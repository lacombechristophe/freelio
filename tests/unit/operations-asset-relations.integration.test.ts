import { PrismaClient } from "@prisma/client"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { createOperationsDashboardFixture } from "../helpers/operations-dashboard-fixture"

const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
import { getCustomerSiteDirectory, getEquipmentDirectory } from "@/actions/operations-assets"

const db = new PrismaClient()
describe.sequential("site and equipment directories share coherent relation predicates", () => {
  let fixture: Awaited<ReturnType<typeof createOperationsDashboardFixture>>
  let foreignAgencySiteId: string, foreignAgencyEquipmentId: string
  beforeAll(async () => {
    fixture = await createOperationsDashboardFixture(db)
    session.companyId = fixture.companyId; session.userId = fixture.user.id
    foreignAgencySiteId = (await db.customerSite.create({ data: { companyId: fixture.companyId, clientId: fixture.site.clientId,
      agencyId: fixture.foreignAgency.id, label: "Fictional incoherent agency site", address1: "Fictional address" } })).id
    foreignAgencyEquipmentId = (await db.equipment.create({ data: { companyId: fixture.companyId, siteId: foreignAgencySiteId,
      label: "Fictional incoherent agency equipment" } })).id
  })
  afterEach(async () => { await db.membership.update({ where: { id: fixture.member.id }, data: { role: "OWNER" } }) })
  afterAll(async () => { if (fixture) await fixture.cleanup(); await db.$disconnect() })
  it("preserves coherent sites, optional products and histories without mutation", async () => {
    const before = await fixture.snapshot()
    const sites = await getCustomerSiteDirectory()
    const equipments = await getEquipmentDirectory()
    expect(sites.items.some(item => item.id === fixture.site.id)).toBe(true)
    for (const id of [fixture.positive.equipments, fixture.optionalEquipment.id]) expect(equipments.items.some(item => item.id === id)).toBe(true)
    expect(await fixture.snapshot()).toEqual(before)
  })
  it.each(["OWNER", "ADMIN"])("excludes sites and equipment linked to a foreign agency for %s", async role => {
    await db.membership.update({ where: { id: fixture.member.id }, data: { role } })
    expect((await getCustomerSiteDirectory()).items.map(item => item.id)).not.toContain(foreignAgencySiteId)
    expect((await getEquipmentDirectory()).items.map(item => item.id)).not.toContain(foreignAgencyEquipmentId)
  })
  it.each(["OWNER", "OPERATIONS", "TECHNICIAN"])("excludes an equipment's foreign product for %s", async role => {
    await db.membership.update({ where: { id: fixture.member.id }, data: { role } })
    expect((await getEquipmentDirectory()).items.map(item => item.id)).not.toContain(fixture.extra[0].id)
  })
  it("does not count equipment with a foreign product on an otherwise coherent site", async () => {
    const row = (await getCustomerSiteDirectory()).items.find(item => item.id === fixture.site.id)!
    expect(row._count.equipments).toBe(2)
  })
  it("does not count tickets assigned to a foreign membership on an otherwise coherent site", async () => {
    const row = (await getCustomerSiteDirectory()).items.find(item => item.id === fixture.site.id)!
    expect(row._count.serviceTickets).toBe(1)
  })
  it("keeps relation checks when searching an incoherent site or equipment", async () => {
    expect((await getCustomerSiteDirectory({ search: "incoherent agency site" })).total).toBe(0)
    expect((await getEquipmentDirectory({ search: "incoherent agency equipment" })).total).toBe(0)
    expect((await getEquipmentDirectory({ search: "foreign product equipment" })).total).toBe(0)
  })
  it("keeps product checks when searching through the equipment's site", async () => {
    const result = await getEquipmentDirectory({ search: fixture.site.label })
    expect(result.total).toBe(2)
    expect(result.items.map(item => item.id).sort()).toEqual([fixture.positive.equipments, fixture.optionalEquipment.id].sort())
  })
})
