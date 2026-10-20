import "server-only"
import { enqueueAutomationEvent, dispatchAutomationEvent } from "@/lib/automations/engine"
import { getOrCreateEmailThread, resolveEmailParty } from "@/lib/communications/threads"
import type { ActiveChannel } from "./email-provider"
import type { EmailOAuthProvider } from "@/lib/integrations/email-oauth"
import prisma from "@/lib/prisma"
import { remoteMailObservationSchema, type ExternalMailMessage } from "./remote-mail-types"
function bounded(value: string | null | undefined, max = 100_000) { return value ? value.slice(0, max) : null }
function normalizedAddress(value: string) { return (value.match(/<([^>]+)>/)?.[1] || value).trim().toLowerCase() }

export async function persistRemoteMail(companyId: string, channel: ActiveChannel, message: ExternalMailMessage, emitReception: boolean) {
  const provider = channel.provider as EmailOAuthProvider
  const exists = await prisma.emailMessage.findUnique({ where: { companyId_provider_providerId: { companyId, provider, providerId: message.providerId } }, select: { id: true } })
  const observation = remoteMailObservationSchema.parse(message.observation)
  if (exists) {
    const updated = await prisma.emailMessage.updateMany({ where: { id: exists.id, companyId, thread: { companyId, channelId: channel.id } }, data: { remoteObservation: observation } })
    if (updated.count !== 1) throw new Error("Référence fournisseur liée à une autre messagerie")
    return false
  }
  const counterparty = message.direction === "INBOUND" ? normalizedAddress(message.from) : normalizedAddress(message.to[0] || "")
  const party = counterparty ? await resolveEmailParty(companyId, counterparty) : { contactId: null, clientId: null, leadCaptureId: null }
  const eventId = await prisma.$transaction(async (tx) => {
    const thread = await getOrCreateEmailThread({ companyId, channelId: channel.id, subject: message.subject, ...party, inReplyTo: message.inReplyTo, occurredAt: message.occurredAt }, tx)
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
      remoteObservation: observation,
      subject: bounded(message.subject, 250) || "Sans objet",
      bodyHtml: bounded(message.bodyHtml),
      bodyText: bounded(message.bodyText),
      status: message.direction === "INBOUND" ? "RECEIVED" : "SENT",
      receivedAt: message.direction === "INBOUND" ? message.occurredAt : null,
      sentAt: message.direction === "OUTBOUND" ? message.occurredAt : null,
    } })
    await tx.emailThread.update({ where: { id: thread.id }, data: { ...(message.occurredAt > thread.lastMessageAt ? { lastMessageAt: message.occurredAt } : {}), ...(emitReception ? { status: "OPEN" } : {}), ...(message.direction === "INBOUND" && message.unread ? { unreadCount: { increment: 1 } } : {}) } })
    if (message.direction !== "INBOUND" || !emitReception) return null
    await tx.emailSequenceEnrollment.updateMany({ where: { status: "ACTIVE", sequence: { companyId, senderChannelId: channel.id }, OR: [...(party.contactId ? [{ contactId: party.contactId }] : []), ...(party.leadCaptureId ? [{ leadCaptureId: party.leadCaptureId }] : [])] }, data: { status: "STOPPED", stopReason: "CUSTOMER_REPLIED", nextSendAt: null, completedAt: message.occurredAt } })
    return enqueueAutomationEvent(tx, { companyId, event: "EMAIL_RECEIVED", subjectModel: "EmailMessage", subjectId: stored.id, eventKey: `${provider.toLowerCase()}:${message.providerId}:received`, leadId: party.leadCaptureId || undefined, clientId: party.clientId || undefined })
  })
  if (eventId) await dispatchAutomationEvent(eventId).catch(() => undefined)
  return true
}
