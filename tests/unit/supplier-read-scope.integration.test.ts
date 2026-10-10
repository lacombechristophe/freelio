import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"

const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
import prisma from "@/lib/prisma"
import { getOperationsDashboard, getSupplierDetail } from "@/actions/operations"
import { getProductCatalogue, getProductDetail } from "@/actions/products"
import { getSupplierProductHistory, getSupplierOrderHistory, getSupplierReturnHistory } from "@/actions/suppliers"

describe.sequential("supplier detail retains the current agency boundary on nested reads", () => {
  let supplierId: string, productId: string, foreignSupplierId: string, foreignCompanyId: string, membershipId: string, agencyId: string
  beforeAll(async () => {
    session.companyId = (await prisma.company.create({ data: { name: "Fictional supplier scope" } })).id
    session.userId = (await prisma.user.create({ data: { email: `supplier-scope-${randomUUID()}@example.test` } })).id
    membershipId = (await prisma.membership.create({ data: { companyId: session.companyId, userId: session.userId, role: "OPERATIONS", status: "ACTIVE" } })).id
    supplierId = (await prisma.supplier.create({ data: { companyId: session.companyId, name: "Fictional shared supplier" } })).id
    const product = await prisma.product.create({ data: { companyId: session.companyId, supplierId, sku: "SCOPE", label: "Fictional product" } })
    productId = product.id
    const client = await prisma.client.create({ data: { companyId: session.companyId, name: "Fictional customer" } })
    for (const code of ["PERMITTED", "OTHER"]) {
      const agency = await prisma.agency.create({ data: { companyId: session.companyId, code, name: `Fictional ${code} agency` } })
      if (code === "PERMITTED") { agencyId = agency.id; await prisma.agencyMembership.create({ data: { agencyId, membershipId } }) }
      const warehouse = await prisma.warehouse.create({ data: { companyId: session.companyId, agencyId: agency.id, code, name: `Fictional ${code} warehouse` } })
      await prisma.inventoryItem.create({ data: { companyId: session.companyId, warehouseId: warehouse.id, productId: product.id, quantity: code === "PERMITTED" ? 2 : 99 } })
      const project = await prisma.project.create({ data: { companyId: session.companyId, clientId: client.id, agencyId: agency.id, name: `Fictional ${code} project` } })
      const order = await prisma.purchaseOrder.create({ data: { companyId: session.companyId, supplierId, projectId: project.id, number: code, totalHtCents: 1000, lines: { create: { productId: product.id, label: "Fictional line", quantity: 1, unitPriceCents: 1000 } } }, include: { lines: true } })
      const movement = await prisma.stockMovement.create({ data: { companyId: session.companyId, warehouseId: warehouse.id, productId: product.id, type: "RETURN", quantity: -1 } })
      await prisma.supplierReturn.create({ data: { companyId: session.companyId, supplierId, warehouseId: warehouse.id, productId: product.id, purchaseOrderId: order.id, purchaseOrderLineId: order.lines[0].id, stockMovementId: movement.id, number: `RETURN-${code}`, quantity: 1, unitCostCents: 1000, reason: "Fictional scope" } })
    }
    foreignCompanyId = (await prisma.company.create({ data: { name: "Fictional foreign supplier company" } })).id
    foreignSupplierId = (await prisma.supplier.create({ data: { companyId: foreignCompanyId, name: "Fictional foreign supplier" } })).id
  })
  afterEach(async () => {
    vi.unstubAllEnvs()
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "OPERATIONS", status: "ACTIVE" } })
    await prisma.agency.update({ where: { id: agencyId }, data: { active: true } })
  })
  afterAll(async () => {
    await prisma.supplierReturn.deleteMany({ where: { companyId: session.companyId } })
    await prisma.stockMovement.deleteMany({ where: { companyId: session.companyId } })
    await prisma.purchaseOrder.deleteMany({ where: { companyId: session.companyId } })
    await prisma.project.deleteMany({ where: { companyId: session.companyId } })
    await prisma.client.deleteMany({ where: { companyId: session.companyId } })
    await prisma.company.deleteMany({ where: { id: { in: [session.companyId, foreignCompanyId] } } })
    await prisma.user.delete({ where: { id: session.userId } })
  })
  it("reads a shared supplier without exposing the other agency's stock or orders", async () => {
    const supplier = await getSupplierDetail(supplierId)
    expect(supplier?.products.items[0].inventoryItems.map(row => row.quantity)).toEqual([2])
    expect(supplier?.purchaseOrders.items.map(row => row.number)).toEqual(["PERMITTED"])
    expect(supplier?.supplierReturns.items.map(row => row.number)).toEqual(["RETURN-PERMITTED"])
    expect((await getSupplierProductHistory(supplierId)).items[0].inventoryItems.map(row => row.quantity)).toEqual([2])
    expect((await getSupplierOrderHistory(supplierId)).items.map(row => row.number)).toEqual(["PERMITTED"])
    expect((await getSupplierReturnHistory(supplierId)).items.map(row => row.number)).toEqual(["RETURN-PERMITTED"])
  })
  it("keeps the same stock boundary in the operations dashboard", async () => {
    const dashboard = await getOperationsDashboard()
    expect(dashboard.products.find(row => row.id === productId)?.inventoryItems.map(row => row.quantity)).toEqual([2])
  })
  it("calculates catalogue availability only from permitted warehouses", async () => {
    const catalogue = await getProductCatalogue()
    expect(catalogue.products.find(row => row.id === productId)?.availableQuantity).toBe(2)
  })
  it("does not disclose an inaccessible warehouse in the product detail", async () => {
    const detail = await getProductDetail(productId)
    expect(detail?.product.inventoryItems.map(row => row.quantity)).toEqual([2])
  })
  it.each(["OWNER", "ADMIN"])("preserves the company-wide supplier view for %s", async role => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    const supplier = await getSupplierDetail(supplierId)
    expect(supplier?.products.items[0].inventoryItems.map(row => row.quantity).sort()).toEqual([2, 99])
    expect(supplier?.purchaseOrders.items).toHaveLength(2)
    expect(supplier?.supplierReturns.items).toHaveLength(2)
    expect((await getProductCatalogue()).products.find(row => row.id === productId)?.availableQuantity).toBe(101)
    expect((await getProductDetail(productId))?.product.inventoryItems).toHaveLength(2)
  })
  it("rechecks agency revocation with the same session", async () => {
    await prisma.agency.update({ where: { id: agencyId }, data: { active: false } })
    const supplier = await getSupplierDetail(supplierId)
    expect(supplier?.products.items[0].inventoryItems).toEqual([])
    expect(supplier?.purchaseOrders.items).toEqual([])
    expect(supplier?.supplierReturns.items).toEqual([])
    expect((await getProductCatalogue()).products.find(row => row.id === productId)?.availableQuantity).toBe(0)
    expect((await getProductDetail(productId))?.product.inventoryItems).toEqual([])
    expect((await getOperationsDashboard()).products.find(row => row.id === productId)?.inventoryItems).toEqual([])
  })
  it("keeps the same agency restriction in public demo", async () => {
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    const supplier = await getSupplierDetail(supplierId)
    expect(supplier?.products.items[0].inventoryItems.map(row => row.quantity)).toEqual([2])
  })
  it("refuses a foreign supplier and a revoked membership", async () => {
    expect(await getSupplierDetail(foreignSupplierId)).toBeNull()
    await prisma.membership.update({ where: { id: membershipId }, data: { status: "SUSPENDED" } })
    await expect(getSupplierDetail(supplierId)).rejects.toThrow("plus accès")
  })
})
