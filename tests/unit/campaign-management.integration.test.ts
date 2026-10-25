import { afterAll, afterEach, describe, expect, it, vi } from "vitest"
import { randomUUID } from "node:crypto"
vi.mock("server-only", () => ({}))
const actor = vi.hoisted(() => ({ companyId: "", userId: "" }))
vi.mock("@/lib/auth-wrapper", () => ({ withAuth: (task: (context: typeof actor) => unknown) => task(actor) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/audit", () => ({ logAction: vi.fn() }))
import prisma from "@/lib/prisma"
import { editCampaign, editCampaignAsset, lockCampaignAudience } from "@/lib/marketing/campaign-management"
import { campaignAssets, campaignChoices, campaignDashboard, campaignSequences } from "@/lib/marketing/campaign-directory"
import { attachSequenceToCampaign, updateMarketingCampaign, updateMarketingCampaignAsset, updateMarketingCampaignStatus } from "@/actions/campaigns"

describe.sequential("campaign editing, locks and complete directories on real SQL", () => {
  const companies: string[] = [], users: string[] = []
  afterEach(() => vi.unstubAllEnvs())
  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { userId: { in: users } } })
    for (const id of companies) await prisma.company.delete({ where: { id } })
    await prisma.user.deleteMany({ where: { id: { in: users } } })
  })
  async function fixture() {
    const company = await prisma.company.create({ data: { name: "Fictional campaign recipe" } }); companies.push(company.id)
    const user = await prisma.user.create({ data: { name: "Fictional campaign author" } }); users.push(user.id)
    const member = await prisma.membership.create({ data: { companyId: company.id, userId: user.id, role: "OWNER" } })
    const segment = await prisma.marketingSegment.create({ data: { companyId: company.id, name: "Fictional audience", filters: {} } })
    const campaign = await prisma.marketingCampaign.create({ data: { companyId: company.id, name: "Fictional campaign", objective: "Fictional objective", channels: ["EMAIL"], segmentId: segment.id, status: "PLANNED" } })
    const asset = await prisma.marketingCampaignAsset.create({ data: { campaignId: campaign.id, name: "Fictional asset", type: "EMAIL" } })
    actor.companyId = company.id; actor.userId = user.id
    const input = { id: campaign.id, version: campaign.version, name: campaign.name, objective: campaign.objective, channels: ["EMAIL"], segmentId: segment.id, ownerMembershipId: member.id, startAt: "", endAt: "", budgetCents: 12500, utmCampaign: "fixture", notes: "Fictional notes" }
    return { company, user, member, segment, campaign, asset, input }
  }
  it("edits every field transactionally, refuses stale submissions and retains the winning version", async () => {
    const f = await fixture()
    expect(await updateMarketingCampaign({ ...f.input, name: "Edited fictional campaign" })).toMatchObject({ success: true })
    expect(await updateMarketingCampaign({ ...f.input, name: "Stale loser" })).toMatchObject({ success: false, error: expect.stringContaining("changé") })
    expect(await prisma.marketingCampaign.findUniqueOrThrow({ where: { id: f.campaign.id } })).toMatchObject({ version: 2, name: "Edited fictional campaign", budgetCents: 12500, ownerMembershipId: f.member.id, notes: "Fictional notes" })
    const input = { id: f.asset.id, version: 1, name: "Edited fictional asset", type: "DOCUMENT", ownerMembershipId: f.member.id, dueAt: "2026-11-01", url: "https://example.test/fixture" }
    expect(await updateMarketingCampaignAsset(input)).toMatchObject({ success: true })
    expect(await updateMarketingCampaignAsset(input)).toMatchObject({ success: false, error: expect.stringContaining("changé") })
    expect(await prisma.marketingCampaignAsset.findUniqueOrThrow({ where: { id: f.asset.id } })).toMatchObject({ version: 2, name: input.name, type: input.type, url: input.url })
    expect(await prisma.auditLog.count({ where: { userId: f.user.id } })).toBe(2)
    await editCampaign(f.company.id, f.user.id, { ...f.input, version: 2, startAt: null, endAt: null })
    expect(await prisma.marketingCampaign.findUniqueOrThrow({ where: { id: f.campaign.id } })).toMatchObject({ startAt: null, endAt: null })
  })
  it("rejects foreign references, invalid URLs/dates, removed rights and read-only demo before writes", async () => {
    const f = await fixture(), other = await fixture(); actor.companyId = f.company.id; actor.userId = f.user.id
    expect(await updateMarketingCampaign({ ...f.input, segmentId: other.segment.id })).toMatchObject({ success: false })
    expect(await updateMarketingCampaign({ ...f.input, ownerMembershipId: other.member.id })).toMatchObject({ success: false })
    expect(await updateMarketingCampaign({ ...f.input, startAt: "2026-11-02", endAt: "2026-11-01" })).toMatchObject({ success: false })
    expect(await updateMarketingCampaignAsset({ id: f.asset.id, version: 1, name: "Invalid URL", type: "EMAIL", url: "javascript:alert(1)" })).toMatchObject({ success: false })
    await expect(editCampaignAsset(other.company.id, other.user.id, { id: f.asset.id, version: 1, name: "Foreign asset", type: "EMAIL" })).rejects.toThrow("introuvable")
    await prisma.membership.update({ where: { id: f.member.id }, data: { status: "INVITED" } })
    await expect(editCampaign(f.company.id, f.user.id, f.input)).rejects.toThrow("inaccessible")
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    expect(await updateMarketingCampaign(f.input)).toMatchObject({ success: false, error: expect.stringContaining("lecture seule") })
    await expect(editCampaignAsset(f.company.id, f.user.id, { id: f.asset.id, version: 1, name: "Read only", type: "EMAIL" })).rejects.toThrow("lecture seule")
    expect((await prisma.marketingCampaign.findUniqueOrThrow({ where: { id: f.campaign.id } })).version).toBe(1)
  })
  it("pins an audience before enrollment and refuses edits/attachments that would move it", async () => {
    const f = await fixture()
    await prisma.$transaction(tx => lockCampaignAudience(tx, f.company.id, f.campaign.id, 1))
    const segment = await prisma.marketingSegment.create({ data: { companyId: f.company.id, name: "Another audience", filters: {} } })
    await expect(editCampaign(f.company.id, f.user.id, { ...f.input, version: 2, segmentId: segment.id })).rejects.toThrow("verrouillée")
    await editCampaign(f.company.id, f.user.id, { ...f.input, version: 2, objective: "Editable objective" })
    const sequence = await prisma.emailSequence.create({ data: { companyId: f.company.id, name: "New unattached sequence" } })
    await expect(attachSequenceToCampaign(f.campaign.id, sequence.id)).rejects.toThrow("verrouillé")
    expect((await prisma.emailSequence.findUniqueOrThrow({ where: { id: sequence.id } })).campaignId).toBeNull()
    const current = await prisma.marketingCampaign.findUniqueOrThrow({ where: { id: f.campaign.id } })
    expect(current).toMatchObject({ version: 3, segmentId: f.segment.id, audienceLockedAt: expect.any(Date) })
    await updateMarketingCampaignStatus(f.campaign.id, "COMPLETED")
    expect(await updateMarketingCampaignStatus(f.campaign.id, "ACTIVE")).toMatchObject({ success: false })
  })
  it("finds campaigns/assets/choices beyond historical limits and computes full aggregates without duplicating UTM leads", async () => {
    const f = await fixture()
    await prisma.marketingCampaign.createMany({ data: Array.from({ length: 201 }, (_, index) => ({ companyId: f.company.id, name: `Volume ${String(index).padStart(3, "0")}`, objective: "Full aggregate", status: "ACTIVE", channels: ["EMAIL"], budgetCents: 100, utmCampaign: "common" })) })
    await prisma.leadCapture.create({ data: { companyId: f.company.id, firstName: "Fiction", lastName: "UTM", fingerprint: "campaign-volume", utmCampaign: "common", privacyAccepted: true } })
    const last = await campaignDashboard(f.company.id, { page: 9 })
    expect(last).toMatchObject({ total: 202, page: 9, pageCount: 9, summary: { active: 201, plannedBudget: 20100, attributedLeads: 1 } })
    expect(last.campaigns).toHaveLength(2)
    expect((await campaignDashboard(f.company.id, { search: "Volume 200" })).campaigns).toHaveLength(1)
    await prisma.marketingCampaignAsset.createMany({ data: Array.from({ length: 101 }, (_, index) => ({ campaignId: f.campaign.id, name: `Asset ${String(index).padStart(3, "0")}`, type: "EMAIL", status: "READY" })) })
    expect(await campaignAssets(f.company.id, { campaignId: f.campaign.id, page: 5 })).toMatchObject({ total: 102, page: 5, items: expect.any(Array) })
    expect((await campaignAssets(f.company.id, { campaignId: f.campaign.id, search: "Asset 100" })).items).toHaveLength(1)
    expect((await campaignDashboard(f.company.id, { search: f.campaign.name })).campaigns[0]).toMatchObject({ assetCount: 102, readyAssetCount: 101 })
    await prisma.marketingSegment.createMany({ data: Array.from({ length: 201 }, (_, index) => ({ companyId: f.company.id, name: `Segment ${String(index).padStart(3, "0")}`, filters: {} })) })
    await prisma.emailSequence.createMany({ data: Array.from({ length: 501 }, (_, index) => ({ companyId: f.company.id, name: `Sequence ${String(index).padStart(3, "0")}`, status: "ACTIVE" })) })
    expect(await campaignChoices(f.company.id, { kind: "SEGMENT", page: 9, selectedId: f.segment.id })).toMatchObject({ total: 202, page: 9, selected: { id: f.segment.id } })
    expect(await campaignChoices(f.company.id, { kind: "SEQUENCE", search: "Sequence 500" })).toMatchObject({ total: 1, items: [expect.objectContaining({ label: "Sequence 500 · ACTIVE" })] })
    const directoryUsers = Array.from({ length: 501 }, (_, index) => ({ id: randomUUID(), name: `Member ${String(index).padStart(3, "0")}` })); users.push(...directoryUsers.map(user => user.id))
    await prisma.user.createMany({ data: directoryUsers })
    await prisma.membership.createMany({ data: directoryUsers.map(user => ({ companyId: f.company.id, userId: user.id, role: "MEMBER" })) })
    expect(await campaignChoices(f.company.id, { kind: "MEMBER", search: "Member 500" })).toMatchObject({ total: 1, items: [expect.objectContaining({ label: "Member 500" })] })
    const foreign = await fixture()
    expect((await campaignChoices(foreign.company.id, { kind: "SEGMENT", selectedId: f.segment.id })).selected).toBeNull()
    await expect(campaignAssets(foreign.company.id, { campaignId: f.campaign.id })).rejects.toThrow("introuvable")
  })
  it("pages all attached sequences and detects an active mailbox sequence beyond the first hundred", async () => {
    const f = await fixture()
    await prisma.emailSequence.createMany({ data: Array.from({ length: 101 }, (_, index) => ({ companyId: f.company.id, campaignId: f.campaign.id, name: `Attached ${String(index).padStart(3, "0")}`, status: index === 100 ? "ACTIVE" : "PAUSED", updatedAt: new Date(Date.UTC(2000, 0, 1, 0, 101 - index)) })) })
    const dashboard = await campaignDashboard(f.company.id)
    expect(dashboard.campaigns[0]).toMatchObject({ sequenceCount: 101, activeSequenceCount: 1 })
    expect(dashboard.campaigns[0].sequences).toHaveLength(25)
    expect(await campaignSequences(f.company.id, { campaignId: f.campaign.id, page: 5 })).toMatchObject({ total: 101, page: 5, items: [expect.objectContaining({ name: "Attached 100" })] })
    expect(await campaignChoices(f.company.id, { campaignId: f.campaign.id, kind: "SEQUENCE", attachedOnly: true })).toMatchObject({ total: 1, items: [expect.objectContaining({ label: "Attached 100 · ACTIVE" })] })
  })
})
