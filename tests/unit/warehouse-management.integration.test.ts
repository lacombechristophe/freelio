import { createDatabaseClient } from "@/lib/database-client"
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createOperationsDashboardFixture } from "../helpers/operations-dashboard-fixture"

const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
import { getWarehouseDirectory, setWarehouseActive, updateWarehouse } from "@/actions/warehouses"

const db = createDatabaseClient()
describe.sequential("warehouse management preserves stock and tenant boundaries", () => {
  let fixture: Awaited<ReturnType<typeof createOperationsDashboardFixture>>
  let warehouseId: string
  const current = () => db.warehouse.findUniqueOrThrow({ where: { id: warehouseId } })
  const edit = async (extra: Record<string, unknown> = {}) => updateWarehouse({ warehouseId, expectedUpdatedAt: (await current()).updatedAt.toISOString(),
    name: "Fictional edited warehouse", code: "EDITED", address: "", ...extra })
  const toggle = async (active: boolean, extra: Record<string, unknown> = {}) => setWarehouseActive({ warehouseId, expectedUpdatedAt: (await current()).updatedAt.toISOString(), active, ...extra })
  beforeEach(async () => {
    fixture = await createOperationsDashboardFixture(db)
    session.companyId = fixture.companyId; session.userId = fixture.user.id
    warehouseId = fixture.goodMovement.warehouseId
    // Historical movements remain, but an empty warehouse can be retired.
    await db.stockReservation.updateMany({ where: { warehouseId }, data: { status: "RELEASED" } })
  })
  afterEach(async () => {
    vi.unstubAllEnvs()
    if (fixture) { await db.auditLog.deleteMany({ where: { userId: fixture.user.id } }); await fixture.cleanup() }
  })
  afterAll(async () => { await db.$disconnect() })
  it("searches every warehouse and clamps the last page without losing inactive records", async () => {
    await db.warehouse.createMany({ data: Array.from({ length: 201 }, (_, index) => ({ companyId: fixture.companyId, agencyId: fixture.agency.id,
      name: `ZZ Warehouse ${String(index).padStart(3, "0")}`, code: `ZZ-${index}`, address: index === 200 ? "Fictional distant address" : null })) })
    const last = await getWarehouseDirectory({ page: 999 })
    expect(last).toMatchObject({ total: 203, page: 9 })
    expect(last.items.map(item => item.code)).toEqual(["ZZ-198", "ZZ-199", "ZZ-200"])
    const found = await getWarehouseDirectory({ search: "distant" })
    expect(found.items.map(item => item.code)).toEqual(["ZZ-200"])
    await toggle(false)
    expect((await getWarehouseDirectory({ status: "INACTIVE" })).items.map(item => item.id)).toEqual([warehouseId])
    expect((await getWarehouseDirectory({ status: "ACTIVE" })).total).toBe(202)
  })
  it("normalizes coordinates and keeps historical references", async () => {
    const history = await fixture.snapshot()
    await edit({ name: " Fictional renamed warehouse ", code: " RENAMED ", address: " Fictional address " })
    expect(await current()).toMatchObject({ name: "Fictional renamed warehouse", code: "RENAMED", address: "Fictional address", agencyId: fixture.agency.id })
    await edit()
    expect((await current()).address).toBeNull()
    const after = await fixture.snapshot()
    expect(after.slice(0, 10)).toEqual(history.slice(0, 10))
    expect(await db.auditLog.count({ where: { userId: fixture.user.id } })).toBe(2)
  })
  it("refuses duplicate codes atomically", async () => {
    const before = await current()
    await expect(edit({ code: "DESTINATION" })).rejects.toThrow("existe déjà")
    expect(await current()).toEqual(before)
    expect(await db.auditLog.count({ where: { userId: fixture.user.id } })).toBe(0)
  })
  it("refuses stale edits and activity changes without overwriting a saved version", async () => {
    const expectedUpdatedAt = (await current()).updatedAt.toISOString()
    await edit()
    const saved = await current()
    await expect(edit({ expectedUpdatedAt, name: "Lost edit" })).rejects.toThrow("a changé")
    await expect(toggle(false, { expectedUpdatedAt })).rejects.toThrow("a changé")
    expect(await current()).toEqual(saved)
    expect(await db.auditLog.count({ where: { userId: fixture.user.id } })).toBe(1)
  })
  it.each([{ quantity: 1 }, { quantity: -1 }, { reservedQuantity: 1 }])("refuses deactivation with inventory %j", async inventory => {
    await db.inventoryItem.create({ data: { companyId: fixture.companyId, warehouseId, productId: fixture.goodMovement.productId, ...inventory } })
    const before = await current()
    await expect(toggle(false)).rejects.toThrow("contient du stock")
    expect(await current()).toEqual(before)
    expect(await db.auditLog.count({ where: { userId: fixture.user.id } })).toBe(0)
  })
  it("refuses deactivation with an active reservation even if its cached quantity is zero", async () => {
    await db.stockReservation.update({ where: { id: fixture.reservation.id }, data: { status: "ACTIVE" } })
    await expect(toggle(false)).rejects.toThrow("réservations actives")
    expect((await current()).active).toBe(true)
  })
  it("does not hide foreign child stock when deciding whether deactivation is safe", async () => {
    await db.inventoryItem.create({ data: { companyId: fixture.foreignCompanyId, warehouseId, productId: fixture.foreignProduct.id, quantity: 1 } })
    await expect(toggle(false)).rejects.toThrow("contient du stock")
    expect((await current()).active).toBe(true)
  })
  it("deactivates an empty warehouse, preserves history, and permits reactivation", async () => {
    const before = await fixture.snapshot()
    await toggle(false)
    expect((await current()).active).toBe(false)
    expect((await fixture.snapshot()).slice(0, 10)).toEqual(before.slice(0, 10))
    await toggle(true)
    expect((await current()).active).toBe(true)
  })
  it.each(["foreign company", "foreign agency", "inaccessible agency"])("hides and refuses a warehouse in a %s", async kind => {
    if (kind === "foreign company") warehouseId = fixture.badTransfer.toWarehouseId
    else await db.warehouse.update({ where: { id: warehouseId }, data: { agencyId: kind === "foreign agency" ? fixture.foreignAgency.id : fixture.otherAgency.id } })
    if (kind === "inaccessible agency") await db.membership.update({ where: { id: fixture.member.id }, data: { role: "OPERATIONS" } })
    expect((await getWarehouseDirectory()).items.some(item => item.id === warehouseId)).toBe(false)
    const before = await current()
    await expect(edit()).rejects.toThrow("introuvable")
    await expect(toggle(false)).rejects.toThrow("introuvable")
    expect(await current()).toEqual(before)
  })
  it("keeps the directory readable but denies writes without Operations write", async () => {
    await db.membership.update({ where: { id: fixture.member.id }, data: { role: "ACCOUNTING" } })
    expect((await getWarehouseDirectory()).canManage).toBe(false)
    await expect(edit()).rejects.toThrow("droits")
    await expect(toggle(false)).rejects.toThrow("droits")
  })
  it("rechecks a suspended membership with the same session", async () => {
    await db.membership.update({ where: { id: fixture.member.id }, data: { status: "SUSPENDED" } })
    await expect(getWarehouseDirectory()).rejects.toThrow("plus accès")
    await expect(edit()).rejects.toThrow("plus accès")
  })
  it("allows reading but denies edits and activity changes in the public demo", async () => {
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    expect((await getWarehouseDirectory()).total).toBe(2)
    await expect(edit()).rejects.toThrow("lecture seule")
    await expect(toggle(false)).rejects.toThrow("lecture seule")
  })
  it.each([{ page: 0 }, { page: 1.5 }, { page: 1_000_001 }, { search: "a".repeat(201) }, { status: "OTHER" }, { agencyId: "untrusted" }])("rejects invalid or extra directory parameters %j", async query => {
    await expect(getWarehouseDirectory(query)).rejects.toThrow()
  })
})
