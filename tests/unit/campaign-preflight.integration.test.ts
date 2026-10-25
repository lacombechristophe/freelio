import { createHash, randomUUID } from "node:crypto"
import { afterAll, afterEach, describe, expect, it, vi } from "vitest"
const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
import prisma from "@/lib/prisma"
import { encrypt } from "@/lib/crypto"
import { captureCampaignAudience, processCampaignActivations } from "@/lib/marketing/campaign-activation"
import { readCampaignContentPreflight } from "@/lib/marketing/campaign-preflight"
import { processDueSequenceEmails } from "@/lib/automations/sequences"
import { getMarketingCampaignContentPreflight } from "@/actions/campaigns"

const companies: string[] = [], users: string[] = []
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers() })
afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { userId: { in: users } } })
  await prisma.client.deleteMany({ where: { companyId: { in: companies } } })
  await prisma.company.deleteMany({ where: { id: { in: companies } } })
  await prisma.user.deleteMany({ where: { id: { in: users } } })
})
async function fixture(bodyHtml: string) {
  const company = await prisma.company.create({ data: { name: "Fictional content preflight" } }); companies.push(company.id)
  const user = await prisma.user.create({ data: { name: "Fictional preflight owner" } }); users.push(user.id)
  const member = await prisma.membership.create({ data: { companyId: company.id, userId: user.id, role: "OWNER", status: "ACTIVE" } })
  const segment = await prisma.marketingSegment.create({ data: { companyId: company.id, name: "Fictional empty audience", kind: "STATIC", filters: {} } })
  const campaign = await prisma.marketingCampaign.create({ data: { companyId: company.id, segmentId: segment.id, name: "Fictional preflight campaign", objective: "Recipe", channels: ["EMAIL"], status: "PLANNED" } })
  const channel = await prisma.communicationChannel.create({ data: { companyId: company.id, provider: "RESEND", status: "ACTIVE", visibility: "SHARED", emailAddress: "sender@example.test",
    credentialsEncrypted: encrypt(JSON.stringify({ mode: "BYOK", apiKey: "re_fictional_only", webhookSecret: "whsec_fictional_only" })) } })
  await prisma.emailSendQuotaPolicy.create({ data: { companyId: company.id, channelId: channel.id, channelKey: channel.id, enabled: true, dailyRecipientLimit: 100, minuteRecipientLimit: 10 } })
  const sequence = await prisma.emailSequence.create({ data: { companyId: company.id, campaignId: campaign.id, senderChannelId: channel.id, name: "Fictional preflight sequence", status: "ACTIVE", businessDaysOnly: false, sendWindowStart: 0, sendWindowEnd: 23, timezone: "UTC", steps: { create: { position: 0, type: "EMAIL", subject: "Fictional message", bodyHtml } } }, include: { steps: true } })
  session.userId = user.id; session.companyId = company.id
  return { company, user, member, campaign, sequence }
}
describe.sequential("campaign content preflight on real SQL", () => {
  it.each([
    ["unknown variable", "<p>Bonjour {{contact.unknown}}</p>"],
    ["broken relative link", '<p>Réservez <a href="/booking">votre visite</a></p>'],
    ["empty sanitized body", "<script>discarded()</script><p>&nbsp; &#8203;</p>"],
  ])("refuses %s before creating an audience or audit", async (_kind, body) => {
    const f = await fixture(body)
    await expect(captureCampaignAudience(f.company.id, f.user.id, { campaignId: f.campaign.id, sequenceId: f.sequence.id, version: 1 })).rejects.toThrow("Étape 1")
    expect(await prisma.campaignAudience.count({ where: { companyId: f.company.id } })).toBe(0)
    expect(await prisma.auditLog.count({ where: { resourceId: f.campaign.id } })).toBe(0)
    expect((await prisma.marketingCampaign.findUniqueOrThrow({ where: { id: f.campaign.id } })).version).toBe(1)
  })
  it("reads a complete bounded report without writing, including in the public demo", async () => {
    const f = await fixture('<p>Bonjour {{contact.firstName}}</p>' + '<a href="/invalid">Visite</a>'.repeat(105))
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    const report = await getMarketingCampaignContentPreflight({ campaignId: f.campaign.id, sequenceId: f.sequence.id })
    expect(report).toMatchObject({ ok: false, emailSteps: 1, linkCount: 105, errors: 105, issues: expect.any(Array), issueCount: 105 })
    expect(report!.issues).toHaveLength(100)
    expect(JSON.stringify(report)).not.toContain("bodyHtml")
    expect(await prisma.auditLog.count({ where: { resourceId: f.campaign.id } })).toBe(0)
    expect(await prisma.campaignAudience.count({ where: { companyId: f.company.id } })).toBe(0)
  })
  it("rejects extra tenant or actor parameters instead of trusting them", async () => {
    const f = await fixture("<p>Bonjour</p>")
    await expect(getMarketingCampaignContentPreflight({ campaignId: f.campaign.id, sequenceId: f.sequence.id, companyId: "foreign" })).rejects.toThrow()
    await expect(getMarketingCampaignContentPreflight({ campaignId: f.campaign.id, sequenceId: f.sequence.id, userId: "foreign" })).rejects.toThrow()
  })
  it("allows read roles but refuses withdrawn memberships and unrelated campaigns or companies", async () => {
    const f = await fixture("<p>Bonjour</p>"), other = await fixture("<p>Foreign</p>")
    await prisma.membership.update({ where: { id: f.member.id }, data: { role: "OPERATIONS" } })
    expect((await readCampaignContentPreflight(f.company.id, f.user.id, { campaignId: f.campaign.id, sequenceId: f.sequence.id })).ok).toBe(true)
    await expect(readCampaignContentPreflight(f.company.id, f.user.id, { campaignId: f.campaign.id, sequenceId: other.sequence.id })).rejects.toThrow("inaccessible")
    await expect(readCampaignContentPreflight(other.company.id, f.user.id, { campaignId: other.campaign.id, sequenceId: other.sequence.id })).rejects.toThrow("Accès")
    await prisma.membership.update({ where: { id: f.member.id }, data: { status: "SUSPENDED" } })
    await expect(readCampaignContentPreflight(f.company.id, f.user.id, { campaignId: f.campaign.id, sequenceId: f.sequence.id })).rejects.toThrow("Accès")
  })
  it("does not require email content for task-only sequences", async () => {
    const f = await fixture("")
    await prisma.emailSequenceStep.update({ where: { id: f.sequence.steps[0].id }, data: { type: "TASK", subject: "", bodyHtml: "", taskTitle: "Fictional task" } })
    expect(await captureCampaignAudience(f.company.id, f.user.id, { campaignId: f.campaign.id, sequenceId: f.sequence.id, version: 1 })).toMatchObject({ success: true })
  })
  it("pauses a legacy capture with invalid content under its own diagnostic, preserving its snapshot", async () => {
    const f = await fixture("<p>Bonjour</p>")
    const captured = await captureCampaignAudience(f.company.id, f.user.id, { campaignId: f.campaign.id, sequenceId: f.sequence.id, version: 1 })
    const bodyHtml = '<p>Visite</p><a href="/invalid">Réserver</a>'
    // Shape and serialization order of the preflight-free a7779b8 snapshot.
    const configuration = { name: f.sequence.name, senderChannelId: f.sequence.senderChannelId, businessDaysOnly: f.sequence.businessDaysOnly,
      sendWindowStart: f.sequence.sendWindowStart, sendWindowEnd: f.sequence.sendWindowEnd, timezone: f.sequence.timezone,
      steps: f.sequence.steps.map(step => ({ id: step.id, position: step.position, delayHours: step.delayHours, type: step.type, subject: step.subject, bodyHtml,
        taskTitle: step.taskTitle, taskNotes: step.taskNotes, taskPriority: step.taskPriority, pauseUntilComplete: step.pauseUntilComplete })) }
    await prisma.emailSequenceStep.update({ where: { id: f.sequence.steps[0].id }, data: { bodyHtml } })
    await prisma.campaignAudience.update({ where: { id: captured.audienceId }, data: { status: "ENROLLING", startedAt: new Date(), configuration, sequenceHash: createHash("sha256").update(JSON.stringify(configuration)).digest("hex") } })
    expect(await processCampaignActivations({ companyId: f.company.id })).toMatchObject({ processed: 0, enrolled: 0 })
    expect(await prisma.campaignAudience.findUnique({ where: { id: captured.audienceId } })).toMatchObject({ status: "PAUSED", errorCode: "CONTENU_INVALIDE", configuration })
    expect(await prisma.emailSequenceEnrollment.count({ where: { sequenceId: f.sequence.id } })).toBe(0)
  })
  it("pauses an existing enrollment before transport and records the content failure without scheduling retries", async () => {
    await prisma.processorLease.deleteMany({ where: { name: "email-sequences" } })
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-10-20T12:00:00Z"))
    const f = await fixture('<p>Bonjour</p><a href="/invalid">Visite</a>')
    await prisma.marketingCampaign.update({ where: { id: f.campaign.id }, data: { status: "ACTIVE" } })
    const client = await prisma.client.create({ data: { companyId: f.company.id, name: "Fictional subscriber" } })
    const contact = await prisma.contact.create({ data: { clientId: client.id, firstName: "Fiction", lastName: "Recipient", email: "recipient@example.test", marketingStatus: "OPTED_IN" } })
    const lead = await prisma.leadCapture.create({ data: { companyId: f.company.id, clientId: client.id, contactId: contact.id, firstName: "Fiction", lastName: "Recipient", email: contact.email, marketingOptIn: true, privacyAccepted: true, fingerprint: randomUUID() } })
    await prisma.marketingConsent.create({ data: { companyId: f.company.id, clientId: client.id, contactId: contact.id, leadCaptureId: lead.id, recipientEmail: contact.email, channel: "EMAIL", purpose: "MARKETING", status: "GRANTED", legalBasis: "CONSENT", source: "FICTIONAL_RECIPE", noticeUrl: "https://example.test/privacy", proofHash: createHash("sha256").update(lead.id).digest("hex") } })
    const enrollment = await prisma.emailSequenceEnrollment.create({ data: { sequenceId: f.sequence.id, leadCaptureId: lead.id, contactId: contact.id, status: "ACTIVE", nextSendAt: new Date(0), nextStepPosition: 0 } })
    const http = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("No provider request permitted"))
    try {
      expect(await processDueSequenceEmails(10, f.company.id)).toMatchObject({ sent: 0, failed: 1, deadLettered: 1 })
      expect(await prisma.emailSequenceEnrollment.findUnique({ where: { id: enrollment.id } })).toMatchObject({ status: "PAUSED", nextSendAt: null, stopReason: expect.stringContaining("Contenu invalide") })
      // The attempt counter records the processing claim, before transport.
      expect(await prisma.emailDelivery.findFirst({ where: { enrollmentId: enrollment.id } })).toMatchObject({ status: "DEAD_LETTER", attempts: 1, nextAttemptAt: null, firstAttemptAt: new Date("2026-10-20T12:00:00Z") })
      expect(await processDueSequenceEmails(10, f.company.id)).toMatchObject({ examined: 0, sent: 0 })
      expect(http).not.toHaveBeenCalled()
    } finally { http.mockRestore() }
  })
})
