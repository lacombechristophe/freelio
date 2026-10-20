import { PrismaClient } from "@prisma/client"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { createOperationsDashboardFixture } from "../helpers/operations-dashboard-fixture"

const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
import { getAssetEquipmentChoices, getAssetSiteChoices } from "@/actions/asset-choices"
import { getCustomerSiteDirectory, getEquipmentDirectory } from "@/actions/operations-assets"
import { getOperationsProductChoices } from "@/actions/operations-product-choices"

const db = new PrismaClient()
describe.sequential("active asset choices and historical directories", () => {
  let fixture: Awaited<ReturnType<typeof createOperationsDashboardFixture>>
  let lastSiteId: string, lastEquipmentId: string, productId: string, inactiveEquipmentId: string
  const prefix = "Complete fictional asset"
  beforeAll(async () => {
    fixture = await createOperationsDashboardFixture(db)
    session.companyId = fixture.companyId; session.userId = fixture.user.id
    await db.customerSite.createMany({ data: Array.from({ length: 201 }, (_, i) => ({ companyId: fixture.companyId, clientId: fixture.site.clientId,
      agencyId: fixture.agency.id, label: `${prefix} ${String(i).padStart(3, "0")}`, address1: "Fictional address" })) })
    lastSiteId = (await db.customerSite.findFirstOrThrow({ where: { companyId: fixture.companyId, label: `${prefix} 200` } })).id
    await db.equipment.createMany({ data: Array.from({ length: 201 }, (_, i) => ({ companyId: fixture.companyId, siteId: lastSiteId,
      label: `${prefix} ${String(i).padStart(3, "0")}`, serialNumber: `COMPLETE-${i}` })) })
    lastEquipmentId = (await db.equipment.findFirstOrThrow({ where: { companyId: fixture.companyId, serialNumber: "COMPLETE-200" } })).id
    productId = (await db.product.create({ data: { companyId: fixture.companyId, sku: "INACTIVE-RETAINED", label: "Fictional retired reference", active: false } })).id
    inactiveEquipmentId = (await db.equipment.create({ data: { companyId: fixture.companyId, siteId: lastSiteId, productId, label: "Fictional historical equipment", archivedAt: new Date() } })).id
  })
  afterEach(async () => {
    await db.membership.update({ where: { id: fixture.member.id }, data: { role: "OWNER", status: "ACTIVE" } })
    await db.customerSite.update({ where: { id: lastSiteId }, data: { archivedAt: null } })
    await db.equipment.update({ where: { id: lastEquipmentId }, data: { archivedAt: null } })
    await db.agency.update({ where: { id: fixture.agency.id }, data: { active: true } })
  })
  afterAll(async () => { if (fixture) await fixture.cleanup(); await db.$disconnect() })
  it.each(["site", "equipment"] as const)("reaches all 201 %s choices with a retained off-page selection and no duplicates", async kind => {
    const action = kind === "site" ? getAssetSiteChoices : getAssetEquipmentChoices
    const selectedId = kind === "site" ? lastSiteId : lastEquipmentId, ids: string[] = []
    for (let page = 1; page <= 9; page++) {
      const result = await action({ search: prefix, page, selectedId })
      expect(result).toMatchObject({ total: 201, page, selected: { id: selectedId } })
      expect(result.items).toHaveLength(page === 9 ? 1 : 25)
      for (const item of [...result.items, result.selected!]) expect(Object.keys(item).sort()).toEqual(["id", "label"])
      ids.push(...result.items.map(item => item.id))
    }
    expect(new Set(ids).size).toBe(201); expect(ids.at(-1)).toBe(selectedId)
  })
  it("searches equipment serial numbers and clamps an obsolete page", async () => {
    expect(await getAssetEquipmentChoices({ search: "complete-200", page: 500 })).toMatchObject({ total: 1, page: 1, items: [{ id: lastEquipmentId }] })
  })
  it("does not reuse a selection belonging to a different client or site", async () => {
    expect((await getAssetSiteChoices({ clientId: fixture.foreignClient.id, selectedId: lastSiteId })).selected).toBeNull()
    expect((await getAssetEquipmentChoices({ siteId: fixture.otherSite.id, selectedId: lastEquipmentId })).selected).toBeNull()
    expect((await getAssetEquipmentChoices({ clientId: fixture.foreignClient.id, selectedId: lastEquipmentId })).selected).toBeNull()
  })
  it.each(["site", "equipment", "agency"] as const)("excludes inactive %s references while keeping their history readable", async kind => {
    if (kind === "site") await db.customerSite.update({ where: { id: lastSiteId }, data: { archivedAt: new Date() } })
    if (kind === "equipment") await db.equipment.update({ where: { id: lastEquipmentId }, data: { archivedAt: new Date() } })
    if (kind === "agency") await db.agency.update({ where: { id: fixture.agency.id }, data: { active: false } })
    expect((await getAssetEquipmentChoices({ selectedId: lastEquipmentId })).selected).toBeNull()
    if (kind !== "equipment") expect((await getAssetSiteChoices({ selectedId: lastSiteId })).selected).toBeNull()
    expect((await getEquipmentDirectory({ search: `${prefix} 200` })).items.map(row => row.id)).toContain(lastEquipmentId)
    expect((await getCustomerSiteDirectory({ search: `${prefix} 200` })).items.map(row => row.id)).toContain(lastSiteId)
  })
  it("filters historical activity separately from the technical equipment status", async () => {
    expect(await getEquipmentDirectory({ status: "INACTIVE", search: "historical equipment" })).toMatchObject({ total: 1, items: [{ id: inactiveEquipmentId, status: "ACTIVE" }] })
    expect(await getEquipmentDirectory({ status: "ACTIVE", search: "historical equipment" })).toMatchObject({ total: 0, items: [] })
  })
  it("keeps an inactive product only for the equipment already linked to it", async () => {
    const retained = await getOperationsProductChoices({ selectedId: productId, equipmentId: inactiveEquipmentId })
    expect(retained.selected).toEqual({ id: productId, sku: "INACTIVE-RETAINED", label: "Fictional retired reference (référence inactive conservée)" })
    expect(retained.items.map(row => row.id)).not.toContain(productId)
    expect((await getOperationsProductChoices({ selectedId: productId, equipmentId: lastEquipmentId })).selected).toBeNull()
    expect((await getOperationsProductChoices({ selectedId: productId })).selected).toBeNull()
  })
  it("does not disclose a foreign or incoherent selection", async () => {
    expect((await getAssetSiteChoices({ selectedId: fixture.negative.sites })).selected).toBeNull()
    expect((await getAssetEquipmentChoices({ selectedId: fixture.foreignEquipment.id })).selected).toBeNull()
    expect((await getAssetEquipmentChoices({ selectedId: fixture.extra[0].id })).selected).toBeNull()
    expect((await getOperationsProductChoices({ selectedId: productId, equipmentId: fixture.foreignEquipment.id })).selected).toBeNull()
  })
  it("keeps agency scope in both search and retained selections", async () => {
    await db.membership.update({ where: { id: fixture.member.id }, data: { role: "TECHNICIAN" } })
    expect((await getAssetSiteChoices({ search: fixture.otherSite.label, selectedId: fixture.otherSite.id })).items).toEqual([])
    expect((await getAssetSiteChoices({ selectedId: fixture.otherSite.id })).selected).toBeNull()
    expect((await getAssetEquipmentChoices({ selectedId: lastEquipmentId })).selected?.id).toBe(lastEquipmentId)
    expect((await getCustomerSiteDirectory()).canManage).toBe(false)
    expect((await getEquipmentDirectory()).canManage).toBe(true)
  })
  it.each([{ page: 0 }, { companyId: "override" }, { search: "x".repeat(201) }, { clientId: "invalid" }])("rejects invalid lookup %j", async input => {
    await expect(getAssetSiteChoices(input)).rejects.toThrow()
    await expect(getAssetEquipmentChoices(input)).rejects.toThrow()
  })
})
