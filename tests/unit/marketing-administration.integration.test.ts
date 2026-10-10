import { afterAll, describe, expect, it, vi } from "vitest"

const context = vi.hoisted(() => ({ companyId: "", userId: "fixture-user" }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/auth-wrapper", () => ({ withAuth: (task: (value: typeof context) => unknown) => task(context) }))
vi.mock("@/lib/audit", () => ({ logAction: vi.fn() }))
import prisma from "@/lib/prisma"
import { duplicateMarketingObject, getMarketingIntelligenceDashboard, getMarketingLeadPage, getSegmentMemberPage, previewMarketingSegment, updateLeadScoringRule, updateMarketingObjectStatus, updateMarketingSegment, updateStaticSegmentMembers } from "@/actions/marketing"

describe.sequential("marketing administration on isolated SQL data", () => {
  const companies: string[] = []
  const company = async () => {
    const value = await prisma.company.create({ data: { name: "Marketing administration fixture" } })
    companies.push(value.id); context.companyId = value.id
    return value
  }
  afterAll(async () => { for (const id of companies) await prisma.company.delete({ where: { id } }) })

  it("refuses stale and cross-company edits, and preserves archived history", async () => {
    const owner = await company()
    const rule = await prisma.leadScoringRule.create({ data: { companyId: owner.id, name: "Original", field: "city", operator: "CONTAINS", value: "Nantes", points: 10 } })
    const change = { ...rule, name: "Changed", expectedUpdatedAt: rule.updatedAt }
    await company()
    await expect(updateLeadScoringRule(rule.id, change)).rejects.toThrow()
    context.companyId = owner.id
    await expect(updateLeadScoringRule(rule.id, { ...change, expectedUpdatedAt: new Date(0) })).rejects.toThrow()
    expect((await prisma.leadScoringRule.findUniqueOrThrow({ where: { id: rule.id } })).name).toBe("Original")
    await updateLeadScoringRule(rule.id, change)
    const edited = await prisma.leadScoringRule.findUniqueOrThrow({ where: { id: rule.id } })
    await updateMarketingObjectStatus({ id: rule.id, kind: "RULE", status: "ARCHIVED", expectedUpdatedAt: edited.updatedAt })
    const archived = await prisma.leadScoringRule.findUniqueOrThrow({ where: { id: rule.id } })
    expect(archived.status).toBe("ARCHIVED")
    await expect(updateLeadScoringRule(rule.id, { ...change, expectedUpdatedAt: archived.updatedAt })).rejects.toThrow()
    expect((await getMarketingIntelligenceDashboard()).rules).toHaveLength(1)
  })

  it("locks active-campaign lists and refuses a kind change without losing memberships", async () => {
    const owner = await company()
    const segment = await prisma.marketingSegment.create({ data: { companyId: owner.id, name: "Locked list", kind: "STATIC", filters: {} } })
    await expect(updateMarketingSegment(segment.id, { ...segment, description: "", kind: "ACTIVE", expectedUpdatedAt: segment.updatedAt })).rejects.toThrow()
    const campaign = await prisma.marketingCampaign.create({ data: { companyId: owner.id, segmentId: segment.id, name: "Active fixture", objective: "Test", channels: ["EMAIL"], status: "ACTIVE" } })
    await expect(updateMarketingSegment(segment.id, { ...segment, description: "", name: "Wrong change", expectedUpdatedAt: segment.updatedAt })).rejects.toThrow()
    await expect(updateMarketingObjectStatus({ id: segment.id, kind: "SEGMENT", status: "ARCHIVED", expectedUpdatedAt: segment.updatedAt })).rejects.toThrow()
    const lead = await prisma.leadCapture.create({ data: { companyId: owner.id, firstName: "Fixture", lastName: "Lead", source: "TEST", privacyAccepted: true, fingerprint: "locked" } })
    await expect(updateStaticSegmentMembers({ segmentId: segment.id, operation: "ADD", leadIds: [lead.id] })).rejects.toThrow()
    expect(await prisma.marketingSegmentMember.count({ where: { segmentId: segment.id } })).toBe(0)
    await prisma.marketingCampaign.update({ where: { id: campaign.id }, data: { status: "PAUSED" } })
    await updateMarketingSegment(segment.id, { ...segment, description: "", name: "Paused list", expectedUpdatedAt: segment.updatedAt })
    expect((await prisma.marketingSegment.findUniqueOrThrow({ where: { id: segment.id } })).name).toBe("Paused list")
  })

  it("paginates complete populations, counts globally and exposes no capture secrets", async () => {
    const owner = await company()
    await prisma.leadCapture.createMany({ data: Array.from({ length: 551 }, (_, index) => ({ companyId: owner.id, firstName: "Volume", lastName: String(index), source: "TEST", score: 70, marketingOptIn: index < 510, privacyAccepted: true, fingerprint: `volume-${index}` })) })
    const dashboard = await getMarketingIntelligenceDashboard()
    expect(dashboard.leads).toHaveLength(50)
    expect(dashboard.total).toBe(551); expect(dashboard.hot).toBe(551)
    const ids = new Set<string>()
    for (let page = 1; page <= 12; page++) {
      const result = await getMarketingLeadPage({ page })
      for (const lead of result.rows) {
        expect(lead).not.toHaveProperty("fingerprint")
        expect(ids.has(lead.id)).toBe(false); ids.add(lead.id)
      }
    }
    expect(ids.size).toBe(551)
    const preview = await previewMarketingSegment({ minScore: 60, marketingOptIn: true })
    expect(preview.examined).toBe(551); expect(preview.matched).toBe(510); expect(preview.sample).toHaveLength(25)
    await expect(previewMarketingSegment({ minScore: 80, maxScore: 20 })).rejects.toThrow()
  })

  it("deduplicates static members, copies beyond one batch and rolls back foreign additions", async () => {
    const owner = await company()
    await prisma.leadCapture.createMany({ data: Array.from({ length: 401 }, (_, index) => ({ companyId: owner.id, firstName: "Static", lastName: String(index), source: "TEST", privacyAccepted: true, fingerprint: `static-${index}` })) })
    const leads = await prisma.leadCapture.findMany({ where: { companyId: owner.id }, select: { id: true } })
    const segment = await prisma.marketingSegment.create({ data: { companyId: owner.id, name: "Static list", kind: "STATIC", filters: {} } })
    await updateStaticSegmentMembers({ segmentId: segment.id, operation: "ADD", leadIds: leads.map((lead) => lead.id) })
    await updateStaticSegmentMembers({ segmentId: segment.id, operation: "ADD", leadIds: [leads[0].id, leads[0].id] })
    expect((await getSegmentMemberPage(segment.id, { page: 9 })).rows).toHaveLength(1)
    const latest = await prisma.marketingSegment.findUniqueOrThrow({ where: { id: segment.id } })
    const copy = await duplicateMarketingObject({ id: segment.id, kind: "SEGMENT", name: "Static copy", expectedUpdatedAt: latest.updatedAt })
    expect(await prisma.marketingSegmentMember.count({ where: { segmentId: copy.id } })).toBe(401)
    const foreign = await company()
    const outsider = await prisma.leadCapture.create({ data: { companyId: foreign.id, firstName: "Other", lastName: "Tenant", source: "TEST", privacyAccepted: true, fingerprint: "foreign" } })
    await expect(getSegmentMemberPage(segment.id)).rejects.toThrow()
    context.companyId = owner.id
    await updateStaticSegmentMembers({ segmentId: segment.id, operation: "REMOVE", leadIds: [leads[0].id] })
    await expect(updateStaticSegmentMembers({ segmentId: segment.id, operation: "ADD", leadIds: [leads[0].id, outsider.id] })).rejects.toThrow()
    expect(await prisma.marketingSegmentMember.count({ where: { segmentId: segment.id } })).toBe(400)
    expect(await prisma.marketingSegmentMember.count({ where: { segmentId: copy.id } })).toBe(401)
  })
})
