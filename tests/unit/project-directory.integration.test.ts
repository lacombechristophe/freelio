import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
import prisma from "@/lib/prisma"
import { getProjectDirectory } from "@/actions/projets/directory"

describe.sequential("Complete project directory on real SQL", () => {
  let membershipId: string, agencyId: string, otherAgencyId: string, clientId: string, foreignClientId: string, foreignCompanyId: string, olderId: string
  beforeAll(async () => {
    session.companyId = (await prisma.company.create({ data: { name: "Fictional project directory" } })).id
    foreignCompanyId = (await prisma.company.create({ data: { name: "Fictional foreign project directory" } })).id
    session.userId = (await prisma.user.create({ data: { email: `project-directory-${randomUUID()}@example.test` } })).id
    membershipId = (await prisma.membership.create({ data: { companyId: session.companyId, userId: session.userId, role: "OWNER", status: "ACTIVE" } })).id
    agencyId = (await prisma.agency.create({ data: { companyId: session.companyId, code: "LOCAL", name: "Fictional local agency" } })).id
    otherAgencyId = (await prisma.agency.create({ data: { companyId: session.companyId, code: "OTHER", name: "Fictional other agency" } })).id
    await prisma.agencyMembership.create({ data: { membershipId, agencyId } })
    clientId = (await prisma.client.create({ data: { companyId: session.companyId, name: "Fictional directory customer", totalRevenueCents: 999999 } })).id
    foreignClientId = (await prisma.client.create({ data: { companyId: foreignCompanyId, name: "Fictional foreign customer" } })).id
  })
  const project = (name: string) => ({ companyId: session.companyId, clientId, agencyId, name, budgetCents: 120000, consumedCents: 30000, worksiteType: "Installation", createdAt: new Date("2001-01-01"), startDate: new Date("2001-01-01"), endDate: new Date("2001-01-03") })
  beforeEach(async () => {
    olderId = (await prisma.project.create({ data: { ...project("ZZ Ancien chantier"), createdAt: new Date("2000-01-01"), status: "COMPLETED" } })).id
    await prisma.project.createMany({ data: Array.from({ length: 100 }, (_, i) => project(`Recent project ${String(i).padStart(3, "0")}`)) })
  })
  afterEach(async () => {
    vi.restoreAllMocks(); vi.unstubAllEnvs()
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "OWNER", status: "ACTIVE" } })
    await prisma.project.deleteMany({ where: { companyId: { in: [session.companyId, foreignCompanyId] } } })
  })
  afterAll(async () => {
    await prisma.client.deleteMany({ where: { companyId: { in: [session.companyId, foreignCompanyId] } } })
    await prisma.company.deleteMany({ where: { id: { in: [session.companyId, foreignCompanyId] } } })
    await prisma.user.delete({ where: { id: session.userId } })
  })
  it("reaches all 101 projects with a stable minimal projection", async () => {
    const pages = []
    for (let page = 1; page <= 5; page++) pages.push(await getProjectDirectory({ page }))
    expect(pages.map(page => page.items.length)).toEqual([25, 25, 25, 25, 1])
    expect(new Set(pages.flatMap(page => page.items.map(item => item.id))).size).toBe(101)
    expect(pages[4].items).toMatchObject([{ id: olderId, budgetCents: 120000, consumedCents: 30000 }])
    expect(pages.every(page => page.total === 101 && page.portfolioTotal === 101)).toBe(true)
    for (const page of pages) for (const item of page.items) {
      expect(Object.keys(item.client).sort()).toEqual(["id", "name"])
      expect(item).not.toHaveProperty("companyId")
      expect(item).not.toHaveProperty("technicalProfile")
    }
  })
  it("keeps equal-date pages stable without duplicates", async () => {
    const first = await getProjectDirectory(), second = await getProjectDirectory({ page: 2 })
    expect(new Set([...first.items, ...second.items].map(item => item.id)).size).toBe(50)
    expect((await getProjectDirectory()).items.map(item => item.id)).toEqual(first.items.map(item => item.id))
  })
  it("searches all four fields and combines status with search", async () => {
    expect(await getProjectDirectory({ search: "  ANCIEN CHANTIER  " })).toMatchObject({ total: 1, items: [{ id: olderId }] })
    expect((await getProjectDirectory({ search: "directory customer" })).total).toBe(101)
    expect((await getProjectDirectory({ search: "local agency" })).total).toBe(101)
    expect((await getProjectDirectory({ search: "INSTALLATION" })).total).toBe(101)
    expect(await getProjectDirectory({ search: "ancien", status: "ACTIVE" })).toMatchObject({ total: 0, portfolioTotal: 101, items: [] })
    expect(await getProjectDirectory({ search: "ancien", status: "COMPLETED" })).toMatchObject({ total: 1, items: [{ id: olderId }] })
  })
  it("filters all archived projects and clamps an obsolete or empty page", async () => {
    await prisma.project.update({ where: { id: olderId }, data: { status: "ARCHIVED" } })
    expect(await getProjectDirectory({ status: "ARCHIVED", page: 500 })).toMatchObject({ total: 1, page: 1, items: [{ id: olderId }] })
    expect(await getProjectDirectory({ page: 500 })).toMatchObject({ total: 101, page: 5, items: [{ id: olderId }] })
    expect(await getProjectDirectory({ search: "no match", page: 500 })).toMatchObject({ total: 0, portfolioTotal: 101, page: 1, items: [] })
  })
  it.each(["OWNER", "ADMIN", "SALES", "OPERATIONS", "TECHNICIAN", "SERVICE", "ACCOUNTING", "VIEWER"])("scopes rows, search and totals for %s", async role => {
    const other = await prisma.project.create({ data: { ...project("Other agency"), agencyId: otherAgencyId } })
    const unattached = await prisma.project.create({ data: { ...project("Unattached project"), agencyId: null } })
    await prisma.project.create({ data: { ...project("Forbidden customer"), clientId: foreignClientId } })
    await prisma.project.create({ data: { companyId: foreignCompanyId, clientId: foreignClientId, name: "Forbidden company" } })
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    const global = role === "OWNER" || role === "ADMIN"
    expect(await getProjectDirectory()).toMatchObject({ total: global ? 103 : 101, portfolioTotal: global ? 103 : 101 })
    const inaccessible = await getProjectDirectory({ search: "Forbidden" })
    expect(inaccessible.total).toBe(0)
    expect(inaccessible.items).toEqual([])
    expect((await getProjectDirectory({ search: "Other agency" })).items.map(item => item.id)).toEqual(global ? [other.id] : [])
    expect((await getProjectDirectory({ search: "Unattached" })).items.map(item => item.id)).toEqual(global ? [unattached.id] : [])
  })
  it("applies agency revocation to both the total and the rows", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "TECHNICIAN" } })
    await prisma.agencyMembership.deleteMany({ where: { membershipId, agencyId } })
    try { expect(await getProjectDirectory()).toMatchObject({ items: [], total: 0, portfolioTotal: 0 }) }
    finally { await prisma.agencyMembership.create({ data: { membershipId, agencyId } }) }
  })
  it("refuses a suspended membership before validating the business query", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { status: "SUSPENDED" } })
    await expect(getProjectDirectory({ companyId: "invalid query" })).rejects.toThrow("plus accès")
  })
  it.each([{ page: 0 }, { page: 1.5 }, { page: 100001 }, { status: "FOREIGN" }, { search: "x".repeat(201) }, { companyId: "injected" }])("rejects invalid or injected query %j", async input => {
    await expect(getProjectDirectory(input)).rejects.toThrow()
  })
  it("keeps this reader available in the public read-only demo", async () => {
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    expect((await getProjectDirectory()).total).toBe(101)
  })
  it("excludes a project referring to another company's agency, even for Owner", async () => {
    const foreignAgency = await prisma.agency.create({ data: { companyId: foreignCompanyId, code: "FOREIGN", name: "Forbidden foreign agency" } })
    await prisma.project.create({ data: { ...project("Forbidden agency relation"), agencyId: foreignAgency.id } })
    expect(await getProjectDirectory({ search: "Forbidden" })).toMatchObject({ total: 0, portfolioTotal: 101, items: [] })
  })
  it("excludes a project referring to another company's template", async () => {
    const foreignTemplate = await prisma.projectTemplate.create({ data: { companyId: foreignCompanyId, name: "Foreign template" } })
    await prisma.project.create({ data: { ...project("Forbidden template relation"), projectTemplateId: foreignTemplate.id } })
    expect(await getProjectDirectory({ search: "Forbidden" })).toMatchObject({ total: 0, portfolioTotal: 101, items: [] })
  })
})
