import "server-only"
import { z } from "zod"
import { Prisma } from "@prisma/client"
import prisma, { type TransactionClient } from "@/lib/prisma"
import { getContext } from "@/lib/context"
import { hasPermission, normalizeCompanyRole } from "@/lib/permissions"
import { assertDemoMutationAllowed } from "@/lib/demo-policy"
import { withProcessorLease } from "@/lib/processing/lease"
import { withEmailDraftLease } from "./drafts"
import { manualEmailPayloadSchema } from "./manual-send"
import { inspectManualEmailProvider } from "./recovery-provider"
import { recordOutgoingEmail, getOrCreateEmailThread } from "./threads"
import { attachmentMetadata } from "./attachment-types"
import { validInternetMessageId } from "./reply-context"
import { emailEventCanReplaceAtSameTime } from "./delivery-events"

export class EmailRecoveryError extends Error {}
const identity = z.object({ id: z.string().cuid(), version: z.number().int().positive() })
const proofSchema = z.object({ provider: z.enum(["RESEND", "GOOGLE", "MICROSOFT"]), channelId: z.string(), providerId: z.string().min(1).max(4096), providerMessageId: z.string().nullable(), checkedAt: z.string().datetime() })
const unavailable = () => new EmailRecoveryError("Commande personnelle inaccessible")
const conflict = () => new EmailRecoveryError("Le résultat a changé ou une tâche est en cours ; actualisez avant de décider")

async function actor(companyId: string, userId: string, db: typeof prisma | TransactionClient = prisma, write = false) {
  const context = getContext()
  if (!context || context.companyId !== companyId || context.userId !== userId) throw unavailable()
  const membership = await db.membership.findUnique({ where: { companyId_userId: { companyId, userId } }, select: { status: true, role: true } })
  const role = membership ? normalizeCompanyRole(membership.role) : null
  if (!membership || membership.status !== "ACTIVE" || !role || !hasPermission(role, write ? "automation.write" : "automation.read")) throw unavailable()
  return role
}

async function readOwn(companyId: string, userId: string, id: string, db: typeof prisma | TransactionClient = prisma, write = false) {
  const role = await actor(companyId, userId, db, write)
  const row = await db.emailDelivery.findFirst({ where: { id, companyId, manualAuthorUserId: userId, requestKey: { not: null }, sequenceId: null, stepId: null, enrollmentId: null } })
  const decoded = manualEmailPayloadSchema.safeParse(row?.payload)
  if (!row || !decoded.success || decoded.data.userId !== userId || decoded.data.to !== row.recipientEmail || decoded.data.subject !== row.subject || (decoded.data.channelId === "platform" ? row.channelId !== null : decoded.data.channelId !== row.channelId)) throw unavailable()
  if (row.providerId && ["GOOGLE", "MICROSOFT"].includes(row.provider || "") && !row.providerId.startsWith(`${decoded.data.channelId}:`)) throw unavailable()
  if (!await db.client.count({ where: { id: decoded.data.clientId, companyId } })) throw unavailable()
  if (row.contactId && (row.contactId !== decoded.data.contactId || !await db.contact.count({ where: { id: row.contactId, clientId: decoded.data.clientId, client: { companyId } } }))) throw unavailable()
  if (row.channelId) {
    const channel = await db.communicationChannel.findFirst({ where: { id: row.channelId, companyId }, select: { provider: true, visibility: true, ownerUserId: true } })
    if (!channel || channel.provider !== row.provider || (!["OWNER", "ADMIN"].includes(role) && channel.visibility !== "SHARED" && channel.ownerUserId !== userId)) throw unavailable()
  } else if (decoded.data.channelId !== "platform" || row.provider !== "RESEND" || !["OWNER", "ADMIN"].includes(role)) throw unavailable()
  return { row, payload: decoded.data }
}

const unchanged = (row: Awaited<ReturnType<typeof readOwn>>["row"]) => ({ id: row.id, companyId: row.companyId, manualAuthorUserId: row.manualAuthorUserId, recoveryVersion: row.recoveryVersion, updatedAt: row.updatedAt, status: row.status, providerId: row.providerId, providerDraftId: row.providerDraftId, providerMessageId: row.providerMessageId, channelId: row.channelId, provider: row.provider, payload: { equals: row.payload as Prisma.InputJsonValue }, sentAt: row.sentAt, closedAt: row.closedAt })
const acceptedReference = (row: Awaited<ReturnType<typeof readOwn>>["row"], channelId: string) => {
  if (row.providerId && row.sentAt) return { providerId: row.providerId, providerMessageId: row.providerMessageId }
  const proof = proofSchema.safeParse(row.recoveryProof)
  return row.recoveryOutcome === "ACCEPTED" && proof.success && proof.data.provider === row.provider && proof.data.channelId === channelId ? proof.data : null
}

export async function listManualEmailRecovery(companyId: string, userId: string, input: unknown = {}) {
  const query = z.object({ page: z.number().int().min(1).max(100_000).default(1) }).safeParse(input)
  if (!query.success) throw new EmailRecoveryError("Page invalide")
  const role = await actor(companyId, userId)
  const where: Prisma.EmailDeliveryWhereInput = { companyId, manualAuthorUserId: userId, closedAt: null, requestKey: { not: null }, sequenceId: null, stepId: null, enrollmentId: null,
    AND: [{ OR: [{ attempts: { gt: 0 } }, { sentAt: { not: null } }, { recoveryOutcome: { not: null } }] }, { OR: [{ message: null }, { status: { in: ["FAILED", "DEAD_LETTER", "SENDING"] } }] }],
    ...(!["OWNER", "ADMIN"].includes(role) ? { channel: { is: { companyId, OR: [{ visibility: "SHARED" }, { ownerUserId: userId }] } } } : {}) }
  return prisma.$transaction(async tx => {
    const total = await tx.emailDelivery.count({ where }), pageCount = Math.max(1, Math.ceil(total / 25)), page = Math.min(query.data.page, pageCount)
    const rows = await tx.emailDelivery.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 25, skip: (page - 1) * 25,
      select: { id: true, recoveryVersion: true, subject: true, status: true, sentAt: true, providerId: true, recoveryOutcome: true, recoveryCheckedAt: true, createdAt: true, channel: { select: { displayName: true, emailAddress: true } } } })
    return { total, page, pageCount, deliveries: rows.map(row => ({ id: row.id, version: row.recoveryVersion, subject: row.subject, state: row.recoveryOutcome || (row.sentAt && row.providerId ? "ACCEPTED" : "UNKNOWN"),
      canRepair: Boolean(row.providerId && row.sentAt) || row.recoveryOutcome === "ACCEPTED", checkedAt: row.recoveryCheckedAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString(), mailbox: row.channel?.displayName || row.channel?.emailAddress || "Messagerie plateforme" })) }
  })
}

export async function recoverManualEmail(companyId: string, userId: string, input: unknown, operation: "CHECK" | "REPAIR" | "CLOSE") {
  assertDemoMutationAllowed()
  const parsed = identity.extend({ reason: z.string().trim().min(3).max(500).optional(), confirmed: z.boolean().optional() }).safeParse(input)
  if (!parsed.success) throw new EmailRecoveryError("Décision invalide")
  const data = parsed.data
  if (operation === "CLOSE" && (!data.reason || !data.confirmed)) throw new EmailRecoveryError("Un motif et une confirmation sont obligatoires")
  const initial = await readOwn(companyId, userId, data.id, prisma, true)
  const draft = await prisma.emailDraft.findFirst({ where: { companyId, authorUserId: userId, requestKey: initial.row.requestKey! }, select: { id: true } })
  const process = async () => {
    const result = await withProcessorLease(`manual-email:${data.id}`, async control => {
      const { row, payload } = await readOwn(companyId, userId, data.id, prisma, true)
      if (row.recoveryVersion !== data.version) throw conflict()
      if (row.closedAt && operation !== "CHECK") throw new EmailRecoveryError("Cette commande est déjà classée ; elle reste conservée sans relance")
      if (operation === "CHECK") {
        const known = acceptedReference(row, payload.channelId)
        const observation = known ? { outcome: "ACCEPTED" as const, ...known } : await inspectManualEmailProvider({ companyId, channelId: payload.channelId, provider: row.provider!, providerId: row.providerId, providerDraftId: row.providerDraftId, providerMessageId: row.providerMessageId, from: payload.from, to: payload.to }, control.signal)
        const checkedAt = new Date()
        await prisma.$transaction(async tx => {
          await control.assertOwned(tx); await readOwn(companyId, userId, row.id, tx, true)
          const saved = await tx.emailDelivery.updateMany({ where: unchanged(row), data: { recoveryVersion: { increment: 1 }, recoveryCheckedAt: checkedAt, recoveryOutcome: observation.outcome,
            ...(observation.outcome === "ACCEPTED" ? { recoveryProof: { provider: row.provider!, channelId: payload.channelId, providerId: observation.providerId, providerMessageId: observation.providerMessageId, checkedAt: checkedAt.toISOString() } } : {}) } })
          if (saved.count !== 1) throw conflict()
          await tx.auditLog.create({ data: { userId, action: "CHECK_MANUAL_EMAIL_RESULT", resource: "EMAIL_DELIVERY", resourceId: row.id, payload: { companyId, outcome: observation.outcome } } })
        })
        return { success: true as const, outcome: observation.outcome }
      }
      if (operation === "CLOSE") {
        if (acceptedReference(row, payload.channelId)) throw new EmailRecoveryError("Une acceptation est connue ; réparez l’historique avant de classer")
        const closedAt = new Date()
        await prisma.$transaction(async tx => {
          await control.assertOwned(tx); await readOwn(companyId, userId, row.id, tx, true)
          const saved = await tx.emailDelivery.updateMany({ where: unchanged(row), data: { closedAt, closedByUserId: userId, closureReason: data.reason!, recoveryVersion: { increment: 1 }, nextAttemptAt: null } })
          if (saved.count !== 1) throw conflict()
          await tx.emailDraft.updateMany({ where: { companyId, authorUserId: userId, requestKey: row.requestKey!, archivedAt: null }, data: { archivedAt: closedAt, scheduleNextAttemptAt: null, version: { increment: 1 } } })
          await tx.auditLog.create({ data: { userId, action: "CLOSE_MANUAL_EMAIL_WITHOUT_RETRY", resource: "EMAIL_DELIVERY", resourceId: row.id, payload: { companyId, outcome: row.recoveryOutcome || "UNKNOWN" } } })
        })
        return { success: true as const, outcome: row.recoveryOutcome || "UNKNOWN" }
      }
      const proof = acceptedReference(row, payload.channelId)
      if (!proof) throw new EmailRecoveryError("Aucune preuve d’acceptation liée à cette commande ; aucun historique fabriqué")
      await control.assertOwned()
      // Only SQL below. The shared journal function preserves frozen recipients,
      // attachments and purpose; it never invokes a provider transport.
      const threadId = payload.threadId || (await getOrCreateEmailThread({ companyId, channelId: row.channelId, clientId: payload.clientId, contactId: row.contactId, subject: payload.subject, occurredAt: row.sentAt || undefined })).id
      await prisma.$transaction(async tx => {
        await control.assertOwned(tx); await readOwn(companyId, userId, row.id, tx, true)
        const saved = await tx.emailDelivery.updateMany({ where: unchanged(row), data: { recoveryVersion: { increment: 1 }, providerId: proof.providerId, providerMessageId: proof.providerMessageId, sentAt: row.sentAt || new Date(),
          ...(!row.sentAt ? { status: "SENT" } : {}), recoveryOutcome: "ACCEPTED" } })
        if (saved.count !== 1) throw conflict()
        const message = await recordOutgoingEmail({ companyId, channelId: row.channelId, threadId, clientId: payload.clientId, contactId: row.contactId, deliveryId: row.id,
        provider: row.provider!, providerId: proof.providerId, purpose: payload.purpose || null, internetMessageId: validInternetMessageId(proof.providerMessageId) ? proof.providerMessageId : null,
        inReplyTo: payload.reply?.internetMessageId, from: payload.from, to: [payload.to], cc: payload.cc, bcc: payload.bcc, attachments: attachmentMetadata(payload.attachments || []), subject: payload.subject,
        bodyHtml: payload.renderedHtml || payload.html, bodyText: payload.text, sentAt: row.sentAt || undefined }, tx).catch(() => { throw new EmailRecoveryError("Historique non rapprochable : original et preuve conservés, aucun nouvel envoi") })
        const eventStatuses = ["SENT", "DELIVERED", "OPENED", "CLICKED", "DELAYED", "BOUNCED", "COMPLAINED"]
        const deliveryIsNewer = !message.lastEventAt || Boolean(row.lastEventAt && row.lastEventAt >= message.lastEventAt)
        if (row.sentAt && eventStatuses.includes(row.status) && deliveryIsNewer && emailEventCanReplaceAtSameTime(message.status, row.status)) await tx.emailMessage.update({ where: { id: message.id }, data: { status: row.status, lastEventAt: row.lastEventAt } })
        else if (eventStatuses.includes(message.status) && message.status !== "SENT" && emailEventCanReplaceAtSameTime(row.sentAt ? row.status : "SENT", message.status) && (!row.lastEventAt || Boolean(message.lastEventAt && message.lastEventAt >= row.lastEventAt))) await tx.emailDelivery.updateMany({ where: { id: row.id, companyId }, data: { status: message.status, lastEventAt: message.lastEventAt } })
        await tx.emailDraft.updateMany({ where: { companyId, authorUserId: userId, requestKey: row.requestKey!, archivedAt: null, sentAt: null }, data: { sentAt: message.sentAt || new Date(), scheduleStatus: "SENT", scheduleNextAttemptAt: null, version: { increment: 1 } } })
        await tx.auditLog.create({ data: { userId, action: "REPAIR_MANUAL_EMAIL_HISTORY", resource: "EMAIL_DELIVERY", resourceId: row.id, payload: { companyId, messageId: message.id } } })
      })
      return { success: true as const, outcome: "ACCEPTED" }
    })
    if (!result.acquired) throw conflict()
    return result.value
  }
  return draft ? withEmailDraftLease(draft.id, process) : process()
}

/** Explicit operator backfill, bounded batches but no total-row truncation. */
export async function normalizeLegacyManualAuthors(companyId?: string) {
  assertDemoMutationAllowed()
  let cursor: string | undefined, examined = 0, normalized = 0
  for (;;) {
    const rows = await prisma.emailDelivery.findMany({ where: { ...(companyId ? { companyId } : {}), ...(cursor ? { id: { gt: cursor } } : {}), manualAuthorUserId: null, requestKey: { not: null }, sequenceId: null, stepId: null, enrollmentId: null }, orderBy: { id: "asc" }, take: 100 })
    if (!rows.length) break
    for (const row of rows) {
      examined++
      const decoded = manualEmailPayloadSchema.safeParse(row.payload)
      if (!decoded.success || !["RESEND", "GOOGLE", "MICROSOFT"].includes(row.provider || "") || decoded.data.to !== row.recipientEmail || decoded.data.subject !== row.subject || (decoded.data.channelId === "platform" ? row.channelId !== null : decoded.data.channelId !== row.channelId)) continue
      if (!await prisma.membership.count({ where: { companyId: row.companyId, userId: decoded.data.userId } })) continue
      if (decoded.data.invoiceSnapshot || !await prisma.client.count({ where: { id: decoded.data.clientId, companyId: row.companyId } })) continue
      if (row.contactId && (row.contactId !== decoded.data.contactId || !await prisma.contact.count({ where: { id: row.contactId, clientId: decoded.data.clientId, client: { companyId: row.companyId } } }))) continue
      if (row.channelId && !await prisma.communicationChannel.count({ where: { id: row.channelId, companyId: row.companyId, provider: row.provider! } })) continue
      const saved = await prisma.emailDelivery.updateMany({ where: { id: row.id, companyId: row.companyId, manualAuthorUserId: null, updatedAt: row.updatedAt }, data: { manualAuthorUserId: decoded.data.userId } })
      normalized += saved.count
    }
    cursor = rows.at(-1)!.id
  }
  return { examined, normalized }
}
export type ManualEmailRecoveryPage = Awaited<ReturnType<typeof listManualEmailRecovery>>
