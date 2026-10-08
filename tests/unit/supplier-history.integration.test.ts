import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"

const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
import prisma from "@/lib/prisma"
import { getSupplierDetail } from "@/actions/operations"
import { getSupplierProductHistory, getSupplierOrderHistory, getSupplierReturnHistory } from "@/actions/suppliers"

describe.sequential("complete supplier histories and metrics on real SQL", () => {
  let supplierId: string, emptySupplierId: string, foreignSupplierId: string, foreignCompanyId: string, membershipId: string, agencyId: string
  beforeAll(async () => {
    const companyId = session.companyId = (await prisma.company.create({ data: { name: "Fictional supplier history" } })).id
    session.userId = (await prisma.user.create({ data: { email: `supplier-history-${randomUUID()}@example.test` } })).id
    membershipId = (await prisma.membership.create({ data: { companyId, userId: session.userId, role: "OWNER", status: "ACTIVE" } })).id
    supplierId = (await prisma.supplier.create({ data: { companyId, name: "Fictional complete supplier" } })).id
    emptySupplierId = (await prisma.supplier.create({ data: { companyId, name: "Fictional empty supplier" } })).id
    const agency = await prisma.agency.create({ data: { companyId, code: "HISTORY", name: "Fictional permitted agency" } })
    agencyId = agency.id
    await prisma.agencyMembership.create({ data: { agencyId, membershipId } })
    const warehouse = await prisma.warehouse.create({ data: { companyId, agencyId, code: "HISTORY", name: "Fictional history warehouse" } })
    const client = await prisma.client.create({ data: { companyId, name: "Fictional history client" } })
    const project = await prisma.project.create({ data: { companyId, agencyId, clientId: client.id, name: "Fictional permitted project" } })
    await prisma.product.createMany({ data: Array.from({ length: 301 }, (_, index) => ({ companyId, supplierId, sku: `HISTORY-${String(index).padStart(3, "0")}`, label: `Fictional product ${String(index).padStart(3, "0")}`, active: index !== 300 })) })
    const product = await prisma.product.findFirstOrThrow({ where: { companyId, supplierId }, orderBy: { sku: "asc" } })
    await prisma.purchaseOrder.createMany({ data: Array.from({ length: 101 }, (_, index) => ({ companyId, supplierId, projectId: project.id, number: `HISTORY-${String(index).padStart(3, "0")}`, totalHtCents: 1000 + index, status: index === 100 ? "CANCELED" : "RECEIVED", orderDate: new Date(Date.UTC(2020, 0, 101 - index)), receivedAt: index === 100 ? null : new Date("2020-06-15"),
      expectedAt: index % 4 === 0 ? null : new Date(index % 4 === 1 ? "2020-06-14" : "2020-06-16"), confirmedExpectedAt: index % 4 === 2 ? new Date("2020-06-14") : null,
    })) })
    const orders = await prisma.purchaseOrder.findMany({ where: { companyId, supplierId }, orderBy: { number: "asc" } })
    await prisma.purchaseOrderLine.createMany({ data: orders.map(order => ({ purchaseOrderId: order.id, productId: product.id, label: "Fictional line", quantity: 3, receivedQuantity: 1, creditedQuantity: 1, unitPriceCents: 1000 })) })
    const lines = await prisma.purchaseOrderLine.findMany({ where: { purchaseOrder: { companyId, supplierId } } })
    await prisma.purchaseIssue.createMany({ data: orders.map((order, index) => ({ companyId, purchaseOrderId: order.id, purchaseOrderLineId: lines.find(line => line.purchaseOrderId === order.id)!.id, type: "DAMAGE", quantity: 1, status: index % 2 === 0 ? "OPEN" : "RESOLVED" })) })
    await prisma.stockMovement.createMany({ data: orders.map(order => ({ companyId, warehouseId: warehouse.id, productId: product.id, type: "RETURN", quantity: -1, reference: order.number })) })
    const movements = await prisma.stockMovement.findMany({ where: { companyId, warehouseId: warehouse.id } })
    await prisma.supplierReturn.createMany({ data: orders.map((order, index) => ({ companyId, supplierId, warehouseId: warehouse.id, productId: product.id, purchaseOrderId: order.id, purchaseOrderLineId: lines.find(line => line.purchaseOrderId === order.id)!.id, stockMovementId: movements.find(movement => movement.reference === order.number)!.id, number: `RETURN-${String(index).padStart(3, "0")}`, quantity: 1, unitCostCents: 1000, reason: "Fictional history", creditReference: index === 100 ? "OLDEST-CREDIT" : null, shippedAt: order.orderDate })) })
    foreignCompanyId = (await prisma.company.create({ data: { name: "Fictional foreign history" } })).id
    foreignSupplierId = (await prisma.supplier.create({ data: { companyId: foreignCompanyId, name: "Fictional foreign history supplier" } })).id
  })
  afterEach(async () => {
    vi.unstubAllEnvs()
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "OWNER", status: "ACTIVE" } })
    await prisma.agency.update({ where: { id: agencyId }, data: { active: true } })
  })
  afterAll(async () => {
    await prisma.supplierReturn.deleteMany({ where: { companyId: session.companyId } })
    await prisma.stockMovement.deleteMany({ where: { companyId: session.companyId } })
    await prisma.purchaseOrder.deleteMany({ where: { companyId: session.companyId } })
    await prisma.project.deleteMany({ where: { companyId: session.companyId } })
    await prisma.client.deleteMany({ where: { companyId: session.companyId } })
    await prisma.company.deleteMany({ where: { id: { in: [session.companyId, foreignCompanyId].filter(Boolean) } } })
    await prisma.user.delete({ where: { id: session.userId } })
  })
  it("calculates all four metrics beyond the former caps, with confirmed dates taking priority", async () => {
    const detail = await getSupplierDetail(supplierId)
    expect(detail?.metrics).toEqual({ orderCount: 101, spend: 104950, receivedCount: 100, onTimeCount: 50, openIssues: 51, productCount: 301 })
    expect(detail?.products.items).toHaveLength(25)
    expect(detail?.purchaseOrders.items).toHaveLength(25)
    expect(detail?.supplierReturns.items).toHaveLength(25)
  })
  it("reaches the last archived product on page 13 and by search", async () => {
    const last = await getSupplierProductHistory(supplierId, { page: 13 })
    expect(last.total).toBe(301)
    expect(last.items.map(row => row.sku)).toEqual(["HISTORY-300"])
    expect((await getSupplierProductHistory(supplierId, { search: "product 300" })).items.map(row => row.sku)).toEqual(["HISTORY-300"])
  })
  it("uses a later confirmed deadline even when the initial deadline was missed", async () => {
    const order = await prisma.purchaseOrder.findUniqueOrThrow({ where: { companyId_number: { companyId: session.companyId, number: "HISTORY-001" } } })
    try {
      await prisma.purchaseOrder.update({ where: { id: order.id }, data: { confirmedExpectedAt: new Date("2020-06-16") } })
      expect((await getSupplierDetail(supplierId))!.metrics.onTimeCount).toBe(51)
    } finally {
      await prisma.purchaseOrder.update({ where: { id: order.id }, data: { confirmedExpectedAt: order.confirmedExpectedAt } })
    }
  })
  it("keeps accounting readers within their assigned agency", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "ACCOUNTING" } })
    expect((await getSupplierOrderHistory(supplierId)).total).toBe(101)
    expect((await getSupplierReturnHistory(supplierId)).total).toBe(101)
    await prisma.agency.update({ where: { id: agencyId }, data: { active: false } })
    expect((await getSupplierOrderHistory(supplierId)).total).toBe(0)
    expect((await getSupplierReturnHistory(supplierId)).total).toBe(0)
  })
  it("refuses each history without an authenticated user", async () => {
    const userId = session.userId
    session.userId = ""
    try {
      for (const read of [getSupplierProductHistory, getSupplierOrderHistory, getSupplierReturnHistory]) await expect(read(supplierId)).rejects.toThrow("Authentification requise")
    } finally { session.userId = userId }
  })
  it("retains the project company boundary when search and punctuality add their own OR conditions", async () => {
    const client = await prisma.client.create({ data: { companyId: foreignCompanyId, name: "Fictional mismatched client" } })
    const project = await prisma.project.create({ data: { companyId: foreignCompanyId, clientId: client.id, name: "Fictional mismatched project" } })
    // SQL permits this legacy cross-company relation; the read must still exclude it.
    const order = await prisma.purchaseOrder.create({ data: { companyId: session.companyId, supplierId, projectId: project.id, number: "HISTORY-MISMATCH", status: "RECEIVED", receivedAt: new Date("2020-06-15"), totalHtCents: 999999 } })
    try {
      expect((await getSupplierOrderHistory(supplierId)).total).toBe(101)
      expect((await getSupplierOrderHistory(supplierId, { search: "HISTORY-MISMATCH" })).total).toBe(0)
      expect((await getSupplierDetail(supplierId))!.metrics).toEqual({ orderCount: 101, spend: 104950, receivedCount: 100, onTimeCount: 50, openIssues: 51, productCount: 301 })
    } finally {
      await prisma.purchaseOrder.delete({ where: { id: order.id } })
      await prisma.project.delete({ where: { id: project.id } })
      await prisma.client.delete({ where: { id: client.id } })
    }
  })
  it("reaches the oldest order beyond 100 and counts the filtered result", async () => {
    const last = await getSupplierOrderHistory(supplierId, { page: 5 })
    expect(last.total).toBe(101)
    expect(last.items.map(row => row.number)).toEqual(["HISTORY-100"])
    expect((await getSupplierOrderHistory(supplierId, { search: "HISTORY-100" })).total).toBe(1)
  })
  it("reaches the oldest return and searches credit references", async () => {
    const last = await getSupplierReturnHistory(supplierId, { page: 5 })
    expect(last.total).toBe(101)
    expect(last.items.map(row => row.number)).toEqual(["RETURN-100"])
    expect((await getSupplierReturnHistory(supplierId, { search: "oldest-credit" })).items.map(row => row.number)).toEqual(["RETURN-100"])
  })
  it("keeps global metrics independent of three searches", async () => {
    const before = (await getSupplierDetail(supplierId))!.metrics
    await getSupplierProductHistory(supplierId, { search: "not-found" })
    await getSupplierOrderHistory(supplierId, { search: "HISTORY-100" })
    await getSupplierReturnHistory(supplierId, { search: "OLDEST-CREDIT" })
    expect((await getSupplierDetail(supplierId))!.metrics).toEqual(before)
  })
  it("clamps pages after filtering and returns truthful empty metrics", async () => {
    expect((await getSupplierOrderHistory(supplierId, { search: "HISTORY-100", page: 999 })).page).toBe(1)
    expect(await getSupplierReturnHistory(emptySupplierId)).toEqual({ items: [], page: 1, total: 0 })
    expect((await getSupplierDetail(emptySupplierId))!.metrics).toEqual({ orderCount: 0, spend: 0, receivedCount: 0, onTimeCount: 0, openIssues: 0, productCount: 0 })
  })
  it("rechecks revoked agency access for aggregates and paged histories", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "OPERATIONS" } })
    expect((await getSupplierOrderHistory(supplierId)).total).toBe(101)
    await prisma.agency.update({ where: { id: agencyId }, data: { active: false } })
    expect((await getSupplierOrderHistory(supplierId)).total).toBe(0)
    expect((await getSupplierReturnHistory(supplierId)).total).toBe(0)
    expect((await getSupplierDetail(supplierId))!.metrics).toEqual({ orderCount: 0, spend: 0, receivedCount: 0, onTimeCount: 0, openIssues: 0, productCount: 301 })
  })
  it("allows bounded read-only demo histories", async () => {
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    expect((await getSupplierProductHistory(supplierId, { page: 13 })).items).toHaveLength(1)
    expect((await getSupplierOrderHistory(supplierId, { page: 5 })).items).toHaveLength(1)
    expect((await getSupplierReturnHistory(supplierId, { page: 5 })).items).toHaveLength(1)
  })
  it.each([getSupplierProductHistory, getSupplierOrderHistory, getSupplierReturnHistory])("refuses a foreign supplier and rechecks suspended membership", async read => {
    await expect(read(foreignSupplierId)).rejects.toThrow("introuvable")
    await prisma.membership.update({ where: { id: membershipId }, data: { status: "SUSPENDED" } })
    await expect(read(supplierId)).rejects.toThrow("plus accès")
  })
  it.each([{ search: "x".repeat(201) }, { page: 0 }, { page: 1.5 }, { page: 1_000_001 }])("rejects unbounded history queries %j", async query => {
    await expect(getSupplierProductHistory(supplierId, query)).rejects.toThrow()
    await expect(getSupplierOrderHistory(supplierId, query)).rejects.toThrow()
    await expect(getSupplierReturnHistory(supplierId, query)).rejects.toThrow()
  })
})
