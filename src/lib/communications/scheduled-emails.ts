import "server-only"
import { randomUUID } from "node:crypto"
import { Prisma } from "@prisma/client"
import { z } from "zod"
import prisma from "@/lib/prisma"
import { requestContext } from "@/lib/context"
import { resolveAgencyAccess } from "@/lib/agency-access"
import { hasPermission, normalizeCompanyRole } from "@/lib/permissions"
import { assertDemoMutationAllowed, isPublicReadOnlyDemo } from "@/lib/demo-policy"
import { logAction } from "@/lib/audit"
import { assertUnarchivedDraft, EmailDraftConflict, getEmailDraft, readEmailDraft, withEmailDraftLease } from "./drafts"
import { emailAttachmentsSchema } from "./attachment-types"
import { prepareManualEmailContent } from "./email-content"
import { prepareManualEmailCommand, preparedManualEmailSchema, sendManualEmail } from "./manual-send"
import { scheduledEmailInstant, scheduledTimeInput } from "./scheduled-time"
import { jsonValue } from "./threads"
import { activeCommunicationChannel } from "./email-provider"
import { requireEmailPurpose, EmailPurposeError } from "./email-purpose"

export class EmailScheduleError extends Error {}
const identity = z.object({ id: z.string().cuid(), version: z.number().int().positive() })
const scheduleInput = identity.merge(scheduledTimeInput)
const MAX_ATTEMPTS = 5

export async function scheduleEmailDraft(companyId: string, userId: string, input: unknown) {
  assertDemoMutationAllowed()
  const data = scheduleInput.safeParse(input)
  if (!data.success) throw new EmailScheduleError("Vérifiez le brouillon, la date et le fuseau horaire")
  let instant: Date
  try { instant = scheduledEmailInstant(data.data) }
  catch (error) { throw new EmailScheduleError(error instanceof Error ? error.message : "Date invalide") }
  return withEmailDraftLease(data.data.id, async control => {
    const draft = await readEmailDraft(companyId, userId, data.data.id)
    assertUnarchivedDraft(draft)
    if (draft.version !== data.data.version) throw new EmailDraftConflict("Conflit : rouvrez la dernière version avant de programmer")
    if (draft.scheduledAt || draft.sentAt || await prisma.emailDelivery.count({ where: { companyId, requestKey: draft.requestKey } })) throw new EmailScheduleError("Ce brouillon est déjà programmé ou son envoi a commencé")
    if (!draft.channelId || !draft.contactId || draft.subject.trim().length < 2 || draft.bodyHtml.trim().length < 10) throw new EmailScheduleError("Choisissez une boîte, un destinataire, un objet et un contenu avant de programmer")
    const [company, contact] = await Promise.all([
      prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { name: true, email: true } }),
      prisma.contact.findFirst({ where: { id: draft.contactId, client: { companyId } }, select: { id: true, email: true, clientId: true } }),
    ])
    if (!contact?.email) throw new EmailScheduleError("Le destinataire n’a plus d’adresse accessible")
    let prepared: z.infer<typeof preparedManualEmailSchema>
    try {
      prepared = await prepareManualEmailCommand({ companyId, userId, requestKey: draft.requestKey, channelId: draft.channelId, companyName: company.name, replyTo: company.email,
        purpose: requireEmailPurpose(draft.purpose),
        contactId: contact.id, clientId: contact.clientId, threadId: draft.threadId, serviceTicketId: null, to: contact.email, subject: draft.subject,
        html: prepareManualEmailContent(draft.bodyHtml).html, cc: draft.cc as string[], bcc: draft.bcc as string[], attachments: emailAttachmentsSchema.parse(draft.attachments) })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError || error instanceof Prisma.PrismaClientInitializationError) throw error
      throw new EmailScheduleError(error instanceof Error ? error.message : "Préparation impossible")
    }
    await control.assertOwned()
    const saved = await prisma.emailDraft.updateMany({ where: { companyId, authorUserId: userId, id: draft.id, version: draft.version, scheduledAt: null, sentAt: null }, data: {
      scheduledAt: instant, scheduledTimezone: data.data.timezone, scheduledPayload: jsonValue(prepared), scheduleStatus: "QUEUED", scheduleAttempts: 0,
      scheduleNextAttemptAt: instant, scheduleStartedAt: null, scheduleError: null, version: { increment: 1 },
    } })
    if (saved.count !== 1) throw new EmailDraftConflict("Conflit : la programmation n’a pas été enregistrée")
    await logAction({ userId, action: "SCHEDULE_CRM_EMAIL", resource: "EMAIL_DRAFT", resourceId: draft.id, payload: { scheduledAt: instant.toISOString(), timezone: data.data.timezone } })
    return getEmailDraft(companyId, userId, draft.id)
  })
}

export async function cancelScheduledEmail(companyId: string, userId: string, input: unknown) {
  assertDemoMutationAllowed()
  const data = identity.parse(input)
  return withEmailDraftLease(data.id, async control => {
    const draft = await readEmailDraft(companyId, userId, data.id)
    assertUnarchivedDraft(draft)
    if (draft.version !== data.version) throw new EmailDraftConflict("Conflit : actualisez la programmation avant de l’annuler")
    if (!draft.scheduledAt || draft.sentAt) throw new EmailScheduleError("Ce brouillon n’a pas de programmation à annuler")
    if (draft.scheduleStartedAt || await prisma.emailDelivery.count({ where: { companyId, requestKey: draft.requestKey } })) throw new EmailScheduleError("L’envoi a commencé ; son résultat doit être vérifié avant toute modification")
    await control.assertOwned()
    const canceled = await prisma.emailDraft.updateMany({ where: { companyId, authorUserId: userId, id: draft.id, version: draft.version, scheduleStartedAt: null, sentAt: null }, data: {
      scheduledAt: null, scheduledTimezone: null, scheduledPayload: Prisma.DbNull, scheduleStatus: null, scheduleAttempts: 0,
      scheduleNextAttemptAt: null, scheduleStartedAt: null, scheduleError: null, requestKey: randomUUID(), version: { increment: 1 },
    } })
    if (canceled.count !== 1) throw new EmailDraftConflict("Conflit : l’annulation n’a pas été enregistrée")
    await logAction({ userId, action: "CANCEL_SCHEDULED_CRM_EMAIL", resource: "EMAIL_DRAFT", resourceId: draft.id })
    return getEmailDraft(companyId, userId, draft.id)
  })
}

async function scheduledAuthor(companyId: string, userId: string) {
  const member = await prisma.membership.findUnique({ where: { companyId_userId: { companyId, userId } }, select: {
    id: true, status: true, role: true, agencyMemberships: { where: { agency: { active: true } }, select: { agencyId: true } },
  } })
  if (!member || member.status !== "ACTIVE") throw new EmailScheduleError("Auteur sans accès actif ; envoi suspendu")
  const role = normalizeCompanyRole(member.role)
  if (!hasPermission(role, "automation.write")) throw new EmailScheduleError("Les droits de l’auteur ne permettent plus cet envoi")
  return { companyId, userId, membershipId: member.id, role, agencyIds: resolveAgencyAccess(role, member.agencyMemberships.map(item => item.agencyId)), actionPermission: "automation.write" as const }
}

export async function processDueScheduledEmails(input: { companyId?: string; limit?: number; now?: Date } = {}) {
  const summary = { examined: 0, sent: 0, failed: 0, skipped: 0 }
  if (isPublicReadOnlyDemo()) return summary
  const now = input.now || new Date()
  const jobs = await prisma.emailDraft.findMany({ where: { ...(input.companyId ? { companyId: input.companyId } : {}), sentAt: null, scheduledAt: { lte: now },
    archivedAt: null, scheduleStatus: { in: ["QUEUED", "PROCESSING", "RETRY"] }, scheduleNextAttemptAt: { lte: now } },
    select: { id: true, companyId: true, authorUserId: true }, orderBy: [{ scheduleNextAttemptAt: "asc" }, { id: "asc" }], take: Math.min(Math.max(input.limit || 50, 1), 100) })
  summary.examined = jobs.length
  for (const job of jobs) {
    try {
      await withEmailDraftLease(job.id, async control => {
        const draft = await readEmailDraft(job.companyId, job.authorUserId, job.id)
        if (draft.sentAt || !draft.scheduledAt || draft.scheduledAt > now || !draft.scheduleNextAttemptAt || draft.scheduleNextAttemptAt > now || !["QUEUED", "PROCESSING", "RETRY"].includes(draft.scheduleStatus || "")) { summary.skipped++; return }
        if (draft.scheduleAttempts >= MAX_ATTEMPTS) {
          await control.assertOwned()
          await prisma.emailDraft.updateMany({ where: { id: draft.id, companyId: job.companyId }, data: { scheduleStatus: "FAILED", scheduleNextAttemptAt: null, scheduleError: "Tentatives épuisées ; résultat fournisseur à vérifier" } })
          summary.failed++; return
        }
        let context: Awaited<ReturnType<typeof scheduledAuthor>>
        try { context = await scheduledAuthor(job.companyId, job.authorUserId) }
        catch (error) {
          if (!(error instanceof EmailScheduleError)) throw error
          await control.assertOwned()
          await prisma.emailDraft.updateMany({ where: { id: draft.id, companyId: job.companyId }, data: { scheduleStatus: "FAILED", scheduleNextAttemptAt: null, scheduleError: "Les droits de l’auteur ne permettent plus cet envoi" } })
          summary.failed++; return
        }
        const parsed = preparedManualEmailSchema.safeParse(draft.scheduledPayload)
        if (!parsed.success || parsed.data.payload.userId !== job.authorUserId || parsed.data.payload.channelId !== draft.channelId || parsed.data.payload.contactId !== draft.contactId || parsed.data.payload.purpose !== (draft.purpose || undefined)) {
          await control.assertOwned()
          await prisma.emailDraft.updateMany({ where: { id: draft.id, companyId: job.companyId }, data: { scheduleStatus: "FAILED", scheduleNextAttemptAt: null, scheduleError: "Commande programmée incohérente ; vérification nécessaire" } })
          summary.failed++; return
        }
        await requestContext.run(context, async () => {
          const prepared = parsed.data
          await control.assertOwned()
          const claim = await prisma.emailDraft.updateMany({ where: { id: draft.id, companyId: job.companyId, version: draft.version }, data: { scheduleStatus: "PROCESSING", scheduleStartedAt: draft.scheduleStartedAt || now,
            scheduleAttempts: { increment: 1 }, scheduleNextAttemptAt: new Date(now.getTime() + Math.min(2 ** draft.scheduleAttempts, 60) * 60_000), scheduleError: null } })
          if (claim.count !== 1) throw new EmailDraftConflict("La programmation a changé avant son traitement")
          try {
            const message = await sendManualEmail({ ...prepared.payload, companyId: job.companyId, requestKey: draft.requestKey, preparedCommand: prepared, scheduledDraftId: draft.id,
              beforeDispatch: async () => {
                await control.assertOwned()
                const fresh = await scheduledAuthor(job.companyId, job.authorUserId)
                await requestContext.run(fresh, async () => {
                  const channel = await activeCommunicationChannel(job.companyId, draft.channelId)
                  if (channel.mailEnabled === false || channel.provider !== prepared.provider) throw new EmailScheduleError("La boîte ne permet plus cet envoi")
                  if (prepared.payload.threadId && !await prisma.emailThread.count({ where: { id: prepared.payload.threadId, companyId: job.companyId, channelId: draft.channelId, clientId: prepared.payload.clientId } })) throw new EmailScheduleError("Conversation devenue inaccessible")
                })
              } })
            await control.assertOwned()
            await prisma.emailDraft.updateMany({ where: { id: draft.id, companyId: job.companyId }, data: { sentAt: new Date(), scheduleStatus: "SENT", scheduleNextAttemptAt: null, scheduleError: null } })
            await logAction({ userId: job.authorUserId, action: "SEND_SCHEDULED_CRM_EMAIL", resource: "EMAIL_MESSAGE", resourceId: message.id, payload: { draftId: draft.id } })
            summary.sent++
          } catch (error) {
            await control.assertOwned()
            const exhausted = error instanceof EmailPurposeError || draft.scheduleAttempts + 1 >= MAX_ATTEMPTS
            await prisma.emailDraft.updateMany({ where: { id: draft.id, companyId: job.companyId }, data: { scheduleStatus: exhausted ? "FAILED" : "RETRY", ...(exhausted ? { scheduleNextAttemptAt: null } : {}), scheduleError: error instanceof EmailPurposeError ? error.message : "Échec de l’envoi programmé ; résultat fournisseur à vérifier" } })
            summary.failed++
          }
        })
      })
    } catch (error) {
      // Busy/lost leases never let a second processor change the active job.
      if (error instanceof EmailDraftConflict) summary.skipped++
      else throw error
    }
  }
  return summary
}
