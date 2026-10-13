import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"

const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
import prisma from "@/lib/prisma"
import { getPurchaseProductChoices, getPurchaseProjectChoices } from "@/actions/purchase-choices"
import { createPurchaseOrder, getOperationsDashboard } from "@/actions/operations"
import { COMPANY_ROLES } from "@/lib/permissions"

describe.sequential("Complete purchase choices on real SQL", () => {
  let otherCompanyId: string, membershipId: string, agencyId: string, otherAgencyId: string, clientId: string, supplierId: string
  let productId: string, inactiveProductId: string, foreignProductId: string, projectId: string, otherAgencyProjectId: string
  let foreignProjectId: string, inconsistentProjectId: string, inactiveProjectId: string
  const input = () => ({ supplierId, projectId, lines: [{ productId, label: "Fictional edited label", quantity: 2, unitPriceCents: 1234 }, { label: "Fictional free line", quantity: 1, unitPriceCents: 300 }], notes: "Fictional preserved instructions", expectedAt: "2030-01-02" })
  beforeAll(async () => {
    session.companyId = (await prisma.company.create({ data: { name: "Fictional complete purchase choices" } })).id
    otherCompanyId = (await prisma.company.create({ data: { name: "Foreign fictional purchase choices" } })).id
    session.userId = (await prisma.user.create({ data: { email: `purchase-choice-${randomUUID()}@example.test` } })).id
    membershipId = (await prisma.membership.create({ data: { companyId: session.companyId, userId: session.userId, role: "OWNER", status: "ACTIVE" } })).id
    agencyId = (await prisma.agency.create({ data: { companyId: session.companyId, code: "PERMITTED", name: "Fictional permitted agency" } })).id
    otherAgencyId = (await prisma.agency.create({ data: { companyId: session.companyId, code: "OTHER", name: "Fictional other agency" } })).id
    await prisma.agencyMembership.create({ data: { agencyId, membershipId } })
    clientId = (await prisma.client.create({ data: { companyId: session.companyId, name: "Fictional purchase client" } })).id
    const foreignClient = await prisma.client.create({ data: { companyId: otherCompanyId, name: "FOREIGN-PURCHASE-CLIENT" } })
    supplierId = (await prisma.supplier.create({ data: { companyId: session.companyId, name: "Fictional purchase supplier" } })).id
    await prisma.product.createMany({ data: Array.from({ length: 500 }, (_, index) => ({ companyId: session.companyId, sku: `SKU-${String(index).padStart(3, "0")}`, label: `Produit ${String(index).padStart(3, "0")}` })) })
    productId = (await prisma.product.create({ data: { companyId: session.companyId, sku: "ZZ-LAST", label: "ZZ DERNIER PRODUIT", purchasePriceCents: 789 } })).id
    inactiveProductId = (await prisma.product.create({ data: { companyId: session.companyId, sku: "INACTIVE", label: "Fictional inactive product", active: false } })).id
    foreignProductId = (await prisma.product.create({ data: { companyId: otherCompanyId, sku: "FOREIGN", label: "FOREIGN-PURCHASE-PRODUCT" } })).id
    const warehouse = await prisma.warehouse.create({ data: { companyId: session.companyId, agencyId, code: "PERMITTED", name: "Fictional purchase warehouse" } })
    await prisma.inventoryItem.create({ data: { companyId: session.companyId, productId: foreignProductId, warehouseId: warehouse.id, quantity: 99 } })
    await prisma.project.createMany({ data: Array.from({ length: 300 }, (_, index) => ({ companyId: session.companyId, clientId, agencyId, name: `Chantier ${String(index).padStart(3, "0")}` })) })
    projectId = (await prisma.project.create({ data: { companyId: session.companyId, clientId, agencyId, name: "ZZ DERNIER CHANTIER" } })).id
    otherAgencyProjectId = (await prisma.project.create({ data: { companyId: session.companyId, clientId, agencyId: otherAgencyId, name: "Fictional other agency project" } })).id
    foreignProjectId = (await prisma.project.create({ data: { companyId: otherCompanyId, clientId: foreignClient.id, name: "FOREIGN-PURCHASE-PROJECT" } })).id
    inconsistentProjectId = (await prisma.project.create({ data: { companyId: session.companyId, clientId: foreignClient.id, agencyId, name: "FOREIGN-CLIENT-PURCHASE-PROJECT" } })).id
    inactiveProjectId = (await prisma.project.create({ data: { companyId: session.companyId, clientId, agencyId, status: "COMPLETED", name: "Fictional completed project" } })).id
  })
  afterEach(async () => {
    vi.restoreAllMocks(); vi.unstubAllEnvs()
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "OWNER", status: "ACTIVE" } })
    await prisma.agency.update({ where: { id: agencyId }, data: { active: true } })
    await prisma.auditLog.deleteMany({ where: { userId: session.userId } })
    await prisma.purchaseOrder.deleteMany({ where: { companyId: session.companyId } })
  })
  afterAll(async () => {
    const where = { companyId: { in: [session.companyId, otherCompanyId] } }
    await prisma.project.deleteMany({ where })
    await prisma.product.deleteMany({ where }); await prisma.client.deleteMany({ where }); await prisma.supplier.deleteMany({ where })
    await prisma.company.deleteMany({ where: { id: { in: [session.companyId, otherCompanyId] } } })
    await prisma.user.delete({ where: { id: session.userId } })
  })
  it("reads all 501 products with exact price and a selected product outside the page", async () => {
    const ids: string[] = []
    for (let page = 1; page <= 21; page++) {
      const result = await getPurchaseProductChoices({ page, selectedId: productId })
      expect(result).toMatchObject({ total: 501, page, selected: { id: productId, purchasePriceCents: 789 } })
      expect(result.items).toHaveLength(page === 21 ? 1 : 25); ids.push(...result.items.map(item => item.id))
    }
    expect(new Set(ids).size).toBe(501); expect(ids.at(-1)).toBe(productId)
  })
  it("reads all active coherent projects with stable pages and a separate selection", async () => {
    const ids: string[] = []
    for (let page = 1; page <= 13; page++) {
      const result = await getPurchaseProjectChoices({ page, selectedId: projectId })
      expect(result).toMatchObject({ total: 302, page, selected: { id: projectId } })
      expect(result.items).toHaveLength(page === 13 ? 2 : 25); ids.push(...result.items.map(item => item.id))
    }
    expect(new Set(ids).size).toBe(302); expect(ids.at(-1)).toBe(projectId)
  })
  it.each(["zz-last", "dernier"])("finds the last product through %s and clamps an old page", async search => {
    expect(await getPurchaseProductChoices({ search, page: 100, selectedId: productId })).toMatchObject({ items: [{ id: productId, purchasePriceCents: 789 }], total: 1, page: 1, selected: { id: productId } })
  })
  it("finds the last project and retains it outside an empty search", async () => {
    expect(await getPurchaseProjectChoices({ search: "dernier", page: 100 })).toMatchObject({ items: [{ id: projectId }], total: 1, page: 1 })
    expect(await getPurchaseProjectChoices({ search: "ABSENT", selectedId: projectId })).toMatchObject({ items: [], total: 0, selected: { id: projectId } })
  })
  it("refuses inactive, foreign or incoherent selected references", async () => {
    for (const selectedId of [inactiveProductId, foreignProductId]) expect((await getPurchaseProductChoices({ selectedId })).selected).toBeNull()
    for (const selectedId of [inactiveProjectId, foreignProjectId, inconsistentProjectId]) expect((await getPurchaseProjectChoices({ selectedId })).selected).toBeNull()
    expect((await getPurchaseProjectChoices({ search: "FOREIGN" })).items).toEqual([])
    expect((await getPurchaseProductChoices({ search: "FOREIGN" })).items).toEqual([])
  })
  it("does not send unused product or warehouse-inventory payloads to the browser", async () => {
    const dashboard = await getOperationsDashboard()
    expect(dashboard).not.toHaveProperty("products")
    expect(dashboard.warehouses).toHaveLength(1)
    for (const warehouse of dashboard.warehouses) expect(warehouse).not.toHaveProperty("inventoryItems")
    expect(JSON.stringify(dashboard)).not.toContain("FOREIGN-PURCHASE-PRODUCT")
  })
  it.each(COMPANY_ROLES)("keeps minimal choices and agency boundaries for %s", async role => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    const products = await getPurchaseProductChoices({ selectedId: productId })
    expect(products.total).toBe(501)
    for (const row of [...products.items, products.selected!]) expect(Object.keys(row).sort()).toEqual(["id", "label", "purchasePriceCents", "sku"])
    const projects = await getPurchaseProjectChoices({ selectedId: otherAgencyProjectId })
    expect(projects.total).toBe(["OWNER", "ADMIN"].includes(role) ? 302 : 301)
    expect(Boolean(projects.selected)).toBe(["OWNER", "ADMIN"].includes(role))
    for (const row of projects.items) expect(Object.keys(row).sort()).toEqual(["id", "name"])
  })
  for (const [kind, load] of [["product", getPurchaseProductChoices], ["project", getPurchaseProjectChoices]] as const) {
    it.each([{ page: 0 }, { page: 1.5 }, { page: 100001 }, { search: "x".repeat(201) }, { selectedId: "" }, { unexpected: true }])(`${kind}: rejects invalid query %j before reading choices`, async input => {
      const readProducts = vi.spyOn(prisma.product, "findMany"), readProjects = vi.spyOn(prisma.project, "findMany")
      await expect(load(input)).rejects.toThrow()
      expect(readProducts).not.toHaveBeenCalled(); expect(readProjects).not.toHaveBeenCalled()
    })
  }
  it("rechecks disappeared selections and lets a valid replacement be resolved", async () => {
    const product = await prisma.product.create({ data: { companyId: session.companyId, sku: "DISAPPEAR", label: "Fictional disappeared product" } })
    const project = await prisma.project.create({ data: { companyId: session.companyId, clientId, agencyId, name: "Fictional disappeared project" } })
    expect((await getPurchaseProductChoices({ selectedId: product.id })).selected?.id).toBe(product.id)
    expect((await getPurchaseProjectChoices({ selectedId: project.id })).selected?.id).toBe(project.id)
    await prisma.product.delete({ where: { id: product.id } }); await prisma.project.delete({ where: { id: project.id } })
    expect((await getPurchaseProductChoices({ selectedId: product.id })).selected).toBeNull()
    expect((await getPurchaseProjectChoices({ selectedId: project.id })).selected).toBeNull()
    expect((await getPurchaseProductChoices({ selectedId: productId })).selected?.id).toBe(productId)
    expect((await getPurchaseProjectChoices({ selectedId: projectId })).selected?.id).toBe(projectId)
  })
  it("rechecks agency and membership revocation in the same session", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "OPERATIONS" } })
    await prisma.agency.update({ where: { id: agencyId }, data: { active: false } })
    expect(await getPurchaseProjectChoices({ selectedId: projectId })).toMatchObject({ items: [], total: 0, selected: null })
    expect((await getPurchaseProductChoices()).total).toBe(501)
    await prisma.membership.update({ where: { id: membershipId }, data: { status: "SUSPENDED" } })
    await expect(getPurchaseProductChoices()).rejects.toThrow("plus accès")
    await expect(getPurchaseProjectChoices()).rejects.toThrow("plus accès")
  })
  it("creates a coherent draft with edited prices, labels and a free line", async () => {
    const result = await createPurchaseOrder(input())
    expect(await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: result.id }, include: { lines: { orderBy: { order: "asc" } } } })).toMatchObject({ projectId, supplierId, status: "DRAFT", totalHtCents: 2768, notes: "Fictional preserved instructions", lines: [{ productId, label: "Fictional edited label", quantity: 2, unitPriceCents: 1234 }, { productId: null, label: "Fictional free line", quantity: 1, unitPriceCents: 300 }] })
    expect(await prisma.stockMovement.count({ where: { companyId: session.companyId } })).toBe(0)
    expect(await prisma.emailDelivery.count({ where: { companyId: session.companyId } })).toBe(0)
  })
  it.each(["SALES", "SERVICE", "ACCOUNTING", "VIEWER"])("does not grant purchase creation to %s", async role => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    const read = vi.spyOn(prisma.product, "count")
    await expect(createPurchaseOrder(input())).rejects.toThrow("droits")
    expect(read).not.toHaveBeenCalled()
    expect(await prisma.purchaseOrder.count({ where: { companyId: session.companyId } })).toBe(0)
    expect(await prisma.auditLog.count({ where: { userId: session.userId } })).toBe(0)
  })
  it("allows public demo reads and refuses creation before any business write", async () => {
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    expect((await getPurchaseProductChoices()).total).toBe(501)
    expect((await getPurchaseProjectChoices()).total).toBe(302)
    await expect(createPurchaseOrder(input())).rejects.toThrow()
    expect(await prisma.purchaseOrder.count({ where: { companyId: session.companyId } })).toBe(0)
    expect(await prisma.auditLog.count({ where: { userId: session.userId } })).toBe(0)
  })
})
