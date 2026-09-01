import "server-only"

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
import prisma from "@/lib/prisma"

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
  const start = new Date()
  start.setDate(start.getDate() - 90)
  const end = new Date()
  end.setFullYear(end.getFullYear() + 1)
  return { start, end }
}

function safeMicrosoftContinuation(value: string) {
  const url = new URL(value)
  if (url.protocol !== "https:" || url.hostname !== "graph.microsoft.com") throw new Error("Curseur Microsoft invalide")
  return url.toString()
}

async function persistExternalEvent(companyId: string, channel: ActiveChannel, event: ExternalCalendarEvent) {
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
  const existing = await prisma.organisationTask.findUnique({
    where: { companyId_calendarChannelId_calendarExternalId: key },
    select: { id: true },
  })
  await prisma.organisationTask.upsert({
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

async function persistRemoteCancellation(companyId: string, channelId: string, externalId: string) {
  await prisma.organisationTask.updateMany({
    where: { companyId, calendarChannelId: channelId, calendarExternalId: externalId },
    data: { status: "DONE", calendarSyncStatus: "REMOTE_CANCELLED", calendarLastError: null, calendarLastSyncedAt: new Date() },
  })
}

async function googleEvents(companyId: string, channel: ActiveChannel, accessToken: string, cursor?: string) {
  const { start, end } = calendarHorizon()
  const events: ExternalCalendarEvent[] = []
  let pageToken: string | undefined
  let nextCursor: string | undefined
  for (let page = 0; page < 10; page += 1) {
    const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events")
    url.searchParams.set("maxResults", "250")
    url.searchParams.set("showDeleted", "true")
    url.searchParams.set("singleEvents", "true")
    if (cursor) url.searchParams.set("syncToken", cursor)
    else {
      url.searchParams.set("timeMin", start.toISOString())
      url.searchParams.set("timeMax", end.toISOString())
      url.searchParams.set("orderBy", "startTime")
    }
    if (pageToken) url.searchParams.set("pageToken", pageToken)
    const response = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` }, cache: "no-store" })
    if (response.status === 410 && cursor) return googleEvents(companyId, channel, accessToken)
    const payload = await response.json().catch(() => ({})) as GooglePage
    if (!response.ok) throw new Error(payload.error?.message || `Synchronisation Google Calendar refusée (${response.status})`)
    for (const item of payload.items || []) {
      if (item.status === "cancelled" && item.id) {
        await persistRemoteCancellation(companyId, channel.id, item.id)
        continue
      }
      const parsed = parseGoogleCalendarEvent(item)
      if (parsed) events.push(parsed)
    }
    pageToken = payload.nextPageToken
    nextCursor = payload.nextSyncToken || nextCursor
    if (!pageToken) break
  }
  return { events, cursor: nextCursor || cursor || null }
}

async function microsoftEvents(companyId: string, channelId: string, accessToken: string, cursor?: string) {
  const { start, end } = calendarHorizon()
  let nextUrl = cursor
    ? safeMicrosoftContinuation(cursor)
    : `https://graph.microsoft.com/v1.0/me/calendarView/delta?startDateTime=${encodeURIComponent(start.toISOString())}&endDateTime=${encodeURIComponent(end.toISOString())}`
  const events: ExternalCalendarEvent[] = []
  let nextCursor: string | null = null
  for (let page = 0; page < 10 && nextUrl; page += 1) {
    const response = await fetch(nextUrl, {
      headers: { authorization: `Bearer ${accessToken}`, Prefer: 'outlook.timezone="UTC"' },
      cache: "no-store",
    })
    const payload = await response.json().catch(() => ({})) as MicrosoftPage
    if (response.status === 410 && cursor) return microsoftEvents(companyId, channelId, accessToken)
    if (!response.ok) throw new Error(payload.error?.message || `Synchronisation Microsoft Calendar refusée (${response.status})`)
    for (const item of payload.value || []) {
      if (item["@removed"] && item.id) {
        await persistRemoteCancellation(companyId, channelId, item.id)
        continue
      }
      const parsed = parseMicrosoftCalendarEvent(item)
      if (parsed) events.push(parsed)
    }
    nextUrl = payload["@odata.nextLink"] ? safeMicrosoftContinuation(payload["@odata.nextLink"]!) : ""
    nextCursor = payload["@odata.deltaLink"] ? safeMicrosoftContinuation(payload["@odata.deltaLink"]!) : nextCursor
  }
  return { events, cursor: nextCursor || cursor || null }
}

export async function syncOAuthCalendarChannel(companyId: string, channelId: string) {
  const channel = await activeCommunicationChannel(companyId, channelId)
  if (!EMAIL_OAUTH_PROVIDERS.includes(channel.provider as EmailOAuthProvider)) throw new Error("Ce canal ne fournit pas de calendrier OAuth")
  const provider = channel.provider as EmailOAuthProvider
  const credentials = await validOAuthCredentials(channel)
  if (!calendarScopeGranted(provider, credentials.scope)) {
    throw new CalendarReconnectRequiredError("Reconnectez cette messagerie pour autoriser la synchronisation du calendrier")
  }
  const result = provider === "GOOGLE"
    ? await googleEvents(companyId, channel, credentials.accessToken, credentials.calendarCursor)
    : await microsoftEvents(companyId, channel.id, credentials.accessToken, credentials.calendarCursor)
  let imported = 0
  for (const event of result.events.sort((left, right) => left.startAt.getTime() - right.startAt.getTime())) {
    if (await persistExternalEvent(companyId, channel, event)) imported += 1
  }
  await storeOAuthCalendarCursor(channel, result.cursor)
  return { examined: result.events.length, imported }
}

export async function pushOrganisationTaskToCalendar(companyId: string, taskId: string, channelId: string) {
  const [channel, task] = await Promise.all([
    activeCommunicationChannel(companyId, channelId),
    prisma.organisationTask.findFirst({ where: { id: taskId, companyId } }),
  ])
  if (!task) throw new Error("Tâche introuvable")
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
  const credentials = await validOAuthCredentials(channel)
  const endpoint = task.calendarProvider === "GOOGLE"
    ? `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(task.calendarExternalId)}`
    : `https://graph.microsoft.com/v1.0/me/events/${encodeURIComponent(task.calendarExternalId)}`
  const response = await fetch(endpoint, { method: "DELETE", headers: { authorization: `Bearer ${credentials.accessToken}` }, cache: "no-store" })
  if (!response.ok && response.status !== 404 && response.status !== 410) throw new Error(`Suppression du calendrier refusée (${response.status})`)
}
