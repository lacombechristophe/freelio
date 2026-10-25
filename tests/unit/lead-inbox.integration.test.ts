import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"

const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/automations/engine", () => ({ enqueueAutomationEvent: vi.fn(async () => "fictional-event"), dispatchAutomationEvent: vi.fn(async () => {}) }))
vi.mock("@/lib/marketing/intelligence", () => ({ refreshSingleLeadIntelligence: vi.fn(async () => {}) }))
import prisma from "@/lib/prisma"
import { getLeadDashboard, updateLeadStatus } from "@/actions/leads"
import { COMPANY_ROLES } from "@/lib/permissions"

describe.sequential("complete incoming lead inbox on real SQL", () => {
  let otherCompanyId: string, memberId: string, oldestId: string, newestActiveId: string
  beforeAll(async () => {
    session.companyId = (await prisma.company.create({ data: { name: "Fictional complete incoming inbox" } })).id
    otherCompanyId = (await prisma.company.create({ data: { name: "Fictional other incoming inbox" } })).id
    session.userId = (await prisma.user.create({ data: { email: `inbox-${randomUUID()}@example.test` } })).id
    memberId = (await prisma.membership.create({ data: { companyId: session.companyId, userId: session.userId, role: "OWNER", status: "ACTIVE" } })).id
    const client = await prisma.client.create({ data: { companyId: session.companyId, name: "Fictional inbox client", nextActionAt: new Date("2025-01-05T12:00:00Z") } })
    const pipeline = await prisma.pipeline.create({ data: { companyId: session.companyId, name: "Fictional inbox pipeline", stages: [{ id: "PROSPECT", title: "Prospect" }] } })
    const opportunity = await prisma.opportunity.create({ data: { pipelineId: pipeline.id, clientId: client.id, title: "UNUSED-INBOX-COMMERCIAL-MARKER", status: "PROSPECT", valueCents: 987654 } })
    oldestId = `c${randomUUID().replaceAll("-", "")}`
    newestActiveId = `c${randomUUID().replaceAll("-", "")}`
    await prisma.leadCapture.createMany({ data: Array.from({ length: 151 }, (_, index) => ({
      ...(index === 0 ? { id: oldestId } : index === 136 ? { id: newestActiveId } : {}),
      companyId: session.companyId, clientId: client.id, opportunityId: index === 136 ? opportunity.id : null,
      firstName: index === 0 ? "OLDEST" : `Fictional ${index}`, lastName: index === 0 ? "PORTFOLIO MARKER" : "Inbox",
      email: index === 0 ? "oldest-inbox@example.test" : null, phone: index === 0 ? "0102030405" : null,
      city: index === 0 ? "Paris" : null, postalCode: index === 0 ? "75001" : null, projectType: index === 0 ? "Couverture" : null,
      source: index === 0 ? "OLD_SOURCE" : "WEBSITE", privacyAccepted: true, marketingOptIn: index === 0,
      fingerprint: `fictional-inbox-${index}`, createdAt: new Date(Date.UTC(2025, 0, 1, 0, index)),
      status: index < 100 ? "NEW" : index < 120 ? "CONTACTED" : index < 137 ? "QUALIFIED" : index < 144 ? "ARCHIVED" : "SPAM",
    })) })
    await prisma.leadCapture.create({ data: { companyId: otherCompanyId, firstName: "FOREIGN-INBOX-MARKER", lastName: "Inbox", privacyAccepted: true, marketingOptIn: true, fingerprint: "fictional-other-inbox" } })
  })
  afterEach(async () => {
    vi.restoreAllMocks(); vi.unstubAllEnvs()
    await prisma.membership.update({ where: { id: memberId }, data: { role: "OWNER", status: "ACTIVE" } })
    await prisma.leadCapture.update({ where: { id: oldestId }, data: { status: "NEW" } })
  })
  afterAll(async () => {
    const scope = { companyId: { in: [session.companyId, otherCompanyId] } }
    await prisma.leadCapture.deleteMany({ where: scope })
    await prisma.opportunity.deleteMany({ where: { pipeline: scope } })
    await prisma.pipeline.deleteMany({ where: scope })
    await prisma.client.deleteMany({ where: scope })
    await prisma.company.deleteMany({ where: { id: { in: [session.companyId, otherCompanyId] } } })
    await prisma.user.deleteMany({ where: { id: session.userId } })
  })
  it("paginates all 151 coherent leads and reaches the oldest without duplicates", async () => {
    const ids: string[] = []
    for (let page = 1; page <= 7; page++) {
      const result = await getLeadDashboard({ status: "ALL", page })
      expect(result).toMatchObject({ total: 151, page })
      expect(result.leads).toHaveLength(page === 7 ? 1 : 25)
      ids.push(...result.leads.map(row => row.id))
    }
    expect(new Set(ids).size).toBe(151); expect(ids.at(-1)).toBe(oldestId)
  })
  it.each([["ACTIVE", 137], ["ALL", 151], ["NEW", 100], ["CONTACTED", 20], ["QUALIFIED", 17], ["ARCHIVED", 7], ["SPAM", 7]])("filters %s across the complete portfolio", async (status, total) => {
    const result = await getLeadDashboard({ status })
    expect(result.total).toBe(total)
    expect(result.leads.length).toBeLessThanOrEqual(25)
    expect(result.counts).toEqual({ NEW: 100, CONTACTED: 20, QUALIFIED: 17, ARCHIVED: 7, SPAM: 7 })
    expect(result.optInCount).toBe(1)
  })
  it.each(["oldest", "portfolio marker", "oldest-inbox@example.test", "0102030405", "paris", "75001", "couverture", "old_source"])("finds the oldest through %s without changing the global indicators", async search => {
    const result = await getLeadDashboard({ search })
    expect(result.total).toBe(1); expect(result.leads[0].id).toBe(oldestId)
    expect(result.counts.NEW).toBe(100); expect(result.optInCount).toBe(1)
    expect(result.sources).toEqual([{ source: "WEBSITE", count: 150 }, { source: "OLD_SOURCE", count: 1 }])
  })
  it("finds a full name across its two fields", async () => {
    expect((await getLeadDashboard({ search: "OLDEST PORTFOLIO" })).leads[0]?.id).toBe(oldestId)
  })
  it.each(COMPANY_ROLES)("keeps CRM reads scoped and omits unused commercial data for %s", async role => {
    await prisma.membership.update({ where: { id: memberId }, data: { role } })
    const result = await getLeadDashboard()
    expect(result.total).toBe(137)
    expect(result.leads[0].id).toBe(newestActiveId)
    expect(result.leads[0].client).toMatchObject({ name: "Fictional inbox client", nextActionAt: "2025-01-05T12:00:00.000Z" })
    expect(Object.hasOwn(result.leads[0], "opportunity")).toBe(false)
    expect(JSON.stringify(result)).not.toContain("UNUSED-INBOX-COMMERCIAL-MARKER")
    expect(JSON.stringify(result)).not.toContain("FOREIGN-INBOX-MARKER")
    expect(await prisma.opportunity.count({ where: { pipeline: { companyId: session.companyId } } })).toBe(1)
  })
  it.each([{ page: 0 }, { page: 1.5 }, { page: 100001 }, { search: "x".repeat(201) }, { status: "INVALID" }, { companyId: "override" }])("rejects invalid input before business queries: %j", async input => {
    const read = vi.spyOn(prisma.leadCapture, "count")
    await expect(getLeadDashboard(input)).rejects.toThrow()
    expect(read).not.toHaveBeenCalled()
  })
  it("clamps an obsolete page and returns a valid empty page for an unmatched search", async () => {
    expect(await getLeadDashboard({ status: "ALL", page: 100000 })).toMatchObject({ page: 7, total: 151 })
    expect(await getLeadDashboard({ search: "not found", page: 9 })).toMatchObject({ page: 1, total: 0, leads: [], optInCount: 1 })
  })
  it("uses a stable ID order when identical timestamps cross a page boundary", async () => {
    const ids = Array.from({ length: 26 }, () => `c${randomUUID().replaceAll("-", "")}`)
    try {
      await prisma.leadCapture.createMany({ data: ids.map(id => ({
        id, companyId: session.companyId, firstName: "TIE-INBOX", lastName: "Inbox", privacyAccepted: true,
        fingerprint: id, createdAt: new Date("2025-01-02T12:00:00Z"),
      })) })
      const first = await getLeadDashboard({ search: "TIE-INBOX" })
      const second = await getLeadDashboard({ search: "TIE-INBOX", page: 2 })
      expect([...first.leads, ...second.leads].map(row => row.id)).toEqual([...ids].sort().reverse())
    } finally { await prisma.leadCapture.deleteMany({ where: { id: { in: ids } } }) }
  })
  it("updates global cards and the filtered result after the oldest lead changes status", async () => {
    await updateLeadStatus(oldestId, "CONTACTED")
    expect(await getLeadDashboard({ search: "oldest", status: "NEW" })).toMatchObject({ total: 0, counts: { NEW: 99, CONTACTED: 21 }, optInCount: 1 })
    expect((await getLeadDashboard({ search: "oldest", status: "CONTACTED" })).leads[0]?.id).toBe(oldestId)
    expect(await prisma.marketingConsent.count({ where: { companyId: session.companyId } })).toBe(0)
  })
  it("rechecks membership before reading the inbox", async () => {
    await prisma.membership.update({ where: { id: memberId }, data: { status: "INACTIVE" } })
    const read = vi.spyOn(prisma.leadCapture, "count")
    await expect(getLeadDashboard()).rejects.toThrow("plus accès")
    expect(read).not.toHaveBeenCalled()
  })
  it("keeps public demo reads while rejecting a status write before mutations", async () => {
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    expect((await getLeadDashboard({ search: "oldest" })).total).toBe(1)
    await expect(updateLeadStatus(oldestId, "CONTACTED")).rejects.toThrow(/démonstration/i)
    expect((await prisma.leadCapture.findUniqueOrThrow({ where: { id: oldestId } })).status).toBe("NEW")
  })
})
