import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"

const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
import prisma from "@/lib/prisma"
import { receivePurchaseOrder, resolvePurchaseIssue, createSupplierReturn, creditSupplierReturn } from "@/actions/operations"

describe.sequential("Supplier stock writes preserve scoped references and atomic history", () => {
  let membershipId: string, foreignCompanyId: string, agencyId: string, otherAgencyId: string
  let clientId: string, foreignClientId: string, projectId: string, supplierId: string, foreignSupplierId: string
  let productId: string, otherProductId: string, foreignProductId: string, warehouseId: string, otherWarehouseId: string
  let sequence = 0
  async function seed() {
    const order = await prisma.purchaseOrder.create({ data: { companyId: session.companyId, supplierId, projectId, number: `STOCK-${++sequence}`, status: "PARTIALLY_RECEIVED",
      totalHtCents: 1000, lines: { create: { productId, label: "Fictional product", quantity: 10, receivedQuantity: 4, unitPriceCents: 100 } },
    }, include: { lines: true } })
    const line = order.lines[0]
    const receipt = await prisma.goodsReceipt.create({ data: { companyId: session.companyId, purchaseOrderId: order.id, warehouseId, number: `RECEIPT-${sequence}`,
      lines: { create: { purchaseOrderLineId: line.id, productId, quantity: 6, acceptedQuantity: 4, rejectedQuantity: 2, unitCostCents: 100 } },
    }, include: { lines: true } })
    const issue = await prisma.purchaseIssue.create({ data: { companyId: session.companyId, purchaseOrderId: order.id, purchaseOrderLineId: line.id, productId, goodsReceiptLineId: receipt.lines[0].id, type: "DAMAGED", quantity: 2 } })
    const movement = await prisma.stockMovement.create({ data: { companyId: session.companyId, productId, warehouseId, type: "OUT", quantity: -1 } })
    const returned = await prisma.supplierReturn.create({ data: { companyId: session.companyId, purchaseOrderId: order.id, purchaseOrderLineId: line.id, supplierId, productId, warehouseId, stockMovementId: movement.id, number: `RETURN-${sequence}`, quantity: 1, unitCostCents: 100, reason: "Fictional return" } })
    return { order, line, receipt, issue, returned }
  }
  type Fixture = Awaited<ReturnType<typeof seed>>
  const commands = ["receipt", "issue", "return", "credit"] as const
  function execute(command: typeof commands[number], f: Fixture) {
    if (command === "receipt") return receivePurchaseOrder({ purchaseOrderId: f.order.id, purchaseOrderLineId: f.line.id, warehouseId, quantity: 1 })
    if (command === "issue") return resolvePurchaseIssue({ issueId: f.issue.id, resolution: "ACCEPTED", notes: "Fictional inspection completed" })
    if (command === "return") return createSupplierReturn({ purchaseOrderId: f.order.id, purchaseOrderLineId: f.line.id, warehouseId, quantity: 1, reason: "Fictional return" })
    return creditSupplierReturn(f.returned.id, "FICTIONAL-CREDIT")
  }
  async function snapshot() {
    const where = { companyId: { in: [session.companyId, foreignCompanyId] } }
    return Promise.all([
      prisma.purchaseOrder.findMany({ where, include: { lines: { orderBy: { id: "asc" } } }, orderBy: { id: "asc" } }),
      prisma.goodsReceipt.findMany({ where, include: { lines: { orderBy: { id: "asc" } } }, orderBy: { id: "asc" } }),
      prisma.purchaseIssue.findMany({ where, orderBy: { id: "asc" } }), prisma.supplierReturn.findMany({ where, orderBy: { id: "asc" } }),
      prisma.stockMovement.findMany({ where, orderBy: { id: "asc" } }), prisma.inventoryItem.findMany({ where, orderBy: { id: "asc" } }),
      prisma.auditLog.findMany({ where: { userId: session.userId }, orderBy: { id: "asc" } }), prisma.emailDelivery.count({ where }),
    ])
  }
  beforeAll(async () => {
    session.companyId = (await prisma.company.create({ data: { name: "Fictional supplier stock integrity" } })).id
    foreignCompanyId = (await prisma.company.create({ data: { name: "Foreign supplier stock integrity" } })).id
    session.userId = (await prisma.user.create({ data: { email: `purchase-stock-${randomUUID()}@example.test` } })).id
    membershipId = (await prisma.membership.create({ data: { companyId: session.companyId, userId: session.userId, role: "OWNER", status: "ACTIVE" } })).id
    agencyId = (await prisma.agency.create({ data: { companyId: session.companyId, code: "LOCAL", name: "Allowed agency" } })).id
    otherAgencyId = (await prisma.agency.create({ data: { companyId: session.companyId, code: "OTHER", name: "Other agency" } })).id
    await prisma.agencyMembership.create({ data: { membershipId, agencyId } })
    clientId = (await prisma.client.create({ data: { companyId: session.companyId, name: "Local client" } })).id
    foreignClientId = (await prisma.client.create({ data: { companyId: foreignCompanyId, name: "Foreign client" } })).id
    projectId = (await prisma.project.create({ data: { companyId: session.companyId, clientId, agencyId, name: "Local project" } })).id
    supplierId = (await prisma.supplier.create({ data: { companyId: session.companyId, name: "Local supplier" } })).id
    foreignSupplierId = (await prisma.supplier.create({ data: { companyId: foreignCompanyId, name: "Foreign supplier" } })).id
    productId = (await prisma.product.create({ data: { companyId: session.companyId, sku: "LOCAL", label: "Local product" } })).id
    otherProductId = (await prisma.product.create({ data: { companyId: session.companyId, sku: "OTHER", label: "Other product" } })).id
    foreignProductId = (await prisma.product.create({ data: { companyId: foreignCompanyId, sku: "FOREIGN", label: "Foreign product" } })).id
    warehouseId = (await prisma.warehouse.create({ data: { companyId: session.companyId, agencyId, code: "LOCAL", name: "Local warehouse" } })).id
    otherWarehouseId = (await prisma.warehouse.create({ data: { companyId: session.companyId, agencyId, code: "OTHER", name: "Other warehouse" } })).id
    await prisma.inventoryItem.create({ data: { companyId: session.companyId, warehouseId, productId, quantity: 20 } })
  })
  afterEach(async () => {
    vi.restoreAllMocks(); vi.unstubAllEnvs()
    const where = { companyId: session.companyId }
    await prisma.auditLog.deleteMany({ where: { userId: session.userId } }); await prisma.purchaseIssue.deleteMany({ where }); await prisma.supplierReturn.deleteMany({ where })
    await prisma.goodsReceipt.deleteMany({ where }); await prisma.stockMovement.deleteMany({ where }); await prisma.purchaseOrder.deleteMany({ where })
    await prisma.inventoryItem.updateMany({ where, data: { quantity: 20, reservedQuantity: 0 } })
    await prisma.project.update({ where: { id: projectId }, data: { clientId, agencyId } })
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "OWNER", status: "ACTIVE" } })
  })
  afterAll(async () => {
    const where = { companyId: { in: [session.companyId, foreignCompanyId] } }
    await prisma.inventoryItem.deleteMany({ where }); await prisma.warehouse.deleteMany({ where }); await prisma.product.deleteMany({ where })
    await prisma.supplier.deleteMany({ where }); await prisma.project.deleteMany({ where }); await prisma.client.deleteMany({ where })
    await prisma.company.deleteMany({ where: { id: { in: [session.companyId, foreignCompanyId] } } }); await prisma.user.delete({ where: { id: session.userId } })
  })
  for (const command of commands) {
    it(`${command}: preserves a coherent command and creates one audit`, async () => {
      const fixture = await seed()
      expect(await execute(command, fixture)).toMatchObject({ success: true })
      expect(await prisma.auditLog.count({ where: { userId: session.userId } })).toBe(1)
      expect(await prisma.emailDelivery.count({ where: { companyId: session.companyId } })).toBe(0)
    })
    it.each(["supplier", "client", "product"])(`${command}: refuses a foreign %s without mutations`, async kind => {
      const f = await seed()
      if (kind === "supplier") await prisma.purchaseOrder.update({ where: { id: f.order.id }, data: { supplierId: foreignSupplierId } })
      if (kind === "client") await prisma.project.update({ where: { id: projectId }, data: { clientId: foreignClientId } })
      if (kind === "product") await prisma.purchaseOrderLine.update({ where: { id: f.line.id }, data: { productId: foreignProductId } })
      const before = await snapshot()
      await expect(execute(command, f)).rejects.toThrow(); expect(await snapshot()).toEqual(before)
    })
    it(`${command}: refuses inaccessible agencies, insufficient writes and the public demo`, async () => {
      const f = await seed()
      await prisma.project.update({ where: { id: projectId }, data: { agencyId: otherAgencyId } })
      await prisma.membership.update({ where: { id: membershipId }, data: { role: "OPERATIONS" } })
      const before = await snapshot()
      await expect(execute(command, f)).rejects.toThrow(); expect(await snapshot()).toEqual(before)
      await prisma.membership.update({ where: { id: membershipId }, data: { role: "VIEWER" } })
      await expect(execute(command, f)).rejects.toThrow("droits nécessaires")
      vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
      await expect(execute(command, f)).rejects.toThrow("lecture seule"); expect(await snapshot()).toEqual(before)
    })
    it(`${command}: rechecks a client changed after preparation`, async () => {
      const f = await seed(), before = await snapshot()
      const change = () => prisma.project.update({ where: { id: projectId }, data: { clientId: foreignClientId } })
      if (command === "receipt" || command === "return") {
        const read = prisma.purchaseOrderLine.findFirst.bind(prisma.purchaseOrderLine)
        vi.spyOn(prisma.purchaseOrderLine, "findFirst").mockImplementationOnce((async args => { const row = await read(args); await change(); return row }) as typeof read)
      } else if (command === "issue") {
        const read = prisma.purchaseIssue.findFirst.bind(prisma.purchaseIssue)
        vi.spyOn(prisma.purchaseIssue, "findFirst").mockImplementationOnce((async args => { const row = await read(args); await change(); return row }) as typeof read)
      } else {
        const read = prisma.supplierReturn.findFirst.bind(prisma.supplierReturn)
        vi.spyOn(prisma.supplierReturn, "findFirst").mockImplementationOnce((async args => { const row = await read(args); await change(); return row }) as typeof read)
      }
      await expect(execute(command, f)).rejects.toThrow()
      expect(await snapshot()).toEqual(before)
      expect((await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).clientId).toBe(foreignClientId)
    })
    it(`${command}: rolls back stock, documents and counters when audit insertion fails`, async () => {
      const f = await seed(), before = await snapshot(), sqlite = process.env.DATABASE_URL?.startsWith("file:")
      const action = { receipt: "RECEIVE_PURCHASE_ORDER", issue: "RESOLVE_PURCHASE_ISSUE", return: "CREATE_SUPPLIER_RETURN", credit: "CREDIT_SUPPLIER_RETURN" }[command]
      if (sqlite) await prisma.$executeRawUnsafe(`CREATE TRIGGER "fictional_purchase_stock_audit" BEFORE INSERT ON "AuditLog" WHEN NEW."action" = '${action}' BEGIN SELECT RAISE(ABORT, 'Fictional audit failure'); END`)
      else {
        await prisma.$executeRawUnsafe(`CREATE FUNCTION fictional_purchase_stock_audit() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'Fictional audit failure'; END; $$ LANGUAGE plpgsql`)
        await prisma.$executeRawUnsafe(`CREATE TRIGGER fictional_purchase_stock_audit BEFORE INSERT ON "AuditLog" FOR EACH ROW WHEN (NEW."action" = '${action}') EXECUTE FUNCTION fictional_purchase_stock_audit()`)
      }
      try { await expect(execute(command, f)).rejects.toThrow(); expect(await snapshot()).toEqual(before) }
      finally {
        if (sqlite) await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS "fictional_purchase_stock_audit"')
        else { await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS fictional_purchase_stock_audit ON "AuditLog"'); await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS fictional_purchase_stock_audit()') }
      }
    })
  }
  it.each(["issue", "credit"] as const)("%s: refuses a line attached to a different order", async command => {
    const f = await seed(), other = await seed()
    if (command === "issue") await prisma.purchaseIssue.update({ where: { id: f.issue.id }, data: { purchaseOrderLineId: other.line.id } })
    else await prisma.supplierReturn.update({ where: { id: f.returned.id }, data: { purchaseOrderLineId: other.line.id } })
    const before = await snapshot()
    await expect(execute(command, f)).rejects.toThrow(); expect(await snapshot()).toEqual(before)
  })
  it("issue: refuses a receipt source from a different order", async () => {
    const f = await seed(), other = await seed()
    await prisma.purchaseIssue.update({ where: { id: f.issue.id }, data: { goodsReceiptLineId: other.receipt.lines[0].id } })
    const before = await snapshot()
    await expect(execute("issue", f)).rejects.toThrow(); expect(await snapshot()).toEqual(before)
  })
  it.each(["product", "warehouse"])("credit: refuses an inconsistent stock movement %s", async field => {
    const f = await seed()
    await prisma.stockMovement.update({ where: { id: f.returned.stockMovementId }, data: field === "product" ? { productId: otherProductId } : { warehouseId: otherWarehouseId } })
    const before = await snapshot()
    await expect(execute("credit", f)).rejects.toThrow(); expect(await snapshot()).toEqual(before)
  })
  it("receipt: refuses a canceled order committed during preparation", async () => {
    const f = await seed(), read = prisma.purchaseOrderLine.findFirst.bind(prisma.purchaseOrderLine)
    vi.spyOn(prisma.purchaseOrderLine, "findFirst").mockImplementationOnce((async args => {
      const row = await read(args); await prisma.purchaseOrder.update({ where: { id: f.order.id }, data: { status: "CANCELED" } }); return row
    }) as typeof read)
    await expect(execute("receipt", f)).rejects.toThrow()
    const saved = await snapshot()
    expect(saved[0]).toMatchObject([{ status: "CANCELED", lines: [{ receivedQuantity: 4 }] }])
    expect(saved[1]).toHaveLength(1); expect(saved[6]).toEqual([])
  })
  it("credits a return once when two prepared requests compete", async () => {
    const f = await seed(), read = prisma.supplierReturn.findFirst.bind(prisma.supplierReturn)
    let arrived = 0, release!: () => void
    const ready = new Promise<void>(resolve => { release = resolve })
    const interleaved = (async (args: Parameters<typeof read>[0]) => { const row = await read(args); if (++arrived === 2) release(); await ready; return row }) as typeof read
    vi.spyOn(prisma.supplierReturn, "findFirst").mockImplementationOnce(interleaved).mockImplementationOnce(interleaved)
    const results = await Promise.allSettled([creditSupplierReturn(f.returned.id, "FIRST"), creditSupplierReturn(f.returned.id, "SECOND")])
    expect(arrived).toBe(2)
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1)
    expect(results.filter(result => result.status === "rejected")).toHaveLength(1)
    expect(await prisma.auditLog.count({ where: { userId: session.userId } })).toBe(1)
    expect(await prisma.inventoryItem.findFirstOrThrow({ where: { companyId: session.companyId } })).toMatchObject({ quantity: 20 })
  })
})
