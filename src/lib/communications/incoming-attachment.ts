import "server-only"
import { readBodyBytes } from "@/lib/http-body"
import { hasExpectedSignature } from "@/lib/local-files"
import { providerFetch } from "@/lib/integrations/provider-fetch"
import prisma from "@/lib/prisma"
import { MAX_EMAIL_FILE_BYTES } from "./attachment-types"
import { activeCommunicationChannel, validOAuthCredentials } from "./email-provider"
import { mailScopeGranted } from "./capabilities"
import type { EmailOAuthProvider } from "@/lib/integrations/email-oauth"
import { mailHeaders, mailResourceId, MailReadError, readMailJson, readRemoteMail, type GmailMessage, type GmailPart } from "./oauth-mail-reader"
import { remoteAttachmentKey } from "./remote-mail-view"
import { remoteAttachmentRefusal, remoteMailObservationSchema } from "./remote-mail-types"

export class IncomingAttachmentError extends Error {
  constructor(message: string, public status: number) { super(message); this.name = "IncomingAttachmentError" }
}
export async function readIncomingAttachment(companyId: string, messageId: string, key: string) {
  const message = await prisma.emailMessage.findFirst({ where: { companyId, id: messageId, thread: { companyId } },
    select: { provider: true, providerId: true, remoteObservation: true, threadId: true } })
  if (!message || !["GOOGLE", "MICROSOFT"].includes(message.provider)) throw new IncomingAttachmentError("Pièce jointe introuvable", 404)
  const thread = await prisma.emailThread.findFirst({ where: { id: message.threadId, companyId }, select: { channelId: true } })
  if (!thread?.channelId) throw new IncomingAttachmentError("Pièce jointe introuvable", 404)
  const observed = remoteMailObservationSchema.safeParse(message.remoteObservation)
  const file = observed.success ? observed.data.attachments.find(file => remoteAttachmentKey(file) === key) : null
  if (!file) throw new IncomingAttachmentError("Pièce jointe introuvable ou modifiée ; actualisez la conversation", 404)
  if (observed.success && observed.data.presence === "MISSING") throw new IncomingAttachmentError("Le message n’est plus disponible chez le fournisseur ; sa copie CRM est conservée", 410)
  const refusal = remoteAttachmentRefusal(file)
  if (refusal) throw new IncomingAttachmentError(refusal, 422)
  const channel = await activeCommunicationChannel(companyId, thread.channelId)
  if (channel.mailEnabled === false || channel.provider !== message.provider || !message.providerId?.startsWith(`${channel.id}:`)) throw new IncomingAttachmentError("Messagerie indisponible pour cette pièce", 409)
  const credentials = await validOAuthCredentials(channel)
  if (!mailScopeGranted(channel.provider as EmailOAuthProvider, credentials.scope, "READ")) throw new IncomingAttachmentError("Reconnectez la messagerie pour lire les pièces jointes", 409)
  const remoteId = message.providerId.slice(channel.id.length + 1), token = credentials.accessToken
  const current = await readRemoteMail(channel, remoteId, token)
  if (!current) throw new IncomingAttachmentError("Le message n’est plus disponible chez le fournisseur", 410)
  if (!current.observation.attachments.some(item => remoteAttachmentKey(item) === key)) throw new IncomingAttachmentError("La pièce a changé chez le fournisseur ; synchronisez la messagerie", 409)
  let bytes: Buffer
  if (channel.provider === "MICROSOFT") {
    const response = await providerFetch(`https://graph.microsoft.com/v1.0/me/messages/${mailResourceId(remoteId)}/attachments/${mailResourceId(file.id)}/$value`, { headers: mailHeaders(token), cache: "no-store" })
    if (!response.ok) throw new MailReadError(response.status)
    bytes = Buffer.from(await readBodyBytes(response, MAX_EMAIL_FILE_BYTES))
  } else {
    let data: string | undefined
    if (file.kind === "GMAIL_ATTACHMENT") {
      const payload = await readMailJson<{ data?: string }>(await providerFetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${mailResourceId(remoteId)}/attachments/${mailResourceId(file.id)}`, { headers: mailHeaders(token), cache: "no-store" }), 7 * 1024 * 1024)
      data = payload.data
    } else {
      const payload = await readMailJson<GmailMessage>(await providerFetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${mailResourceId(remoteId)}?format=full`, { headers: mailHeaders(token), cache: "no-store" }), 12 * 1024 * 1024)
      const stack: GmailPart[] = payload.payload ? [payload.payload] : []
      let examined = 0
      while (stack.length && examined++ < 2000) {
        const part = stack.pop()!
        if (part.partId === file.id) { data = part.body?.data; break }
        stack.push(...part.parts || [])
      }
    }
    if (!data || !/^[A-Za-z0-9_-]+={0,2}$/.test(data) || data.length > Math.ceil(MAX_EMAIL_FILE_BYTES * 4 / 3) + 4) throw new IncomingAttachmentError("Contenu de pièce invalide ou trop volumineux", 422)
    bytes = Buffer.from(data, "base64url")
  }
  if (bytes.length !== file.size || bytes.length > MAX_EMAIL_FILE_BYTES || !hasExpectedSignature(file.type, bytes)) throw new IncomingAttachmentError("Le contenu de la pièce ne correspond pas aux métadonnées vérifiées", 422)
  // Check access again after the provider read. A disconnect or ACL revocation
  // must not expose bytes fetched under the previous authorization.
  if (!await prisma.emailMessage.count({ where: { companyId, id: messageId, thread: { companyId, channelId: channel.id } } })) throw new IncomingAttachmentError("Pièce jointe introuvable", 404)
  await activeCommunicationChannel(companyId, channel.id)
  return { bytes, name: file.name, type: file.type, channelId: channel.id }
}
