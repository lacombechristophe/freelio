import "server-only"
import { z } from "zod"

import { enqueueAutomationEvent, dispatchAutomationEvent } from "@/lib/automations/engine"
import { activeCommunicationChannel, validOAuthAccessToken, type ActiveChannel } from "@/lib/communications/email-provider"
import { getOrCreateEmailThread, resolveEmailParty } from "@/lib/communications/threads"
import { EMAIL_OAUTH_PROVIDERS, type EmailOAuthProvider } from "@/lib/integrations/email-oauth"
import prisma from "@/lib/prisma"
import { providerFetch as fetch, safeMicrosoftContinuation } from "@/lib/integrations/provider-fetch"
import { channelConfig, storeChannelSyncState } from "@/lib/communications/sync-state"
import { withProcessorLease, type ProcessorLeaseControl } from "@/lib/processing/lease"

type ExternalMessage = {
  providerId: string
  direction: "INBOUND" | "OUTBOUND"
  internetMessageId: string | null
  inReplyTo: string | null
  from: string
  to: string[]
  cc: string[]
  bcc: string[]
  subject: string
  bodyHtml: string | null
  bodyText: string | null
  occurredAt: Date
  unread: boolean
}

function bounded(value: string | null | undefined, max = 100_000) {
  return value ? value.slice(0, max) : null
}

function normalizedAddress(value: string) {
  return (value.match(/<([^>]+)>/)?.[1] || value).trim().toLowerCase()
}

function splitAddresses(value: string | null | undefined) {
  return (value || "").split(",").map((item) => item.trim()).filter(Boolean).slice(0, 100)
}

async function persistMessage(companyId: string, provider: EmailOAuthProvider, message: ExternalMessage) {
  const exists = await prisma.emailMessage.findUnique({ where: { provider_providerId: { provider, providerId: message.providerId } }, select: { id: true } })
  if (exists) return false
  const counterparty = message.direction === "INBOUND" ? normalizedAddress(message.from) : normalizedAddress(message.to[0] || "")
  const party = counterparty ? await resolveEmailParty(companyId, counterparty) : { contactId: null, clientId: null, leadCaptureId: null }
  const thread = await getOrCreateEmailThread({ companyId, subject: message.subject, ...party, inReplyTo: message.inReplyTo, occurredAt: message.occurredAt })
  const eventId = await prisma.$transaction(async (tx) => {
    const stored = await tx.emailMessage.create({ data: {
      companyId,
      threadId: thread.id,
      direction: message.direction,
      provider,
      providerId: message.providerId,
      internetMessageId: message.internetMessageId,
      inReplyTo: message.inReplyTo,
      fromAddress: message.from,
      toAddresses: message.to,
      ccAddresses: message.cc,
      bccAddresses: message.bcc,
      subject: bounded(message.subject, 250) || "Sans objet",
      bodyHtml: bounded(message.bodyHtml),
      bodyText: bounded(message.bodyText),
      status: message.direction === "INBOUND" ? "RECEIVED" : "SENT",
      receivedAt: message.direction === "INBOUND" ? message.occurredAt : null,
      sentAt: message.direction === "OUTBOUND" ? message.occurredAt : null,
    } })
    await tx.emailThread.update({ where: { id: thread.id }, data: { lastMessageAt: message.occurredAt, status: "OPEN", ...(message.direction === "INBOUND" && message.unread ? { unreadCount: { increment: 1 } } : {}) } })
    if (message.direction !== "INBOUND") return null
    await tx.emailSequenceEnrollment.updateMany({ where: { status: "ACTIVE", sequence: { companyId }, OR: [...(party.contactId ? [{ contactId: party.contactId }] : []), ...(party.leadCaptureId ? [{ leadCaptureId: party.leadCaptureId }] : [])] }, data: { status: "STOPPED", stopReason: "CUSTOMER_REPLIED", nextSendAt: null, completedAt: message.occurredAt } })
    return enqueueAutomationEvent(tx, { companyId, event: "EMAIL_RECEIVED", subjectModel: "EmailMessage", subjectId: stored.id, eventKey: `${provider.toLowerCase()}:${message.providerId}:received`, leadId: party.leadCaptureId || undefined, clientId: party.clientId || undefined })
  })
  if (eventId) await dispatchAutomationEvent(eventId).catch(() => undefined)
  return true
}

type GmailPart = { mimeType?: string; body?: { data?: string }; parts?: GmailPart[] }
type GmailMessage = { id: string; internalDate?: string; labelIds?: string[]; payload?: GmailPart & { headers?: Array<{ name: string; value: string }> } }

function decodeGmailBody(value: string | undefined) {
  if (!value) return null
  try { return Buffer.from(value, "base64url").toString("utf8") } catch { return null }
}

function gmailBody(part: GmailPart | undefined, mimeType: string): string | null {
  if (!part) return null
  if (part.mimeType?.toLowerCase() === mimeType) return decodeGmailBody(part.body?.data)
  for (const child of part.parts || []) {
    const value = gmailBody(child, mimeType)
    if (value) return value
  }
  return null
}

function gmailHeader(message: GmailMessage, name: string) {
  return message.payload?.headers?.find((header) => header.name.toLowerCase() === name.toLowerCase())?.value || ""
}

const emailSyncStateSchema = z.object({ folder: z.number().int().min(0).max(1), continuation: z.string().max(20_000).nullable(), since: z.string().datetime(), until: z.string().datetime() })
type EmailSyncState = z.infer<typeof emailSyncStateSchema>

async function googleMessages(channel: ActiveChannel, accessToken: string, state: EmailSyncState) {
  const since = Math.floor(new Date(state.since).getTime() / 1000)
  const until = Math.floor(new Date(state.until).getTime() / 1000) + 1
  const ids = new Map<string, "INBOUND" | "OUTBOUND">()
  const [label, direction] = ([["INBOX", "INBOUND"], ["SENT", "OUTBOUND"]] as const)[state.folder]
    const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages")
    url.searchParams.set("labelIds", label)
    url.searchParams.set("q", `after:${since} before:${until}`)
    url.searchParams.set("maxResults", "50")
    if (state.continuation) url.searchParams.set("pageToken", state.continuation)
    const response = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` }, cache: "no-store" })
    const payload = await response.json().catch(() => ({})) as { messages?: Array<{ id: string }>; nextPageToken?: string; error?: { message?: string } }
    if (!response.ok) throw new Error(payload.error?.message || "Synchronisation Gmail refusée")
    for (const item of payload.messages || []) ids.set(item.id, direction)
  const messages: ExternalMessage[] = []
  const entries = [...ids]
  for (let index = 0; index < entries.length; index += 8) {
    const batch = await Promise.all(entries.slice(index, index + 8).map(async ([id, direction]) => {
      const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=full`, { headers: { authorization: `Bearer ${accessToken}` }, cache: "no-store" })
      const message = await response.json().catch(() => ({})) as GmailMessage & { error?: { message?: string } }
      if (!response.ok || !message.id) throw new Error(message.error?.message || "Lecture d’un message Gmail impossible")
      return {
      providerId: `${channel.id}:${message.id}`,
      direction,
      internetMessageId: gmailHeader(message, "Message-ID") || null,
      inReplyTo: gmailHeader(message, "In-Reply-To") || null,
      from: gmailHeader(message, "From"),
      to: splitAddresses(gmailHeader(message, "To")),
      cc: splitAddresses(gmailHeader(message, "Cc")),
      bcc: splitAddresses(gmailHeader(message, "Bcc")),
      subject: gmailHeader(message, "Subject") || "Sans objet",
      bodyHtml: gmailBody(message.payload, "text/html"),
      bodyText: gmailBody(message.payload, "text/plain"),
      occurredAt: new Date(Number(message.internalDate || Date.now())),
      unread: Boolean(message.labelIds?.includes("UNREAD")),
      } satisfies ExternalMessage
    }))
    messages.push(...batch)
  }
  return { messages, continuation: payload.nextPageToken || null }
}

type GraphMessage = {
  id: string
  internetMessageId?: string | null
  subject?: string | null
  body?: { contentType?: string; content?: string }
  bodyPreview?: string
  from?: { emailAddress?: { name?: string; address?: string } }
  toRecipients?: Array<{ emailAddress?: { name?: string; address?: string } }>
  ccRecipients?: Array<{ emailAddress?: { name?: string; address?: string } }>
  bccRecipients?: Array<{ emailAddress?: { name?: string; address?: string } }>
  receivedDateTime?: string
  sentDateTime?: string
  isRead?: boolean
}

function graphAddress(value: { name?: string; address?: string } | undefined) {
  if (!value?.address) return ""
  return value.name ? `${value.name.replace(/[<>\r\n]/g, "")} <${value.address}>` : value.address
}

async function microsoftMessages(channel: ActiveChannel, accessToken: string, state: EmailSyncState) {
  const messages: ExternalMessage[] = []
  const [folder, direction, dateField] = ([["inbox", "INBOUND", "receivedDateTime"], ["sentitems", "OUTBOUND", "sentDateTime"]] as const)[state.folder]
    const url = new URL(`https://graph.microsoft.com/v1.0/me/mailFolders/${folder}/messages`)
    url.searchParams.set("$top", "50")
    url.searchParams.set("$orderby", `${dateField} desc`)
    url.searchParams.set("$filter", `${dateField} ge ${state.since} and ${dateField} le ${state.until}`)
    url.searchParams.set("$select", "id,internetMessageId,subject,body,bodyPreview,from,toRecipients,ccRecipients,bccRecipients,receivedDateTime,sentDateTime,isRead")
    const response = await fetch(state.continuation ? safeMicrosoftContinuation(state.continuation) : url, { headers: { authorization: `Bearer ${accessToken}`, Prefer: 'IdType="ImmutableId", outlook.body-content-type="html"' }, cache: "no-store" })
    const payload = await response.json().catch(() => ({})) as { value?: GraphMessage[]; "@odata.nextLink"?: string; error?: { message?: string } }
    if (!response.ok) throw new Error(payload.error?.message || "Synchronisation Microsoft refusée")
    for (const item of payload.value || []) messages.push({
      providerId: `${channel.id}:${item.id}`,
      direction,
      internetMessageId: item.internetMessageId || null,
      inReplyTo: null,
      from: graphAddress(item.from?.emailAddress),
      to: (item.toRecipients || []).map((entry) => graphAddress(entry.emailAddress)).filter(Boolean),
      cc: (item.ccRecipients || []).map((entry) => graphAddress(entry.emailAddress)).filter(Boolean),
      bcc: (item.bccRecipients || []).map((entry) => graphAddress(entry.emailAddress)).filter(Boolean),
      subject: item.subject || "Sans objet",
      bodyHtml: item.body?.contentType?.toLowerCase() === "html" ? item.body.content || null : null,
      bodyText: item.body?.contentType?.toLowerCase() === "text" ? item.body.content || null : item.bodyPreview || null,
      occurredAt: new Date((direction === "INBOUND" ? item.receivedDateTime : item.sentDateTime) || Date.now()),
      unread: direction === "INBOUND" && !item.isRead,
    })
  return { messages, continuation: payload["@odata.nextLink"] ? safeMicrosoftContinuation(payload["@odata.nextLink"]) : null }
}

async function syncOAuthEmailChannelUnlocked(companyId: string, channelId: string, control: ProcessorLeaseControl) {
  const channel = await activeCommunicationChannel(companyId, channelId)
  if (!EMAIL_OAUTH_PROVIDERS.includes(channel.provider as EmailOAuthProvider)) throw new Error("Ce canal reçoit déjà ses événements par webhook")
  try {
    const provider = channel.provider as EmailOAuthProvider
    const accessToken = await validOAuthAccessToken(channel)
    const stored = await prisma.communicationChannel.findFirstOrThrow({ where: { id: channel.id, companyId }, select: { config: true } })
    let state = emailSyncStateSchema.parse(channelConfig(stored.config).emailSync || {
      folder: 0, continuation: null,
      since: new Date((channel.lastSyncAt?.getTime() ?? Date.now() - 30 * 86_400_000) - 5 * 60_000).toISOString(),
      until: new Date().toISOString(),
    })
    let examined = 0
    let imported = 0
    let complete = false
    for (let page = 0; page < 4; page += 1) {
      await control.assertOwned()
      const result = provider === "GOOGLE" ? await googleMessages(channel, accessToken, state) : await microsoftMessages(channel, accessToken, state)
      examined += result.messages.length
      for (const message of result.messages.sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime())) {
        await control.assertOwned()
        if (await persistMessage(companyId, provider, message)) imported += 1
      }
      // Persist after all messages on the page. A crash before this checkpoint
      // safely replays the same page and does not advance the time watermark.
      if (!result.continuation && state.folder === 1) {
        await storeChannelSyncState(companyId, channel.id, "emailSync", null, new Date(state.until))
        complete = true
        break
      }
      state = { ...state, folder: result.continuation ? state.folder : state.folder + 1, continuation: result.continuation }
      await storeChannelSyncState(companyId, channel.id, "emailSync", state)
    }
    await prisma.communicationChannel.updateMany({ where: { id: channel.id, companyId, status: "ACTIVE" }, data: { lastError: null } })
    return { examined, imported, complete }
  } catch (error) {
    const message = (error instanceof Error ? error.message : "Synchronisation impossible").slice(0, 500)
    await prisma.communicationChannel.updateMany({ where: { id: channel.id, companyId }, data: { lastError: message } })
    throw new Error(message)
  }
}

export async function syncOAuthEmailChannel(companyId: string, channelId: string) {
  const result = await withProcessorLease(`email-sync:${channelId}`, (control) => syncOAuthEmailChannelUnlocked(companyId, channelId, control))
  return result.acquired ? result.value : { examined: 0, imported: 0, complete: false }
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
