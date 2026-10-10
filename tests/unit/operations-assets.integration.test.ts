import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"

const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
import prisma from "@/lib/prisma"
import { getCustomerSiteDirectory, getEquipmentDirectory } from "@/actions/operations-assets"

describe.sequential("complete site and equipment directories on real SQL", () => {
  let membershipId: string, agencyId: string, otherAgencyId: string, foreignCompanyId: string, foreignAgencyId: string, firstSiteId: string
  beforeAll(async () => {
    session.companyId = (await prisma.company.create({ data: { name: "Fictional assets directory" } })).id
    foreignCompanyId = (await prisma.company.create({ data: { name: "Fictional foreign assets company" } })).id
    session.userId = (await prisma.user.create({ data: { email: `assets-volume-${randomUUID()}@example.test` } })).id
    membershipId = (await prisma.membership.create({ data: { companyId: session.companyId, userId: session.userId, role: "OPERATIONS", status: "ACTIVE" } })).id
    agencyId = (await prisma.agency.create({ data: { companyId: session.companyId, code: "LOCAL", name: "Fictional permitted agency" } })).id
    otherAgencyId = (await prisma.agency.create({ data: { companyId: session.companyId, code: "OTHER", name: "Fictional other agency" } })).id
    foreignAgencyId = (await prisma.agency.create({ data: { companyId: foreignCompanyId, code: "FOREIGN", name: "Fictional foreign agency" } })).id
    await prisma.agencyMembership.create({ data: { agencyId, membershipId } })
    const clientId = (await prisma.client.create({ data: { companyId: session.companyId, name: "Fictional searchable assets client" } })).id
    const foreignClientId = (await prisma.client.create({ data: { companyId: foreignCompanyId, name: "Fictional foreign assets client" } })).id
    const ids = Array.from({ length: 201 }, () => `c${randomUUID().replaceAll("-", "")}`)
    firstSiteId = ids[0]
    await prisma.customerSite.createMany({ data: ids.map((id, index) => ({ id, companyId: session.companyId, clientId, agencyId, label: `Fictional site ${String(index).padStart(3, "0")}`, address1: `Fictional address ${index}`, updatedAt: new Date(Date.UTC(2020, 0, 201 - index)) })) })
    const otherSite = await prisma.customerSite.create({ data: { companyId: session.companyId, clientId, agencyId: otherAgencyId, label: "Fictional other agency site", address1: "Fictional address" } })
    const foreignSite = await prisma.customerSite.create({ data: { companyId: foreignCompanyId, clientId: foreignClientId, agencyId: foreignAgencyId, label: "Foreign company site", address1: "Fictional address" } })
    const invalidSite = await prisma.customerSite.create({ data: { companyId: session.companyId, clientId: foreignClientId, agencyId, label: "Foreign client site", address1: "Fictional address" } })
    await prisma.equipment.createMany({ data: Array.from({ length: 301 }, (_, index) => ({ companyId: session.companyId, siteId: ids[index % ids.length], label: `Fictional equipment ${String(index).padStart(3, "0")}`, serialNumber: `VOLUME-${String(index).padStart(3, "0")}`, category: index === 300 ? "Fictional distinctive category" : null, updatedAt: new Date(Date.UTC(2020, 0, 301 - index)) })) })
    for (const [companyId, siteId, label] of [[session.companyId, otherSite.id, "Other agency equipment"], [session.companyId, foreignSite.id, "Foreign site equipment"], [session.companyId, invalidSite.id, "Foreign client equipment"], [foreignCompanyId, firstSiteId, "Foreign company equipment"]]) {
      await prisma.equipment.create({ data: { companyId, siteId, label } })
    }
    await prisma.serviceTicket.create({ data: { companyId: session.companyId, clientId, siteId: firstSiteId, number: "LOCAL", title: "Fictional local ticket", description: "Fictional ticket" } })
    await prisma.serviceTicket.create({ data: { companyId: foreignCompanyId, clientId: foreignClientId, siteId: firstSiteId, number: "FOREIGN", title: "Fictional foreign ticket", description: "Fictional ticket" } })
  })
  afterEach(async () => {
    vi.unstubAllEnvs()
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "OPERATIONS", status: "ACTIVE" } })
    await prisma.agency.update({ where: { id: agencyId }, data: { active: true } })
    await prisma.agencyMembership.upsert({ where: { agencyId_membershipId: { agencyId, membershipId } }, update: {}, create: { agencyId, membershipId } })
  })
  afterAll(async () => {
    const where = { companyId: { in: [session.companyId, foreignCompanyId] } }
    await prisma.serviceTicket.deleteMany({ where })
    await prisma.equipment.deleteMany({ where })
    await prisma.customerSite.deleteMany({ where })
    await prisma.client.deleteMany({ where })
    await prisma.company.deleteMany({ where: { id: where.companyId } })
    await prisma.user.delete({ where: { id: session.userId } })
  })
  it("paginates all 201 sites and 301 equipment items with stable complete boundaries", async () => {
    for (const [load, total] of [[getCustomerSiteDirectory, 201], [getEquipmentDirectory, 301]] as const) {
      const seen = new Set<string>()
      for (let page = 1; page <= Math.ceil(total / 25); page++) {
        const result = await load({ page })
        expect(result.total).toBe(total)
        expect(result.page).toBe(page)
        expect(result.items.length).toBeLessThanOrEqual(25)
        for (const row of result.items) { expect(seen.has(row.id)).toBe(false); seen.add(row.id) }
      }
      expect(seen.size).toBe(total)
      expect((await load({ page: 999 })).page).toBe(Math.ceil(total / 25))
    }
  })
  it.each(["site 200", "address 200"])("finds the oldest site through %s", async search => {
    const data = await getCustomerSiteDirectory({ search, page: 999 })
    expect(data.total).toBe(1)
    expect(data.page).toBe(1)
    expect(data.items[0].label).toBe("Fictional site 200")
  })
  it.each(["equipment 300", "volume-300", "distinctive category"])("finds the oldest equipment through %s", async search => {
    const data = await getEquipmentDirectory({ search, page: 999 })
    expect(data.total).toBe(1)
    expect(data.page).toBe(1)
    expect(data.items[0].label).toBe("Fictional equipment 300")
  })
  it("searches related clients and sites within the permitted scope", async () => {
    expect((await getCustomerSiteDirectory({ search: "searchable assets client" })).total).toBe(201)
    expect((await getEquipmentDirectory({ search: "searchable assets client" })).total).toBe(301)
    expect((await getEquipmentDirectory({ search: "site 200" })).total).toBe(1)
  })
  it("scopes nested site counters to local-company children", async () => {
    const site = (await getCustomerSiteDirectory()).items.find(item => item.id === firstSiteId)!
    expect(site._count).toEqual({ equipments: 2, serviceTickets: 1 })
  })
  it.each(["OWNER", "ADMIN"])("preserves both local agencies for %s while excluding foreign relations", async role => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    expect((await getCustomerSiteDirectory()).total).toBe(202)
    expect((await getEquipmentDirectory()).total).toBe(302)
    expect((await getCustomerSiteDirectory({ agencyId: otherAgencyId })).total).toBe(1)
    expect((await getEquipmentDirectory({ agencyId: agencyId })).total).toBe(301)
    expect((await getCustomerSiteDirectory({ search: "Foreign" })).total).toBe(0)
    expect((await getEquipmentDirectory({ search: "Foreign" })).total).toBe(0)
  })
  it("refuses a requested agency outside assignments instead of widening the result", async () => {
    await expect(getCustomerSiteDirectory({ agencyId: otherAgencyId })).rejects.toThrow("AGENCY_ACCESS_DENIED")
    await expect(getEquipmentDirectory({ agencyId: otherAgencyId })).rejects.toThrow("AGENCY_ACCESS_DENIED")
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "OWNER" } })
    await expect(getCustomerSiteDirectory({ agencyId: foreignAgencyId })).rejects.toThrow("Agence introuvable")
    await expect(getEquipmentDirectory({ agencyId: foreignAgencyId })).rejects.toThrow("Agence introuvable")
  })
  it.each(["inactive", "unassigned"])("rereads %s agency assignments", async condition => {
    if (condition === "inactive") await prisma.agency.update({ where: { id: agencyId }, data: { active: false } })
    else await prisma.agencyMembership.deleteMany({ where: { agencyId, membershipId } })
    expect((await getCustomerSiteDirectory()).total).toBe(0)
    expect((await getEquipmentDirectory()).total).toBe(0)
  })
  it("refuses both readers for a suspended member", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { status: "SUSPENDED" } })
    await expect(getCustomerSiteDirectory()).rejects.toThrow("plus accès")
    await expect(getEquipmentDirectory()).rejects.toThrow("plus accès")
  })
  it("keeps both directories readable in the public demo", async () => {
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    expect((await getCustomerSiteDirectory()).total).toBe(201)
    expect((await getEquipmentDirectory()).total).toBe(301)
  })
  it.each([{ page: 0 }, { page: 1.5 }, { page: 1_000_001 }, { search: "x".repeat(201) }, { agencyId: "invalid" }])("rejects unbounded query %j", async input => {
    await expect(getCustomerSiteDirectory(input)).rejects.toThrow()
    await expect(getEquipmentDirectory(input)).rejects.toThrow()
  })
})
