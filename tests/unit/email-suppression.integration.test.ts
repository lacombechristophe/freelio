import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { activeEmailSuppression, clearEmailSuppression, suppressEmailAddress } from "@/lib/communications/suppressions"
import prisma from "@/lib/prisma"

describe.sequential("email suppression persistence", () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  let companyId = ""
  let leadId = ""
  let enrollmentId = ""

  beforeAll(async () => {
    const company = await prisma.company.create({ data: { name: `Suppression QA ${suffix}` } })
    companyId = company.id
    const lead = await prisma.leadCapture.create({
      data: {
        companyId,
        firstName: "Camille",
        lastName: "Test",
        email: `CLIENT-${suffix}@Example.FR`,
        privacyAccepted: true,
        marketingOptIn: true,
        fingerprint: `suppression-${suffix}`,
      },
    })
    leadId = lead.id
    const sequence = await prisma.emailSequence.create({
      data: {
        companyId,
        name: `Séquence suppression ${suffix}`,
        status: "ACTIVE",
        steps: { create: { position: 0, delayHours: 0, subject: "Test", bodyHtml: "<p>Test</p>" } },
      },
    })
    const enrollment = await prisma.emailSequenceEnrollment.create({
      data: { sequenceId: sequence.id, leadCaptureId: lead.id, status: "ACTIVE", nextSendAt: new Date() },
    })
    enrollmentId = enrollment.id
  })

  afterAll(async () => {
    if (companyId) await prisma.company.deleteMany({ where: { id: companyId } })
  })

  it("blocks the normalized address and stops future sequence work", async () => {
    const suppression = await suppressEmailAddress({
      companyId,
      email: `  CLIENT-${suffix}@Example.FR `,
      reason: "PERMANENT_BOUNCE",
      provider: "RESEND",
      providerEventId: `event-${suffix}`,
      leadCaptureId: leadId,
    })

    await expect(activeEmailSuppression(companyId, `client-${suffix}@example.fr`)).resolves.toMatchObject({
      id: suppression.id,
      email: `client-${suffix}@example.fr`,
      active: true,
      reason: "PERMANENT_BOUNCE",
    })
    await expect(prisma.emailSequenceEnrollment.findUniqueOrThrow({ where: { id: enrollmentId } })).resolves.toMatchObject({
      status: "STOPPED",
      stopReason: "PERMANENT_BOUNCE",
      nextSendAt: null,
    })

    await expect(clearEmailSuppression(companyId, suppression.id)).resolves.toBe(true)
    await expect(activeEmailSuppression(companyId, `client-${suffix}@example.fr`)).resolves.toBeNull()
  })
})
