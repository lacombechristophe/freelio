import { PrismaClient } from "@prisma/client"
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createOperationsDashboardFixture } from "../helpers/operations-dashboard-fixture"

const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
import prisma from "@/lib/prisma"
import { withAuth } from "@/lib/auth-wrapper"
import { completeFieldInterventionForContext } from "@/lib/field/interventions"
import { createStockMovement, createStockTransfer, reserveStock, consumeInterventionMaterial,
  receivePurchaseOrder, createSupplierReturn, resolvePurchaseIssue } from "@/actions/operations"

const db = new PrismaClient()
const commands = ["movement", "transfer", "reservation", "material", "receipt", "return"] as const

describe.sequential("stock writers recheck the active warehouse inside their transaction", () => {
  let fixture: Awaited<ReturnType<typeof createOperationsDashboardFixture>>
  let warehouseId: string, productId: string, destinationId: string
  beforeEach(async () => {
    fixture = await createOperationsDashboardFixture(db)
    session.companyId = fixture.companyId
    session.userId = fixture.user.id
    warehouseId = fixture.goodMovement.warehouseId
    productId = fixture.goodMovement.productId
    destinationId = fixture.stockTransfer.toWarehouseId
    await db.inventoryItem.create({ data: { companyId: fixture.companyId, warehouseId, productId, quantity: 10 } })
    await db.purchaseOrder.update({ where: { id: fixture.purchase.id }, data: { status: "SENT" } })
    await db.purchaseOrderLine.update({ where: { id: fixture.line.id }, data: { quantity: 20, receivedQuantity: 5 } })
    await db.goodsReceiptLine.update({ where: { id: fixture.goodReceiptLine.id }, data: { quantity: 6, acceptedQuantity: 5, rejectedQuantity: 1 } })
  })
  afterEach(async () => {
    vi.restoreAllMocks()
    if (fixture) { await db.auditLog.deleteMany({ where: { userId: fixture.user.id } }); await fixture.cleanup() }
  })
  afterAll(async () => { await db.$disconnect() })
  function execute(command: typeof commands[number]) {
    const stock = { warehouseId, productId, quantity: 1 }
    if (command === "movement") return createStockMovement({ ...stock, type: "IN" })
    if (command === "transfer") return createStockTransfer({ fromWarehouseId: warehouseId, toWarehouseId: destinationId, productId, quantity: 1 })
    if (command === "reservation") return reserveStock({ ...stock, projectId: fixture.project.id })
    if (command === "material") return consumeInterventionMaterial({ ...stock, interventionId: fixture.positive.interventions })
    const purchase = { warehouseId, purchaseOrderId: fixture.purchase.id, purchaseOrderLineId: fixture.line.id, quantity: 1 }
    if (command === "receipt") return receivePurchaseOrder({ ...purchase, rejectedQuantity: 0 })
    return createSupplierReturn({ ...purchase, reason: "Fictional return" })
  }
  async function snapshot() {
    const where = { companyId: fixture.companyId }
    return Promise.all([fixture.snapshot(), db.inventoryItem.findMany({ where, orderBy: { id: "asc" } }),
      db.stockMovement.findMany({ where, orderBy: { id: "asc" } }), db.stockReservation.findMany({ where, orderBy: { id: "asc" } }),
      db.purchaseOrderLine.findMany({ where: { purchaseOrderId: fixture.purchase.id }, orderBy: { id: "asc" } }),
      db.purchaseIssue.findMany({ where, orderBy: { id: "asc" } }), db.supplierReturn.findMany({ where, orderBy: { id: "asc" } }),
    ])
  }
  it.each(commands)("preserves a coherent %s command", async command => {
    await expect(execute(command)).resolves.toMatchObject({ success: true })
  })
  it.each(commands)("refuses %s after the warehouse is deactivated during preparation", async command => {
    const original = prisma.warehouse.findFirst.bind(prisma.warehouse)
    const delegate: { findFirst(args: Parameters<typeof original>[0]): Promise<Awaited<ReturnType<typeof original>>> } = prisma.warehouse
    vi.spyOn(delegate, "findFirst").mockImplementationOnce(async args => {
      const row = await original(args)
      await db.warehouse.update({ where: { id: warehouseId }, data: { active: false } })
      return row
    })
    const before = await snapshot()
    await expect(execute(command)).rejects.toThrow("Dépôt introuvable ou inactif")
    const after = await snapshot()
    // Only the intentional deactivation differs; stock and documents remain untouched.
    expect(after.slice(1)).toEqual(before.slice(1))
    expect(after[0]).toEqual(before[0])
    expect((await db.warehouse.findUniqueOrThrow({ where: { id: warehouseId } })).active).toBe(false)
  })
  it("refuses acceptance of a supplier issue into an inactive warehouse", async () => {
    await db.warehouse.update({ where: { id: warehouseId }, data: { active: false } })
    const before = await snapshot()
    await expect(resolvePurchaseIssue({ issueId: fixture.goodIssue.id, resolution: "ACCEPTED", notes: "Fictional inspection" })).rejects.toThrow("Dépôt introuvable ou inactif")
    expect(await snapshot()).toEqual(before)
  })
  it("locks warehouse activity without invalidating its coordinates revision", async () => {
    const before = await db.warehouse.findUniqueOrThrow({ where: { id: warehouseId } })
    await execute("movement")
    expect(await db.warehouse.findUniqueOrThrow({ where: { id: warehouseId } })).toEqual(before)
  })
  it.each([true, false])("keeps field completion atomic when warehouse activity is %s", async active => {
    await db.warehouse.update({ where: { id: warehouseId }, data: { active } })
    const before = await snapshot()
    const result = withAuth(context => completeFieldInterventionForContext({ interventionId: fixture.positive.interventions,
      report: "Fictional field completion", laborMinutes: 30, customerName: "Fictional customer", customerApproval: true,
      customerSignatureData: `data:image/png;base64,${"A".repeat(120)}`, materials: [{ warehouseId, productId, quantity: 1 }] }, context), "operations.write")
    if (active) {
      await expect(result).resolves.toMatchObject({ success: true })
      expect((await db.fieldIntervention.findUniqueOrThrow({ where: { id: fixture.positive.interventions } })).status).toBe("COMPLETED")
      expect((await db.inventoryItem.findUniqueOrThrow({ where: { warehouseId_productId: { warehouseId, productId } } })).quantity).toBe(9)
    } else {
      await expect(result).rejects.toThrow("Dépôt introuvable ou inactif")
      expect(await snapshot()).toEqual(before)
    }
  })
})
