import "server-only"
import { z } from "zod"
import { Prisma } from "@prisma/client"
import prisma, { type TransactionClient } from "@/lib/prisma"
import { getContext } from "@/lib/context"
import { hasPermission, normalizeCompanyRole } from "@/lib/permissions"
import { assertDemoMutationAllowed } from "@/lib/demo-policy"
import { withProcessorLease } from "@/lib/processing/lease"
import { inspectManualEmailProvider } from "@/lib/communications/recovery-provider"
import { getOrCreateEmailThread, recordOutgoingEmail } from "@/lib/communications/threads"
import { validInternetMessageId } from "@/lib/communications/reply-context"
import { emailEventCanReplaceAtSameTime } from "@/lib/communications/delivery-events"
import { sequencePayloadSchema } from "./sequence-history"

export class SequenceRecoveryError extends Error {}
const unavailable = () => new SequenceRecoveryError("Commande de séquence inaccessible ou données historiques incomplètes")
const conflict = () => new SequenceRecoveryError("Le résultat ou l’inscription a changé ; actualisez avant de décider")
const identity = z.object({ id: z.string().cuid(), version: z.number().int().positive(), reason: z.string().trim().min(3).max(500).optional(), confirmed: z.boolean().optional() })
const proofSchema = z.object({ provider: z.enum(["RESEND", "GOOGLE", "MICROSOFT"]), channelId: z.string(), providerId: z.string().min(1).max(4096), providerMessageId: z.string().nullable(), checkedAt: z.string().datetime() })

async function readCommand(companyId: string, userId: string, id: string, db: typeof prisma | TransactionClient = prisma, write = false) {
  const context = getContext()
  if (!context || context.companyId !== companyId || context.userId !== userId) throw unavailable()
  const member = await db.membership.findUnique({ where: { companyId_userId: { companyId, userId } }, select: { status: true, role: true } })
  const role = member ? normalizeCompanyRole(member.role) : null
  if (!member || member.status !== "ACTIVE" || !role || !hasPermission(role, write ? "automation.write" : "automation.read")) throw unavailable()
  const row = await db.emailDelivery.findFirst({ where: { id, companyId, sequenceId: { not: null }, stepId: { not: null }, enrollmentId: { not: null }, requestKey: null, manualAuthorUserId: null } })
  const decoded = sequencePayloadSchema.safeParse(row?.payload)
  if (!row || !decoded.success || decoded.data.to !== row.recipientEmail || decoded.data.subject !== row.subject || !["RESEND", "GOOGLE", "MICROSOFT"].includes(row.provider || "")) throw unavailable()
  const enrollment = await db.emailSequenceEnrollment.findFirst({ where: { id: row.enrollmentId!, sequenceId: row.sequenceId!, sequence: { companyId } } })
  const step = await db.emailSequenceStep.findFirst({ where: { id: row.stepId!, sequenceId: row.sequenceId!, sequence: { companyId } } })
  if (!enrollment || !step || enrollment.leadCaptureId !== row.leadCaptureId || enrollment.contactId !== row.contactId || !await db.leadCapture.count({ where: { id: enrollment.leadCaptureId, companyId } })) throw unavailable()
  if (row.contactId && !await db.contact.count({ where: { id: row.contactId, client: { companyId } } })) throw unavailable()
  if (row.channelId) {
    const channel = await db.communicationChannel.findFirst({ where: { id: row.channelId, companyId }, select: { provider: true, ownerUserId: true, visibility: true } })
    if (!channel || channel.provider !== row.provider || (!["OWNER", "ADMIN"].includes(role) && channel.visibility !== "SHARED" && channel.ownerUserId !== userId)) throw unavailable()
    if (row.providerId && row.provider !== "RESEND" && !row.providerId.startsWith(`${row.channelId}:`)) throw unavailable()
  } else if (row.provider !== "RESEND" || !["OWNER", "ADMIN"].includes(role)) throw unavailable()
  return { row, enrollment, step, payload: decoded.data, canWrite: hasPermission(role, "automation.write") }
}
type Command = Awaited<ReturnType<typeof readCommand>>
function acceptedReference({ row }: Command) {
  if (row.providerId && row.sentAt) return { providerId: row.providerId, providerMessageId: row.providerMessageId }
  const proof = proofSchema.safeParse(row.recoveryProof)
  const channelId = row.channelId || "platform"
  return row.recoveryOutcome === "ACCEPTED" && proof.success && proof.data.provider === row.provider && proof.data.channelId === channelId
    && (row.provider === "RESEND" || proof.data.providerId.startsWith(`${channelId}:`)) && (!row.providerMessageId || row.providerMessageId === proof.data.providerMessageId) ? proof.data : null
}
function eligible(command: Command) {
  const { row, enrollment, step } = command
  return row.status !== "SENDING" && step.position === enrollment.nextStepPosition && (row.closedAt ? enrollment.status === "STOPPED" : enrollment.status === "PAUSED")
}
const inconclusiveOutcome = (command: Command) => command.row.recoveryOutcome === "ACCEPTED" ? "UNKNOWN" : command.row.recoveryOutcome || "UNKNOWN"
const unchanged = ({ row }: Command): Prisma.EmailDeliveryWhereInput => ({ id: row.id, companyId: row.companyId, sequenceId: row.sequenceId, enrollmentId: row.enrollmentId, stepId: row.stepId, leadCaptureId: row.leadCaptureId, contactId: row.contactId,
  recipientEmail: row.recipientEmail, subject: row.subject, purpose: row.purpose, recoveryVersion: row.recoveryVersion, updatedAt: row.updatedAt, status: row.status, provider: row.provider, channelId: row.channelId,
  providerId: row.providerId, providerDraftId: row.providerDraftId, providerMessageId: row.providerMessageId, payload: { equals: row.payload as Prisma.InputJsonValue }, sentAt: row.sentAt, closedAt: row.closedAt })

export async function sequenceRecoveryState(companyId: string, userId: string, id: string) {
  try {
    const command = await readCommand(companyId, userId, id), { row, enrollment } = command
    const accepted = Boolean(acceptedReference(command)), enabled = eligible(command) && command.canWrite
    return { version: row.recoveryVersion, outcome: accepted ? "ACCEPTED" : inconclusiveOutcome(command), checkedAt: row.recoveryCheckedAt?.toISOString() ?? null,
      closedAt: row.closedAt?.toISOString() ?? null, enrollmentStatus: enrollment.status, canCheck: enabled, canRepair: enabled && accepted && !row.closedAt, canClose: enabled && !accepted && !row.closedAt }
  } catch (error) { if (error instanceof SequenceRecoveryError) return null; throw error }
}

export async function recoverSequenceEmail(companyId: string, userId: string, input: unknown, operation: "CHECK" | "REPAIR" | "CLOSE") {
  assertDemoMutationAllowed()
  const parsed = identity.safeParse(input)
  if (!parsed.success) throw new SequenceRecoveryError("Décision invalide")
  const data = parsed.data
  if (operation === "CLOSE" && (!data.confirmed || !data.reason)) throw new SequenceRecoveryError("Un motif et une confirmation sont obligatoires")
  const result = await withProcessorLease("email-sequences", async control => {
    try {
      const command = await readCommand(companyId, userId, data.id, prisma, true), { row, enrollment, payload } = command
      if (row.recoveryVersion !== data.version) throw conflict()
      if (!eligible(command)) throw new SequenceRecoveryError("L’inscription doit rester en pause et la commande ne doit pas être en cours d’envoi")
      if (row.closedAt && operation !== "CHECK") throw new SequenceRecoveryError("Cette commande est classée sans relance")
      const proof = acceptedReference(command), checkedAt = new Date()
      const observation = operation === "CHECK" ? proof ? { outcome: "ACCEPTED" as const, ...proof } : await inspectManualEmailProvider({ companyId, channelId: row.channelId || "platform", provider: row.provider!, providerId: row.providerId, providerDraftId: row.providerDraftId, providerMessageId: row.providerMessageId, from: payload.from, to: payload.to }, control.signal) : null
      if (operation === "REPAIR" && !proof) throw new SequenceRecoveryError("Aucune preuve d’acceptation liée à cette commande ; aucun historique fabriqué")
      if (operation === "CLOSE" && proof) throw new SequenceRecoveryError("Une acceptation est connue ; réparez l’historique sans relancer")
      // Persist the thread before the atomic history write: mailbox ACLs resolve
      // message.threadId through the committed view, including for ordinary members.
      const thread = operation === "REPAIR" ? await getOrCreateEmailThread({ companyId, channelId: row.channelId, contactId: row.contactId, leadCaptureId: row.leadCaptureId, subject: payload.subject, occurredAt: row.sentAt || checkedAt }) : null
      await prisma.$transaction(async tx => {
        await control.assertOwned(tx)
        await readCommand(companyId, userId, row.id, tx, true)
        // Claim the enrollment without advancing it; a concurrent resume or
        // progress must not race a human decision. Keep its timestamp on reads.
        const claimed = await tx.emailSequenceEnrollment.updateMany({ where: { id: enrollment.id, sequenceId: row.sequenceId!, status: enrollment.status, updatedAt: enrollment.updatedAt, nextStepPosition: enrollment.nextStepPosition },
          data: operation === "CLOSE" ? { status: "STOPPED", stopReason: "DELIVERY_CLOSED_WITHOUT_RETRY", nextSendAt: null, completedAt: checkedAt } : { updatedAt: enrollment.updatedAt } })
        if (claimed.count !== 1) throw conflict()
        const change: Prisma.EmailDeliveryUpdateManyMutationInput = { recoveryVersion: { increment: 1 } }
        if (operation === "CHECK" && observation) Object.assign(change, { recoveryCheckedAt: checkedAt, recoveryOutcome: observation.outcome,
          ...(observation.outcome === "ACCEPTED" ? { recoveryProof: { provider: row.provider, channelId: row.channelId || "platform", providerId: observation.providerId, providerMessageId: observation.providerMessageId, checkedAt: checkedAt.toISOString() } } : {}) })
        if (operation === "CLOSE") Object.assign(change, { closedAt: checkedAt, closedByUserId: userId, closureReason: data.reason!, nextAttemptAt: null })
        if (operation === "REPAIR" && proof) Object.assign(change, { providerId: proof.providerId, providerMessageId: proof.providerMessageId, sentAt: row.sentAt || checkedAt, recoveryOutcome: "ACCEPTED", nextAttemptAt: null, ...(!row.sentAt ? { status: "SENT" } : {}) })
        const saved = await tx.emailDelivery.updateMany({ where: unchanged(command), data: change })
        if (saved.count !== 1) throw conflict()
        let messageId: string | undefined
        if (operation === "REPAIR" && proof && thread) {
          const message = await recordOutgoingEmail({ companyId, deliveryId: row.id, threadId: thread.id, channelId: row.channelId, contactId: row.contactId, leadCaptureId: row.leadCaptureId,
            provider: row.provider!, providerId: proof.providerId, purpose: row.purpose, internetMessageId: validInternetMessageId(proof.providerMessageId) ? proof.providerMessageId : null,
            from: payload.from, to: [payload.to], subject: payload.subject, bodyHtml: payload.html, sentAt: row.sentAt || checkedAt }, tx).catch(() => { throw new SequenceRecoveryError("Historique non rapprochable : original et preuve conservés, aucun nouvel envoi") })
          const eventStatuses = ["SENT", "DELIVERED", "OPENED", "CLICKED", "DELAYED", "BOUNCED", "COMPLAINED"]
          if (row.sentAt && eventStatuses.includes(row.status) && (!message.lastEventAt || Boolean(row.lastEventAt && row.lastEventAt >= message.lastEventAt)) && emailEventCanReplaceAtSameTime(message.status, row.status)) await tx.emailMessage.update({ where: { id: message.id }, data: { status: row.status, lastEventAt: row.lastEventAt } })
          else if (eventStatuses.includes(message.status) && message.status !== "SENT" && emailEventCanReplaceAtSameTime(row.sentAt ? row.status : "SENT", message.status) && (!row.lastEventAt || Boolean(message.lastEventAt && message.lastEventAt >= row.lastEventAt))) await tx.emailDelivery.updateMany({ where: { id: row.id, companyId }, data: { status: message.status, lastEventAt: message.lastEventAt } })
          messageId = message.id
        }
        await tx.auditLog.create({ data: { userId, action: `${operation}_SEQUENCE_EMAIL_${operation === "CHECK" ? "RESULT" : operation === "REPAIR" ? "HISTORY" : "WITHOUT_RETRY"}`, resource: "EMAIL_DELIVERY", resourceId: row.id,
          payload: { companyId, outcome: observation?.outcome || (proof ? "ACCEPTED" : inconclusiveOutcome(command)), ...(messageId ? { messageId } : {}) } } })
      }, { isolationLevel: "Serializable" })
      return { success: true as const, outcome: observation?.outcome || (proof ? "ACCEPTED" : inconclusiveOutcome(command)) }
    } catch (error) {
      // The shared lease stores its error; never persist SQL/provider payloads there.
      if (error instanceof SequenceRecoveryError) throw error
      throw new SequenceRecoveryError("Reprise indisponible ; aucune décision partielle conservée")
    }
  })
  if (!result.acquired) throw new SequenceRecoveryError("Le processeur de séquences est occupé ; actualisez avant de décider")
  return result.value
}
