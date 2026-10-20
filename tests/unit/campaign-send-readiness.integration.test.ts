import { afterAll, afterEach, describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
import prisma from "@/lib/prisma"
import { encrypt } from "@/lib/crypto"
import { requestContext } from "@/lib/context"
import { readCampaignContentPreflight } from "@/lib/marketing/campaign-preflight"
import { captureCampaignAudience, changeCampaignActivation, processCampaignActivations } from "@/lib/marketing/campaign-activation"
import { reserveEmailSendQuota } from "@/lib/communications/send-quotas"
import { fictionalMarketingProof } from "../helpers/fictional-marketing-proof"

describe.sequential("campaign sender and quota preflight on SQL", () => {
  const companies: string[] = [], users: string[] = []
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers() })
  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { userId: { in: users } } })
    await prisma.emailSendQuotaCharge.deleteMany({ where: { companyId: { in: companies } } })
    await prisma.emailSendQuotaState.deleteMany({ where: { companyId: { in: companies } } })
    await prisma.emailSendQuotaPolicy.deleteMany({ where: { companyId: { in: companies } } })
    await prisma.leadCapture.deleteMany({ where: { companyId: { in: companies } } })
    await prisma.contact.deleteMany({ where: { client: { companyId: { in: companies } } } })
    await prisma.client.deleteMany({ where: { companyId: { in: companies } } })
    await prisma.company.deleteMany({ where: { id: { in: companies } } })
    await prisma.user.deleteMany({ where: { id: { in: users } } })
    await prisma.processorLease.deleteMany({ where: { name: { startsWith: "campaign-activation:" } } })
  })
  async function fixture() {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("No provider request allowed during campaign preflight") }))
    const company = await prisma.company.create({ data: { name: "Fictional dispatch preflight" } }); companies.push(company.id)
    const user = await prisma.user.create({ data: { name: "Fictional dispatch owner" } }); users.push(user.id)
    const member = await prisma.membership.create({ data: { companyId: company.id, userId: user.id, role: "OWNER", status: "ACTIVE" } })
    const segment = await prisma.marketingSegment.create({ data: { companyId: company.id, name: "Fictional audience", kind: "STATIC", filters: {} } })
    const campaign = await prisma.marketingCampaign.create({ data: { companyId: company.id, segmentId: segment.id, name: "Fictional dispatch campaign", objective: "Recipe", channels: ["EMAIL"], status: "PLANNED" } })
    const channel = await prisma.communicationChannel.create({ data: { companyId: company.id, ownerUserId: user.id, provider: "RESEND", status: "ACTIVE", visibility: "SHARED", emailAddress: "sender@example.test",
      credentialsEncrypted: encrypt(JSON.stringify({ mode: "BYOK", apiKey: "re_fictional_only", webhookSecret: "whsec_fictional_only" })) } })
    const sequence = await prisma.emailSequence.create({ data: { companyId: company.id, campaignId: campaign.id, senderChannelId: channel.id, name: "Fictional dispatch sequence", status: "ACTIVE", businessDaysOnly: false, timezone: "UTC",
      steps: { create: { position: 0, type: "EMAIL", subject: "Fictional message", bodyHtml: "<p>Fictional message only</p>" } } } })
    const input = { campaignId: campaign.id, sequenceId: sequence.id }
    const policy = (data: Partial<{ enabled: boolean; dailyRecipientLimit: number; minuteRecipientLimit: number }> = {}) => prisma.emailSendQuotaPolicy.create({ data: { companyId: company.id, channelKey: channel.id, channelId: channel.id, enabled: true, dailyRecipientLimit: 20, minuteRecipientLimit: 2, ...data } })
    const read = () => readCampaignContentPreflight(company.id, user.id, input)
    const capture = () => captureCampaignAudience(company.id, user.id, { ...input, version: 1 })
    return { company, user, member, channel, campaign, sequence, segment, input, policy, read, capture }
  }
  it("reports an unconfigured quota even when the retained content is valid", async () => {
    const f = await fixture()
    expect(await readCampaignContentPreflight(f.company.id, f.user.id, f.input)).toMatchObject({ ok: true,
      dispatch: { ready: false, state: "QUOTA_NOT_CONFIGURED" } })
    expect(fetch).not.toHaveBeenCalled()
    expect(await prisma.emailSendQuotaState.count({ where: { companyId: f.company.id } })).toBe(0)
  })
  it("refuses capture without an explicit quota before creating an audience or audit", async () => {
    const f = await fixture()
    await expect(captureCampaignAudience(f.company.id, f.user.id, { ...f.input, version: 1 })).rejects.toThrow(/plafonds/i)
    expect(await prisma.campaignAudience.count({ where: { companyId: f.company.id } })).toBe(0)
    expect(await prisma.auditLog.count({ where: { resourceId: f.campaign.id } })).toBe(0)
    expect((await prisma.marketingCampaign.findUniqueOrThrow({ where: { id: f.campaign.id } })).version).toBe(1)
  })
  it("refuses capture when an administrator has disabled the quota policy", async () => {
    const f = await fixture()
    await prisma.emailSendQuotaPolicy.create({ data: { companyId: f.company.id, channelKey: f.channel.id, channelId: f.channel.id, enabled: false, dailyRecipientLimit: 20, minuteRecipientLimit: 2 } })
    await expect(captureCampaignAudience(f.company.id, f.user.id, { ...f.input, version: 1 })).rejects.toThrow(/plafonds/i)
    expect(await prisma.campaignAudience.count({ where: { companyId: f.company.id } })).toBe(0)
    expect(fetch).not.toHaveBeenCalled()
  })
  it("reports configured usage without reserving recipients or exposing sender credentials", async () => {
    const f = await fixture(); await f.policy()
    const report = await f.read()
    expect(report.dispatch).toMatchObject({ required: true, ready: true, availableNow: true, state: "READY", quota: { version: 1, enabled: true, dailyRecipientLimit: 20, minuteRecipientLimit: 2 } })
    expect(report.dispatch.quota?.windows.map(window => window.used)).toEqual([0, 0])
    for (const secret of [f.channel.emailAddress, f.channel.credentialsEncrypted!, "re_fictional_only", "channelKey", "bindingHash", "ownerUserId"]) expect(JSON.stringify(report)).not.toContain(secret)
    expect(await prisma.emailSendQuotaCharge.count({ where: { companyId: f.company.id } })).toBe(0)
    expect(await prisma.emailSendQuotaState.count({ where: { companyId: f.company.id } })).toBe(0)
    expect(fetch).not.toHaveBeenCalled()
  })
  it("allows queuing at a full quota and never spends capacity during the report or capture", async () => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2035-01-02T12:00:10Z"))
    const f = await fixture(); await f.policy({ dailyRecipientLimit: 1, minuteRecipientLimit: 1 })
    const delivery = await prisma.emailDelivery.create({ data: { companyId: f.company.id, channelId: f.channel.id, status: "SENDING", subject: "Fiction", recipientEmail: "recipient@example.test", scheduledAt: new Date() } })
    await reserveEmailSendQuota({ companyId: f.company.id, channelKey: f.channel.id, deliveryId: delivery.id, from: f.channel.emailAddress, to: delivery.recipientEmail, subject: "Fiction", html: "<p>Fiction</p>" })
    expect((await f.read()).dispatch).toMatchObject({ ready: true, availableNow: false, state: "QUOTA_WAIT" })
    await expect(f.capture()).resolves.toMatchObject({ success: true })
    expect(await prisma.emailSendQuotaCharge.count({ where: { companyId: f.company.id } })).toBe(2)
    expect((await prisma.emailSendQuotaState.findMany({ where: { companyId: f.company.id } })).map(state => state.used)).toEqual([1, 1])
    expect(fetch).not.toHaveBeenCalled()
  })
  it("rechecks a policy disabled after a successful preview before any capture write", async () => {
    const f = await fixture(), policy = await f.policy()
    expect((await f.read()).dispatch.ready).toBe(true)
    await prisma.emailSendQuotaPolicy.update({ where: { id: policy.id }, data: { enabled: false, version: { increment: 1 } } })
    await expect(f.capture()).rejects.toThrow(/plafonds/i)
    expect(await prisma.campaignAudience.count({ where: { companyId: f.company.id } })).toBe(0)
    expect(await prisma.auditLog.count({ where: { resourceId: f.campaign.id } })).toBe(0)
  })
  it("checks policy at start and permits a corrected operational policy without rebuilding the frozen audience", async () => {
    const f = await fixture(), policy = await f.policy(), captured = await f.capture()
    const before = await prisma.campaignAudience.findUniqueOrThrow({ where: { id: captured.audienceId } })
    await prisma.emailSendQuotaPolicy.update({ where: { id: policy.id }, data: { enabled: false, version: { increment: 1 } } })
    await expect(changeCampaignActivation(f.company.id, f.user.id, { audienceId: captured.audienceId, version: before.version, operation: "START" })).rejects.toThrow(/plafonds/i)
    expect(await prisma.campaignAudience.findUniqueOrThrow({ where: { id: captured.audienceId } })).toEqual(before)
    await prisma.emailSendQuotaPolicy.update({ where: { id: policy.id }, data: { enabled: true, minuteRecipientLimit: 3, version: { increment: 1 } } })
    await expect(changeCampaignActivation(f.company.id, f.user.id, { audienceId: captured.audienceId, version: before.version, operation: "START" })).resolves.toMatchObject({ success: true })
    expect((await prisma.campaignAudience.findUniqueOrThrow({ where: { id: captured.audienceId } })).configuration).toEqual(before.configuration)
  })
  it("pauses a partially processed activation for its own quota reason and resumes without repeating members", async () => {
    const f = await fixture(), policy = await f.policy()
    const leads = Array.from({ length: 201 }, (_, index) => ({ companyId: f.company.id, firstName: "Fiction", lastName: `Quota ${index}`, email: `dispatch-${index}@example.test`, privacyAccepted: true, marketingOptIn: false, fingerprint: `fiction-${index}` }))
    await prisma.leadCapture.createMany({ data: leads })
    const rows = await prisma.leadCapture.findMany({ where: { companyId: f.company.id }, orderBy: { id: "asc" }, select: { id: true, email: true } })
    await prisma.leadCapture.update({ where: { id: rows[0].id }, data: { marketingOptIn: true } })
    await fictionalMarketingProof(f.company.id, rows[0].id, rows[0].email!)
    await prisma.marketingSegmentMember.createMany({ data: rows.map(lead => ({ segmentId: f.segment.id, leadCaptureId: lead.id })) })
    const captured = await f.capture()
    await changeCampaignActivation(f.company.id, f.user.id, { audienceId: captured.audienceId, version: 1, operation: "START" })
    expect(await processCampaignActivations({ companyId: f.company.id })).toMatchObject({ processed: 200, enrolled: 1, failed: 0 })
    const partial = await prisma.campaignAudience.findUniqueOrThrow({ where: { id: captured.audienceId } })
    await prisma.emailSendQuotaPolicy.update({ where: { id: policy.id }, data: { enabled: false } })
    expect(await processCampaignActivations({ companyId: f.company.id })).toMatchObject({ processed: 0, enrolled: 0, failed: 0 })
    const paused = await prisma.campaignAudience.findUniqueOrThrow({ where: { id: captured.audienceId } })
    expect(paused).toMatchObject({ status: "PAUSED", errorCode: "PLAFONDS_INDISPONIBLES", processed: 200, afterMemberId: partial.afterMemberId, configuration: partial.configuration })
    expect(await prisma.emailSequenceEnrollment.count({ where: { sequenceId: f.sequence.id } })).toBe(1)
    await prisma.emailSendQuotaPolicy.update({ where: { id: policy.id }, data: { enabled: true } })
    await changeCampaignActivation(f.company.id, f.user.id, { audienceId: captured.audienceId, version: paused.version, operation: "RESUME" })
    expect(await processCampaignActivations({ companyId: f.company.id })).toMatchObject({ processed: 1, enrolled: 0 })
    expect(await prisma.emailSequenceEnrollment.count({ where: { sequenceId: f.sequence.id } })).toBe(1)
    expect(await prisma.campaignAudience.findUniqueOrThrow({ where: { id: captured.audienceId } })).toMatchObject({ status: "COMPLETED", processed: 201 })
    expect(fetch).not.toHaveBeenCalled()
  })
  it("uses the current role when a cached owner is downgraded and never exposes an unowned private quota", async () => {
    const f = await fixture(); await f.policy()
    await prisma.communicationChannel.update({ where: { id: f.channel.id }, data: { visibility: "PRIVATE", ownerUserId: null } })
    await prisma.membership.update({ where: { id: f.member.id }, data: { role: "SALES" } })
    await requestContext.run({ companyId: f.company.id, userId: f.user.id, membershipId: f.member.id, role: "OWNER", agencyIds: null, actionPermission: "automation.write" }, async () => {
      expect((await f.read()).dispatch).toMatchObject({ ready: false, state: "SENDER_UNAVAILABLE", quota: null })
      await expect(f.capture()).rejects.toThrow("inaccessible")
    })
    expect(await prisma.campaignAudience.count({ where: { companyId: f.company.id } })).toBe(0)
  })
  it("keeps private access for the owning member and administrator", async () => {
    const f = await fixture(); await f.policy()
    await prisma.communicationChannel.update({ where: { id: f.channel.id }, data: { visibility: "PRIVATE" } })
    await prisma.membership.update({ where: { id: f.member.id }, data: { role: "SALES" } })
    expect((await f.read()).dispatch.ready).toBe(true)
    await prisma.membership.update({ where: { id: f.member.id }, data: { role: "ADMIN" } })
    await prisma.communicationChannel.update({ where: { id: f.channel.id }, data: { ownerUserId: null } })
    expect((await f.read()).dispatch.ready).toBe(true)
  })
  it("does not resolve a sender from a different company or invent a platform mailbox for campaign capture", async () => {
    const f = await fixture(), other = await fixture(); await f.policy(); await other.policy()
    for (const senderChannelId of [other.channel.id, null, "platform"]) {
      await prisma.emailSequence.update({ where: { id: f.sequence.id }, data: { senderChannelId } })
      expect((await f.read()).dispatch).toMatchObject({ ready: false, quota: null })
      await expect(f.capture()).rejects.toThrow()
    }
    expect(fetch).not.toHaveBeenCalled()
  })
  it.each([{ status: "DISCONNECTED" }, { mailEnabled: false }])("blocks the unavailable sender %j without exposing quota counters", async changes => {
    const f = await fixture(); await f.policy()
    await prisma.communicationChannel.update({ where: { id: f.channel.id }, data: changes })
    expect((await f.read()).dispatch).toMatchObject({ ready: false, quota: null })
    await expect(f.capture()).rejects.toThrow()
    expect(fetch).not.toHaveBeenCalled()
  })
  it("blocks unreadable provider credentials without returning the stored ciphertext or using a fallback key", async () => {
    const f = await fixture(); await f.policy()
    vi.stubEnv("RESEND_API_KEY", "re_platform_fixture")
    await prisma.communicationChannel.update({ where: { id: f.channel.id }, data: { credentialsEncrypted: "unreadable-private-fixture" } })
    const report = await f.read()
    expect(report.dispatch).toMatchObject({ ready: false, state: "LOCAL_CREDENTIALS_INVALID", quota: null })
    expect(JSON.stringify(report)).not.toContain("unreadable-private-fixture")
    await expect(f.capture()).rejects.toThrow("Identifiants Resend")
    expect(fetch).not.toHaveBeenCalled()
  })
  it.each([
    ["GOOGLE", "https://www.googleapis.com/auth/gmail.send", false],
    ["GOOGLE", "https://www.googleapis.com/auth/gmail.modify", true],
    ["MICROSOFT", "Mail.Send", false],
    ["MICROSOFT", "Mail.Send Mail.ReadWrite", true],
  ])("matches the send and draft scopes of %s: %s", async (provider, scope, ready) => {
    const f = await fixture(); await f.policy()
    await prisma.communicationChannel.update({ where: { id: f.channel.id }, data: { provider: String(provider), credentialsEncrypted: encrypt(JSON.stringify({ mode: "OAUTH", accessToken: "fictional_access_token", refreshToken: "fictional_refresh_token", scope, expiresAt: "2000-01-01T00:00:00Z" })) } })
    expect((await f.read()).dispatch.ready).toBe(ready)
    expect(fetch).not.toHaveBeenCalled()
  })
  it("keeps an all-task sequence independent of sender and quotas", async () => {
    const f = await fixture()
    await prisma.emailSequenceStep.updateMany({ where: { sequenceId: f.sequence.id }, data: { type: "TASK", subject: "", bodyHtml: "", taskTitle: "Fictional task" } })
    await prisma.emailSequence.update({ where: { id: f.sequence.id }, data: { senderChannelId: null } })
    expect((await f.read()).dispatch).toMatchObject({ required: false, ready: true, state: "NOT_REQUIRED", quota: null })
    await expect(f.capture()).resolves.toMatchObject({ success: true })
    expect(fetch).not.toHaveBeenCalled()
  })
  it("detects an incoherent policy and invalid stored limits without reserving anything", async () => {
    const f = await fixture(), policy = await f.policy({ minuteRecipientLimit: 0 })
    expect((await f.read()).dispatch.state).toBe("QUOTA_INVALID")
    const other = await prisma.communicationChannel.create({ data: { companyId: f.company.id, provider: "RESEND", emailAddress: "other@example.test" } })
    await prisma.emailSendQuotaPolicy.update({ where: { id: policy.id }, data: { minuteRecipientLimit: 2, channelId: other.id } })
    expect((await f.read()).dispatch.state).toBe("QUOTA_INVALID")
    await expect(f.capture()).rejects.toThrow(/plafonds/i)
    expect(await prisma.emailSendQuotaCharge.count({ where: { companyId: f.company.id } })).toBe(0)
  })
  it("permits the report but never the capture in the public read-only demo", async () => {
    const f = await fixture(); await f.policy()
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    expect((await f.read()).dispatch.ready).toBe(true)
    await expect(f.capture()).rejects.toThrow("lecture seule")
    expect(await prisma.campaignAudience.count({ where: { companyId: f.company.id } })).toBe(0)
    expect(await prisma.emailSendQuotaState.count({ where: { companyId: f.company.id } })).toBe(0)
    expect(fetch).not.toHaveBeenCalled()
  })
})
