import { z } from "zod"
import { activeCommunicationChannel, sendEmailThroughChannel } from "@/lib/communications/email-provider"
import { formatMailboxSender } from "@/lib/communications/provider-credentials"
import { recordOutgoingEmail } from "@/lib/communications/threads"
import prisma from "@/lib/prisma"
import { withProcessorLease } from "@/lib/processing/lease"
import { assertReplyContext, freezeReplyContext, replyContextSchema, validInternetMessageId } from "@/lib/communications/reply-context"

const payloadSchema = z.object({
  userId: z.string(), contactId: z.string(), clientId: z.string(), threadId: z.string().nullable(), serviceTicketId: z.string().nullable(),
  channelId: z.string(), companyName: z.string(), replyTo: z.string().nullable(), from: z.string(), to: z.string().email(), subject: z.string(), html: z.string(),
  reply: replyContextSchema.nullable().optional(),
})

type ManualSendInput = Omit<z.infer<typeof payloadSchema>, "from" | "channelId" | "reply"> & { companyId: string; requestKey: string; channelId: string | null }

async function assertReplyMailbox(companyId: string, payload: Pick<ManualSendInput, "threadId" | "clientId">, channelId: string) {
  if (!payload.threadId) return
  const thread = await prisma.emailThread.findFirst({ where: { id: payload.threadId, companyId, clientId: payload.clientId, channelId: channelId === "platform" ? null : channelId }, select: { id: true } })
  if (!thread) throw new Error("La conversation ne correspond plus au client ou à la boîte expéditrice")
}

export async function sendManualEmail(input: ManualSendInput) {
  // Persist the frozen payload and mailbox BEFORE any remote request. A retry
  // with another recipient/body is a different intent, never a replacement.
  let delivery = await prisma.emailDelivery.findUnique({ where: { companyId_requestKey: { companyId: input.companyId, requestKey: input.requestKey } } })
  if (!delivery) {
    const channel = await activeCommunicationChannel(input.companyId, input.channelId)
    await assertReplyMailbox(input.companyId, input, channel.id)
    const reply = await freezeReplyContext(input.companyId, input.threadId, channel.provider, input.subject)
    const payload = payloadSchema.parse({ ...input, reply, channelId: channel.id, from: formatMailboxSender(channel.displayName || input.companyName, channel.emailAddress) })
    delivery = await prisma.emailDelivery.upsert({
      where: { companyId_requestKey: { companyId: input.companyId, requestKey: input.requestKey } }, update: {},
      create: { companyId: input.companyId, contactId: input.contactId, requestKey: input.requestKey, recipientEmail: input.to, subject: input.subject, channelId: channel.id === "platform" ? null : channel.id, provider: channel.provider, payload, scheduledAt: new Date() },
    })
  }
  const payload = payloadSchema.parse(delivery.payload)
  for (const key of ["userId", "contactId", "clientId", "threadId", "serviceTicketId", "to", "subject", "html"] as const) {
    if (payload[key] !== input[key]) throw new Error("Cette commande d’envoi correspond à un autre contenu ; créez un nouvel envoi")
  }
  if (input.channelId && input.channelId !== payload.channelId) throw new Error("La boîte expéditrice de cet envoi est déjà fixée")

  const deliveryId = delivery.id
  const lease = await withProcessorLease(`manual-email:${deliveryId}`, async (control) => {
    const current = await prisma.emailDelivery.findFirstOrThrow({ where: { id: deliveryId, companyId: input.companyId } })
    if (!["SENT", "DELIVERED", "OPENED", "CLICKED"].includes(current.status)) {
      if (payload.threadId && !payload.reply) throw new Error("Ancienne réponse sans référence figée ; vérifiez son résultat avant de créer un nouvel envoi")
      if (["DEAD_LETTER", "CANCELED", "SUPPRESSED", "BOUNCED", "COMPLAINED"].includes(current.status)) throw new Error("Cette commande d’envoi ne peut pas être relancée")
      // Resend's deduplication expires after 24 hours. No blind resend after an
      // ambiguous attempt outside that window, even after a worker restart.
      if (current.provider === "RESEND" && current.attempts > 0 && (!current.firstAttemptAt || Date.now() - current.firstAttemptAt.getTime() >= 23 * 60 * 60_000)) {
        await prisma.emailDelivery.update({ where: { id: deliveryId }, data: { status: "DEAD_LETTER", error: "Résultat distant à vérifier ; fenêtre d’idempotence expirée", deadLetteredAt: new Date() } })
        throw new Error("Vérifiez le résultat chez le fournisseur avant de créer un nouvel envoi")
      }
      await control.assertOwned()
      await prisma.emailDelivery.update({ where: { id: deliveryId }, data: { status: "SENDING", attempts: { increment: 1 }, lastAttemptAt: new Date(), firstAttemptAt: current.firstAttemptAt || new Date(), error: null } })
      try {
        const sent = await sendEmailThroughChannel({
          companyId: input.companyId, companyName: payload.companyName, from: payload.from, channelId: payload.channelId, to: payload.to, replyTo: payload.replyTo,
          subject: payload.subject, html: payload.html, idempotencyKey: deliveryId,
          reply: payload.reply || undefined,
          resume: { provider: current.provider, channelId: payload.channelId, providerDraftId: current.providerDraftId, providerMessageId: current.providerMessageId },
          beforeDispatch: async () => {
            await control.assertOwned()
            await assertReplyMailbox(input.companyId, payload, payload.channelId)
            if (payload.threadId && payload.reply) await assertReplyContext(input.companyId, payload.threadId, payload.reply)
            const contact = await prisma.contact.findFirst({ where: { id: payload.contactId, client: { companyId: input.companyId }, email: payload.to }, select: { id: true } })
            if (!contact) throw new Error("Le destinataire a changé depuis la préparation")
          },
          onPrepared: async (prepared) => {
            await control.assertOwned()
            const saved = await prisma.emailDelivery.updateMany({ where: { id: deliveryId, companyId: input.companyId, status: "SENDING" }, data: { ...prepared, channelId: prepared.channelId === "platform" ? null : prepared.channelId } })
            if (saved.count !== 1) throw new Error("La préparation de l’envoi n’a pas pu être persistée")
          },
        })
        await prisma.emailDelivery.update({ where: { id: deliveryId }, data: { status: "SENT", provider: sent.provider, providerId: sent.providerId, providerDraftId: sent.providerDraftId, providerMessageId: sent.providerMessageId, sentAt: new Date(), error: null } })
      } catch (error) {
        await prisma.emailDelivery.updateMany({ where: { id: deliveryId, status: "SENDING" }, data: { status: "FAILED", error: (error instanceof Error ? error.message : "Résultat d’envoi à vérifier").slice(0, 500) } })
        throw error
      }
    }
    const accepted = await prisma.emailDelivery.findFirstOrThrow({ where: { id: deliveryId, companyId: input.companyId } })
    if (!accepted.providerId) throw new Error("Référence distante absente ; réconciliation nécessaire")
    // History can be repaired independently of transport acceptance. A SQL
    // failure here must never turn a confirmed send into another remote send.
    return recordOutgoingEmail({ companyId: input.companyId, channelId: accepted.channelId, threadId: payload.threadId, clientId: payload.clientId, contactId: payload.contactId, deliveryId,
      provider: accepted.provider!, providerId: accepted.providerId, internetMessageId: validInternetMessageId(accepted.providerMessageId) ? accepted.providerMessageId : null,
      inReplyTo: payload.reply?.internetMessageId, from: payload.from, to: [payload.to], subject: payload.subject, bodyHtml: payload.html, sentAt: accepted.sentAt || undefined })
  })
  if (!lease.acquired) throw new Error("Cet envoi est déjà en cours ; actualisez son résultat avant de réessayer")
  return lease.value
}
