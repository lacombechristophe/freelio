import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
const authContext = vi.hoisted(() => ({ companyId: "", userId: "fixture-user" }))
vi.mock("@/lib/auth-wrapper", () => ({ withAuth: (task: (value: typeof authContext) => unknown) => task(authContext) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/audit", () => ({ logAction: vi.fn() }))
vi.mock("@/lib/automations/email", () => ({
  prepareSequenceEmail: vi.fn(async () => ({ subject: "Fixture", html: "<p>Fixture</p>", headers: {} })),
  renderEmailVariables: (value: string) => value,
  sendSequenceEmail: vi.fn(async () => ({ provider: "RESEND", providerId: "fiction-message", providerDraftId: null, providerMessageId: "fiction-message", channelId: "platform", from: "fiction@example.test", subject: "Fixture", html: "<p>Fixture</p>" })),
}))
vi.mock("@/lib/communications/threads", () => ({ recordOutgoingEmail: vi.fn() }))

import prisma from "@/lib/prisma"
import { sendSequenceEmail } from "@/lib/automations/email"
import { enrollLeadInSequenceInternal, processDueSequenceEmails } from "@/lib/automations/sequences"
import { pinSequenceSender } from "@/lib/communications/email-provider"
import { enrollCampaignAudience } from "@/actions/campaigns"

describe.sequential("campaign gate and enrollment identity", () => {
  const companies: string[] = []
  beforeEach(() => vi.clearAllMocks())
  afterAll(async () => {
    for (const id of companies) await prisma.company.delete({ where: { id } })
    await prisma.processorLease.deleteMany({ where: { name: "email-sequences" } })
  })

  async function fixture(status: string, startAt: Date | null = null, endAt: Date | null = null) {
    const company = await prisma.company.create({ data: { name: "Fictitious campaign gate" } })
    companies.push(company.id)
    const lead = await prisma.leadCapture.create({ data: { companyId: company.id, firstName: "Fiction", lastName: "Campaign", email: "campaign@example.test", marketingOptIn: true, privacyAccepted: true, fingerprint: "recipe" } })
    const campaign = await prisma.marketingCampaign.create({ data: { companyId: company.id, name: "Fixture", objective: "Gate", channels: ["EMAIL"], status, startAt, endAt } })
    const sequence = await prisma.emailSequence.create({ data: { companyId: company.id, campaignId: campaign.id, name: "Fixture", status: "ACTIVE", businessDaysOnly: false, timezone: "UTC", steps: { create: { position: 0, subject: "Fixture", bodyHtml: "<p>Fixture</p>" } } } })
    const enrollment = await prisma.emailSequenceEnrollment.create({ data: { sequenceId: sequence.id, leadCaptureId: lead.id, nextSendAt: new Date(Date.now() - 60_000) } })
    return { company, campaign, sequence, lead, enrollment }
  }

  it.each(["PLANNED", "PAUSED", "COMPLETED", "ARCHIVED", "DRAFT"])("does not dispatch an active enrollment from a %s campaign", async (status) => {
    const { company } = await fixture(status)
    const result = await processDueSequenceEmails(10, company.id)
    expect(result.sent).toBe(0)
    expect(sendSequenceEmail).not.toHaveBeenCalled()
    expect(await prisma.emailDelivery.count({ where: { companyId: company.id } })).toBe(0)
  })

  it("does not dispatch outside an active campaign's date interval", async () => {
    for (const [startAt, endAt] of [[new Date(Date.now() + 86_400_000), null], [null, new Date(Date.now() - 60_000)]] as const) {
      const { company } = await fixture("ACTIVE", startAt, endAt)
      await processDueSequenceEmails(10, company.id)
      expect(sendSequenceEmail).not.toHaveBeenCalled()
    }
  })

  it("re-enrollment preserves progress and never restarts an old occurrence", async () => {
    const { company, sequence, lead, enrollment } = await fixture("ACTIVE")
    await prisma.emailSequenceEnrollment.update({ where: { id: enrollment.id }, data: { status: "COMPLETED", nextStepPosition: 4, nextSendAt: null, completedAt: new Date() } })
    const result = await enrollLeadInSequenceInternal({ companyId: company.id, sequenceId: sequence.id, leadId: lead.id })
    expect(result.id).toBe(enrollment.id)
    expect(result.status).toBe("COMPLETED")
    expect(result.nextStepPosition).toBe(4)
    expect(result.nextSendAt).toBeNull()
  })

  it("keeps a future campaign planned and schedules its audience after the start", async () => {
    const startAt = new Date(Date.now() + 86_400_000)
    const { company, campaign, sequence, lead, enrollment } = await fixture("PLANNED", startAt)
    authContext.companyId = company.id
    await prisma.communicationChannel.create({ data: { companyId: company.id, provider: "RESEND", emailAddress: "campaign-sender@example.test", status: "ACTIVE" } })
    await prisma.emailSequenceEnrollment.delete({ where: { id: enrollment.id } })
    const segment = await prisma.marketingSegment.create({ data: { companyId: company.id, name: "Fictitious audience", filters: {}, memberships: { create: { leadCaptureId: lead.id } } } })
    await prisma.marketingCampaign.update({ where: { id: campaign.id }, data: { segmentId: segment.id } })
    const result = await enrollCampaignAudience({ campaignId: campaign.id, sequenceId: sequence.id })
    expect(result.enrolled).toBe(1)
    expect((await prisma.marketingCampaign.findUniqueOrThrow({ where: { id: campaign.id } })).status).toBe("PLANNED")
    expect((await prisma.emailSequenceEnrollment.findUniqueOrThrow({ where: { sequenceId_leadCaptureId: { sequenceId: sequence.id, leadCaptureId: lead.id } } })).nextSendAt!.getTime()).toBeGreaterThanOrEqual(startAt.getTime())
  })

  it("pins the sender and refuses to substitute a newly added mailbox after disconnect", async () => {
    const { company, sequence } = await fixture("ACTIVE")
    const mailbox = await prisma.communicationChannel.create({ data: { companyId: company.id, provider: "RESEND", emailAddress: "first@example.test", status: "ACTIVE" } })
    expect(await pinSequenceSender(company.id, sequence.id)).toBe(mailbox.id)
    await prisma.communicationChannel.create({ data: { companyId: company.id, provider: "RESEND", emailAddress: "new@example.test", status: "ACTIVE" } })
    expect(await pinSequenceSender(company.id, sequence.id)).toBe(mailbox.id)
    await prisma.communicationChannel.update({ where: { id: mailbox.id }, data: { status: "PENDING" } })
    await expect(pinSequenceSender(company.id, sequence.id)).rejects.toThrow("Aucune messagerie active")
  })

  it("rechecks a concurrent pause after preparation and leaves the delivery pending", async () => {
    const { company, campaign } = await fixture("ACTIVE")
    await prisma.communicationChannel.create({ data: { companyId: company.id, provider: "RESEND", emailAddress: "first@example.test", status: "ACTIVE" } })
    vi.mocked(sendSequenceEmail).mockImplementationOnce(async (input) => {
      await prisma.marketingCampaign.update({ where: { id: campaign.id }, data: { status: "PAUSED" } })
      await input.beforeDispatch?.()
      throw new Error("Transport must not be reached")
    })
    const result = await processDueSequenceEmails(10, company.id)
    expect(result.sent).toBe(0)
    expect(result.failed).toBe(0)
    expect((await prisma.emailDelivery.findFirstOrThrow({ where: { companyId: company.id } })).status).toBe("SCHEDULED")
  })
})
