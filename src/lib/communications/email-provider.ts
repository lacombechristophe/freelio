import "server-only"

import { z } from "zod"
import { createHash } from "node:crypto"

import { formatMailboxSender, getResendTransport } from "@/lib/communications/provider-credentials"
import { decrypt, encrypt } from "@/lib/crypto"
import { EMAIL_OAUTH_PROVIDERS, refreshEmailOAuthAccessToken, type EmailOAuthProvider } from "@/lib/integrations/email-oauth"
import prisma from "@/lib/prisma"
import { providerFetch as fetch } from "@/lib/integrations/provider-fetch"
import { withProcessorLease } from "@/lib/processing/lease"
import { activeEmailSuppression } from "@/lib/communications/suppressions"
import { mailScopeGranted, MailReconnectRequiredError } from "@/lib/communications/capabilities"
import { canonicalEmailSubject } from "@/lib/communications/threads"
import { replyContextSchema, replyHeaders, replyMailboxAddresses, validInternetMessageId, type ReplyContext } from "@/lib/communications/reply-context"
import { copyRecipientsSchema, emailAddressSchema, validateRecipients } from "@/lib/communications/recipients"
import { emailAttachmentsSchema } from "./attachment-types"
import type { LoadedEmailAttachment } from "./attachment-content"
import { hasExpectedSignature } from "@/lib/local-files"
import { prepareGraphAttachments } from "./graph-attachments"

const oauthCredentialsSchema = z.object({
  mode: z.literal("OAUTH"),
  accessToken: z.string().min(10),
  refreshToken: z.string().min(10),
  tokenType: z.string().default("Bearer"),
  scope: z.string().default(""),
  expiresAt: z.string().datetime(),
  calendarCursor: z.string().max(20_000).optional(),
  calendarCursorKind: z.enum(["GOOGLE_SYNC_TOKEN", "MICROSOFT_DELTA_LINK"]).optional(),
})

export type OAuthCredentials = z.infer<typeof oauthCredentialsSchema>

export type ActiveChannel = {
  id: string
  provider: string
  emailAddress: string
  displayName: string | null
  credentialsEncrypted: string | null
  lastSyncAt: Date | null
  mailEnabled?: boolean
  calendarEnabled?: boolean
}

export async function activeCommunicationChannel(companyId: string, channelId?: string | null): Promise<ActiveChannel> {
  const channels = await prisma.communicationChannel.findMany({
    where: { companyId, status: "ACTIVE", ...(channelId ? { id: channelId } : {}) },
    select: { id: true, provider: true, emailAddress: true, displayName: true, credentialsEncrypted: true, lastSyncAt: true, mailEnabled: true, calendarEnabled: true },
    orderBy: { id: "asc" },
    take: channelId ? 1 : 2,
  })
  if (channels.length > 1) throw new Error("Choisissez explicitement une boîte expéditrice")
  const channel = channels[0]
  if (!channel && (!channelId || channelId === "platform")) {
    const configuredFrom = process.env.EMAIL_FROM?.trim() || ""
    const emailAddress = (configuredFrom.match(/<([^>]+)>/)?.[1] || configuredFrom).trim().toLowerCase()
    if (process.env.RESEND_API_KEY?.trim() && emailAddress) {
      return { id: "platform", provider: "RESEND", emailAddress, displayName: null, credentialsEncrypted: null, lastSyncAt: null }
    }
  }
  if (!channel) throw new Error("Aucune messagerie active. Connectez-en une dans Communications > Intégrations")
  return channel
}

export async function pinSequenceSender(companyId: string, sequenceId: string) {
  const sequence = await prisma.emailSequence.findFirstOrThrow({ where: { id: sequenceId, companyId }, select: { senderChannelId: true } })
  if (sequence.senderChannelId) {
    const channel = await activeCommunicationChannel(companyId, sequence.senderChannelId)
    if (channel.mailEnabled === false) throw new Error("La boîte expéditrice n’autorise plus les e-mails")
    return channel.id
  }
  const channel = await activeCommunicationChannel(companyId)
  if (channel.mailEnabled === false) throw new Error("Cette connexion autorise uniquement le calendrier")
  await prisma.emailSequence.updateMany({ where: { id: sequenceId, companyId, senderChannelId: null }, data: { senderChannelId: channel.id } })
  const pinned = await prisma.emailSequence.findFirstOrThrow({ where: { id: sequenceId, companyId }, select: { senderChannelId: true } })
  return (await activeCommunicationChannel(companyId, pinned.senderChannelId)).id
}

export function readOAuthCredentials(channel: ActiveChannel): OAuthCredentials {
  if (!EMAIL_OAUTH_PROVIDERS.includes(channel.provider as EmailOAuthProvider) || !channel.credentialsEncrypted) throw new Error("Autorisation OAuth absente")
  return oauthCredentialsSchema.parse(JSON.parse(decrypt(channel.credentialsEncrypted)))
}

export async function validOAuthCredentials(channel: ActiveChannel) {
  if (!EMAIL_OAUTH_PROVIDERS.includes(channel.provider as EmailOAuthProvider)) throw new Error("Autorisation OAuth absente")
  const provider = channel.provider as EmailOAuthProvider
  const fresh = await prisma.communicationChannel.findFirstOrThrow({ where: { id: channel.id, status: "ACTIVE" }, select: { id: true, provider: true, emailAddress: true, displayName: true, credentialsEncrypted: true, lastSyncAt: true } })
  const credentials = readOAuthCredentials(fresh)
  if (new Date(credentials.expiresAt).getTime() > Date.now() + 5 * 60_000) return credentials
  const refresh = await withProcessorLease(`oauth-refresh:${channel.id}`, async (control) => {
  const current = await prisma.communicationChannel.findFirstOrThrow({ where: { id: channel.id, status: "ACTIVE" }, select: { id: true, provider: true, emailAddress: true, displayName: true, credentialsEncrypted: true, lastSyncAt: true } })
  const credentials = readOAuthCredentials(current)
  if (new Date(credentials.expiresAt).getTime() > Date.now() + 5 * 60_000) return credentials
  await control.assertOwned()
  const refreshed = await refreshEmailOAuthAccessToken(provider, credentials.refreshToken)
  await control.assertOwned()
  const updated = {
    mode: "OAUTH" as const,
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token || credentials.refreshToken,
    tokenType: refreshed.token_type || credentials.tokenType,
    scope: refreshed.scope || credentials.scope,
    expiresAt: new Date(Date.now() + Math.max(60, refreshed.expires_in ?? 3600) * 1000).toISOString(),
    calendarCursor: credentials.calendarCursor,
    calendarCursorKind: credentials.calendarCursorKind,
  }
  // A concurrent cursor write is merged with the refreshed token; a reconnect
  // or disconnect must never be overwritten by an old refresh response.
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await control.assertOwned()
    const latest = await prisma.communicationChannel.findFirstOrThrow({ where: { id: channel.id, status: "ACTIVE" }, select: { id: true, provider: true, emailAddress: true, displayName: true, credentialsEncrypted: true, lastSyncAt: true } })
    const latestCredentials = readOAuthCredentials(latest)
    if (latestCredentials.refreshToken !== credentials.refreshToken || latestCredentials.accessToken !== credentials.accessToken) throw new Error("La connexion OAuth a changé pendant le renouvellement")
    const merged = { ...latestCredentials, ...updated, calendarCursor: latestCredentials.calendarCursor, calendarCursorKind: latestCredentials.calendarCursorKind }
    const stored = await prisma.communicationChannel.updateMany({ where: { id: channel.id, status: "ACTIVE", credentialsEncrypted: latest.credentialsEncrypted }, data: { credentialsEncrypted: encrypt(JSON.stringify(merged)), lastError: null } })
    if (stored.count === 1) return merged
  }
  throw new Error("Le renouvellement OAuth nécessite une reprise")
  })
  if (refresh.acquired) return refresh.value
  throw new Error("Un renouvellement OAuth est en cours ; réessayez la synchronisation")
}

export async function validOAuthAccessToken(channel: ActiveChannel) {
  return (await validOAuthCredentials(channel)).accessToken
}

export async function storeOAuthCalendarCursor(channel: ActiveChannel, cursor: string | null) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
  const current = await prisma.communicationChannel.findUnique({
    where: { id: channel.id },
    select: { id: true, provider: true, emailAddress: true, displayName: true, credentialsEncrypted: true, lastSyncAt: true },
  })
  if (!current) throw new Error("Messagerie introuvable")
  const credentials = readOAuthCredentials(current)
  const updated: OAuthCredentials = {
    ...credentials,
    calendarCursor: cursor || undefined,
    calendarCursorKind: cursor
      ? channel.provider === "GOOGLE" ? "GOOGLE_SYNC_TOKEN" : "MICROSOFT_DELTA_LINK"
      : undefined,
  }
  const saved = await prisma.communicationChannel.updateMany({
    where: { id: channel.id, status: "ACTIVE", credentialsEncrypted: current.credentialsEncrypted },
    data: { credentialsEncrypted: encrypt(JSON.stringify(updated)) },
  })
  if (saved.count === 1) return
  }
  throw new Error("La connexion OAuth a changé pendant l’enregistrement du calendrier")
}

export type EmailProviderState = {
  provider?: string | null
  channelId?: string | null
  providerDraftId?: string | null
  providerMessageId?: string | null
}

export type PreparedEmailProviderState = Required<Pick<EmailProviderState, "provider" | "channelId" | "providerDraftId" | "providerMessageId">>

function deterministicMessageId(idempotencyKey: string) {
  const local = idempotencyKey.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || "message"
  return `<${local}@mail.freelio.app>`
}

function mimeMessage(input: { from: string; to: string; cc?: string[]; bcc?: string[]; replyTo?: string | null; subject: string; html: string; text?: string; messageId: string; headers?: Record<string, string>; attachments?: LoadedEmailAttachment[] }) {
  const subject = Buffer.from(input.subject, "utf8").toString("base64")
  const body = Buffer.from(input.html, "utf8").toString("base64").replace(/(.{76})/g, "$1\r\n")
  const headers = [
    `From: ${input.from}`,
    `To: ${input.to}`,
    ...(input.cc?.length ? [`Cc: ${input.cc.join(", ")}`] : []),
    // The provider consumes Bcc from the submitted MIME envelope. Reading DTOs
    // never expose this header or the stored bccAddresses.
    ...(input.bcc?.length ? [`Bcc: ${input.bcc.join(", ")}`] : []),
    `Message-ID: ${input.messageId}`,
    ...(input.replyTo ? [`Reply-To: ${input.replyTo}`] : []),
    ...Object.entries(input.headers || {}).filter(([name]) => /^[A-Za-z0-9-]+$/.test(name)).map(([name, value]) => `${name}: ${value.replace(/[\r\n]+/g, " ")}`),
    `Subject: =?UTF-8?B?${subject}?=`,
    "MIME-Version: 1.0",
  ]
  const htmlPart = ["Content-Type: text/html; charset=UTF-8", "Content-Transfer-Encoding: base64", "", body].join("\r\n")
  let contentPart = htmlPart
  if (input.text !== undefined) {
    const boundary = `freelio-alt-${createHash("sha256").update(input.messageId).digest("hex").slice(0, 32)}`
    const text = Buffer.from(input.text, "utf8").toString("base64").replace(/(.{76})/g, "$1\r\n")
    const textPart = ["Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "", text].join("\r\n")
    contentPart = [`Content-Type: multipart/alternative; boundary="${boundary}"`, "", `--${boundary}`, textPart, `--${boundary}`, htmlPart, `--${boundary}--`, ""].join("\r\n")
  }
  if (!input.attachments?.length) return [...headers, contentPart].join("\r\n")
  const boundary = `freelio-${createHash("sha256").update(input.messageId).digest("hex").slice(0, 32)}`
  const parts = input.attachments.map(file => {
    const name = encodeURIComponent(file.name).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16)}`)
    return [`Content-Type: ${file.type}`, `Content-Disposition: attachment; filename*=UTF-8''${name}`, `Content-ID: <freelio-${file.id}>`, "Content-Transfer-Encoding: base64", "", file.bytes.toString("base64").replace(/(.{76})/g, "$1\r\n")].join("\r\n")
  })
  return [...headers, `Content-Type: multipart/mixed; boundary="${boundary}"`, "", `--${boundary}`, contentPart, ...parts.flatMap(part => [`--${boundary}`, part]), `--${boundary}--`, ""].join("\r\n")
}

export async function sendEmailThroughChannel(input: {
  companyId: string
  channelId?: string | null
  companyName: string
  from?: string
  to: string
  cc?: string[]
  bcc?: string[]
  attachments?: LoadedEmailAttachment[]
  replyTo?: string | null
  subject: string
  html: string
  text?: string
  idempotencyKey: string
  headers?: Record<string, string>
  reply?: ReplyContext
  resume?: EmailProviderState
  onPrepared?: (state: PreparedEmailProviderState) => Promise<void>
  beforeDispatch?: () => Promise<void>
}) {
  input = { ...input, to: emailAddressSchema.parse(input.to), cc: copyRecipientsSchema.parse(input.cc || []), bcc: copyRecipientsSchema.parse(input.bcc || []) }
  validateRecipients(input.to, input.cc, input.bcc)
  emailAttachmentsSchema.parse(input.attachments || [])
  for (const file of input.attachments || []) if (file.bytes.length !== file.size || createHash("sha256").update(file.bytes).digest("hex") !== file.sha256 || !hasExpectedSignature(file.type, file.bytes)) throw new Error("Pièce jointe altérée ou invalide")
  if (Object.keys(input.headers || {}).some(name => /^(to|cc|bcc)$/i.test(name))) throw new Error("Les destinataires doivent être renseignés dans leurs champs dédiés")
  const assertRecipientsAllowed = async () => {
    for (const address of [input.to, ...input.cc!, ...input.bcc!]) {
      const suppression = await activeEmailSuppression(input.companyId, address)
      if (suppression) throw new Error(`Envoi bloqué : adresse supprimée de la diffusion (${suppression.reason.toLowerCase().replaceAll("_", " ")})`)
    }
  }
  await assertRecipientsAllowed()
  const channel = await activeCommunicationChannel(input.companyId, input.resume?.channelId || input.channelId)
  if (channel.mailEnabled === false) throw new Error("Les e-mails sont désactivés pour cette connexion")
  const beforeDispatch = async () => {
    await input.beforeDispatch?.()
    await assertRecipientsAllowed()
    const current = await activeCommunicationChannel(input.companyId, channel.id)
    if (current.mailEnabled === false || current.provider !== channel.provider || current.emailAddress !== channel.emailAddress) throw new Error("La messagerie a changé avant l’envoi")
  }
  if (input.resume?.provider && input.resume.provider !== channel.provider) throw new Error("La messagerie de reprise ne correspond plus au fournisseur initial")
  const from = input.from ?? formatMailboxSender(channel.displayName || input.companyName, channel.emailAddress)
  const fromAddress = (from.match(/<([^<>]+)>$/)?.[1] || from).trim().toLowerCase()
  if (/[\r\n]/.test(from) || fromAddress !== channel.emailAddress.trim().toLowerCase()) throw new Error("L’expéditeur préparé ne correspond plus à la messagerie")
  let messageId = input.resume?.providerMessageId || deterministicMessageId(input.idempotencyKey)
  const reply = input.reply ? replyContextSchema.parse(input.reply) : null
  if (reply && (reply.provider !== channel.provider || canonicalEmailSubject(input.subject) !== canonicalEmailSubject(reply.subject))) throw new Error("La réponse ne correspond pas au fournisseur ou à l’objet préparé")
  const remoteReplyId = reply && channel.provider !== "RESEND"
    ? reply.providerId?.startsWith(`${channel.id}:`) ? reply.providerId.slice(channel.id.length + 1) : null : null
  if (reply && channel.provider !== "RESEND" && (!remoteReplyId || /[\r\n]/.test(remoteReplyId))) throw new Error("Référence de réponse hors de la boîte expéditrice")

  if (channel.provider === "RESEND") {
    const transport = await getResendTransport(input.companyId, channel.id === "platform" ? null : channel.id)
    await input.onPrepared?.({ provider: "RESEND", channelId: channel.id, providerDraftId: null, providerMessageId: null })
    await beforeDispatch()
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${transport.apiKey}`, "Idempotency-Key": input.idempotencyKey },
      body: JSON.stringify({ from, to: [input.to], cc: input.cc!.length ? input.cc : undefined, bcc: input.bcc!.length ? input.bcc : undefined, reply_to: input.replyTo || undefined, subject: input.subject, html: input.html, text: input.text, attachments: input.attachments?.length ? input.attachments.map(file => ({ filename: file.name, content: file.bytes.toString("base64") })) : undefined, headers: { ...input.headers, ...(reply ? replyHeaders(reply) : {}) } }),
    })
    const payload = await response.json().catch(() => ({})) as { id?: string; message?: string }
    if (!response.ok || !payload.id) throw new Error(payload.message || `Envoi refusé (${response.status})`)
    return { provider: "RESEND", providerId: payload.id, providerDraftId: null, providerMessageId: payload.id, channelId: channel.id, from }
  }

  const provider = channel.provider as EmailOAuthProvider
  const credentials = await validOAuthCredentials(channel)
  if (!mailScopeGranted(provider, credentials.scope, "SEND")) throw new MailReconnectRequiredError("Reconnectez cette messagerie pour autoriser l’envoi")
  const scopes = new Set(credentials.scope.toLowerCase().split(/\s+/))
  if (provider === "GOOGLE" ? !scopes.has("https://mail.google.com/") && !scopes.has("https://www.googleapis.com/auth/gmail.modify") : !scopes.has("mail.readwrite")) {
    throw new MailReconnectRequiredError("Reconnectez cette messagerie pour autoriser les brouillons et la reprise des envois")
  }
  const accessToken = credentials.accessToken
  if (provider === "GOOGLE") {
    const headers = { authorization: `Bearer ${accessToken}`, "content-type": "application/json" }
    let draftId = input.resume?.providerDraftId || null
    let persistedDraftDisappeared = false
    if (draftId) {
      const draftCheck = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/drafts/${encodeURIComponent(draftId)}`, { headers })
      if (draftCheck.status === 404) {
        persistedDraftDisappeared = true
        draftId = null
      }
      else if (!draftCheck.ok) throw new Error(`Vérification du brouillon Google refusée (${draftCheck.status})`)
    }
    if (!draftId) {
      const query = new URLSearchParams({ q: `rfc822msgid:${messageId}`, maxResults: "1" })
      const sentCheck = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${query}`, { headers })
      const sentPayload = await sentCheck.json().catch(() => ({})) as { messages?: Array<{ id: string }>; error?: { message?: string } }
      if (!sentCheck.ok) throw new Error(sentPayload.error?.message || `Vérification Google refusée (${sentCheck.status})`)
      const alreadySentId = sentPayload.messages?.[0]?.id
      if (alreadySentId) return { provider, providerId: `${channel.id}:${alreadySentId}`, providerDraftId: null, providerMessageId: messageId, channelId: channel.id, from }
      if (persistedDraftDisappeared) throw new Error("État d’envoi Google incertain : vérification différée avant toute nouvelle création")

      let nativeThreadId: string | undefined
      let mimeHeaders = input.headers
      if (reply) {
        const metadataQuery = new URLSearchParams({ format: "metadata" })
        for (const name of ["Message-ID", "Subject", "References", "Reply-To", "From"]) metadataQuery.append("metadataHeaders", name)
        const originalResponse = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(remoteReplyId!)}?${metadataQuery}`, { headers })
        const original = await originalResponse.json().catch(() => ({})) as { id?: string; threadId?: string; payload?: { headers?: Array<{ name: string; value: string }> } }
        if (!originalResponse.ok || original.id !== remoteReplyId || !original.threadId) throw new Error("Message Gmail d’origine introuvable ; aucune réponse créée")
        const header = (name: string) => original.payload?.headers?.find(item => item.name.toLowerCase() === name.toLowerCase())?.value || ""
        const replyTo = header("Reply-To") || header("From")
        mimeHeaders = { ...input.headers, ...replyHeaders(reply, { internetMessageId: header("Message-ID"), subject: header("Subject"), references: header("References"),
          replyTo: replyMailboxAddresses(replyTo) }, input.to) }
        nativeThreadId = original.threadId
      }
      const raw = Buffer.from(mimeMessage({ from, to: input.to, cc: input.cc, bcc: input.bcc, replyTo: input.replyTo, subject: input.subject, html: input.html, text: input.text, messageId, headers: mimeHeaders, attachments: input.attachments }), "utf8").toString("base64url")
      await beforeDispatch()
      const draftResponse = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/drafts", { method: "POST", headers, body: JSON.stringify({ message: { raw, ...(nativeThreadId ? { threadId: nativeThreadId } : {}) } }) })
      const draft = await draftResponse.json().catch(() => ({})) as { id?: string; error?: { message?: string } }
      if (!draftResponse.ok || !draft.id) throw new Error(draft.error?.message || `Création du brouillon Google refusée (${draftResponse.status})`)
      draftId = draft.id
      await input.onPrepared?.({ provider, channelId: channel.id, providerDraftId: draftId, providerMessageId: messageId })
    }
    await beforeDispatch()
    const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/drafts/send", { method: "POST", headers, body: JSON.stringify({ id: draftId }) })
    const payload = await response.json().catch(() => ({})) as { id?: string; error?: { message?: string } }
    if (!response.ok || !payload.id) throw new Error(payload.error?.message || `Envoi Google refusé (${response.status})`)
    return { provider, providerId: `${channel.id}:${payload.id}`, providerDraftId: draftId, providerMessageId: messageId, channelId: channel.id, from }
  }

  const graphHeaders = { authorization: `Bearer ${accessToken}`, Prefer: 'IdType="ImmutableId"' }
  let draftId = input.resume?.providerDraftId || null
  let persistedDraftDisappeared = false
  if (draftId) {
    const check = await fetch(`https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(draftId)}?$select=id,isDraft,internetMessageId`, { headers: graphHeaders })
    if (check.status === 404) {
      persistedDraftDisappeared = true
      draftId = null
    }
    else {
      const state = await check.json().catch(() => ({})) as { id?: string; isDraft?: boolean; error?: { message?: string } }
      if (!check.ok) throw new Error(state.error?.message || `Vérification Microsoft refusée (${check.status})`)
      if (state.isDraft === false) return { provider, providerId: `${channel.id}:${state.id || draftId}`, providerDraftId: draftId, providerMessageId: messageId, channelId: channel.id, from }
    }
  }
  if (!draftId) {
    const filter = `internetMessageId eq '${messageId.replaceAll("'", "''")}'`
    const query = new URLSearchParams({ "$filter": filter, "$select": "id,isDraft,internetMessageId", "$top": "1" })
    const sentCheck = await fetch(`https://graph.microsoft.com/v1.0/me/messages?${query}`, { headers: graphHeaders })
    const sentPayload = await sentCheck.json().catch(() => ({})) as { value?: Array<{ id: string; isDraft?: boolean }>; error?: { message?: string } }
    if (!sentCheck.ok) throw new Error(sentPayload.error?.message || `Vérification Microsoft refusée (${sentCheck.status})`)
    const existing = sentPayload.value?.find((message) => message.isDraft === false)
    if (existing) return { provider, providerId: `${channel.id}:${existing.id}`, providerDraftId: null, providerMessageId: messageId, channelId: channel.id, from }
    if (persistedDraftDisappeared) throw new Error("État d’envoi Microsoft incertain : vérification différée avant toute nouvelle création")

    let mimeHeaders = input.headers
    if (reply) {
      const originalResponse = await fetch(`https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(remoteReplyId!)}?$select=id,internetMessageId,subject,replyTo,from`, { headers: graphHeaders })
      const original = await originalResponse.json().catch(() => ({})) as { id?: string; internetMessageId?: string; subject?: string; replyTo?: Array<{ emailAddress?: { address?: string } }>; from?: { emailAddress?: { address?: string } } }
      if (!originalResponse.ok || original.id !== remoteReplyId) throw new Error("Message Microsoft d’origine introuvable ; aucune réponse créée")
      mimeHeaders = { ...input.headers, ...replyHeaders(reply, { internetMessageId: original.internetMessageId || "", subject: original.subject || "", replyTo: original.replyTo?.length ? original.replyTo.map(item => item.emailAddress?.address || "") : [original.from?.emailAddress?.address || ""] }, input.to) }
    }
    const raw = Buffer.from(mimeMessage({ from, to: input.to, cc: input.cc, bcc: input.bcc, replyTo: input.replyTo, subject: input.subject, html: input.html, text: input.text, messageId, headers: mimeHeaders }), "utf8").toString("base64")
    await beforeDispatch()
    const draftResponse = await fetch(reply ? `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(remoteReplyId!)}/createReply` : "https://graph.microsoft.com/v1.0/me/messages", {
      method: "POST",
      headers: { ...graphHeaders, "content-type": "text/plain" },
      body: raw,
    })
    const draft = await draftResponse.json().catch(() => ({})) as { id?: string; internetMessageId?: string; error?: { message?: string } }
    if (!draftResponse.ok || !draft.id) throw new Error(draft.error?.message || `Création du message Microsoft refusée (${draftResponse.status})`)
    draftId = draft.id
    if (draft.internetMessageId) {
      if (!validInternetMessageId(draft.internetMessageId)) throw new Error("Référence Internet du brouillon Microsoft invalide")
      messageId = draft.internetMessageId
    }
    await input.onPrepared?.({ provider, channelId: channel.id, providerDraftId: draftId, providerMessageId: messageId })
  }
  if (input.attachments?.length) await prepareGraphAttachments(draftId, graphHeaders, input.attachments, beforeDispatch)
  await beforeDispatch()
  const response = await fetch(`https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(draftId)}/send`, {
    method: "POST",
    headers: graphHeaders,
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { error?: { message?: string } }
    throw new Error(payload.error?.message || `Envoi Microsoft refusé (${response.status})`)
  }
  return { provider, providerId: `${channel.id}:${draftId}`, providerDraftId: draftId, providerMessageId: messageId, channelId: channel.id, from }
}
