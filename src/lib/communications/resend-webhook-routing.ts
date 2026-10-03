import { Resend, type WebhookEventPayload } from "resend"
import prisma from "@/lib/prisma"
import { readResendCredentials } from "@/lib/communications/provider-credentials"

export class WebhookRoutingPendingError extends Error {}
export type VerifiedWebhookScope = { companyId: string; channelId: string | null; apiKey: string; event: WebhookEventPayload }
function address(value: string) { return (value.match(/<([^>]+)>/)?.[1] || value).trim().toLowerCase() }

/** Payload hints select candidates; only a verified signature selects a tenant. */
export async function verifiedResendWebhook(payload: string, headers: { id: string; timestamp: string; signature: string }, explicitChannelId?: string | null): Promise<VerifiedWebhookScope> {
  const hint = JSON.parse(payload) as { type?: unknown; data?: { email_id?: unknown; to?: unknown; received_for?: unknown } }
  const recipients = [...(Array.isArray(hint.data?.to) ? hint.data.to : []), ...(Array.isArray(hint.data?.received_for) ? hint.data.received_for : [])].filter((value): value is string => typeof value === "string").slice(0, 100).map(address)
  let identities: Array<{ companyId: string; channelId: string | null }> = []
  if (hint.type !== "email.received" && typeof hint.data?.email_id === "string") {
    const [messages, deliveries] = await Promise.all([
      prisma.emailMessage.findMany({ where: { provider: "RESEND", providerId: hint.data.email_id }, select: { companyId: true, thread: { select: { channelId: true } } }, take: 11 }),
      prisma.emailDelivery.findMany({ where: { provider: "RESEND", providerId: hint.data.email_id }, select: { companyId: true, channelId: true }, take: 11 }),
    ])
    identities = [...messages.map((message) => ({ companyId: message.companyId, channelId: message.thread.channelId })), ...deliveries]
    if (identities.length > 20) throw new Error("Rattachement webhook ambigu")
  }
  const channelIds = identities.flatMap((identity) => identity.channelId ? [identity.channelId] : [])
  const channels = await prisma.communicationChannel.findMany({ where: {
    provider: "RESEND", status: "ACTIVE",
    ...(explicitChannelId ? { id: explicitChannelId } : hint.type === "email.received" ? { emailAddress: { in: recipients } } : { id: { in: channelIds } }),
  }, select: { id: true, companyId: true, emailAddress: true, credentialsEncrypted: true }, take: 6 })
  if (channels.length > 5) throw new Error("Précisez la connexion dans l’URL du webhook")
  const candidates: Array<{ companyId: string | null; channelId: string | null; emailAddress?: string; apiKey: string; secret: string }> = []
  const platformKey = process.env.RESEND_API_KEY?.trim(), platformSecret = process.env.RESEND_WEBHOOK_SECRET?.trim()
  for (const channel of channels) {
    const stored = readResendCredentials(channel.credentialsEncrypted)
    const apiKey = stored?.apiKey || platformKey, secret = stored?.webhookSecret || platformSecret
    if (apiKey && secret) candidates.push({ companyId: channel.companyId, channelId: channel.id, emailAddress: channel.emailAddress, apiKey, secret })
  }
  if (!explicitChannelId && platformKey && platformSecret) {
    const companyIds = [...new Set(identities.filter((identity) => !identity.channelId).map((identity) => identity.companyId))]
    for (const companyId of companyIds) candidates.push({ companyId, channelId: null, apiKey: platformKey, secret: platformSecret })
    if (!candidates.length) candidates.push({ companyId: null, channelId: null, apiKey: platformKey, secret: platformSecret })
  }
  const verified: VerifiedWebhookScope[] = []
  let authenticatedWithoutTenant = false
  for (const candidate of candidates) {
    let event: WebhookEventPayload
    try { event = new Resend(candidate.apiKey).webhooks.verify({ payload, headers, webhookSecret: candidate.secret }) } catch { continue }
    if (!candidate.companyId) { authenticatedWithoutTenant = true; continue }
    if (event.type === "email.received" && (!candidate.emailAddress || ![...event.data.to, ...event.data.received_for].map(address).includes(candidate.emailAddress))) continue
    if (!verified.some((scope) => scope.companyId === candidate.companyId && scope.channelId === candidate.channelId)) verified.push({ companyId: candidate.companyId, channelId: candidate.channelId, apiKey: candidate.apiKey, event })
  }
  if (verified.length > 1) throw new Error("Rattachement webhook ambigu ; utilisez une URL dédiée à la connexion")
  if (!verified.length) {
    if (authenticatedWithoutTenant) throw new WebhookRoutingPendingError("Référence d’envoi pas encore persistée")
    throw new Error("Signature ou connexion webhook invalide")
  }
  return verified[0]
}
