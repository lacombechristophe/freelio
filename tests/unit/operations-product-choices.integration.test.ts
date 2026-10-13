import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
import prisma from "@/lib/prisma"
import { getOperationsProductChoices } from "@/actions/operations-product-choices"
import { createEquipment, createCustomerOrder, createStockMovement, createStockTransfer, reserveStock, consumeInterventionMaterial } from "@/actions/operations"
import { COMPANY_ROLES } from "@/lib/permissions"

describe.sequential("Operations complete product choices on real SQL", () => {
  let otherCompanyId: string, memberId: string, lastId: string, foreignId: string, inactiveId: string, untrackedId: string
  let clientId: string, siteId: string, warehouseId: string, destinationId: string, projectId: string, interventionId: string
  const kinds = ["equipment", "movement", "transfer", "order", "reservation", "material"] as const
  type Kind = typeof kinds[number]
  function create(kind: Kind, productId: string) {
    if (kind === "equipment") return createEquipment({ productId, siteId, label: "Fictional preserved equipment", serialNumber: "FICTIONAL-SERIAL" })
    if (kind === "movement") return createStockMovement({ productId, warehouseId, type: "IN", quantity: 2, reference: "Fictional preserved movement" })
    if (kind === "transfer") return createStockTransfer({ productId, fromWarehouseId: warehouseId, toWarehouseId: destinationId, quantity: 2, reference: "Fictional preserved transfer" })
    if (kind === "order") return createCustomerOrder({ productId, clientId, label: "Fictional preserved order", quantity: 2, unitPriceCents: 12345, tvaRate: 20, depositCents: 0 })
    if (kind === "reservation") return reserveStock({ productId, warehouseId, projectId, quantity: 2 })
    return consumeInterventionMaterial({ productId, warehouseId, interventionId, quantity: 2 })
  }
  async function snapshot() {
    const where = { companyId: session.companyId }
    return Promise.all([
      prisma.equipment.count({ where }), prisma.customerOrder.count({ where }), prisma.stockMovement.count({ where }),
      prisma.stockTransfer.count({ where }), prisma.stockReservation.count({ where }),
      prisma.inventoryItem.findMany({ where, select: { warehouseId: true, productId: true, quantity: true, reservedQuantity: true }, orderBy: { id: "asc" } }),
      prisma.auditLog.count({ where: { userId: session.userId } }),
    ])
  }
  beforeAll(async () => {
    session.companyId = (await prisma.company.create({ data: { name: "Fictional Operations complete product choices" } })).id
    otherCompanyId = (await prisma.company.create({ data: { name: "Foreign fictional Operations product choices" } })).id
    session.userId = (await prisma.user.create({ data: { email: `operations-product-choice-${randomUUID()}@example.test` } })).id
    memberId = (await prisma.membership.create({ data: { companyId: session.companyId, userId: session.userId, role: "OWNER", status: "ACTIVE" } })).id
    untrackedId = `c${randomUUID().replaceAll("-", "")}`
    await prisma.product.createMany({ data: Array.from({ length: 500 }, (_, index) => ({
      ...(index === 499 ? { id: untrackedId } : {}), companyId: session.companyId, sku: `SKU-${String(index).padStart(3, "0")}`, label: `Produit ${String(index).padStart(3, "0")}`, stockTracked: index !== 499,
    })) })
    lastId = (await prisma.product.create({ data: { companyId: session.companyId, sku: "ZZ-LAST", label: "ZZ DERNIER PRODUIT", purchasePriceCents: 789, salePriceCents: 12345 } })).id
    inactiveId = (await prisma.product.create({ data: { companyId: session.companyId, sku: "INACTIVE", label: "Fictional inactive product", active: false } })).id
    foreignId = (await prisma.product.create({ data: { companyId: otherCompanyId, sku: "FOREIGN", label: "FOREIGN-PRODUCT-CHOICE" } })).id
    clientId = (await prisma.client.create({ data: { companyId: session.companyId, name: "Fictional product choice client" } })).id
    siteId = (await prisma.customerSite.create({ data: { companyId: session.companyId, clientId, label: "Fictional product choice site", address1: "12 rue fictive" } })).id
    projectId = (await prisma.project.create({ data: { companyId: session.companyId, clientId, name: "Fictional product choice project" } })).id
    warehouseId = (await prisma.warehouse.create({ data: { companyId: session.companyId, code: "SOURCE", name: "Fictional source warehouse" } })).id
    destinationId = (await prisma.warehouse.create({ data: { companyId: session.companyId, code: "DESTINATION", name: "Fictional destination warehouse" } })).id
    interventionId = (await prisma.fieldIntervention.create({ data: { companyId: session.companyId, siteId, projectId, title: "Fictional product choice intervention", scheduledStart: new Date("2030-01-02T12:00:00Z") } })).id
    await prisma.inventoryItem.create({ data: { companyId: session.companyId, warehouseId, productId: lastId, quantity: 100 } })
  })
  afterEach(async () => {
    vi.restoreAllMocks(); vi.unstubAllEnvs()
    await prisma.membership.update({ where: { id: memberId }, data: { role: "OWNER", status: "ACTIVE" } })
  })
  afterAll(async () => {
    const where = { companyId: { in: [session.companyId, otherCompanyId] } }
    await prisma.auditLog.deleteMany({ where: { userId: session.userId } })
    await prisma.stockMovement.deleteMany({ where }); await prisma.stockTransfer.deleteMany({ where }); await prisma.stockReservation.deleteMany({ where })
    await prisma.inventoryItem.deleteMany({ where }); await prisma.customerOrder.deleteMany({ where }); await prisma.equipment.deleteMany({ where })
    await prisma.fieldIntervention.deleteMany({ where }); await prisma.project.deleteMany({ where }); await prisma.customerSite.deleteMany({ where })
    await prisma.warehouse.deleteMany({ where }); await prisma.product.deleteMany({ where }); await prisma.client.deleteMany({ where })
    await prisma.company.deleteMany({ where: { id: { in: [session.companyId, otherCompanyId] } } }); await prisma.user.deleteMany({ where: { id: session.userId } })
  })
  it("reaches all 501 eligible products without duplication and keeps the last selection outside its page", async () => {
    const ids: string[] = []
    for (let page = 1; page <= 21; page++) {
      const result = await getOperationsProductChoices({ page, selectedId: lastId })
      expect(result).toMatchObject({ total: 501, page, selected: { id: lastId, sku: "ZZ-LAST", label: "ZZ DERNIER PRODUIT" } })
      expect(result.items).toHaveLength(page === 21 ? 1 : 25); ids.push(...result.items.map(row => row.id))
    }
    expect(new Set(ids).size).toBe(501); expect(ids.at(-1)).toBe(lastId)
  })
  it.each(["dernier", "zz-last"])("finds the last product through %s and clamps an obsolete page", async search => {
    expect(await getOperationsProductChoices({ search, page: 100, selectedId: lastId })).toMatchObject({ total: 1, page: 1, selected: { id: lastId }, items: [{ id: lastId }] })
  })
  it("retains the current active and stock-tracked eligibility rules", async () => {
    expect(await getOperationsProductChoices({ selectedId: inactiveId })).toMatchObject({ total: 501, selected: null })
    expect(await getOperationsProductChoices({ stockTrackedOnly: true, selectedId: untrackedId })).toMatchObject({ total: 500, selected: null })
    expect((await getOperationsProductChoices({ selectedId: untrackedId })).selected?.id).toBe(untrackedId)
    expect((await getOperationsProductChoices({ stockTrackedOnly: true, page: 20 })).items.at(-1)?.id).toBe(lastId)
  })
  it.each(COMPANY_ROLES)("returns minimal company-shared choices for %s", async role => {
    await prisma.membership.update({ where: { id: memberId }, data: { role } })
    const result = await getOperationsProductChoices({ selectedId: lastId })
    expect(result.total).toBe(501)
    for (const row of [...result.items, result.selected!]) expect(Object.keys(row).sort()).toEqual(["id", "label", "sku"])
    expect(await getOperationsProductChoices({ search: "FOREIGN", selectedId: foreignId })).toEqual({ total: 0, page: 1, items: [], selected: null })
  })
  it.each([{ page: 0 }, { page: 1.5 }, { page: 100001 }, { search: "x".repeat(201) }, { selectedId: "" }, { stockTrackedOnly: "true" }, { companyId: "override" }])("rejects malformed input before business queries: %j", async input => {
    const read = vi.spyOn(prisma.product, "count")
    await expect(getOperationsProductChoices(input)).rejects.toThrow(); expect(read).not.toHaveBeenCalled()
  })
  it("orders identical labels deterministically across a page boundary", async () => {
    const label = "Fictional equal product choice"
    try {
      await prisma.product.createMany({ data: Array.from({ length: 26 }, (_, index) => ({ companyId: session.companyId, sku: `TIE-${index}`, label })) })
      const first = await getOperationsProductChoices({ search: label }), second = await getOperationsProductChoices({ search: label, page: 2 })
      const ids = [...first.items, ...second.items].map(row => row.id)
      expect(first.total).toBe(26); expect(first.items).toHaveLength(25); expect(second.items).toHaveLength(1)
      expect(new Set(ids).size).toBe(26); expect(ids).toEqual([...ids].sort())
    } finally { await prisma.product.deleteMany({ where: { companyId: session.companyId, label } }) }
  })
  it.each(kinds)("supports %s with the 501st product without changing the entered values", async kind => {
    await create(kind, lastId)
    if (kind === "equipment") expect(await prisma.equipment.findFirst({ where: { companyId: session.companyId } })).toMatchObject({ productId: lastId, serialNumber: "FICTIONAL-SERIAL", siteId })
    if (kind === "movement") expect(await prisma.stockMovement.findFirst({ where: { companyId: session.companyId, reference: "Fictional preserved movement" } })).toMatchObject({ productId: lastId, quantity: 2 })
    if (kind === "transfer") expect(await prisma.stockTransfer.findFirst({ where: { companyId: session.companyId } })).toMatchObject({ productId: lastId, quantity: 2, unitCostCents: 789 })
    if (kind === "order") expect(await prisma.customerOrder.findFirst({ where: { companyId: session.companyId }, include: { lines: true } })).toMatchObject({ clientId, totalHtCents: 24690, lines: [expect.objectContaining({ productId: lastId, unitPriceCents: 12345, quantity: 2 })] })
    if (kind === "reservation") expect(await prisma.stockReservation.findFirst({ where: { companyId: session.companyId } })).toMatchObject({ productId: lastId, projectId, quantity: 2 })
    if (kind === "material") expect(await prisma.stockMovement.findFirst({ where: { companyId: session.companyId, fieldInterventionId: interventionId } })).toMatchObject({ productId: lastId, quantity: -2, unitCostCents: 789 })
  })
  it.each(kinds)("rejects a foreign product during %s without mutation or audit", async kind => {
    const before = await snapshot()
    await expect(create(kind, foreignId)).rejects.toThrow(); expect(await snapshot()).toEqual(before)
  })
  it.each(kinds)("keeps %s forbidden to Viewer before looking up the product", async kind => {
    await prisma.membership.update({ where: { id: memberId }, data: { role: "VIEWER" } })
    const before = await snapshot(), read = vi.spyOn(prisma.product, "findFirst")
    await expect(create(kind, lastId)).rejects.toThrow(); expect(read).not.toHaveBeenCalled(); expect(await snapshot()).toEqual(before)
  })
  it.each(kinds)("keeps %s forbidden in the public read-only demo", async kind => {
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    expect((await getOperationsProductChoices({ selectedId: lastId })).selected?.id).toBe(lastId)
    const before = await snapshot()
    await expect(create(kind, lastId)).rejects.toThrow(); expect(await snapshot()).toEqual(before)
  })
  it("offers replacement choices after the selected product disappears", async () => {
    const removed = await prisma.product.create({ data: { companyId: session.companyId, sku: "REMOVED", label: "Fictional removable choice" } })
    await prisma.product.delete({ where: { id: removed.id } })
    expect(await getOperationsProductChoices({ selectedId: removed.id, search: "dernier" })).toMatchObject({ total: 1, selected: null, items: [{ id: lastId }] })
  })
  it("checks membership before querying products", async () => {
    await prisma.membership.update({ where: { id: memberId }, data: { status: "INACTIVE" } })
    const read = vi.spyOn(prisma.product, "count")
    await expect(getOperationsProductChoices()).rejects.toThrow("plus accès"); expect(read).not.toHaveBeenCalled()
  })
})
