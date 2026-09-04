import "server-only"

import { z } from "zod"

import { formatMailboxSender, getResendTransport } from "@/lib/communications/provider-credentials"
import { decrypt, encrypt } from "@/lib/crypto"
import { EMAIL_OAUTH_PROVIDERS, refreshEmailOAuthAccessToken, type EmailOAuthProvider } from "@/lib/integrations/email-oauth"
import prisma from "@/lib/prisma"
import { activeEmailSuppression } from "@/lib/communications/suppressions"

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
}

export async function activeCommunicationChannel(companyId: string, channelId?: string | null): Promise<ActiveChannel> {
  const channel = await prisma.communicationChannel.findFirst({
    where: { companyId, status: "ACTIVE", ...(channelId ? { id: channelId } : {}) },
    select: { id: true, provider: true, emailAddress: true, displayName: true, credentialsEncrypted: true, lastSyncAt: true },
    // Without an explicit channel (manual compose supplies one), the most
    // recently configured mailbox is the deterministic default for automations.
    orderBy: { updatedAt: "desc" },
  })
  if (!channel && !channelId) {
    const configuredFrom = process.env.EMAIL_FROM?.trim() || ""
    const emailAddress = (configuredFrom.match(/<([^>]+)>/)?.[1] || configuredFrom).trim().toLowerCase()
    if (process.env.RESEND_API_KEY?.trim() && emailAddress) {
      return { id: "platform", provider: "RESEND", emailAddress, displayName: null, credentialsEncrypted: null, lastSyncAt: null }
    }
  }
  if (!channel) throw new Error("Aucune messagerie active. Connectez-en une dans Communications > Intégrations")
  return channel
}

export function readOAuthCredentials(channel: ActiveChannel): OAuthCredentials {
  if (!EMAIL_OAUTH_PROVIDERS.includes(channel.provider as EmailOAuthProvider) || !channel.credentialsEncrypted) throw new Error("Autorisation OAuth absente")
  return oauthCredentialsSchema.parse(JSON.parse(decrypt(channel.credentialsEncrypted)))
}

export async function validOAuthCredentials(channel: ActiveChannel) {
  if (!EMAIL_OAUTH_PROVIDERS.includes(channel.provider as EmailOAuthProvider)) throw new Error("Autorisation OAuth absente")
  const provider = channel.provider as EmailOAuthProvider
  const credentials = readOAuthCredentials(channel)
  if (new Date(credentials.expiresAt).getTime() > Date.now() + 5 * 60_000) return credentials
  const refreshed = await refreshEmailOAuthAccessToken(provider, credentials.refreshToken)
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
  await prisma.communicationChannel.update({ where: { id: channel.id }, data: { credentialsEncrypted: encrypt(JSON.stringify(updated)), lastError: null } })
  return updated
}

export async function validOAuthAccessToken(channel: ActiveChannel) {
  return (await validOAuthCredentials(channel)).accessToken
}

export async function storeOAuthCalendarCursor(channel: ActiveChannel, cursor: string | null) {
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
  await prisma.communicationChannel.update({
    where: { id: channel.id },
    data: { credentialsEncrypted: encrypt(JSON.stringify(updated)) },
  })
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

function mimeMessage(input: { from: string; to: string; replyTo?: string | null; subject: string; html: string; messageId: string; headers?: Record<string, string> }) {
  const subject = Buffer.from(input.subject, "utf8").toString("base64")
  const body = Buffer.from(input.html, "utf8").toString("base64").replace(/(.{76})/g, "$1\r\n")
  return [
    `From: ${input.from}`,
    `To: ${input.to}`,
    `Message-ID: ${input.messageId}`,
    ...(input.replyTo ? [`Reply-To: ${input.replyTo}`] : []),
    ...Object.entries(input.headers || {}).filter(([name]) => /^[A-Za-z0-9-]+$/.test(name)).map(([name, value]) => `${name}: ${value.replace(/[\r\n]+/g, " ")}`),
    `Subject: =?UTF-8?B?${subject}?=`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    body,
  ].join("\r\n")
}

export async function sendEmailThroughChannel(input: {
  companyId: string
  channelId?: string | null
  companyName: string
  to: string
  replyTo?: string | null
  subject: string
  html: string
  idempotencyKey: string
  headers?: Record<string, string>
  resume?: EmailProviderState
  onPrepared?: (state: PreparedEmailProviderState) => Promise<void>
}) {
  const suppression = await activeEmailSuppression(input.companyId, input.to)
  if (suppression) throw new Error(`Envoi bloqué : adresse supprimée de la diffusion (${suppression.reason.toLowerCase().replaceAll("_", " ")})`)
  const channel = await activeCommunicationChannel(input.companyId, input.resume?.channelId || input.channelId)
  if (input.resume?.provider && input.resume.provider !== channel.provider) throw new Error("La messagerie de reprise ne correspond plus au fournisseur initial")
  const from = formatMailboxSender(channel.displayName || input.companyName, channel.emailAddress)
  const messageId = input.resume?.providerMessageId || deterministicMessageId(input.idempotencyKey)

  if (channel.provider === "RESEND") {
    const transport = await getResendTransport(input.companyId, channel.id === "platform" ? null : channel.id)
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${transport.apiKey}`, "Idempotency-Key": input.idempotencyKey },
      body: JSON.stringify({ from, to: [input.to], reply_to: input.replyTo || undefined, subject: input.subject, html: input.html, headers: input.headers }),
    })
    const payload = await response.json().catch(() => ({})) as { id?: string; message?: string }
    if (!response.ok || !payload.id) throw new Error(payload.message || `Envoi refusé (${response.status})`)
    return { provider: "RESEND", providerId: payload.id, providerDraftId: null, providerMessageId: payload.id, channelId: channel.id, from }
  }

  const provider = channel.provider as EmailOAuthProvider
  const accessToken = await validOAuthAccessToken(channel)
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

      const raw = Buffer.from(mimeMessage({ from, to: input.to, replyTo: input.replyTo, subject: input.subject, html: input.html, messageId, headers: input.headers }), "utf8").toString("base64url")
      const draftResponse = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/drafts", { method: "POST", headers, body: JSON.stringify({ message: { raw } }) })
      const draft = await draftResponse.json().catch(() => ({})) as { id?: string; error?: { message?: string } }
      if (!draftResponse.ok || !draft.id) throw new Error(draft.error?.message || `Création du brouillon Google refusée (${draftResponse.status})`)
      draftId = draft.id
      await input.onPrepared?.({ provider, channelId: channel.id, providerDraftId: draftId, providerMessageId: messageId })
    }
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

    const raw = Buffer.from(mimeMessage({ from, to: input.to, replyTo: input.replyTo, subject: input.subject, html: input.html, messageId, headers: input.headers }), "utf8").toString("base64")
    const draftResponse = await fetch("https://graph.microsoft.com/v1.0/me/messages", {
      method: "POST",
      headers: { ...graphHeaders, "content-type": "text/plain" },
      body: raw,
    })
    const draft = await draftResponse.json().catch(() => ({})) as { id?: string; error?: { message?: string } }
    if (!draftResponse.ok || !draft.id) throw new Error(draft.error?.message || `Création du message Microsoft refusée (${draftResponse.status})`)
    draftId = draft.id
    await input.onPrepared?.({ provider, channelId: channel.id, providerDraftId: draftId, providerMessageId: messageId })
  }
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
