import { Prisma } from "@prisma/client"

import prisma from "@/lib/prisma"

export const EMAIL_SUPPRESSION_REASONS = [
  "PERMANENT_BOUNCE",
  "COMPLAINT",
  "PROVIDER_SUPPRESSION",
  "MANUAL",
] as const

export type EmailSuppressionReason = (typeof EMAIL_SUPPRESSION_REASONS)[number]

export function normalizeEmailAddress(value: string) {
  return value.trim().toLowerCase()
}

export function resendSuppressionReason(event: {
  type: string
  data?: { bounce?: { type?: string } }
}): EmailSuppressionReason | null {
  if (event.type === "email.complained") return "COMPLAINT"
  if (event.type === "email.suppressed") return "PROVIDER_SUPPRESSION"
  if (event.type === "email.bounced" && event.data?.bounce?.type?.toLowerCase() === "permanent") return "PERMANENT_BOUNCE"
  return null
}

export async function activeEmailSuppression(companyId: string, email: string) {
  return prisma.emailSuppression.findUnique({
    where: { companyId_email: { companyId, email: normalizeEmailAddress(email) } },
  }).then((suppression) => suppression?.active ? suppression : null)
}

export async function suppressEmailAddress(input: {
  companyId: string
  email: string
  reason: EmailSuppressionReason
  provider?: string | null
  providerEventId?: string | null
  details?: Prisma.InputJsonValue
  leadCaptureId?: string | null
  contactId?: string | null
  occurredAt?: Date
}) {
  const email = normalizeEmailAddress(input.email)
  const occurredAt = input.occurredAt ?? new Date()
  return prisma.$transaction(async (tx) => {
    const suppression = await tx.emailSuppression.upsert({
      where: { companyId_email: { companyId: input.companyId, email } },
      update: {
        active: true,
        reason: input.reason,
        provider: input.provider ?? null,
        providerEventId: input.providerEventId ?? null,
        details: input.details,
        suppressedAt: occurredAt,
        clearedAt: null,
      },
      create: {
        companyId: input.companyId,
        email,
        reason: input.reason,
        provider: input.provider ?? null,
        providerEventId: input.providerEventId ?? null,
        details: input.details,
        suppressedAt: occurredAt,
      },
    })

    const identities = [
      ...(input.leadCaptureId ? [{ leadCaptureId: input.leadCaptureId }] : []),
      ...(input.contactId ? [{ contactId: input.contactId }] : []),
    ]
    if (identities.length) {
      await tx.emailSequenceEnrollment.updateMany({
        where: { status: { in: ["ACTIVE", "PAUSED"] }, sequence: { companyId: input.companyId }, OR: identities },
        data: {
          status: "STOPPED",
          stopReason: input.reason,
          nextSendAt: null,
          completedAt: occurredAt,
        },
      })
    }
    return suppression
  })
}

export async function clearEmailSuppression(companyId: string, suppressionId: string) {
  const clearedAt = new Date()
  const updated = await prisma.emailSuppression.updateMany({
    where: { id: suppressionId, companyId, active: true },
    data: { active: false, clearedAt },
  })
  return updated.count === 1
}
