import { createHash, randomUUID } from "node:crypto"
import { afterAll, afterEach, describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
import prisma from "@/lib/prisma"
import { captureCampaignAudience, changeCampaignActivation, campaignAudienceReport, campaignAudienceHistory, processCampaignActivations } from "@/lib/marketing/campaign-activation"
import { enrollLeadInSequenceInternal } from "@/lib/automations/sequences"
import { assertManualMarketingConsent } from "@/lib/communications/marketing-consent"
import { prepareSequenceEmail } from "@/lib/automations/email"
import { verifyManualMarketingWithdrawalToken } from "@/lib/leads/consent-token"
import { buildBackupPayload } from "@/lib/backup"

const cuid = () => `c${randomUUID().replaceAll("-", "")}`
const digest = (value: string) => createHash("sha256").update(value).digest("hex")
describe.sequential("verified immutable campaign audiences and atomic resumable activation", () => {
  const companies: string[] = [], users: string[] = []
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })
  afterAll(async () => {
    for (const companyId of companies) {
      await prisma.leadCapture.deleteMany({ where: { companyId } })
      await prisma.contact.deleteMany({ where: { client: { companyId } } })
      await prisma.client.deleteMany({ where: { companyId } })
      await prisma.company.delete({ where: { id: companyId } })
    }
    await prisma.auditLog.deleteMany({ where: { userId: { in: users } } })
    await prisma.user.deleteMany({ where: { id: { in: users } } })
    await prisma.processorLease.deleteMany({ where: { name: { startsWith: "campaign-activation:" } } })
  })
  async function fixture(count = 1, proven = true) {
    const company = await prisma.company.create({ data: { name: "Fictional activation recipe" } }); companies.push(company.id)
    const user = await prisma.user.create({ data: { name: "Fictional activation author" } }); users.push(user.id)
    const member = await prisma.membership.create({ data: { companyId: company.id, userId: user.id, role: "OWNER" } })
    const client = await prisma.client.create({ data: { companyId: company.id, name: "Fictional activation contacts" } })
    const segment = await prisma.marketingSegment.create({ data: { companyId: company.id, name: "Fictional audience", kind: "STATIC", filters: {}, lastBuiltAt: new Date() } })
    const campaign = await prisma.marketingCampaign.create({ data: { companyId: company.id, segmentId: segment.id, name: "Fictional campaign", objective: "Fictional activation", channels: ["EMAIL"], status: "PLANNED", startAt: new Date(Date.now() + 86_400_000) } })
    const channel = await prisma.communicationChannel.create({ data: { companyId: company.id, ownerUserId: user.id, visibility: "PRIVATE", provider: "RESEND", status: "ACTIVE", emailAddress: "sender@example.test" } })
    const sequence = await prisma.emailSequence.create({ data: { companyId: company.id, campaignId: campaign.id, senderChannelId: channel.id, name: "Fictional sequence", status: "ACTIVE", businessDaysOnly: false, timezone: "UTC", steps: { create: { position: 0, delayHours: 0, subject: "Fictional message", bodyHtml: "<p>Fictional recipe</p>" } } }, include: { steps: true } })
    const leads = Array.from({ length: count }, (_, index) => ({ id: cuid(), companyId: company.id, clientId: client.id, contactId: proven ? cuid() : null, firstName: "Fiction", lastName: `Recipient ${String(index).padStart(5, "0")}`, email: `fiction${index}@example.test`, privacyAccepted: true, marketingOptIn: true, fingerprint: `fixture-${index}` }))
    for (let offset = 0; offset < count; offset += 200) {
      const batch = leads.slice(offset, offset + 200)
      if (proven) await prisma.contact.createMany({ data: batch.map(lead => ({ id: lead.contactId!, clientId: client.id, firstName: lead.firstName, lastName: lead.lastName, email: lead.email, marketingStatus: "OPTED_IN" })) })
      await prisma.leadCapture.createMany({ data: batch })
      if (proven) await prisma.marketingConsent.createMany({ data: batch.map(lead => ({ companyId: company.id, clientId: client.id, contactId: lead.contactId!, leadCaptureId: lead.id, recipientEmail: lead.email, channel: "EMAIL", purpose: "MARKETING", status: "GRANTED", legalBasis: "CONSENT", source: "ISOLATED_FICTIONAL_RECIPE", noticeUrl: "https://example.test/privacy", proofHash: digest(`fictional-evidence:${lead.id}`) })) })
      await prisma.marketingSegmentMember.createMany({ data: batch.map(lead => ({ segmentId: segment.id, leadCaptureId: lead.id })) })
    }
    return { company, user, member, client, segment, campaign, channel, sequence, leads }
  }
  async function capture(f: Awaited<ReturnType<typeof fixture>>, version = 1) {
    const result = await captureCampaignAudience(f.company.id, f.user.id, { campaignId: f.campaign.id, sequenceId: f.sequence.id, version })
    return prisma.campaignAudience.findUniqueOrThrow({ where: { id: result.audienceId } })
  }
  async function command(f: Awaited<ReturnType<typeof fixture>>, audienceId: string, operation: "START" | "PAUSE" | "RESUME") {
    const audience = await prisma.campaignAudience.findUniqueOrThrow({ where: { id: audienceId } })
    return changeCampaignActivation(f.company.id, f.user.id, { audienceId, version: audience.version, operation })
  }
  // Real SQL faults exercise rollback after writes, on both supported databases.
  async function sqlFault(table: "CampaignAudience" | "CampaignAudienceMember", condition: string) {
    const name = `fictional_activation_fault_${randomUUID().replaceAll("-", "")}`
    const pg = process.env.DATABASE_URL?.startsWith("postgres")
    if (pg) {
      await prisma.$executeRawUnsafe(`CREATE FUNCTION "${name}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF ${condition} THEN RAISE EXCEPTION 'fictional batch outage'; END IF; RETURN NEW; END; $$`)
      await prisma.$executeRawUnsafe(`CREATE TRIGGER "${name}" BEFORE ${table === "CampaignAudience" ? "UPDATE" : "INSERT"} ON "${table}" FOR EACH ROW EXECUTE FUNCTION "${name}"()`)
    } else await prisma.$executeRawUnsafe(`CREATE TRIGGER "${name}" BEFORE ${table === "CampaignAudience" ? "UPDATE" : "INSERT"} ON "${table}" WHEN ${condition} BEGIN SELECT RAISE(ABORT, 'fictional batch outage'); END`)
    return async () => { await prisma.$executeRawUnsafe(`DROP TRIGGER "${name}"${pg ? ` ON "${table}"` : ""}`); if (pg) await prisma.$executeRawUnsafe(`DROP FUNCTION "${name}"()` ) }
  }

  it("captures exact proof decisions without enrollment, and a direct old action cannot bypass verification", async () => {
    const f = await fixture(5)
    await prisma.marketingConsent.deleteMany({ where: { leadCaptureId: f.leads[0].id } })
    await prisma.emailSuppression.create({ data: { companyId: f.company.id, email: f.leads[1].email, reason: "FICTIONAL_RECIPE" } })
    await prisma.contact.update({ where: { id: f.leads[2].contactId! }, data: { email: "changed@example.test" } })
    await prisma.marketingConsent.updateMany({ where: { leadCaptureId: f.leads[3].id }, data: { recipientEmail: null } })
    const a = await capture(f)
    expect(a).toMatchObject({ total: 5, eligible: 1, excluded: 4, status: "READY", processed: 0 })
    expect(await prisma.emailSequenceEnrollment.count({ where: { sequenceId: f.sequence.id } })).toBe(0)
    const report = await campaignAudienceReport(f.company.id, { campaignId: f.campaign.id })
    expect(report?.rows.filter(row => row.decision === "ELIGIBLE")).toHaveLength(1)
    expect(report?.rows.map(row => row.reason)).toContain("ADRESSE_BLOQUEE")
    await expect(enrollLeadInSequenceInternal({ companyId: f.company.id, sequenceId: f.sequence.id, leadId: f.leads[0].id })).rejects.toThrow("preuve")
    expect(await prisma.emailSequenceEnrollment.count({ where: { sequenceId: f.sequence.id } })).toBe(0)
  })
  it.each([5001, 10001])("captures all %s members in bounded batches and exposes the last one", async count => {
    const f = await fixture(count, false), a = await capture(f)
    expect(a).toMatchObject({ total: count, eligible: 0, excluded: count })
    expect(await prisma.campaignAudienceMember.count({ where: { audienceId: a.id } })).toBe(count)
    const last = await campaignAudienceReport(f.company.id, { campaignId: f.campaign.id, search: f.leads[count - 1].email })
    expect(last?.rows).toHaveLength(1)
    expect(last?.rows[0].recipientEmail).toBe(f.leads[count - 1].email)
    expect(last?.rows[0].reason).toBe("PREUVE_ADRESSE_ABSENTE")
  }, 120_000)
  it("retains the previous complete capture when construction is interrupted after its first 200 rows", async () => {
    const f = await fixture(301), original = await capture(f)
    const drop = await sqlFault("CampaignAudienceMember", `(SELECT COUNT(*) FROM "CampaignAudienceMember" WHERE "audienceId" = NEW."audienceId") >= 200`)
    try { await expect(capture(f, 2)).rejects.toThrow() } finally { await drop() }
    expect(await prisma.campaignAudience.count({ where: { campaignId: f.campaign.id } })).toBe(1)
    expect(await prisma.campaignAudienceMember.count({ where: { audienceId: original.id } })).toBe(301)
    expect((await prisma.marketingCampaign.findUniqueOrThrow({ where: { id: f.campaign.id } })).version).toBe(2)
  }, 60_000)
  it("rolls back enrollment and checkpoint together, resumes the same 501 members, and never resets an existing occurrence", async () => {
    const f = await fixture(501), a = await capture(f)
    await command(f, a.id, "START")
    await expect(changeCampaignActivation(f.company.id, f.user.id, { audienceId: a.id, version: 1, operation: "START" })).rejects.toThrow("changé")
    const drop = await sqlFault("CampaignAudience", `NEW."id" = '${a.id}' AND NEW."processed" > OLD."processed"`)
    try { expect(await processCampaignActivations({ companyId: f.company.id })).toMatchObject({ failed: 1, enrolled: 0, processed: 0 }) } finally { await drop() }
    expect(await prisma.emailSequenceEnrollment.count({ where: { sequenceId: f.sequence.id } })).toBe(0)
    expect(await prisma.campaignAudience.findUniqueOrThrow({ where: { id: a.id } })).toMatchObject({ processed: 0, status: "PAUSED", errorCode: "LOT_INTERROMPU" })
    await command(f, a.id, "RESUME")
    await prisma.emailSequenceEnrollment.create({ data: { sequenceId: f.sequence.id, leadCaptureId: f.leads[0].id, status: "COMPLETED", nextStepPosition: 7, nextSendAt: null } })
    const initial = await processCampaignActivations({ companyId: f.company.id })
    expect(initial.processed).toBe(200)
    await command(f, a.id, "PAUSE")
    expect(await processCampaignActivations({ companyId: f.company.id })).toMatchObject({ processed: 0 })
    const added = await prisma.leadCapture.create({ data: { companyId: f.company.id, firstName: "Late", lastName: "Fiction", email: "late@example.test", marketingOptIn: true, privacyAccepted: true, fingerprint: "late" } })
    await prisma.marketingSegmentMember.create({ data: { segmentId: f.segment.id, leadCaptureId: added.id } })
    await command(f, a.id, "RESUME")
    await Promise.allSettled([processCampaignActivations({ companyId: f.company.id }), processCampaignActivations({ companyId: f.company.id })])
    for (let attempt = 0; attempt < 5 && (await prisma.campaignAudience.findUniqueOrThrow({ where: { id: a.id } })).status === "ENROLLING"; attempt++) await processCampaignActivations({ companyId: f.company.id })
    expect(await prisma.campaignAudience.findUniqueOrThrow({ where: { id: a.id } })).toMatchObject({ processed: 501, enrolled: 500, existing: 1, rejected: 0, status: "COMPLETED" })
    expect(await prisma.emailSequenceEnrollment.count({ where: { sequenceId: f.sequence.id } })).toBe(501)
    expect(await prisma.emailSequenceEnrollment.findUniqueOrThrow({ where: { sequenceId_leadCaptureId: { sequenceId: f.sequence.id, leadCaptureId: f.leads[0].id } } })).toMatchObject({ status: "COMPLETED", nextStepPosition: 7, nextSendAt: null })
    expect(await prisma.emailSequenceEnrollment.count({ where: { sequenceId: f.sequence.id, leadCaptureId: added.id } })).toBe(0)
    const actual = await prisma.emailSequenceEnrollment.findFirstOrThrow({ where: { sequenceId: f.sequence.id, status: "ACTIVE" } })
    expect(actual.nextSendAt!.getTime()).toBeGreaterThanOrEqual(f.campaign.startAt!.getTime())
    expect(actual.marketingAuthorization).toBeTruthy()
  }, 120_000)
  it("invalidates a stale generation before activation and rechecks withdrawal, changed address, deletion, sender and rights during enrollment", async () => {
    const f = await fixture(4), a = await capture(f)
    await prisma.marketingSegment.update({ where: { id: f.segment.id }, data: { lastBuiltAt: new Date(), updatedAt: new Date(a.segmentUpdatedAt.getTime() + 1000) } })
    await expect(command(f, a.id, "START")).rejects.toThrow("audience a changé")
    const fresh = await capture(f, 2)
    await command(f, fresh.id, "START")
    await prisma.marketingConsent.updateMany({ where: { leadCaptureId: f.leads[0].id }, data: { withdrawnAt: new Date() } })
    await prisma.leadCapture.update({ where: { id: f.leads[1].id }, data: { email: "changed@example.test" } })
    await prisma.leadCapture.delete({ where: { id: f.leads[2].id } })
    await prisma.communicationChannel.update({ where: { id: f.channel.id }, data: { status: "PENDING" } })
    expect(await processCampaignActivations({ companyId: f.company.id })).toMatchObject({ processed: 0 })
    expect(await prisma.campaignAudience.findUniqueOrThrow({ where: { id: fresh.id } })).toMatchObject({ status: "PAUSED", errorCode: "EXPEDITEUR_INDISPONIBLE" })
    await prisma.communicationChannel.update({ where: { id: f.channel.id }, data: { status: "ACTIVE" } })
    await command(f, fresh.id, "RESUME")
    await prisma.membership.update({ where: { id: f.member.id }, data: { role: "VIEWER" } })
    await processCampaignActivations({ companyId: f.company.id })
    expect(await prisma.campaignAudience.findUniqueOrThrow({ where: { id: fresh.id } })).toMatchObject({ status: "PAUSED", errorCode: "DROITS_RETIRES" })
    await prisma.membership.update({ where: { id: f.member.id }, data: { role: "OWNER" } })
    await command(f, fresh.id, "RESUME")
    expect(await processCampaignActivations({ companyId: f.company.id })).toMatchObject({ processed: 4, enrolled: 1 })
    expect(await prisma.campaignAudience.findUniqueOrThrow({ where: { id: fresh.id } })).toMatchObject({ enrolled: 1, rejected: 3, status: "COMPLETED" })
  })
  it("closes the remaining batch after 200 inscriptions, preserves progress and restarts only with a new capture", async () => {
    const f = await fixture(201), a = await capture(f)
    await command(f, a.id, "START")
    await processCampaignActivations({ companyId: f.company.id })
    const partial = await prisma.campaignAudience.findUniqueOrThrow({ where: { id: a.id } })
    expect(partial).toMatchObject({ status: "ENROLLING", processed: 200, enrolled: 200 })
    // A broken source must not trap an activation forever.
    await prisma.emailSequence.update({ where: { id: f.sequence.id }, data: { name: "Changed fictional configuration" } })
    const close = { audienceId: a.id, version: partial.version, operation: "CLOSE", reason: "Fictional remaining batch abandoned", confirmed: true }
    await expect(changeCampaignActivation(f.company.id, f.user.id, { ...close, version: partial.version - 1 })).rejects.toThrow("changé")
    await expect(changeCampaignActivation(f.company.id, f.user.id, { ...close, confirmed: false })).rejects.toThrow()
    await expect(changeCampaignActivation(f.company.id, f.user.id, { ...close, reason: " " })).rejects.toThrow()
    await changeCampaignActivation(f.company.id, f.user.id, close)
    expect(await processCampaignActivations({ companyId: f.company.id })).toMatchObject({ processed: 0, enrolled: 0 })
    expect(await prisma.campaignAudience.findUniqueOrThrow({ where: { id: a.id } })).toMatchObject({ status: "CLOSED", processed: 200, enrolled: 200, afterMemberId: partial.afterMemberId, closedByUserId: f.user.id, closureReason: close.reason })
    await expect(command(f, a.id, "RESUME")).rejects.toThrow("opération")
    const campaign = await prisma.marketingCampaign.findUniqueOrThrow({ where: { id: f.campaign.id } })
    const next = await capture(f, campaign.version)
    expect(next).toMatchObject({ total: 201, eligible: 1, excluded: 200 })
    await command(f, next.id, "START")
    await processCampaignActivations({ companyId: f.company.id })
    await processCampaignActivations({ companyId: f.company.id })
    expect(await prisma.emailSequenceEnrollment.count({ where: { sequenceId: f.sequence.id } })).toBe(201)
    expect((await campaignAudienceReport(f.company.id, { campaignId: f.campaign.id, audienceId: a.id }))?.audience).toMatchObject({ status: "CLOSED", processed: 200 })
  }, 60_000)
  it("paginates all 26 captures and isolates history and closure by society, rights and public demo", async () => {
    const f = await fixture(), other = await fixture()
    for (let version = 1; version <= 26; version++) await capture(f, version)
    const history = await campaignAudienceHistory(f.company.id, { campaignId: f.campaign.id, page: 2 })
    expect(history).toMatchObject({ total: 26, page: 2, pageCount: 2, activeAudienceId: null })
    expect(history.rows).toHaveLength(1)
    await expect(campaignAudienceHistory(other.company.id, { campaignId: f.campaign.id })).rejects.toThrow("introuvable")
    const a = await prisma.campaignAudience.findUniqueOrThrow({ where: { id: history.rows[0].id } })
    const close = { audienceId: a.id, version: a.version, operation: "CLOSE", reason: "Fictional unused capture", confirmed: true }
    await expect(changeCampaignActivation(other.company.id, other.user.id, close)).rejects.toThrow("changé")
    await prisma.membership.update({ where: { id: f.member.id }, data: { role: "VIEWER" } })
    await expect(changeCampaignActivation(f.company.id, f.user.id, close)).rejects.toThrow("Droits")
    await prisma.membership.update({ where: { id: f.member.id }, data: { role: "OWNER" } })
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    await expect(changeCampaignActivation(f.company.id, f.user.id, close)).rejects.toThrow("lecture seule")
    expect((await prisma.campaignAudience.findUniqueOrThrow({ where: { id: a.id } })).status).toBe("READY")
    vi.unstubAllEnvs()
    await prisma.emailSequence.delete({ where: { id: f.sequence.id } })
    await changeCampaignActivation(f.company.id, f.user.id, close)
    expect((await campaignAudienceReport(f.company.id, { campaignId: f.campaign.id, audienceId: a.id }))?.audience.status).toBe("CLOSED")
  })
  it("isolates societies, refuses read-only mutations, preserves captured evidence in backup and binds the withdrawal link to its exact address proof", async () => {
    const f = await fixture(), other = await fixture(), a = await capture(f)
    await expect(campaignAudienceReport(other.company.id, { campaignId: f.campaign.id })).rejects.toThrow("introuvable")
    await expect(changeCampaignActivation(other.company.id, other.user.id, { audienceId: a.id, version: 1, operation: "START" })).rejects.toThrow("changé")
    vi.stubEnv("PUBLIC_APP_URL", "https://example.test")
    vi.stubEnv("CONSENT_TOKEN_SECRET", "isolated-fictional-consent-token-secret-123456789")
    const lead = await prisma.leadCapture.findUniqueOrThrow({ where: { id: f.leads[0].id } })
    const email = await prepareSequenceEmail({ company: { ...f.company, email: null }, lead, subjectTemplate: "Fictional subject", bodyTemplate: "<p>Fictional recipe</p>" })
    const token = email.html.match(/\/consent\/withdraw\/([^"<]+)"/)![1]
    expect(await verifyManualMarketingWithdrawalToken(token)).toMatchObject({ companyId: f.company.id, consentId: email.marketing.consentId, addressHash: digest(lead.email!) })
    const backup = await buildBackupPayload(f.user.id, f.company.id)
    expect(JSON.stringify(backup)).toContain(a.id)
    expect(JSON.stringify(backup)).toContain("CampaignAudienceMember")
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    await expect(command(f, a.id, "START")).rejects.toThrow("lecture seule")
    await expect(capture(f, 2)).rejects.toThrow("lecture seule")
    await expect(processCampaignActivations({ companyId: f.company.id })).rejects.toThrow("lecture seule")
    expect((await prisma.campaignAudience.findUniqueOrThrow({ where: { id: a.id } })).status).toBe("READY")
    vi.unstubAllEnvs()
    const proof = await assertManualMarketingConsent(f.company.id, lead.contactId!, lead.email!)
    await prisma.marketingConsent.update({ where: { id: proof.consentId }, data: { withdrawnAt: new Date() } })
    await expect(assertManualMarketingConsent(f.company.id, lead.contactId!, lead.email!, proof)).rejects.toThrow("preuve")
  })
})
