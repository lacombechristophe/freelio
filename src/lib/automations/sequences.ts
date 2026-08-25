import { Prisma } from "@prisma/client"

import { sendSequenceEmail } from "@/lib/automations/email"
import prisma from "@/lib/prisma"
import { recordOutgoingEmail } from "@/lib/communications/threads"

function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + Math.max(0, hours) * 60 * 60 * 1_000)
}

export async function enrollLeadInSequenceInternal(input: { companyId: string; sequenceId: string; leadId: string }) {
  const [sequence, lead] = await Promise.all([
    prisma.emailSequence.findFirst({
      where: { id: input.sequenceId, companyId: input.companyId },
      include: { steps: { orderBy: { position: "asc" }, take: 1 } },
    }),
    prisma.leadCapture.findFirst({ where: { id: input.leadId, companyId: input.companyId }, select: { id: true, contactId: true, email: true, marketingOptIn: true } }),
  ])
  if (!sequence) throw new Error("Séquence introuvable")
  if (!sequence.steps[0]) throw new Error("Ajoutez au moins une étape à la séquence")
  if (!lead?.email) throw new Error("Le prospect n'a pas d'adresse e-mail")
  if (!lead.marketingOptIn) throw new Error("Le prospect n'a pas de consentement marketing actif")
  const now = new Date()
  return prisma.emailSequenceEnrollment.upsert({
    where: { sequenceId_leadCaptureId: { sequenceId: sequence.id, leadCaptureId: lead.id } },
    update: { status: "ACTIVE", nextStepPosition: sequence.steps[0].position, nextSendAt: addHours(now, sequence.steps[0].delayHours), stopReason: null, completedAt: null },
    create: { sequenceId: sequence.id, leadCaptureId: lead.id, contactId: lead.contactId, status: "ACTIVE", nextStepPosition: sequence.steps[0].position, nextSendAt: addHours(now, sequence.steps[0].delayHours) },
  })
}

async function stopEnrollment(id: string, reason: string) {
  await prisma.emailSequenceEnrollment.update({ where: { id }, data: { status: "STOPPED", stopReason: reason, nextSendAt: null, completedAt: new Date() } })
}

export async function processDueSequenceEmails(limit = 50) {
  if (!process.env.RESEND_API_KEY?.trim()) throw new Error("RESEND_API_KEY n'est pas configurée")
  const now = new Date()
  const due = await prisma.emailSequenceEnrollment.findMany({
    where: { status: "ACTIVE", nextSendAt: { lte: now }, sequence: { status: "ACTIVE" } },
    include: {
      sequence: { include: { company: { select: { id: true, name: true, email: true } }, steps: { orderBy: { position: "asc" } } } },
      leadCapture: { select: { id: true, firstName: true, lastName: true, email: true, projectType: true, city: true, marketingOptIn: true, status: true } },
      contact: { select: { marketingStatus: true } },
    },
    orderBy: { nextSendAt: "asc" },
    take: Math.min(Math.max(limit, 1), 200),
  })

  const summary = { examined: due.length, sent: 0, failed: 0, stopped: 0, completed: 0 }
  for (const enrollment of due) {
    const lead = enrollment.leadCapture
    if (!lead.marketingOptIn || enrollment.contact?.marketingStatus === "OPTED_OUT") {
      await stopEnrollment(enrollment.id, "CONSENT_WITHDRAWN")
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

    try {
      const existing = await prisma.emailDelivery.findUnique({
        where: { enrollmentId_stepId: { enrollmentId: enrollment.id, stepId: step.id } },
      })
      if (existing && ["SENT", "DELIVERED", "OPENED", "CLICKED"].includes(existing.status)) {
        const stepIndex = enrollment.sequence.steps.findIndex((item) => item.id === step.id)
        const nextStep = enrollment.sequence.steps[stepIndex + 1]
        await prisma.emailSequenceEnrollment.update({
          where: { id: enrollment.id },
          data: nextStep
            ? { nextStepPosition: nextStep.position, nextSendAt: addHours(existing.sentAt || new Date(), nextStep.delayHours), lastSentAt: existing.sentAt }
            : { status: "COMPLETED", nextSendAt: null, lastSentAt: existing.sentAt, completedAt: existing.sentAt || new Date() },
        })
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
        await prisma.emailDelivery.updateMany({ where: { id: delivery.id, status: "SENDING", updatedAt: { lte: staleClaimBefore } }, data: { status: "FAILED", error: "Reprise après verrou d’envoi expiré" } })
      }
      const claimed = await prisma.emailDelivery.updateMany({
        where: { id: delivery.id, status: { in: ["SCHEDULED", "FAILED"] } },
        data: { status: "SENDING", error: null },
      })
      if (claimed.count !== 1) continue
      const sent = await sendSequenceEmail({ company: enrollment.sequence.company, lead, subjectTemplate: step.subject, bodyTemplate: step.bodyHtml, idempotencyKey: delivery.id })
      const stepIndex = enrollment.sequence.steps.findIndex((item) => item.id === step.id)
      const nextStep = enrollment.sequence.steps[stepIndex + 1]
      await prisma.$transaction([
        prisma.emailDelivery.update({ where: { id: delivery.id }, data: { status: "SENT", subject: sent.subject, providerId: sent.providerId, sentAt: new Date(), error: null } }),
        prisma.emailSequenceEnrollment.update({
          where: { id: enrollment.id },
          data: nextStep
            ? { nextStepPosition: nextStep.position, nextSendAt: addHours(new Date(), nextStep.delayHours), lastSentAt: new Date() }
            : { status: "COMPLETED", nextSendAt: null, lastSentAt: new Date(), completedAt: new Date() },
        }),
      ])
      await recordOutgoingEmail({
        companyId: enrollment.sequence.companyId,
        contactId: enrollment.contactId,
        leadCaptureId: lead.id,
        deliveryId: delivery.id,
        providerId: sent.providerId,
        from: sent.from,
        to: [lead.email!],
        subject: sent.subject,
        bodyHtml: sent.html,
      })
      summary.sent += 1
      if (!nextStep) summary.completed += 1
    } catch (error) {
      const message = (error instanceof Error ? error.message : "Envoi impossible").slice(0, 500)
      await prisma.emailDelivery.updateMany({ where: { enrollmentId: enrollment.id, stepId: step.id }, data: { status: "FAILED", error: message } })
      await prisma.emailSequenceEnrollment.update({ where: { id: enrollment.id }, data: { nextSendAt: addHours(new Date(), 1) } })
      summary.failed += 1
    }
  }
  return summary
}

export function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
}
