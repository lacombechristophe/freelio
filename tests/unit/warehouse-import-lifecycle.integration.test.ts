import { PrismaClient } from "@prisma/client"
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createOperationsDashboardFixture } from "../helpers/operations-dashboard-fixture"

const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
import { importMigrationRun } from "@/actions/migrations"

const db = new PrismaClient()
const kinds = ["stock_movements", "stock_reservations", "goods_receipts"] as const
describe.sequential("imports respect warehouse activity and retain rejected raw records", () => {
  let fixture: Awaited<ReturnType<typeof createOperationsDashboardFixture>>
  let warehouseId: string, runId: string
  beforeEach(async () => {
    fixture = await createOperationsDashboardFixture(db)
    session.companyId = fixture.companyId; session.userId = fixture.user.id
    warehouseId = fixture.goodMovement.warehouseId
    runId = (await db.migrationRun.create({ data: { companyId: fixture.companyId, provider: "EXTRABAT", kind: "MANUAL_ARCHIVE", status: "SIMULATED" } })).id
    const targets = [["Warehouse", warehouseId], ["Product", fixture.goodMovement.productId], ["Project", fixture.project.id], ["PurchaseOrder", fixture.purchase.id]]
    await db.externalIdMap.createMany({ data: targets.map(([targetModel, targetRecordId]) => ({ companyId: fixture.companyId, provider: "EXTRABAT",
      sourceObjectType: targetModel, sourceRecordId: targetModel, targetModel, targetRecordId })) })
    await db.inventoryItem.create({ data: { companyId: fixture.companyId, warehouseId, productId: fixture.goodMovement.productId, quantity: 10 } })
  })
  afterEach(async () => {
    if (fixture) {
      await db.externalIdMap.deleteMany({ where: { companyId: fixture.companyId } })
      await db.migrationRun.deleteMany({ where: { companyId: fixture.companyId } })
      await db.auditLog.deleteMany({ where: { userId: fixture.user.id } }); await fixture.cleanup()
    }
  })
  afterAll(async () => { await db.$disconnect() })
  async function stage(kind: string, extra: Record<string, string | boolean> = {}) {
    const payload = { name: "Fictional imported warehouse", code: "LOCAL", quantity: "1", type: "IN", date: "2030-01-02T12:00:00Z",
      association_warehouse_id: "Warehouse", association_product_id: "Product", association_project_id: "Project", association_purchase_order_id: "PurchaseOrder", ...extra }
    const record = await db.sourceRecord.create({ data: { companyId: fixture.companyId, runId, provider: "EXTRABAT", objectType: kind, sourceId: "import-one", checksum: "fixture-checksum", payload } })
    await db.migrationMetric.create({ data: { runId, objectType: kind, sourceCount: 1, extracted: 1 } })
    return record
  }
  async function stockSnapshot() {
    const where = { companyId: fixture.companyId }
    return Promise.all([db.stockMovement.findMany({ where, orderBy: { id: "asc" } }), db.stockReservation.findMany({ where, orderBy: { id: "asc" } }),
      db.inventoryItem.findMany({ where, orderBy: { id: "asc" } }), db.goodsReceipt.findMany({ where, orderBy: { id: "asc" } }),
      db.purchaseOrderLine.findMany({ where: { purchaseOrderId: fixture.purchase.id }, orderBy: { id: "asc" } })])
  }
  it.each(kinds)("imports and replays a coherent %s without duplicates", async kind => {
    const record = await stage(kind)
    await expect(importMigrationRun(runId)).resolves.toMatchObject({ imported: 1, rejected: 0 })
    const first = await db.sourceRecord.findUniqueOrThrow({ where: { id: record.id } })
    const snapshot = await stockSnapshot()
    await expect(importMigrationRun(runId)).resolves.toMatchObject({ imported: 1, rejected: 0 })
    expect((await db.sourceRecord.findUniqueOrThrow({ where: { id: record.id } })).targetRecordId).toBe(first.targetRecordId)
    // A replay may update row revisions, but must keep the same rows and values.
    const withoutRevisions = (collections: Awaited<ReturnType<typeof stockSnapshot>>) => collections.map(rows => rows.map(row =>
      Object.fromEntries(Object.entries(row).filter(([key]) => key !== "updatedAt"))))
    expect(withoutRevisions(await stockSnapshot())).toEqual(withoutRevisions(snapshot))
  })
  it.each(kinds)("refuses %s into an inactive warehouse without losing source or stock", async kind => {
    const record = await stage(kind)
    await db.warehouse.update({ where: { id: warehouseId }, data: { active: false } })
    const snapshot = await stockSnapshot()
    await expect(importMigrationRun(runId)).rejects.toThrow("Dépôt introuvable ou inactif")
    expect(await stockSnapshot()).toEqual(snapshot)
    expect(await db.sourceRecord.findUniqueOrThrow({ where: { id: record.id } })).toEqual(record)
    expect(await db.externalIdMap.count({ where: { companyId: fixture.companyId, sourceRecordId: "import-one" } })).toBe(0)
    expect((await db.migrationRun.findUniqueOrThrow({ where: { id: runId } })).status).toBe("FAILED")
  })
  it("rolls back imported deactivation and coordinates when warehouse stock remains", async () => {
    const record = await stage("warehouses", { active: false })
    const warehouse = await db.warehouse.findUniqueOrThrow({ where: { id: warehouseId } })
    await expect(importMigrationRun(runId)).rejects.toThrow("contient du stock")
    expect(await db.warehouse.findUniqueOrThrow({ where: { id: warehouseId } })).toEqual(warehouse)
    expect(await db.sourceRecord.findUniqueOrThrow({ where: { id: record.id } })).toEqual(record)
  })
})
