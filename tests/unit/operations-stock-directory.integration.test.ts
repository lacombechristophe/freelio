import * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"

const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), useSearchParams: () => new URLSearchParams() }))
vi.mock("next/dynamic", () => ({ default: () => () => null }))
import prisma from "@/lib/prisma"
import { getOperationsStockDirectory } from "@/actions/operations-stock"
import { getOperationsDashboard } from "@/actions/operations"
import { OperationsCenter } from "@/app/dashboard/operations/operations-center"
import { COMPANY_ROLES } from "@/lib/permissions"

describe.sequential("Complete Operations stock on real SQL", () => {
  let otherCompanyId: string, memberId: string, lastId: string, agencyId: string, otherAgencyId: string
  let warehouseId: string, otherWarehouseId: string, inactiveWarehouseId: string, unassignedWarehouseId: string, foreignWarehouseId: string
  async function inventory(warehouse: string, quantity: number, reservedQuantity = 0, reorderPoint = 0, companyId = session.companyId) {
    return prisma.inventoryItem.create({ data: { companyId, warehouseId: warehouse, productId: lastId, quantity, reservedQuantity, reorderPoint } })
  }
  beforeAll(async () => {
    vi.stubGlobal("React", React)
    session.companyId = (await prisma.company.create({ data: { name: "Fictional stock directory" } })).id
    otherCompanyId = (await prisma.company.create({ data: { name: "Foreign fictional stock directory" } })).id
    session.userId = (await prisma.user.create({ data: { email: `stock-directory-${randomUUID()}@example.test` } })).id
    memberId = (await prisma.membership.create({ data: { companyId: session.companyId, userId: session.userId, role: "OWNER", status: "ACTIVE" } })).id
    agencyId = (await prisma.agency.create({ data: { companyId: session.companyId, code: "PERMITTED", name: "Fictional permitted agency" } })).id
    otherAgencyId = (await prisma.agency.create({ data: { companyId: session.companyId, code: "OTHER", name: "Fictional other agency" } })).id
    await prisma.agencyMembership.create({ data: { agencyId, membershipId: memberId } })
    warehouseId = (await prisma.warehouse.create({ data: { companyId: session.companyId, agencyId, code: "PERMITTED", name: "Fictional permitted warehouse" } })).id
    otherWarehouseId = (await prisma.warehouse.create({ data: { companyId: session.companyId, agencyId: otherAgencyId, code: "OTHER", name: "Fictional other warehouse" } })).id
    inactiveWarehouseId = (await prisma.warehouse.create({ data: { companyId: session.companyId, agencyId, active: false, code: "INACTIVE", name: "Fictional historical warehouse" } })).id
    unassignedWarehouseId = (await prisma.warehouse.create({ data: { companyId: session.companyId, code: "UNASSIGNED", name: "Fictional unassigned warehouse" } })).id
    foreignWarehouseId = (await prisma.warehouse.create({ data: { companyId: otherCompanyId, code: "FOREIGN", name: "Foreign fictional warehouse" } })).id
    await prisma.product.createMany({ data: Array.from({ length: 500 }, (_, index) => ({ companyId: session.companyId, sku: `SKU-${String(index).padStart(3, "0")}`, label: `Produit ${String(index).padStart(3, "0")}` })) })
    lastId = (await prisma.product.create({ data: { companyId: session.companyId, sku: "ZZ-LAST", label: "ZZ DERNIER PRODUIT", purchasePriceCents: 100 } })).id
    await prisma.product.create({ data: { companyId: session.companyId, sku: "INACTIVE", label: "Fictional inactive product", active: false } })
    await prisma.product.create({ data: { companyId: otherCompanyId, sku: "FOREIGN", label: "FOREIGN-STOCK" } })
  })
  afterEach(async () => {
    vi.restoreAllMocks(); vi.unstubAllEnvs()
    await prisma.inventoryItem.deleteMany({ where: { productId: lastId } })
    await prisma.product.update({ where: { id: lastId }, data: { stockTracked: true, purchasePriceCents: 100 } })
    await prisma.membership.update({ where: { id: memberId }, data: { role: "OWNER", status: "ACTIVE" } })
    await prisma.agency.update({ where: { id: agencyId }, data: { active: true } })
  })
  afterAll(async () => {
    vi.unstubAllGlobals()
    await prisma.company.deleteMany({ where: { id: { in: [session.companyId, otherCompanyId] } } })
    await prisma.user.delete({ where: { id: session.userId } })
  })
  it("renders 501 low stocks and the five-of-501 preview in the actual dashboard", async () => {
    expect(await prisma.product.count({ where: { companyId: session.companyId, active: true, stockTracked: true } })).toBe(501)
    expect(await prisma.inventoryItem.count({ where: { companyId: session.companyId } })).toBe(0)
    const dashboard = await getOperationsDashboard()
    expect(dashboard.stock.items).toHaveLength(25)
    expect(dashboard.stock.summary.all.lowStockCount).toBe(501)
    const html = renderToStaticMarkup(React.createElement(OperationsCenter, { initialData: dashboard }))
    expect(Number(html.match(/Stocks bas<\/p><p[^>]*>(\d+)<\/p>/)?.[1])).toBe(501)
    expect(html).toContain("5 affichées sur 501.")
  })
  it("visits all 21 pages without duplication or changing global indicators", async () => {
    const ids: string[] = []
    for (let page = 1; page <= 21; page++) {
      const result = await getOperationsStockDirectory({ page })
      expect(result).toMatchObject({ total: 501, page, summary: { all: { lowStockCount: 501 } } })
      expect(result.items).toHaveLength(page === 21 ? 1 : 25)
      ids.push(...result.items.map(item => item.id))
    }
    expect(new Set(ids).size).toBe(501); expect(ids.at(-1)).toBe(lastId)
  })
  it.each(["dernier", "zz-last"])("searches the last product by %s without reducing aggregates", async search => {
    await inventory(warehouseId, 12, 2, 3)
    expect(await getOperationsStockDirectory({ search, page: 100 })).toMatchObject({ total: 1, page: 1, items: [{ id: lastId, available: 10, reserved: 2 }], summary: { all: { lowStockCount: 500, available: 10, stockValueCents: 1200 } } })
  })
  it("returns an empty search with complete metrics and a clamped page", async () => {
    expect(await getOperationsStockDirectory({ search: "ABSENT", page: 100 })).toMatchObject({ items: [], total: 0, page: 1, summary: { all: { lowStockCount: 501 } } })
  })
  it("orders identical labels by id across pages and the critical preview", async () => {
    const ids = Array.from({ length: 26 }, () => `c${randomUUID().replaceAll("-", "")}`).sort()
    try {
      await prisma.product.createMany({ data: ids.map((id, index) => ({ id, companyId: session.companyId, sku: `TIE-${index}`, label: "A égalité" })) })
      const first = await getOperationsStockDirectory({ search: "A égalité" })
      const second = await getOperationsStockDirectory({ search: "A égalité", page: 2 })
      expect([...first.items, ...second.items].map(item => item.id)).toEqual(ids)
      expect(first.summary.all.criticalProducts.map(item => item.id)).toEqual(ids.slice(0, 5))
      expect(first.summary.all.lowStockCount).toBe(527)
    } finally { await prisma.product.deleteMany({ where: { id: { in: ids } } }) }
  })
  it("includes the last product in agency totals and counts the exact threshold", async () => {
    await inventory(warehouseId, 12, 2, 10); await inventory(otherWarehouseId, 20, 3)
    const result = await getOperationsStockDirectory({ agencyId, search: "ZZ-LAST" })
    expect(result.items).toMatchObject([{ available: 10, reserved: 2 }])
    expect(result.summary.byAgency[agencyId]).toMatchObject({ available: 10, stockValueCents: 1200, lowStockCount: 1, criticalProducts: [{ id: lastId, available: 10, threshold: 10 }] })
    expect(result.summary.byAgency[otherAgencyId]).toMatchObject({ available: 17, stockValueCents: 2000, lowStockCount: 0 })
    expect(result.summary.all).toMatchObject({ available: 27, stockValueCents: 3200, lowStockCount: 500 })
  })
  it("preserves historical and unassigned warehouses in ALL, excluding them from agency comparison", async () => {
    await inventory(warehouseId, 2); await inventory(inactiveWarehouseId, 3); await inventory(unassignedWarehouseId, 4)
    const all = await getOperationsStockDirectory({ search: "ZZ-LAST" })
    expect(all.items[0].available).toBe(9)
    expect(all.summary.all).toMatchObject({ available: 9, stockValueCents: 900 })
    expect(all.summary.byAgency[agencyId]).toMatchObject({ available: 2, stockValueCents: 200 })
    expect((await getOperationsStockDirectory({ search: "ZZ-LAST", agencyId })).items[0].available).toBe(2)
  })
  it("keeps untracked active products in quantities and valuation but outside low-stock alerts", async () => {
    await prisma.product.update({ where: { id: lastId }, data: { stockTracked: false } })
    await inventory(warehouseId, 2, 2, 10)
    expect(await getOperationsStockDirectory({ search: "ZZ-LAST" })).toMatchObject({ total: 1, summary: { all: { lowStockCount: 500, stockValueCents: 200 }, byAgency: { [agencyId]: { lowStockCount: 0, available: 0, stockValueCents: 200 } } } })
  })
  it.each(COMPANY_ROLES)("keeps stock inside the current agency scope for %s", async role => {
    await inventory(warehouseId, 2); await inventory(otherWarehouseId, 99); await inventory(foreignWarehouseId, 999, 0, 0, otherCompanyId)
    await prisma.membership.update({ where: { id: memberId }, data: { role } })
    const result = await getOperationsStockDirectory({ search: "ZZ-LAST" })
    expect(result.items[0].available).toBe(["OWNER", "ADMIN"].includes(role) ? 101 : 2)
    expect(Object.keys(result.summary.byAgency).sort()).toEqual((["OWNER", "ADMIN"].includes(role) ? [agencyId, otherAgencyId] : [agencyId]).sort())
    expect((await getOperationsStockDirectory({ search: "FOREIGN" })).items).toEqual([])
    if (!["OWNER", "ADMIN"].includes(role)) await expect(getOperationsStockDirectory({ agencyId: otherAgencyId })).rejects.toThrow("AGENCY_ACCESS_DENIED")
  })
  it("rejects a nonexistent agency even for an owner", async () => {
    await expect(getOperationsStockDirectory({ agencyId: "cabsentagency" })).rejects.toThrow("AGENCY_ACCESS_DENIED")
  })
  it("rechecks agency and membership revocation", async () => {
    await inventory(warehouseId, 99)
    await prisma.membership.update({ where: { id: memberId }, data: { role: "OPERATIONS" } })
    await prisma.agency.update({ where: { id: agencyId }, data: { active: false } })
    expect(await getOperationsStockDirectory({ search: "ZZ-LAST" })).toMatchObject({ items: [{ available: 0 }], summary: { all: { available: 0 }, byAgency: {} } })
    await expect(getOperationsStockDirectory({ agencyId })).rejects.toThrow("AGENCY_ACCESS_DENIED")
    await prisma.membership.update({ where: { id: memberId }, data: { status: "SUSPENDED" } })
    await expect(getOperationsStockDirectory()).rejects.toThrow("plus accès")
  })
  it.each([{ page: 0 }, { page: 1.5 }, { page: 100001 }, { search: "x".repeat(201) }, { agencyId: "" }, { surprise: true }])("rejects invalid query %j before reading stock", async input => {
    const read = vi.spyOn(prisma.product, "findMany")
    await expect(getOperationsStockDirectory(input)).rejects.toThrow()
    expect(read).not.toHaveBeenCalled()
  })
  it("returns unavailable valuation instead of an inexact agency total", async () => {
    await prisma.product.update({ where: { id: lastId }, data: { purchasePriceCents: 2_000_000_000 } })
    await inventory(warehouseId, 2_000_000_000, 1)
    const result = await getOperationsStockDirectory()
    expect(result.summary.byAgency[agencyId]).toMatchObject({ available: 1_999_999_999, stockValueCents: null })
    const html = renderToStaticMarkup(React.createElement(OperationsCenter, { initialData: await getOperationsDashboard() }))
    expect(html).toContain("Valeur indisponible")
  })
  it("keeps every cent at the maximum exact integer value", async () => {
    const extra = await prisma.product.create({ data: { companyId: session.companyId, sku: "EXACT-CENTS", label: "Fictional exact cents", purchasePriceCents: 1 } })
    try {
      await prisma.product.update({ where: { id: lastId }, data: { purchasePriceCents: 2_000_000_000 } })
      await inventory(warehouseId, 4_503_599)
      await prisma.inventoryItem.create({ data: { companyId: session.companyId, warehouseId, productId: extra.id, quantity: 1_254_740_991 } })
      expect((await getOperationsStockDirectory()).summary.byAgency[agencyId].stockValueCents).toBe(Number.MAX_SAFE_INTEGER)
      const html = renderToStaticMarkup(React.createElement(OperationsCenter, { initialData: await getOperationsDashboard() }))
      expect(html.replace(/[\s\u00a0\u202f]/g, "")).toContain("90071992547409,91")
    } finally { await prisma.product.delete({ where: { id: extra.id } }) }
  })
  it("does not lose an exact global result when large historical values cancel", async () => {
    await prisma.product.update({ where: { id: lastId }, data: { purchasePriceCents: 2_000_000_000 } })
    await inventory(warehouseId, 2_000_000_000); await inventory(otherWarehouseId, -2_000_000_000)
    const result = await getOperationsStockDirectory()
    expect(result.summary.all).toMatchObject({ available: 0, stockValueCents: 0 })
    expect(result.summary.byAgency[agencyId].stockValueCents).toBeNull()
    expect(result.summary.byAgency[otherAgencyId].stockValueCents).toBeNull()
  })
  it("allows read-only demo stock reads without any stock or audit writes", async () => {
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    const before = await Promise.all([prisma.stockMovement.count({ where: { companyId: session.companyId } }), prisma.auditLog.count({ where: { userId: session.userId } })])
    expect((await getOperationsStockDirectory()).total).toBe(501)
    expect(await Promise.all([prisma.stockMovement.count({ where: { companyId: session.companyId } }), prisma.auditLog.count({ where: { userId: session.userId } })])).toEqual(before)
  })
})
