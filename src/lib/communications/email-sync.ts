import "server-only"
import { activeCommunicationChannel, validOAuthCredentials, type ActiveChannel } from "./email-provider"
import { mailScopeGranted, MailReconnectRequiredError } from "./capabilities"
import { EMAIL_OAUTH_PROVIDERS, type EmailOAuthProvider } from "@/lib/integrations/email-oauth"
import { providerFetch } from "@/lib/integrations/provider-fetch"
import prisma from "@/lib/prisma"
import { withProcessorLease, type ProcessorLeaseControl } from "@/lib/processing/lease"
import { channelConfig, storeChannelSyncState } from "./sync-state"
import { mailHeaders, mailResourceId, MailReadError, microsoftMailContinuation, readMailJson, readRemoteMail } from "./oauth-mail-reader"
import { mailSyncStateSchema, type MailSyncState, type MailId } from "./mail-sync-state"
import { persistRemoteMail } from "./remote-mail-persistence"
import { remoteMailObservationSchema } from "./remote-mail-types"

type MailPage = { ids: MailId[]; continuation: string | null; checkpoint: string | null }
const googleRoot = "https://gmail.googleapis.com/gmail/v1/users/me"
const graphRoot = "https://graph.microsoft.com/v1.0/me"

async function lastLocalId(companyId: string, channel: ActiveChannel) {
  return (await prisma.emailMessage.findFirst({ where: { companyId, provider: channel.provider, providerId: { startsWith: `${channel.id}:` }, thread: { companyId, channelId: channel.id } },
    select: { id: true }, orderBy: { id: "desc" } }))?.id ?? null
}
async function initialState(companyId: string, channel: ActiveChannel, token: string, generation: string, signal: AbortSignal): Promise<MailSyncState> {
  const now = new Date().toISOString()
  const state: MailSyncState = { version: 2, generation, phase: "BOOTSTRAP", since: new Date(Math.min(channel.lastSyncAt?.getTime() ?? Infinity, Date.now() - 30 * 86_400_000) - 300_000).toISOString(), startedAt: now,
    folder: 0, continuation: null, receptionSince: now, roundStartedAt: now, googleHistoryId: null, graphCursors: [null, null], graphFolders: ["inbox", "sentitems"],
    reconcileUntil: await lastLocalId(companyId, channel), reconcileAfter: null, initialised: false, pendingPage: null }
  if (channel.provider === "GOOGLE") {
    const profile = await readMailJson<{ historyId?: string }>(await providerFetch(`${googleRoot}/profile`, { headers: mailHeaders(token), signal, cache: "no-store" }))
    if (!profile.historyId || !/^\d+$/.test(profile.historyId)) throw new Error("Checkpoint initial Gmail absent")
    state.googleHistoryId = profile.historyId
  } else {
    for (const folder of [0, 1] as const) {
      const data = await readMailJson<{ id?: string }>(await providerFetch(`${graphRoot}/mailFolders/${state.graphFolders[folder]}?$select=id`, { headers: mailHeaders(token), signal, cache: "no-store" }))
      if (!data.id) throw new Error("Dossier Microsoft introuvable")
      state.graphFolders[folder] = data.id
    }
  }
  return state
}
async function googlePage(state: MailSyncState, token: string, signal: AbortSignal): Promise<MailPage> {
  const bootstrap = state.phase === "BOOTSTRAP"
  const url = new URL(`${googleRoot}/${bootstrap ? "messages" : "history"}`)
  url.searchParams.set("maxResults", "50")
  if (state.continuation) url.searchParams.set("pageToken", state.continuation)
  if (bootstrap) {
    url.searchParams.set("labelIds", state.folder === 0 ? "INBOX" : "SENT")
    url.searchParams.set("q", `after:${Math.floor(Date.parse(state.since) / 1000)} before:${Math.floor(Date.parse(state.startedAt) / 1000) + 1}`)
  } else url.searchParams.set("startHistoryId", state.googleHistoryId!)
  const data = await readMailJson<{ messages?: Array<{ id: string }>; nextPageToken?: string; historyId?: string;
    history?: Array<{ messages?: Array<{ id: string }>; messagesAdded?: Array<{ message: { id: string } }>; messagesDeleted?: Array<{ message: { id: string } }>;
      labelsAdded?: Array<{ message: { id: string } }>; labelsRemoved?: Array<{ message: { id: string } }> }> }>(await providerFetch(url, { headers: mailHeaders(token), signal, cache: "no-store" }))
  const ids = new Map<string, boolean>()
  for (const item of data.messages || []) ids.set(item.id, false)
  for (const history of data.history || []) {
    for (const item of history.messages || []) ids.set(item.id, ids.get(item.id) ?? false)
    for (const item of [...history.labelsAdded || [], ...history.labelsRemoved || [], ...history.messagesDeleted || []]) ids.set(item.message.id, ids.get(item.message.id) ?? false)
    for (const item of history.messagesAdded || []) ids.set(item.message.id, true)
  }
  if (!bootstrap && !data.nextPageToken && (!data.historyId || !/^\d+$/.test(data.historyId))) throw new Error("Checkpoint final Gmail absent")
  return { ids: [...ids].map(([id, newReceipt]) => ({ id, newReceipt })), continuation: data.nextPageToken || null, checkpoint: data.historyId || null }
}
async function graphPage(state: MailSyncState, token: string, signal: AbortSignal): Promise<MailPage> {
  const folder = state.graphFolders[state.folder]
  const initial = new URL(`${graphRoot}/mailFolders/${mailResourceId(folder)}/messages/delta`)
  // A receivedDateTime filter imposes Graph's 5,000-message cap. Walk the
  // complete metadata collection, then apply our bounded import window locally.
  initial.searchParams.set("$select", "id,receivedDateTime,sentDateTime")
  const url = microsoftMailContinuation(state.continuation || state.graphCursors[state.folder] || initial.toString(), folder)
  const data = await readMailJson<{ value?: Array<{ id: string }>; "@odata.nextLink"?: string; "@odata.deltaLink"?: string }>(await providerFetch(url, { headers: { ...mailHeaders(token), Prefer: `${mailHeaders(token).Prefer}, odata.maxpagesize=50` }, signal, cache: "no-store" }))
  const next = data["@odata.nextLink"] ? microsoftMailContinuation(data["@odata.nextLink"], folder) : null
  const checkpoint = data["@odata.deltaLink"] ? microsoftMailContinuation(data["@odata.deltaLink"], folder) : null
  if (!next && !checkpoint) throw new Error("Checkpoint final Microsoft absent")
  return { ids: [...new Set((data.value || []).map(item => item.id))].map(id => ({ id, newReceipt: state.initialised, sentHint: state.folder === 1 })), continuation: next, checkpoint }
}
async function syncOAuthEmailChannelUnlocked(companyId: string, channelId: string, control: ProcessorLeaseControl) {
  const channel = await activeCommunicationChannel(companyId, channelId)
  if (channel.mailEnabled === false) return { examined: 0, imported: 0, complete: true, disabled: true }
  if (!EMAIL_OAUTH_PROVIDERS.includes(channel.provider as EmailOAuthProvider)) throw new Error("Ce canal reçoit déjà ses événements par webhook")
  // Bind credentials to the captured connection, including a reconnect that
  // finishes before the first provider request or checkpoint.
  const stored = await prisma.communicationChannel.findFirstOrThrow({ where: { id: channel.id, companyId, status: "ACTIVE" }, select: { config: true } })
  const config = channelConfig(stored.config)
  const generation = typeof config.mailSyncGeneration === "string" ? config.mailSyncGeneration : "legacy"
  const credentials = await validOAuthCredentials(channel)
  await assertCurrent()
  if (!mailScopeGranted(channel.provider as EmailOAuthProvider, credentials.scope, "READ")) throw new MailReconnectRequiredError("Reconnectez cette messagerie pour autoriser la lecture des e-mails")
  const token = credentials.accessToken
  const resume = mailSyncStateSchema.safeParse(config.emailSync)
  let state = resume.success && resume.data.generation === generation ? resume.data : await initialState(companyId, channel, token, generation, control.signal)
  if (!resume.success && config.emailSync && typeof config.emailSync === "object" && !Array.isArray(config.emailSync) && typeof config.emailSync.since === "string" && Number.isFinite(Date.parse(config.emailSync.since))) {
    state.since = new Date(Math.min(Date.parse(state.since), Date.parse(config.emailSync.since))).toISOString()
  }
  let examined = 0, imported = 0
  const folders = new Map<string, string>()
  const save = (completedAt?: Date) => {
    state = mailSyncStateSchema.parse(state)
    return storeChannelSyncState(companyId, channel.id, "emailSync", state, completedAt, { mailGeneration: generation })
  }
  async function assertCurrent() {
    await control.assertOwned()
    const current = await prisma.communicationChannel.findFirst({ where: { id: channel.id, companyId, provider: channel.provider, emailAddress: channel.emailAddress, status: "ACTIVE", mailEnabled: true }, select: { config: true } })
    if (!current || (channelConfig(current.config).mailSyncGeneration ?? "legacy") !== generation) throw new Error("La connexion a changé pendant la synchronisation")
  }
  async function observe(item: MailId, importing: boolean) {
    await assertCurrent(); examined += 1
    const key = `${channel.id}:${item.id}`
    const existing = await prisma.emailMessage.findFirst({ where: { companyId, provider: channel.provider, providerId: key, thread: { companyId, channelId: channel.id } }, select: { id: true, remoteObservation: true } })
    const message = await readRemoteMail(channel, item.id, token, { signal: control.signal, folders, sentFolderId: state.graphFolders[1], sentHint: item.sentHint })
    await assertCurrent()
    if (!message) {
      if (existing) {
        const previous = remoteMailObservationSchema.safeParse(existing.remoteObservation)
        await prisma.emailMessage.updateMany({ where: { id: existing.id, companyId, thread: { companyId, channelId: channel.id } }, data: { remoteObservation: {
          presence: "MISSING", read: null, folderIds: [], folderNames: [], checkedAt: new Date().toISOString(), attachments: previous.success ? previous.data.attachments : [], attachmentsComplete: previous.success && previous.data.attachmentsComplete,
        } } })
      }
      return
    }
    if (!existing && (message.draft || !importing || message.occurredAt.getTime() < Date.parse(state.since))) return
    const newReceipt = item.newReceipt && message.occurredAt.getTime() >= Date.parse(state.receptionSince)
    if (await persistRemoteMail(companyId, channel, message, newReceipt)) imported += 1
  }
  try {
    await save() // The initial Gmail anchor must survive a partially processed page.
    for (let page = 0; page < 4; page++) {
      await assertCurrent()
      if (state.phase === "RECONCILE") {
        const rows = state.reconcileUntil ? await prisma.emailMessage.findMany({ where: { companyId, provider: channel.provider, providerId: { startsWith: `${channel.id}:` },
          thread: { companyId, channelId: channel.id }, id: { lte: state.reconcileUntil, ...(state.reconcileAfter ? { gt: state.reconcileAfter } : {}) } }, select: { id: true, providerId: true }, orderBy: { id: "asc" }, take: 50 }) : []
        for (const row of rows) { await observe({ id: row.providerId!.slice(channel.id.length + 1), newReceipt: false }, false); state.reconcileAfter = row.id }
        if (rows.length < 50) {
          state.phase = "CHANGES"; state.folder = 0; state.continuation = null; state.reconcileAfter = null; state.reconcileUntil = null
          if (channel.provider === "MICROSOFT") {
            state.initialised = true; state.receptionSince = state.roundStartedAt ?? state.startedAt; state.roundStartedAt = null
            await save(new Date(state.receptionSince)); return { examined, imported, complete: true }
          }
        }
        await save(); continue
      }
      if (state.phase === "CHANGES" && !state.roundStartedAt) { state.roundStartedAt = new Date().toISOString(); await save() }
      try {
        if (!state.pendingPage) {
          const result = channel.provider === "GOOGLE" ? await googlePage(state, token, control.signal) : await graphPage(state, token, control.signal)
          state.pendingPage = { ...result, position: 0 }
          await save()
        }
      }
      catch (error) {
        if (error instanceof MailReadError && ((channel.provider === "GOOGLE" && state.phase === "CHANGES" && error.status === 404) || channel.provider === "MICROSOFT" && error.status === 410)) {
          state = await initialState(companyId, channel, token, generation, control.signal); await save(); return { examined, imported, complete: false }
        }
        throw error
      }
      const pending = state.pendingPage!
      // One history record can contain thousands of changed IDs. Persist its
      // work separately from its provider checkpoint; never replay the first
      // hundred IDs indefinitely when a function stops before finishing a page.
      const end = Math.min(pending.ids.length, pending.position + 50)
      for (; pending.position < end; pending.position++) await observe(pending.ids[pending.position], true)
      state.pendingPage = pending
      if (pending.position < pending.ids.length) { await save(); continue }
      const result: MailPage = pending
      state.pendingPage = null
      if (result.continuation) state.continuation = result.continuation
      else if (channel.provider === "GOOGLE" && state.phase === "CHANGES") {
        state.googleHistoryId = result.checkpoint; state.initialised = true; state.continuation = null
        // Use the round's start, not its completion. A message arriving after
        // the provider response must remain eligible in the following round.
        state.receptionSince = state.roundStartedAt ?? state.startedAt; state.roundStartedAt = null
        await save(new Date(state.receptionSince)); return { examined, imported, complete: true }
      } else {
        if (channel.provider === "MICROSOFT") state.graphCursors[state.folder] = result.checkpoint
        state.continuation = null
        if (state.folder === 0) state.folder = 1
        else {
          state.folder = 0; state.phase = "RECONCILE"; state.reconcileAfter = null
          if (channel.provider === "MICROSOFT" && state.initialised) state.reconcileUntil = await lastLocalId(companyId, channel)
        }
      }
      await save()
    }
    return { examined, imported, complete: false }
  } catch (error) {
    // Reconnection must not receive errors or checkpoints from its old worker.
    await assertCurrent()
    const reconnect = error instanceof MailReadError && error.status === 401
    const message = (error instanceof Error ? error.message : "Synchronisation impossible").slice(0, 500)
    await storeChannelSyncState(companyId, channel.id, "emailSyncStatus", { status: reconnect ? "RECONNECT_REQUIRED" : "FAILED", error: message, checkedAt: new Date().toISOString() }, undefined,
      { mailGeneration: generation, lastError: message })
    if (reconnect) throw new MailReconnectRequiredError("Reconnectez cette messagerie pour reprendre la lecture des e-mails")
    throw error
  }
}

export async function syncOAuthEmailChannel(companyId: string, channelId: string) {
  try {
    const result = await withProcessorLease(`email-sync:${channelId}`, control => syncOAuthEmailChannelUnlocked(companyId, channelId, control))
    return result.acquired ? result.value : { examined: 0, imported: 0, complete: false }
  } catch (error) {
    if (error instanceof MailReadError && error.status === 401) throw new MailReconnectRequiredError("Reconnectez cette messagerie pour reprendre la lecture des e-mails")
    throw error
  }
}

export async function syncDueOAuthEmailChannels(limit = 10) {
  const channels = await prisma.communicationChannel.findMany({
    where: { provider: { in: [...EMAIL_OAUTH_PROVIDERS] }, status: "ACTIVE" },
    select: { id: true, companyId: true },
    orderBy: { lastSyncAt: "asc" },
    take: Math.min(25, Math.max(1, limit)),
  })
  const summary = { examined: channels.length, synced: 0, imported: 0, failed: 0 }
  for (const channel of channels) {
    try {
      const result = await syncOAuthEmailChannel(channel.companyId, channel.id)
      summary.synced += 1
      summary.imported += result.imported
    } catch {
      summary.failed += 1
    }
  }
  return summary
}
