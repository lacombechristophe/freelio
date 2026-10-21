import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"

const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
import prisma from "@/lib/prisma"
import { receivePurchaseOrder, resolvePurchaseIssue, createSupplierReturn } from "@/actions/operations"

describe.sequential("Return of goods accepted after supplier inspection", () => {
  let supplierId: string, productId: string, warehouseId: string, sequence = 0
  async function seed(quantity = 3) {
    const order = await prisma.purchaseOrder.create({ data: { companyId: session.companyId, supplierId, number: `INSPECTION-${++sequence}`, status: "SENT",
      lines: { create: { productId, label: "Fictional inspected goods", quantity, unitPriceCents: 100 } },
    }, include: { lines: true } })
    const input = { purchaseOrderId: order.id, purchaseOrderLineId: order.lines[0].id, warehouseId }
    await receivePurchaseOrder({ ...input, quantity: 3, rejectedQuantity: 2, issueType: "QUALITY" })
    const issue = await prisma.purchaseIssue.findFirstOrThrow({ where: { purchaseOrderId: order.id } })
    return { order, input, issue }
  }
  const resolve = (issueId: string, resolution = "ACCEPTED") => resolvePurchaseIssue({ issueId, resolution, notes: "Fictional quality inspection" })
  const sendBack = (input: Awaited<ReturnType<typeof seed>>["input"], quantity: number) => createSupplierReturn({ ...input, quantity, reason: "Fictional later return" })
  async function snapshot() {
    const where = { companyId: session.companyId }
    return Promise.all([
      prisma.goodsReceipt.findMany({ where, include: { lines: true }, orderBy: { id: "asc" } }),
      prisma.purchaseOrder.findMany({ where, include: { lines: true }, orderBy: { id: "asc" } }),
      prisma.purchaseIssue.findMany({ where, orderBy: { id: "asc" } }),
      prisma.inventoryItem.findMany({ where, orderBy: { id: "asc" } }), prisma.stockMovement.findMany({ where, orderBy: { id: "asc" } }),
      prisma.auditLog.findMany({ where: { userId: session.userId }, orderBy: { id: "asc" } }),
    ])
  }
  beforeAll(async () => {
    session.companyId = (await prisma.company.create({ data: { name: "Fictional post-inspection returns" } })).id
    session.userId = (await prisma.user.create({ data: { email: `purchase-inspection-${randomUUID()}@example.test` } })).id
    await prisma.membership.create({ data: { companyId: session.companyId, userId: session.userId, role: "OWNER", status: "ACTIVE" } })
    supplierId = (await prisma.supplier.create({ data: { companyId: session.companyId, name: "Fictional supplier" } })).id
    productId = (await prisma.product.create({ data: { companyId: session.companyId, sku: "INSPECTED", label: "Fictional inspected goods" } })).id
    warehouseId = (await prisma.warehouse.create({ data: { companyId: session.companyId, code: "INSPECTED", name: "Fictional warehouse" } })).id
  })
  afterEach(async () => {
    vi.restoreAllMocks()
    const where = { companyId: session.companyId }
    await prisma.auditLog.deleteMany({ where: { userId: session.userId } }); await prisma.purchaseIssue.deleteMany({ where }); await prisma.supplierReturn.deleteMany({ where })
    await prisma.goodsReceipt.deleteMany({ where }); await prisma.stockMovement.deleteMany({ where }); await prisma.inventoryItem.deleteMany({ where }); await prisma.purchaseOrder.deleteMany({ where })
  })
  afterAll(async () => {
    const where = { companyId: session.companyId }
    await prisma.warehouse.deleteMany({ where }); await prisma.product.deleteMany({ where }); await prisma.supplier.deleteMany({ where })
    await prisma.company.delete({ where: { id: session.companyId } }); await prisma.user.delete({ where: { id: session.userId } })
  })
  it("returns all three units after inspection without rewriting the original delivery observations", async () => {
    const { order, issue, input } = await seed()
    await resolve(issue.id)
    expect(await prisma.purchaseIssue.findUniqueOrThrow({ where: { id: issue.id } })).toMatchObject({ resolutionKind: "ACCEPTED" })
    expect(await sendBack(input, 3)).toMatchObject({ success: true })
    expect(await prisma.inventoryItem.findFirstOrThrow({ where: { companyId: session.companyId } })).toMatchObject({ quantity: 0 })
    expect(await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: order.id }, include: { lines: true } })).toMatchObject({ status: "RECEIVED", lines: [{ receivedQuantity: 3 }] })
    expect(await prisma.goodsReceiptLine.findFirstOrThrow({ where: { goodsReceipt: { purchaseOrderId: order.id } } })).toMatchObject({ quantity: 3, acceptedQuantity: 1, rejectedQuantity: 2 })
  })
  it("combines partial deliveries, inspected goods and returns without returning more than accepted", async () => {
    const { issue, input } = await seed(5)
    await receivePurchaseOrder({ ...input, quantity: 2 })
    await resolve(issue.id)
    expect(await sendBack(input, 5)).toMatchObject({ success: true })
    const before = await snapshot()
    await expect(sendBack(input, 1)).rejects.toThrow("quantité reçue")
    expect(await snapshot()).toEqual(before)
  })
  it("does not treat a supplier credit as physical goods accepted into stock", async () => {
    const { issue, input } = await seed()
    await resolve(issue.id, "CREDIT")
    await expect(sendBack(input, 2)).rejects.toThrow("quantité reçue")
    expect(await sendBack(input, 1)).toMatchObject({ success: true })
    expect(await prisma.purchaseIssue.findUniqueOrThrow({ where: { id: issue.id } })).toMatchObject({ resolutionKind: "CREDIT" })
  })
  it("does not add physical stock when waiting for replacement or closing with another resolution", async () => {
    const { issue, input } = await seed()
    await resolve(issue.id, "REPLACEMENT"); await resolve(issue.id, "OTHER")
    await expect(sendBack(input, 2)).rejects.toThrow("quantité reçue")
    expect(await prisma.inventoryItem.findFirstOrThrow({ where: { companyId: session.companyId } })).toMatchObject({ quantity: 1 })
    expect(await prisma.purchaseIssue.findUniqueOrThrow({ where: { id: issue.id } })).toMatchObject({ resolutionKind: "OTHER" })
  })
  it("bounds cumulative inspection acceptance by the originally rejected quantity", async () => {
    const { order, issue } = await seed(10)
    await prisma.purchaseIssue.update({ where: { id: issue.id }, data: { quantity: 1 } })
    const second = await prisma.purchaseIssue.create({ data: { companyId: session.companyId, purchaseOrderId: order.id, purchaseOrderLineId: issue.purchaseOrderLineId, goodsReceiptLineId: issue.goodsReceiptLineId, productId, quantity: 2, type: "QUALITY" } })
    await resolve(issue.id)
    const before = await snapshot()
    await expect(resolve(second.id)).rejects.toThrow()
    expect(await snapshot()).toEqual(before)
  })
  it("cannot accept the same issue twice or add a second stock movement", async () => {
    const { issue } = await seed()
    await resolve(issue.id)
    const before = await snapshot()
    await expect(resolve(issue.id)).rejects.toThrow("déjà résolue")
    expect(await snapshot()).toEqual(before)
  })
  it("keeps unclassified historical decisions unknown and refuses another acceptance", async () => {
    const { order, issue } = await seed(10)
    await prisma.purchaseIssue.create({ data: { companyId: session.companyId, purchaseOrderId: order.id, purchaseOrderLineId: issue.purchaseOrderLineId, goodsReceiptLineId: issue.goodsReceiptLineId, productId, quantity: 1, type: "QUALITY", status: "RESOLVED", resolution: "Historical unclassified note" } })
    const before = await snapshot()
    await expect(resolve(issue.id)).rejects.toThrow("Historique de contrôle incomplet")
    expect(await snapshot()).toEqual(before)
  })
  it("accepts two separately inspected units exactly once each", async () => {
    const { order, issue, input } = await seed()
    await prisma.purchaseIssue.update({ where: { id: issue.id }, data: { quantity: 1 } })
    const second = await prisma.purchaseIssue.create({ data: { companyId: session.companyId, purchaseOrderId: order.id, purchaseOrderLineId: issue.purchaseOrderLineId, goodsReceiptLineId: issue.goodsReceiptLineId, productId, quantity: 1, type: "QUALITY" } })
    await resolve(issue.id); await resolve(second.id)
    expect(await sendBack(input, 3)).toMatchObject({ success: true })
  })
})
