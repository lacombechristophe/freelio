import "server-only"
import { z } from "zod"
import { Prisma } from "@prisma/client"

import {
  calendarDurationMinutes,
  calendarTaskNotes,
  googleCalendarPayload,
  microsoftCalendarPayload,
  parseGoogleCalendarEvent,
  parseMicrosoftCalendarEvent,
  type ExternalCalendarEvent,
} from "@/lib/integrations/calendar-event"
import { activeCommunicationChannel, storeOAuthCalendarCursor, validOAuthCredentials, type ActiveChannel } from "@/lib/communications/email-provider"
import { EMAIL_OAUTH_PROVIDERS, type EmailOAuthProvider } from "@/lib/integrations/email-oauth"
import prisma, { type TransactionClient } from "@/lib/prisma"
import { providerFetch as fetch, safeMicrosoftContinuation } from "@/lib/integrations/provider-fetch"
import { channelConfig, storeChannelSyncState } from "@/lib/communications/sync-state"
import { withProcessorLease, type ProcessorLeaseControl } from "@/lib/processing/lease"

type GooglePage = {
  items?: Array<Record<string, unknown> & { id?: string; status?: string }>
  nextPageToken?: string
  nextSyncToken?: string
  error?: { message?: string }
}

type MicrosoftPage = {
  value?: Array<Record<string, unknown> & { id?: string; "@removed"?: unknown }>
  "@odata.nextLink"?: string
  "@odata.deltaLink"?: string
  error?: { message?: string }
}

export class CalendarReconnectRequiredError extends Error {}

function scopes(value: string) {
  return new Set(value.split(/\s+/).map((scope) => scope.trim().toLowerCase()).filter(Boolean))
}

export function calendarScopeGranted(provider: EmailOAuthProvider, value: string) {
  const granted = scopes(value)
  return provider === "GOOGLE"
    ? granted.has("https://www.googleapis.com/auth/calendar.events") || granted.has("https://www.googleapis.com/auth/calendar")
    : granted.has("calendars.readwrite")
}

function calendarHorizon() {
  const now = new Date()
  return { start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 90)).toISOString(),
    end: new Date(Date.UTC(now.getUTCFullYear() + 1, now.getUTCMonth(), now.getUTCDate() + 1)).toISOString() }
}

function coversHorizon(window: { start: string; end: string }) {
  const target = calendarHorizon()
  return Date.parse(window.start) <= Date.parse(target.start) && Date.parse(window.end) >= Date.parse(target.end)
}

function newCalendarWindow() {
  const target = calendarHorizon(), end = new Date(target.end)
  // A month boundary provides headroom: ordinary delta jobs keep their fixed
  // view until a new full view is needed, instead of rebuilding it every day.
  return { start: target.start, end: new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 1)).toISOString() }
}

async function persistExternalEvent(companyId: string, channel: ActiveChannel, event: ExternalCalendarEvent, database: TransactionClient) {
  const provider = channel.provider as EmailOAuthProvider
  const key = { companyId, calendarChannelId: channel.id, calendarExternalId: event.id }
  const common = {
    title: event.title,
    notes: calendarTaskNotes(event),
    scheduledDate: event.startAt,
    dueDate: event.endAt,
    estimateMin: calendarDurationMinutes(event),
    isBillable: false,
    category: "MEETING",
    calendarProvider: provider,
    calendarEtag: event.etag,
    calendarSyncStatus: event.cancelled ? "REMOTE_CANCELLED" : "SYNCED",
    calendarLastError: null,
    calendarLastSyncedAt: new Date(),
  }
  const existing = await database.organisationTask.findUnique({
    where: { companyId_calendarChannelId_calendarExternalId: key },
    select: { id: true },
  })
  await database.organisationTask.upsert({
    where: { companyId_calendarChannelId_calendarExternalId: key },
    update: { ...common, ...(event.cancelled ? { status: "DONE" } : {}) },
    create: {
      companyId,
      ...common,
      status: event.cancelled ? "DONE" : "TODO",
      priority: 2,
      calendarChannelId: channel.id,
      calendarExternalId: event.id,
    },
  })
  return !existing
}

async function persistRemoteCancellation(companyId: string, channelId: string, externalId: string, database: TransactionClient) {
  await database.organisationTask.updateMany({
    where: { companyId, calendarChannelId: channelId, calendarExternalId: externalId },
    data: { status: "DONE", calendarSyncStatus: "REMOTE_CANCELLED", calendarLastError: null, calendarLastSyncedAt: new Date() },
  })
}

const calendarStateSchema = z.object({ version: z.literal(2), generation: z.string().max(200), continuation: z.string().max(20_000).nullable(), cursor: z.string().max(20_000).nullable(), start: z.string().datetime(), end: z.string().datetime() })
  .refine(state => Date.parse(state.start) < Date.parse(state.end))
type CalendarState = z.infer<typeof calendarStateSchema>

async function persistCalendarPage(companyId: string, channel: ActiveChannel, rows: Array<{ event?: ExternalCalendarEvent; cancelledId?: string }>, control: ProcessorLeaseControl) {
  return prisma.$transaction(async tx => {
    await control.assertOwned(tx)
    const current = await tx.communicationChannel.findFirstOrThrow({ where: { id: channel.id, companyId }, select: { config: true } })
    // Hold this connection row until the page commits. A reconnect that won
    // before the lock invalidates the CAS; one that follows waits for the page.
    const locked = await tx.communicationChannel.updateMany({ where: { id: channel.id, companyId, status: "ACTIVE", calendarEnabled: true, config: { equals: current.config ?? Prisma.DbNull } }, data: { updatedAt: new Date() } })
    if (locked.count !== 1) throw new Error("La connexion a changé pendant la synchronisation du calendrier")
    await control.assertOwned(tx)
    let imported = 0
    for (const row of rows) {
      await control.assertOwned(tx)
      if (row.cancelledId) await persistRemoteCancellation(companyId, channel.id, row.cancelledId, tx)
      else if (row.event && await persistExternalEvent(companyId, channel, row.event, tx)) imported++
    }
    return imported
  }, { timeout: 30_000 })
}

function safeCalendarContinuation(value: string) {
  const safe = safeMicrosoftContinuation(value)
  if (!/^\/v1\.0\/me\/calendarView\/delta$/i.test(new URL(safe).pathname)) throw new Error("Curseur de calendrier Microsoft invalide")
  return safe
}

async function googleEvents(companyId: string, channel: ActiveChannel, accessToken: string, state: CalendarState, control: ProcessorLeaseControl) {
  let examined = 0
  let imported = 0
  for (let page = 0; page < 4; page += 1) {
    await control.assertOwned()
    const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events")
    url.searchParams.set("maxResults", "50")
    url.searchParams.set("showDeleted", "true")
    url.searchParams.set("singleEvents", "true")
    if (state.cursor) url.searchParams.set("syncToken", state.cursor)
    else {
      url.searchParams.set("timeMin", state.start)
      url.searchParams.set("timeMax", state.end)
      url.searchParams.set("orderBy", "startTime")
    }
    if (state.continuation) url.searchParams.set("pageToken", state.continuation)
    const response = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` }, signal: control.signal, cache: "no-store" })
    await control.assertOwned()
    if (response.status === 410 && (state.cursor || state.continuation)) {
      await storeOAuthCalendarCursor(channel, null, { generation: state.generation, window: null })
      return { examined, imported, complete: false }
    }
    const payload = await response.json().catch(() => ({})) as GooglePage
    await control.assertOwned()
    if (!response.ok) throw new Error(payload.error?.message || `Synchronisation Google Calendar refusée (${response.status})`)
    const rows = (payload.items || []).map(item => item.status === "cancelled" && item.id ? { cancelledId: item.id } : { event: parseGoogleCalendarEvent(item) || undefined })
    examined += rows.length
    imported += await persistCalendarPage(companyId, channel, rows, control)
    if (!payload.nextPageToken) {
      if (!payload.nextSyncToken) throw new Error("Le calendrier Google n’a pas fourni de checkpoint final")
      await control.assertOwned()
      await storeOAuthCalendarCursor(channel, payload.nextSyncToken, { generation: state.generation, window: { start: state.start, end: state.end } })
      return { examined, imported, complete: coversHorizon(state) }
    }
    state = { ...state, continuation: payload.nextPageToken }
    await storeChannelSyncState(companyId, channel.id, "calendarSync", state, undefined, { mailGeneration: state.generation })
  }
  return { examined, imported, complete: false }
}

async function microsoftEvents(companyId: string, channel: ActiveChannel, accessToken: string, state: CalendarState, control: ProcessorLeaseControl) {
  let nextUrl = state.continuation || state.cursor
    ? safeCalendarContinuation(state.continuation || state.cursor!)
    : `https://graph.microsoft.com/v1.0/me/calendarView/delta?startDateTime=${encodeURIComponent(state.start)}&endDateTime=${encodeURIComponent(state.end)}`
  let examined = 0
  let imported = 0
  for (let page = 0; page < 4; page += 1) {
    await control.assertOwned()
    const response = await fetch(nextUrl, {
      headers: { authorization: `Bearer ${accessToken}`, Prefer: 'outlook.timezone="UTC", odata.maxpagesize=50' },
      signal: control.signal,
      cache: "no-store",
    })
    const payload = await response.json().catch(() => ({})) as MicrosoftPage
    await control.assertOwned()
    if (response.status === 410 && (state.cursor || state.continuation)) {
      await storeOAuthCalendarCursor(channel, null, { generation: state.generation, window: null })
      return { examined, imported, complete: false }
    }
    if (!response.ok) throw new Error(payload.error?.message || `Synchronisation Microsoft Calendar refusée (${response.status})`)
    const rows = (payload.value || []).map(item => item["@removed"] && item.id ? { cancelledId: item.id } : { event: parseMicrosoftCalendarEvent(item) || undefined })
    examined += rows.length
    imported += await persistCalendarPage(companyId, channel, rows, control)
    if (!payload["@odata.nextLink"]) {
      if (!payload["@odata.deltaLink"]) throw new Error("Le calendrier Microsoft n’a pas fourni de checkpoint final")
      await control.assertOwned()
      await storeOAuthCalendarCursor(channel, safeCalendarContinuation(payload["@odata.deltaLink"]), { generation: state.generation, window: { start: state.start, end: state.end } })
      return { examined, imported, complete: coversHorizon(state) }
    }
    nextUrl = safeCalendarContinuation(payload["@odata.nextLink"]!)
    state = { ...state, continuation: nextUrl }
    await storeChannelSyncState(companyId, channel.id, "calendarSync", state, undefined, { mailGeneration: state.generation })
  }
  return { examined, imported, complete: false }
}

async function syncOAuthCalendarChannelUnlocked(companyId: string, channelId: string, control: ProcessorLeaseControl) {
  const channel = await activeCommunicationChannel(companyId, channelId)
  if (channel.calendarEnabled === false) return { examined: 0, imported: 0, complete: true, disabled: true }
  if (!EMAIL_OAUTH_PROVIDERS.includes(channel.provider as EmailOAuthProvider)) throw new Error("Ce canal ne fournit pas de calendrier OAuth")
  const provider = channel.provider as EmailOAuthProvider
  const stored = await prisma.communicationChannel.findFirstOrThrow({ where: { id: channel.id, companyId, status: "ACTIVE" }, select: { config: true } })
  const config = channelConfig(stored.config)
  const generation = typeof config.mailSyncGeneration === "string" ? config.mailSyncGeneration : "legacy"
  async function assertCurrent(tx?: TransactionClient) {
    await control.assertOwned(tx)
    const current = await (tx || prisma).communicationChannel.findFirst({ where: { id: channel.id, companyId, provider: channel.provider, emailAddress: channel.emailAddress, status: "ACTIVE", calendarEnabled: true }, select: { config: true } })
    if (!current || (channelConfig(current.config).mailSyncGeneration ?? "legacy") !== generation) throw new Error("La connexion a changé pendant la synchronisation du calendrier")
  }
  const credentials = await validOAuthCredentials(channel)
  await assertCurrent()
  if (!calendarScopeGranted(provider, credentials.scope)) {
    throw new CalendarReconnectRequiredError("Reconnectez cette messagerie pour autoriser la synchronisation du calendrier")
  }
  const resume = calendarStateSchema.safeParse(config.calendarSync)
  const reuseCursor = credentials.calendarCursor && credentials.calendarWindow && coversHorizon(credentials.calendarWindow)
  const state = resume.success && resume.data.generation === generation ? resume.data : calendarStateSchema.parse({ version: 2, generation, continuation: null,
    cursor: reuseCursor ? credentials.calendarCursor : null, ...(reuseCursor ? credentials.calendarWindow : newCalendarWindow()) })
  await storeChannelSyncState(companyId, channel.id, "calendarSync", state, undefined, { mailGeneration: generation })
  const guarded = { assertOwned: assertCurrent, signal: control.signal }
  return provider === "GOOGLE"
    ? googleEvents(companyId, channel, credentials.accessToken, state, guarded)
    : microsoftEvents(companyId, channel, credentials.accessToken, state, guarded)
}

export async function syncOAuthCalendarChannel(companyId: string, channelId: string) {
  const result = await withProcessorLease(`calendar-sync:${channelId}`, (control) => syncOAuthCalendarChannelUnlocked(companyId, channelId, control))
  return result.acquired ? result.value : { examined: 0, imported: 0, complete: false }
}

export async function pushOrganisationTaskToCalendar(companyId: string, taskId: string, channelId: string) {
  const [channel, task] = await Promise.all([
    activeCommunicationChannel(companyId, channelId),
    prisma.organisationTask.findFirst({ where: { id: taskId, companyId } }),
  ])
  if (!task) throw new Error("Tâche introuvable")
  if (channel.calendarEnabled === false) throw new Error("Le calendrier n’est pas activé pour cette messagerie")
  if (!task.scheduledDate) throw new Error("Une date planifiée est requise pour synchroniser la tâche")
  const provider = channel.provider as EmailOAuthProvider
  if (!EMAIL_OAUTH_PROVIDERS.includes(provider)) throw new Error("Sélectionnez une connexion Google ou Microsoft")
  const credentials = await validOAuthCredentials(channel)
  if (!calendarScopeGranted(provider, credentials.scope)) throw new CalendarReconnectRequiredError("Reconnectez cette messagerie pour autoriser le calendrier")
  const input = { title: task.title, notes: task.notes, startAt: task.scheduledDate, durationMinutes: task.estimateMin || 60 }
  const existingId = task.calendarChannelId === channel.id ? task.calendarExternalId : null
  const endpoint = provider === "GOOGLE"
    ? existingId ? `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(existingId)}` : "https://www.googleapis.com/calendar/v3/calendars/primary/events"
    : existingId ? `https://graph.microsoft.com/v1.0/me/events/${encodeURIComponent(existingId)}` : "https://graph.microsoft.com/v1.0/me/events"
  const response = await fetch(endpoint, {
    method: existingId ? "PATCH" : "POST",
    headers: { authorization: `Bearer ${credentials.accessToken}`, "content-type": "application/json", ...(provider === "MICROSOFT" ? { Prefer: 'outlook.timezone="UTC"' } : {}) },
    body: JSON.stringify(provider === "GOOGLE" ? googleCalendarPayload(input) : microsoftCalendarPayload(input)),
    cache: "no-store",
  })
  const payload = await response.json().catch(() => ({})) as { id?: string; etag?: string; changeKey?: string; error?: { message?: string } }
  if (!response.ok || !payload.id) throw new Error(payload.error?.message || `Écriture du calendrier refusée (${response.status})`)
  await prisma.organisationTask.update({
    where: { id: task.id },
    data: {
      calendarChannelId: channel.id,
      calendarProvider: provider,
      calendarExternalId: payload.id,
      calendarEtag: payload.etag || payload.changeKey || null,
      calendarSyncStatus: "SYNCED",
      calendarLastError: null,
      calendarLastSyncedAt: new Date(),
    },
  })
  return { provider, externalId: payload.id }
}

export async function deleteOrganisationTaskFromCalendar(companyId: string, taskId: string) {
  const task = await prisma.organisationTask.findFirst({ where: { id: taskId, companyId } })
  if (!task?.calendarChannelId || !task.calendarExternalId || !task.calendarProvider) return
  const channel = await activeCommunicationChannel(companyId, task.calendarChannelId)
  if (channel.calendarEnabled === false) throw new Error("Le calendrier n’est pas activé pour cette messagerie")
  const credentials = await validOAuthCredentials(channel)
  const endpoint = task.calendarProvider === "GOOGLE"
    ? `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(task.calendarExternalId)}`
    : `https://graph.microsoft.com/v1.0/me/events/${encodeURIComponent(task.calendarExternalId)}`
  const response = await fetch(endpoint, { method: "DELETE", headers: { authorization: `Bearer ${credentials.accessToken}` }, cache: "no-store" })
  if (!response.ok && response.status !== 404 && response.status !== 410) throw new Error(`Suppression du calendrier refusée (${response.status})`)
}
