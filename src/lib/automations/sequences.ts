import { Prisma } from "@prisma/client"

import { renderEmailVariables, sendSequenceEmail } from "@/lib/automations/email"
import { nextDeliveryRetry } from "@/lib/automations/delivery-retry"
import prisma from "@/lib/prisma"
import { recordOutgoingEmail } from "@/lib/communications/threads"
import { activeEmailSuppression } from "@/lib/communications/suppressions"
import { nextSequenceExecution, type SequenceSchedule } from "@/lib/automations/schedule"
import { withProcessorLease } from "@/lib/processing/lease"

type ProgressionSequence = SequenceSchedule & { steps: Array<{ id: string; position: number; delayHours: number }> }

export function enrollableSequenceWhere(sequenceId: string, companyId: string) {
  return { id: sequenceId, companyId, status: "ACTIVE" } as const
}

function progressionData(sequence: ProgressionSequence, currentStepId: string, at: Date) {
  const stepIndex = sequence.steps.findIndex((item) => item.id === currentStepId)
  const nextStep = sequence.steps[stepIndex + 1]
  return nextStep
    ? { nextStep, data: { nextStepPosition: nextStep.position, nextSendAt: nextSequenceExecution(at, nextStep.delayHours, sequence) } }
    : { nextStep: null, data: { status: "COMPLETED", nextSendAt: null, completedAt: at } }
}

export async function enrollLeadInSequenceInternal(input: { companyId: string; sequenceId: string; leadId: string }) {
  const [sequence, lead] = await Promise.all([
    prisma.emailSequence.findFirst({
      where: enrollableSequenceWhere(input.sequenceId, input.companyId),
      include: { steps: { orderBy: { position: "asc" }, take: 1 } },
    }),
    prisma.leadCapture.findFirst({ where: { id: input.leadId, companyId: input.companyId }, select: { id: true, contactId: true, email: true, marketingOptIn: true } }),
  ])
  if (!sequence) throw new Error("Séquence inactive ou introuvable")
  if (!sequence.steps[0]) throw new Error("Ajoutez au moins une étape à la séquence")
  if (!lead?.email) throw new Error("Le prospect n'a pas d'adresse e-mail")
  if (!lead.marketingOptIn) throw new Error("Le prospect n'a pas de consentement marketing actif")
  const suppression = await activeEmailSuppression(input.companyId, lead.email)
  if (suppression) throw new Error(`Cette adresse est bloquée (${suppression.reason.toLowerCase().replaceAll("_", " ")})`)
  const now = new Date()
  return prisma.emailSequenceEnrollment.upsert({
    where: { sequenceId_leadCaptureId: { sequenceId: sequence.id, leadCaptureId: lead.id } },
    update: { status: "ACTIVE", nextStepPosition: sequence.steps[0].position, nextSendAt: nextSequenceExecution(now, sequence.steps[0].delayHours, sequence), stopReason: null, completedAt: null },
    create: { sequenceId: sequence.id, leadCaptureId: lead.id, contactId: lead.contactId, status: "ACTIVE", nextStepPosition: sequence.steps[0].position, nextSendAt: nextSequenceExecution(now, sequence.steps[0].delayHours, sequence) },
  })
}

async function stopEnrollment(id: string, reason: string) {
  await prisma.emailSequenceEnrollment.update({ where: { id }, data: { status: "STOPPED", stopReason: reason, nextSendAt: null, completedAt: new Date() } })
}

export function dueSequenceEnrollmentWhere(now: Date, companyId?: string) {
  return {
    status: "ACTIVE",
    nextSendAt: { lte: now },
    sequence: { status: "ACTIVE", ...(companyId ? { companyId } : {}) },
  } as const
}

async function processDueSequenceEmailsUnlocked(limit = 50, companyId?: string) {
  const now = new Date()
  const due = await prisma.emailSequenceEnrollment.findMany({
    where: dueSequenceEnrollmentWhere(now, companyId),
    include: {
      sequence: { include: { company: { select: { id: true, name: true, email: true } }, steps: { orderBy: { position: "asc" } } } },
      leadCapture: { select: { id: true, clientId: true, firstName: true, lastName: true, email: true, projectType: true, city: true, marketingOptIn: true, status: true } },
      contact: { select: { marketingStatus: true } },
    },
    orderBy: { nextSendAt: "asc" },
    take: Math.min(Math.max(limit, 1), 200),
  })

  const summary = { examined: due.length, sent: 0, failed: 0, deadLettered: 0, stopped: 0, completed: 0, tasksCreated: 0, tasksWaiting: 0, skipped: null as string | null }
  for (const enrollment of due) {
    const lead = enrollment.leadCapture
    if (!lead.marketingOptIn || enrollment.contact?.marketingStatus === "OPTED_OUT") {
      await stopEnrollment(enrollment.id, "CONSENT_WITHDRAWN")
      summary.stopped += 1
      continue
    }
    const suppression = lead.email ? await activeEmailSuppression(enrollment.sequence.companyId, lead.email) : null
    if (suppression) {
      await stopEnrollment(enrollment.id, suppression.reason)
      summary.stopped += 1
      continue
    }
    if (["SPAM", "ARCHIVED"].includes(lead.status)) {
      await stopEnrollment(enrollment.id, `LEAD_${lead.status}`)
      summary.stopped += 1
      continue
    }
    const step = enrollment.sequence.steps.find((item) => item.position === enrollment.nextStepPosition)
    if (!step) {
      await prisma.emailSequenceEnrollment.update({ where: { id: enrollment.id }, data: { status: "COMPLETED", nextSendAt: null, completedAt: now } })
      summary.completed += 1
      continue
    }

    if (step.type !== "EMAIL") {
      try {
        let execution = await prisma.emailSequenceTask.findUnique({ where: { enrollmentId_stepId: { enrollmentId: enrollment.id, stepId: step.id } }, include: { organisationTask: { select: { status: true } } } })
        if (!execution) {
          const title = renderEmailVariables(step.taskTitle || "Action de suivi", { company: enrollment.sequence.company, lead }, false)
          const notes = step.taskNotes ? renderEmailVariables(step.taskNotes, { company: enrollment.sequence.company, lead }, false) : null
          execution = await prisma.$transaction(async (tx) => {
            const existing = await tx.emailSequenceTask.findUnique({ where: { enrollmentId_stepId: { enrollmentId: enrollment.id, stepId: step.id } }, include: { organisationTask: { select: { status: true } } } })
            if (existing) return existing
            const task = await tx.organisationTask.create({ data: { companyId: enrollment.sequence.companyId, clientId: lead.clientId, title, notes: [notes, `Séquence : ${enrollment.sequence.name}`].filter(Boolean).join("\n\n"), status: "TODO", priority: step.taskPriority, category: "SALES", isBillable: false, dueDate: enrollment.nextSendAt || now } })
            return tx.emailSequenceTask.create({ data: { companyId: enrollment.sequence.companyId, enrollmentId: enrollment.id, stepId: step.id, organisationTaskId: task.id }, include: { organisationTask: { select: { status: true } } } })
          })
          summary.tasksCreated += 1
        }
        if (!step.pauseUntilComplete || execution.organisationTask.status === "DONE") {
          const progressed = progressionData(enrollment.sequence, step.id, now)
          await prisma.$transaction([
            prisma.emailSequenceTask.update({ where: { id: execution.id }, data: { completedAt: execution.organisationTask.status === "DONE" ? now : execution.completedAt } }),
            prisma.emailSequenceEnrollment.update({ where: { id: enrollment.id }, data: progressed.data }),
          ])
          if (!progressed.nextStep) summary.completed += 1
        } else {
          await prisma.emailSequenceEnrollment.update({ where: { id: enrollment.id }, data: { nextSendAt: nextSequenceExecution(now, 1, enrollment.sequence) } })
          summary.tasksWaiting += 1
        }
      } catch {
        await prisma.emailSequenceEnrollment.update({ where: { id: enrollment.id }, data: { nextSendAt: nextSequenceExecution(new Date(), 1, enrollment.sequence) } })
        summary.failed += 1
      }
      continue
    }

    try {
      const existing = await prisma.emailDelivery.findUnique({
        where: { enrollmentId_stepId: { enrollmentId: enrollment.id, stepId: step.id } },
      })
      if (existing && ["SENT", "DELIVERED", "OPENED", "CLICKED"].includes(existing.status)) {
        const progressed = progressionData(enrollment.sequence, step.id, existing.sentAt || new Date())
        await prisma.emailSequenceEnrollment.update({
          where: { id: enrollment.id },
          data: { ...progressed.data, lastSentAt: existing.sentAt },
        })
        continue
      }
      if (existing && ["BOUNCED", "COMPLAINED", "SUPPRESSED", "DEAD_LETTER", "CANCELED"].includes(existing.status)) {
        await stopEnrollment(enrollment.id, existing.status === "DEAD_LETTER" ? "DELIVERY_RETRIES_EXHAUSTED" : `DELIVERY_${existing.status}`)
        summary.stopped += 1
        continue
      }
      if (existing?.status === "FAILED" && existing.nextAttemptAt && existing.nextAttemptAt > now) {
        await prisma.emailSequenceEnrollment.update({ where: { id: enrollment.id }, data: { nextSendAt: existing.nextAttemptAt } })
        continue
      }
      const staleClaimBefore = new Date(Date.now() - 15 * 60 * 1_000)
      if (existing?.status === "SENDING" && existing.updatedAt > staleClaimBefore) continue
      const delivery = await prisma.emailDelivery.upsert({
        where: { enrollmentId_stepId: { enrollmentId: enrollment.id, stepId: step.id } },
        update: {},
        create: {
          companyId: enrollment.sequence.companyId,
          sequenceId: enrollment.sequenceId,
          stepId: step.id,
          enrollmentId: enrollment.id,
          leadCaptureId: lead.id,
          contactId: enrollment.contactId,
          recipientEmail: lead.email!,
          subject: step.subject,
          status: "SCHEDULED",
          scheduledAt: enrollment.nextSendAt || now,
        },
      })
      if (delivery.status === "SENDING" && delivery.updatedAt <= staleClaimBefore) {
        await prisma.emailDelivery.updateMany({ where: { id: delivery.id, status: "SENDING", updatedAt: { lte: staleClaimBefore } }, data: { status: "FAILED", error: "Reprise après verrou d’envoi expiré", nextAttemptAt: now } })
      }
      const claimed = await prisma.emailDelivery.updateMany({
        where: {
          id: delivery.id,
          OR: [
            { status: "SCHEDULED" },
            { status: "FAILED", OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] },
          ],
        },
        data: { status: "SENDING", error: null, attempts: { increment: 1 }, lastAttemptAt: now },
      })
      if (claimed.count !== 1) continue
      const sent = await sendSequenceEmail({
        company: enrollment.sequence.company,
        lead,
        subjectTemplate: step.subject,
        bodyTemplate: step.bodyHtml,
        idempotencyKey: delivery.id,
        resume: {
          provider: delivery.provider,
          channelId: delivery.channelId,
          providerDraftId: delivery.providerDraftId,
          providerMessageId: delivery.providerMessageId,
        },
        onPrepared: async (prepared) => {
          const persisted = await prisma.emailDelivery.updateMany({
            where: { id: delivery.id, status: "SENDING" },
            data: prepared,
          })
          if (persisted.count !== 1) throw new Error("La préparation de l’envoi n’a pas pu être persistée")
        },
      })
      const sentAt = new Date()
      const progressed = progressionData(enrollment.sequence, step.id, sentAt)
      await prisma.$transaction([
        prisma.emailDelivery.update({ where: { id: delivery.id }, data: { status: "SENT", subject: sent.subject, provider: sent.provider, channelId: sent.channelId === "platform" ? null : sent.channelId, providerId: sent.providerId, providerDraftId: sent.providerDraftId, providerMessageId: sent.providerMessageId, sentAt, nextAttemptAt: null, deadLetteredAt: null, error: null } }),
        prisma.emailSequenceEnrollment.update({
          where: { id: enrollment.id },
          data: { ...progressed.data, lastSentAt: sentAt },
        }),
      ])
      await recordOutgoingEmail({
        companyId: enrollment.sequence.companyId,
        contactId: enrollment.contactId,
        leadCaptureId: lead.id,
        deliveryId: delivery.id,
        provider: sent.provider,
        providerId: sent.providerId,
        from: sent.from,
        to: [lead.email!],
        subject: sent.subject,
        bodyHtml: sent.html,
      })
      summary.sent += 1
      if (!progressed.nextStep) summary.completed += 1
    } catch (error) {
      const message = (error instanceof Error ? error.message : "Envoi impossible").slice(0, 500)
      const failedDelivery = await prisma.emailDelivery.findUnique({ where: { enrollmentId_stepId: { enrollmentId: enrollment.id, stepId: step.id } }, select: { id: true, attempts: true, maxAttempts: true } })
      const retry = nextDeliveryRetry({ attempts: failedDelivery?.attempts ?? 1, maxAttempts: failedDelivery?.maxAttempts ?? 5 })
      if (retry.deadLetter) {
        await prisma.$transaction([
          prisma.emailDelivery.updateMany({ where: { enrollmentId: enrollment.id, stepId: step.id, status: "SENDING" }, data: { status: "DEAD_LETTER", error: message, nextAttemptAt: null, deadLetteredAt: new Date() } }),
          prisma.emailSequenceEnrollment.update({ where: { id: enrollment.id }, data: { status: "PAUSED", stopReason: "DELIVERY_RETRIES_EXHAUSTED", nextSendAt: null } }),
        ])
        summary.deadLettered += 1
      } else {
        await prisma.$transaction([
          prisma.emailDelivery.updateMany({ where: { enrollmentId: enrollment.id, stepId: step.id, status: "SENDING" }, data: { status: "FAILED", error: message, nextAttemptAt: retry.nextAttemptAt } }),
          prisma.emailSequenceEnrollment.update({ where: { id: enrollment.id }, data: { nextSendAt: retry.nextAttemptAt } }),
        ])
      }
      summary.failed += 1
    }
  }
  return summary
}

export async function processDueSequenceEmails(limit = 50, companyId?: string) {
  const result = await withProcessorLease("email-sequences", () => processDueSequenceEmailsUnlocked(limit, companyId))
  if (result.acquired) return result.value
  return { examined: 0, sent: 0, failed: 0, deadLettered: 0, stopped: 0, completed: 0, tasksCreated: 0, tasksWaiting: 0, skipped: "PROCESSOR_BUSY" }
}

export async function completeSequenceTaskFromOrganisationTask(organisationTaskId: string) {
  const execution = await prisma.emailSequenceTask.findUnique({
    where: { organisationTaskId },
    include: { organisationTask: { select: { status: true } }, step: { select: { id: true, position: true, pauseUntilComplete: true } }, enrollment: { include: { sequence: { include: { steps: { orderBy: { position: "asc" }, select: { id: true, position: true, delayHours: true } } } } } } },
  })
  if (!execution || execution.organisationTask.status !== "DONE" || !execution.step.pauseUntilComplete || execution.enrollment.status !== "ACTIVE" || execution.enrollment.nextStepPosition !== execution.step.position) return { advanced: false as const }
  const now = new Date()
  const progressed = progressionData(execution.enrollment.sequence, execution.step.id, now)
  const updated = await prisma.emailSequenceEnrollment.updateMany({ where: { id: execution.enrollment.id, status: "ACTIVE", nextStepPosition: execution.step.position }, data: progressed.data })
  if (updated.count === 1) await prisma.emailSequenceTask.update({ where: { id: execution.id }, data: { completedAt: now } })
  return { advanced: updated.count === 1 }
}

export function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
}
