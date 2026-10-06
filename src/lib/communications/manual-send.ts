import { z } from "zod"
import { activeCommunicationChannel, sendEmailThroughChannel } from "@/lib/communications/email-provider"
import { formatMailboxSender } from "@/lib/communications/provider-credentials"
import { recordOutgoingEmail } from "@/lib/communications/threads"
import prisma from "@/lib/prisma"
import { withProcessorLease } from "@/lib/processing/lease"
import { assertReplyContext, freezeReplyContext, replyContextSchema, validInternetMessageId } from "@/lib/communications/reply-context"
import { copyRecipientsSchema, validateRecipients } from "@/lib/communications/recipients"
import { emailAttachmentsSchema, attachmentMetadata } from "./attachment-types"
import { readEmailAttachmentBytes } from "./attachment-content"
import { emailPlainText } from "./email-content"
import { EmailDraftConflict } from "./drafts"
import { emailPurposeSchema, requireEmailPurpose, assertPurposeRecipients, EmailPurposeError } from "./email-purpose"
import { marketingAuthorizationSchema, prepareManualMarketingContent, assertManualMarketingConsent } from "./marketing-consent"

export const manualEmailPayloadSchema = z.object({
  userId: z.string(), contactId: z.string(), clientId: z.string(), threadId: z.string().nullable(), serviceTicketId: z.string().nullable(),
  channelId: z.string(), companyName: z.string(), replyTo: z.string().nullable(), from: z.string(), to: z.string().email(), subject: z.string(), html: z.string(),
  reply: replyContextSchema.nullable().optional(),
  cc: copyRecipientsSchema.optional(), bcc: copyRecipientsSchema.optional(),
  attachments: emailAttachmentsSchema.optional(),
  text: z.string().optional(),
  purpose: emailPurposeSchema.optional(),
  marketing: marketingAuthorizationSchema.optional(),
  renderedHtml: z.string().max(110_000).optional(),
  marketingHeaders: z.object({ "List-Unsubscribe": z.string().max(4096), "List-Unsubscribe-Post": z.literal("List-Unsubscribe=One-Click") }).optional(),
  invoiceSnapshot: z.object({ invoiceId: z.string(), remainingCents: z.number().int().positive() }).optional(),
})

export const preparedManualEmailSchema = z.object({ provider: z.enum(["GOOGLE", "MICROSOFT", "RESEND"]), payload: manualEmailPayloadSchema })
type ManualSendInput = Omit<z.infer<typeof manualEmailPayloadSchema>, "from" | "channelId" | "reply" | "text" | "marketing" | "renderedHtml" | "marketingHeaders"> & {
  companyId: string; requestKey: string; channelId: string | null; beforeDispatch?: () => Promise<void>
  preparedCommand?: z.infer<typeof preparedManualEmailSchema>; scheduledDraftId?: string
}

async function assertReplyMailbox(companyId: string, payload: Pick<ManualSendInput, "threadId" | "clientId">, channelId: string) {
  if (!payload.threadId) return
  const thread = await prisma.emailThread.findFirst({ where: { id: payload.threadId, companyId, clientId: payload.clientId, channelId: channelId === "platform" ? null : channelId }, select: { id: true } })
  if (!thread) throw new Error("La conversation ne correspond plus au client ou à la boîte expéditrice")
}

export async function prepareManualEmailCommand(input: ManualSendInput) {
  const purpose = requireEmailPurpose(input.purpose)
  assertPurposeRecipients(purpose, input.cc || [], input.bcc || [])
  validateRecipients(input.to, input.cc || [], input.bcc || [])
  const channel = await activeCommunicationChannel(input.companyId, input.channelId)
  if (channel.mailEnabled === false) throw new Error("Cette connexion autorise uniquement le calendrier")
  await assertReplyMailbox(input.companyId, input, channel.id)
  const reply = await freezeReplyContext(input.companyId, input.threadId, channel.provider, input.subject)
  const marketing = purpose === "MARKETING" ? await prepareManualMarketingContent(input.companyId, input.contactId, input.to, input.html) : null
  return preparedManualEmailSchema.parse({ provider: channel.provider, payload: { ...input, purpose, ...(marketing ? { marketing: marketing.authorization, renderedHtml: marketing.renderedHtml, marketingHeaders: marketing.headers } : {}), cc: input.cc || [], bcc: input.bcc || [], attachments: input.attachments || [], text: emailPlainText(marketing?.renderedHtml || input.html), reply,
    channelId: channel.id, from: formatMailboxSender(channel.displayName || input.companyName, channel.emailAddress) } })
}

export async function sendManualEmail(input: ManualSendInput) {
  input = { ...input, cc: copyRecipientsSchema.parse(input.cc || []), bcc: copyRecipientsSchema.parse(input.bcc || []), attachments: emailAttachmentsSchema.parse(input.attachments || []) }
  validateRecipients(input.to, input.cc, input.bcc)
  const scheduled = await prisma.emailDraft.findFirst({ where: { companyId: input.companyId, requestKey: input.requestKey, scheduledAt: { not: null } }, select: { id: true, scheduleStartedAt: true, scheduleStatus: true } })
  if (scheduled && (input.scheduledDraftId !== scheduled.id || !scheduled.scheduleStartedAt || scheduled.scheduleStatus !== "PROCESSING")) throw new EmailDraftConflict("Ce brouillon est programmé ; annulez sa programmation avant un envoi immédiat")
  // Persist the frozen payload and mailbox BEFORE any remote request. A retry
  // with another recipient/body is a different intent, never a replacement.
  let delivery = await prisma.emailDelivery.findUnique({ where: { companyId_requestKey: { companyId: input.companyId, requestKey: input.requestKey } } })
  if (!delivery) {
    const prepared = input.preparedCommand ? preparedManualEmailSchema.parse(input.preparedCommand) : await prepareManualEmailCommand(input)
    const payload = prepared.payload
    requireEmailPurpose(payload.purpose)
    assertPurposeRecipients(payload.purpose, payload.cc || [], payload.bcc || [])
    delivery = await prisma.emailDelivery.upsert({
      where: { companyId_requestKey: { companyId: input.companyId, requestKey: input.requestKey } }, update: {},
      create: { companyId: input.companyId, manualAuthorUserId: payload.userId, contactId: input.contactId, requestKey: input.requestKey, recipientEmail: input.to, purpose: payload.purpose, subject: input.subject, channelId: payload.channelId === "platform" ? null : payload.channelId, provider: prepared.provider, payload, scheduledAt: new Date() },
    })
  }
  const payload = manualEmailPayloadSchema.parse(delivery.payload)
  if (payload.purpose && payload.purpose !== input.purpose) throw new EmailPurposeError("La finalité de cet envoi est déjà fixée ; créez un nouvel envoi")
  if (JSON.stringify(payload.attachments || []) !== JSON.stringify(input.attachments)) throw new Error("Les pièces jointes de cet envoi sont déjà figées")
  if (JSON.stringify(payload.invoiceSnapshot) !== JSON.stringify(input.invoiceSnapshot)) throw new Error("Le contexte financier de cet envoi est déjà figé")
  if (JSON.stringify(payload.cc || []) !== JSON.stringify(input.cc) || JSON.stringify(payload.bcc || []) !== JSON.stringify(input.bcc)) throw new Error("Les destinataires de cet envoi sont déjà fixés ; créez un nouvel envoi")
  for (const key of ["userId", "contactId", "clientId", "threadId", "serviceTicketId", "to", "subject", "html"] as const) {
    if (payload[key] !== input[key]) throw new Error("Cette commande d’envoi correspond à un autre contenu ; créez un nouvel envoi")
  }
  if (input.channelId && input.channelId !== payload.channelId) throw new Error("La boîte expéditrice de cet envoi est déjà fixée")

  const deliveryId = delivery.id
  const lease = await withProcessorLease(`manual-email:${deliveryId}`, async (control) => {
    const current = await prisma.emailDelivery.findFirstOrThrow({ where: { id: deliveryId, companyId: input.companyId } })
    if (current.closedAt) throw new EmailDraftConflict("Cette commande est classée sans relance ; aucun nouvel envoi n’est autorisé")
    if (!["SENT", "DELIVERED", "OPENED", "CLICKED"].includes(current.status)) {
      requireEmailPurpose(payload.purpose)
      assertPurposeRecipients(payload.purpose, payload.cc || [], payload.bcc || [])
      if (payload.purpose === "MARKETING") {
        if (!payload.marketing || !payload.renderedHtml || !payload.marketingHeaders) throw new EmailPurposeError("Commande de prospection incomplète ; créez un nouvel envoi")
        await assertManualMarketingConsent(input.companyId, payload.contactId, payload.to, payload.marketing)
      }
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
        const attachments = await Promise.all((payload.attachments || []).map(file => readEmailAttachmentBytes(input.companyId, file)))
        const sent = await sendEmailThroughChannel({
          companyId: input.companyId, companyName: payload.companyName, from: payload.from, channelId: payload.channelId, to: payload.to, replyTo: payload.replyTo,
          subject: payload.subject, html: payload.renderedHtml || payload.html, text: payload.text, headers: payload.marketingHeaders, idempotencyKey: deliveryId,
          reply: payload.reply || undefined,
          cc: payload.cc, bcc: payload.bcc,
          attachments,
          resume: { provider: current.provider, channelId: payload.channelId, providerDraftId: current.providerDraftId, providerMessageId: current.providerMessageId },
          beforeDispatch: async () => {
            await control.assertOwned()
            await input.beforeDispatch?.()
            await assertReplyMailbox(input.companyId, payload, payload.channelId)
            if (payload.threadId && payload.reply) await assertReplyContext(input.companyId, payload.threadId, payload.reply)
            const contact = await prisma.contact.findFirst({ where: { id: payload.contactId, client: { companyId: input.companyId }, email: payload.to }, select: { id: true } })
            if (!contact) throw new Error("Le destinataire a changé depuis la préparation")
            if (payload.purpose === "MARKETING") await assertManualMarketingConsent(input.companyId, payload.contactId, payload.to, payload.marketing)
          },
          onPrepared: async (prepared) => {
            await control.assertOwned()
            const saved = await prisma.emailDelivery.updateMany({ where: { id: deliveryId, companyId: input.companyId, status: "SENDING" }, data: { ...prepared, channelId: prepared.channelId === "platform" ? null : prepared.channelId } })
            if (saved.count !== 1) throw new Error("La préparation de l’envoi n’a pas pu être persistée")
          },
        })
        await prisma.emailDelivery.update({ where: { id: deliveryId }, data: { status: "SENT", provider: sent.provider, providerId: sent.providerId, providerDraftId: sent.providerDraftId, providerMessageId: sent.providerMessageId, sentAt: new Date(), error: null } })
      } catch (error) {
        // Provider errors may quote a hidden recipient. The shared delivery
        // journal must never disclose a Bcc address through its error text.
        await prisma.emailDelivery.updateMany({ where: { id: deliveryId, status: "SENDING" }, data: { status: "FAILED", error: payload.bcc?.length ? "Échec de l’envoi avec destinataires cachés ; résultat à vérifier" : (error instanceof Error ? error.message : "Résultat d’envoi à vérifier").slice(0, 500) } })
        throw error
      }
    }
    const accepted = await prisma.emailDelivery.findFirstOrThrow({ where: { id: deliveryId, companyId: input.companyId } })
    if (!accepted.providerId) throw new Error("Référence distante absente ; réconciliation nécessaire")
    // History can be repaired independently of transport acceptance. A SQL
    // failure here must never turn a confirmed send into another remote send.
    return recordOutgoingEmail({ companyId: input.companyId, channelId: accepted.channelId, threadId: payload.threadId, clientId: payload.clientId, contactId: payload.contactId, deliveryId,
      provider: accepted.provider!, providerId: accepted.providerId, purpose: payload.purpose || null, internetMessageId: validInternetMessageId(accepted.providerMessageId) ? accepted.providerMessageId : null,
      inReplyTo: payload.reply?.internetMessageId, from: payload.from, to: [payload.to], cc: payload.cc, bcc: payload.bcc, attachments: attachmentMetadata(payload.attachments || []), subject: payload.subject, bodyHtml: payload.renderedHtml || payload.html, bodyText: payload.text, sentAt: accepted.sentAt || undefined })
  })
  if (!lease.acquired) throw new Error("Cet envoi est déjà en cours ; actualisez son résultat avant de réessayer")
  return lease.value
}
