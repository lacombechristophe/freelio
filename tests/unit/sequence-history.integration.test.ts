import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/automations/email", async (original) => ({
  ...await original<typeof import("@/lib/automations/email")>(),
  prepareSequenceEmail: vi.fn(async (input: { subjectTemplate: string; bodyTemplate: string }) => ({ subject: input.subjectTemplate, html: input.bodyTemplate, headers: { "List-Unsubscribe": "<https://example.test/frozen-token>" } })),
  sendSequenceEmail: vi.fn(),
}))
vi.mock("@/lib/communications/threads", async (original) => ({
  ...await original<typeof import("@/lib/communications/threads")>(),
  recordOutgoingEmail: vi.fn(),
}))

import prisma from "@/lib/prisma"
import { prepareSequenceEmail, sendSequenceEmail } from "@/lib/automations/email"
import { recordOutgoingEmail } from "@/lib/communications/threads"
import { processDueSequenceEmails } from "@/lib/automations/sequences"
import { assertManualMarketingConsent } from "@/lib/communications/marketing-consent"
import { fictionalMarketingProof } from "../helpers/fictional-marketing-proof"

describe.sequential("accepted sequence transport and durable history", () => {
  const companies: string[] = []
  beforeEach(async () => {
    vi.resetAllMocks()
    const actual = await vi.importActual<typeof import("@/lib/communications/threads")>("@/lib/communications/threads")
    vi.mocked(recordOutgoingEmail).mockImplementation(actual.recordOutgoingEmail)
    vi.mocked(prepareSequenceEmail).mockImplementation(async (input) => ({ subject: input.subjectTemplate, html: input.bodyTemplate, marketing: await assertManualMarketingConsent(input.company.id, input.lead.contactId!, input.lead.email!), headers: { "List-Unsubscribe": "<https://example.test/frozen-token>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } }))
    vi.mocked(sendSequenceEmail).mockImplementation(async (input) => {
      await input.beforeDispatch?.()
      await input.onPrepared?.({ provider: "RESEND", channelId: input.channelId!, providerDraftId: null, providerMessageId: null })
      return { provider: "RESEND", providerId: `fiction-${input.idempotencyKey}`, providerDraftId: null, providerMessageId: `fiction-${input.idempotencyKey}`, channelId: input.channelId!, from: "sender@example.test", subject: input.prepared!.subject, html: input.prepared!.html }
    })
  })
  afterAll(async () => {
    for (const id of companies) {
      await prisma.leadCapture.deleteMany({ where: { companyId: id } })
      await prisma.contact.deleteMany({ where: { client: { companyId: id } } })
      await prisma.client.deleteMany({ where: { companyId: id } })
      await prisma.company.delete({ where: { id } })
    }
    await prisma.processorLease.deleteMany({ where: { name: "email-sequences" } })
  })
  async function fixture() {
    const company = await prisma.company.create({ data: { name: "Fictitious sequence history" } })
    companies.push(company.id)
    const channel = await prisma.communicationChannel.create({ data: { companyId: company.id, provider: "RESEND", emailAddress: "sender@example.test", status: "ACTIVE", visibility: "SHARED" } })
    const lead = await prisma.leadCapture.create({ data: { companyId: company.id, firstName: "Fiction", lastName: "History", email: "recipient@example.test", marketingOptIn: true, privacyAccepted: true, fingerprint: "recipe" } })
    const proof = await fictionalMarketingProof(company.id, lead.id, lead.email!)
    const campaign = await prisma.marketingCampaign.create({ data: { companyId: company.id, name: "Fixture", objective: "History", channels: ["EMAIL"], status: "ACTIVE" } })
    const sequence = await prisma.emailSequence.create({ data: { companyId: company.id, campaignId: campaign.id, senderChannelId: channel.id, name: "Fixture", status: "ACTIVE", businessDaysOnly: false, timezone: "UTC", steps: { create: { position: 0, subject: "Original subject", bodyHtml: "<p>Original body</p>" } } }, include: { steps: true } })
    const enrollment = await prisma.emailSequenceEnrollment.create({ data: { sequenceId: sequence.id, leadCaptureId: lead.id, contactId: proof.contact.id, nextSendAt: new Date(Date.now() - 60_000) } })
    return { company, channel, lead, campaign, sequence, enrollment }
  }

  it("repairs accepted history while paused, then advances without sending again", async () => {
    const { company, campaign, sequence, enrollment } = await fixture()
    vi.mocked(recordOutgoingEmail).mockRejectedValueOnce(new Error("Fictitious history outage"))
    const first = await processDueSequenceEmails(10, company.id)
    expect(first.sent).toBe(1)
    expect(first.failed).toBe(1)
    const delivery = await prisma.emailDelivery.findFirstOrThrow({ where: { companyId: company.id } })
    expect(delivery.status).toBe("SENT")
    expect(delivery.providerId).toBeTruthy()
    expect((await prisma.emailSequenceEnrollment.findUniqueOrThrow({ where: { id: enrollment.id } })).status).toBe("ACTIVE")
    await prisma.marketingCampaign.update({ where: { id: campaign.id }, data: { status: "PAUSED" } })
    await prisma.emailSequenceStep.update({ where: { id: sequence.steps[0].id }, data: { subject: "Edited subject", bodyHtml: "<p>Edited body</p>" } })
    expect((await processDueSequenceEmails(10, company.id)).historiesRepaired).toBe(1)
    const history = await prisma.emailMessage.findUniqueOrThrow({ where: { deliveryId: delivery.id } })
    expect(history.subject).toBe("Original subject")
    expect(history.bodyHtml).toBe("<p>Original body</p>")
    await prisma.marketingCampaign.update({ where: { id: campaign.id }, data: { status: "ACTIVE" } })
    await processDueSequenceEmails(10, company.id)
    expect(vi.mocked(sendSequenceEmail)).toHaveBeenCalledTimes(1)
    expect((await prisma.emailSequenceEnrollment.findUniqueOrThrow({ where: { id: enrollment.id } })).status).toBe("COMPLETED")
    expect(await prisma.emailMessage.count({ where: { deliveryId: delivery.id } })).toBe(1)
  })

  it("reuses the frozen body, unsubscribe token and idempotency key on a retry", async () => {
    const { company, sequence, enrollment } = await fixture()
    vi.mocked(sendSequenceEmail).mockImplementationOnce(async (input) => {
      await input.onPrepared?.({ provider: "RESEND", channelId: input.channelId!, providerDraftId: null, providerMessageId: null })
      throw new Error("Fictitious ambiguous timeout")
    })
    await processDueSequenceEmails(10, company.id)
    const delivery = await prisma.emailDelivery.findFirstOrThrow({ where: { companyId: company.id } })
    expect(delivery.status).toBe("FAILED")
    await prisma.emailSequenceStep.update({ where: { id: sequence.steps[0].id }, data: { subject: "Changed", bodyHtml: "<p>Changed</p>" } })
    await prisma.emailDelivery.update({ where: { id: delivery.id }, data: { nextAttemptAt: new Date(0) } })
    await prisma.emailSequenceEnrollment.update({ where: { id: enrollment.id }, data: { nextSendAt: new Date(0) } })
    await processDueSequenceEmails(10, company.id)
    const calls = vi.mocked(sendSequenceEmail).mock.calls
    expect(calls).toHaveLength(2)
    expect(calls[1][0].prepared).toEqual(calls[0][0].prepared)
    expect(calls[1][0].idempotencyKey).toBe(calls[0][0].idempotencyKey)
    expect(prepareSequenceEmail).toHaveBeenCalledTimes(1)
    expect((await prisma.emailMessage.findUniqueOrThrow({ where: { deliveryId: delivery.id } })).bodyHtml).toBe("<p>Original body</p>")
  })

  it("holds legacy accepted deliveries without inventing missing content or resending", async () => {
    const { company, sequence, enrollment, lead } = await fixture()
    const delivery = await prisma.emailDelivery.create({ data: { companyId: company.id, sequenceId: sequence.id, enrollmentId: enrollment.id, stepId: sequence.steps[0].id, leadCaptureId: lead.id, recipientEmail: lead.email!, subject: "Legacy", status: "SENT", provider: "RESEND", providerId: "legacy-fiction", sentAt: new Date(), scheduledAt: new Date() } })
    await processDueSequenceEmails(10, company.id)
    expect(sendSequenceEmail).not.toHaveBeenCalled()
    expect((await prisma.emailDelivery.findUniqueOrThrow({ where: { id: delivery.id } })).status).toBe("SENT")
    expect(await prisma.emailMessage.count({ where: { deliveryId: delivery.id } })).toBe(0)
    expect((await prisma.emailSequenceEnrollment.findUniqueOrThrow({ where: { id: enrollment.id } })).status).toBe("ACTIVE")
  })

  it("preserves a pause occurring during transport acceptance and resumes through history", async () => {
    const { company, enrollment } = await fixture()
    const transport = vi.mocked(sendSequenceEmail).getMockImplementation()!
    vi.mocked(sendSequenceEmail).mockImplementationOnce(async (input) => {
      const accepted = await transport(input)
      await prisma.emailSequenceEnrollment.update({ where: { id: enrollment.id }, data: { status: "PAUSED", nextSendAt: null } })
      return accepted
    })
    await processDueSequenceEmails(10, company.id)
    expect((await prisma.emailSequenceEnrollment.findUniqueOrThrow({ where: { id: enrollment.id } })).status).toBe("PAUSED")
    expect((await prisma.emailDelivery.findFirstOrThrow({ where: { companyId: company.id } })).status).toBe("SENT")
    expect(await prisma.emailMessage.count({ where: { companyId: company.id } })).toBe(1)
    await prisma.emailSequenceEnrollment.update({ where: { id: enrollment.id }, data: { status: "ACTIVE", nextSendAt: new Date(0) } })
    expect((await processDueSequenceEmails(10, company.id)).completed).toBe(1)
    expect(sendSequenceEmail).toHaveBeenCalledTimes(1)
  })

  it("holds an address proof withdrawn during preparation and never reaches transport or silently adopts a replacement grant", async () => {
    const { company, lead, enrollment } = await fixture()
    const currentLead = await prisma.leadCapture.findUniqueOrThrow({ where: { id: lead.id } })
    const proof = await assertManualMarketingConsent(company.id, currentLead.contactId!, lead.email!)
    await prisma.emailSequenceEnrollment.update({ where: { id: enrollment.id }, data: { marketingAuthorization: proof } })
    const renderer = vi.mocked(prepareSequenceEmail).getMockImplementation()!
    vi.mocked(prepareSequenceEmail).mockImplementationOnce(async input => {
      const prepared = await renderer(input)
      await prisma.marketingConsent.update({ where: { id: proof.consentId }, data: { withdrawnAt: new Date() } })
      const original = await prisma.marketingConsent.findUniqueOrThrow({ where: { id: proof.consentId } })
      await prisma.marketingConsent.create({ data: { companyId: company.id, clientId: original.clientId, contactId: original.contactId, recipientEmail: original.recipientEmail,
        channel: "EMAIL", purpose: "MARKETING", legalBasis: "CONSENT", status: "GRANTED", source: "ISOLATED_REPLACEMENT_PROOF", noticeUrl: "https://example.test/privacy", proofHash: "b".repeat(64), capturedAt: new Date(original.capturedAt.getTime() + 1000) } })
      return prepared
    })
    const result = await processDueSequenceEmails(10, company.id)
    expect(result.sent).toBe(0)
    expect(result.stopped).toBe(1)
    expect(sendSequenceEmail).not.toHaveBeenCalled()
    expect(await prisma.emailSequenceEnrollment.findUniqueOrThrow({ where: { id: enrollment.id } })).toMatchObject({ status: "STOPPED", stopReason: "CONSENT_PROOF_INVALID", nextSendAt: null })
  })
})
