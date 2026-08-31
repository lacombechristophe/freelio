import "server-only"

import { z } from "zod"

import { formatMailboxSender, getResendTransport } from "@/lib/communications/provider-credentials"
import { decrypt, encrypt } from "@/lib/crypto"
import { EMAIL_OAUTH_PROVIDERS, refreshEmailOAuthAccessToken, type EmailOAuthProvider } from "@/lib/integrations/email-oauth"
import prisma from "@/lib/prisma"

const oauthCredentialsSchema = z.object({
  mode: z.literal("OAUTH"),
  accessToken: z.string().min(10),
  refreshToken: z.string().min(10),
  tokenType: z.string().default("Bearer"),
  scope: z.string().default(""),
  expiresAt: z.string().datetime(),
})

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

export async function validOAuthAccessToken(channel: ActiveChannel) {
  if (!EMAIL_OAUTH_PROVIDERS.includes(channel.provider as EmailOAuthProvider) || !channel.credentialsEncrypted) throw new Error("Autorisation OAuth absente")
  const provider = channel.provider as EmailOAuthProvider
  const credentials = oauthCredentialsSchema.parse(JSON.parse(decrypt(channel.credentialsEncrypted)))
  if (new Date(credentials.expiresAt).getTime() > Date.now() + 5 * 60_000) return credentials.accessToken
  const refreshed = await refreshEmailOAuthAccessToken(provider, credentials.refreshToken)
  const updated = {
    mode: "OAUTH" as const,
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token || credentials.refreshToken,
    tokenType: refreshed.token_type || credentials.tokenType,
    scope: refreshed.scope || credentials.scope,
    expiresAt: new Date(Date.now() + Math.max(60, refreshed.expires_in ?? 3600) * 1000).toISOString(),
  }
  await prisma.communicationChannel.update({ where: { id: channel.id }, data: { credentialsEncrypted: encrypt(JSON.stringify(updated)), lastError: null } })
  return updated.accessToken
}

function mimeMessage(input: { from: string; to: string; replyTo?: string | null; subject: string; html: string; headers?: Record<string, string> }) {
  const subject = Buffer.from(input.subject, "utf8").toString("base64")
  const body = Buffer.from(input.html, "utf8").toString("base64").replace(/(.{76})/g, "$1\r\n")
  return [
    `From: ${input.from}`,
    `To: ${input.to}`,
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
}) {
  const channel = await activeCommunicationChannel(input.companyId, input.channelId)
  const from = formatMailboxSender(channel.displayName || input.companyName, channel.emailAddress)

  if (channel.provider === "RESEND") {
    const transport = await getResendTransport(input.companyId, channel.id === "platform" ? null : channel.id)
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${transport.apiKey}`, "Idempotency-Key": input.idempotencyKey },
      body: JSON.stringify({ from, to: [input.to], reply_to: input.replyTo || undefined, subject: input.subject, html: input.html, headers: input.headers }),
    })
    const payload = await response.json().catch(() => ({})) as { id?: string; message?: string }
    if (!response.ok || !payload.id) throw new Error(payload.message || `Envoi refusé (${response.status})`)
    return { provider: "RESEND", providerId: payload.id, from }
  }

  const provider = channel.provider as EmailOAuthProvider
  const accessToken = await validOAuthAccessToken(channel)
  if (provider === "GOOGLE") {
    const raw = Buffer.from(mimeMessage({ from, to: input.to, replyTo: input.replyTo, subject: input.subject, html: input.html, headers: input.headers }), "utf8").toString("base64url")
    const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ raw }),
    })
    const payload = await response.json().catch(() => ({})) as { id?: string; error?: { message?: string } }
    if (!response.ok || !payload.id) throw new Error(payload.error?.message || `Envoi Google refusé (${response.status})`)
    return { provider, providerId: `${channel.id}:${payload.id}`, from }
  }

  // Creating the draft first gives us a stable provider identifier. Requesting
  // immutable IDs prevents the identifier changing when Graph moves it to Sent.
  const draftResponse = await fetch("https://graph.microsoft.com/v1.0/me/messages", {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json", Prefer: 'IdType="ImmutableId"' },
    body: JSON.stringify({ subject: input.subject, body: { contentType: "HTML", content: input.html }, toRecipients: [{ emailAddress: { address: input.to } }], ...(input.replyTo ? { replyTo: [{ emailAddress: { address: input.replyTo } }] } : {}) }),
  })
  const draft = await draftResponse.json().catch(() => ({})) as { id?: string; error?: { message?: string } }
  if (!draftResponse.ok || !draft.id) throw new Error(draft.error?.message || `Création du message Microsoft refusée (${draftResponse.status})`)
  const response = await fetch(`https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(draft.id)}/send`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, Prefer: 'IdType="ImmutableId"' },
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { error?: { message?: string } }
    throw new Error(payload.error?.message || `Envoi Microsoft refusé (${response.status})`)
  }
  return { provider, providerId: `${channel.id}:${draft.id}`, from }
}
