import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"

const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
import prisma from "@/lib/prisma"
import { getPurchaseOrderDirectory, getPurchaseOrderSummary } from "@/actions/purchase-directory"
import { getOperationsDashboard } from "@/actions/operations"

describe.sequential("Complete purchase directory on real SQL", () => {
  let foreignCompanyId: string, membershipId: string, foreignMemberId: string, foreignUserId: string
  let agencyId: string, otherAgencyId: string, supplierId: string, foreignSupplierId: string, foreignProductId: string
  let projectId: string, otherProjectId: string, clientId: string, foreignClientId: string, oldestId: string, lineId: string
  beforeAll(async () => {
    session.companyId = (await prisma.company.create({ data: { name: "Fictional complete purchases" } })).id
    foreignCompanyId = (await prisma.company.create({ data: { name: "Foreign fictional purchases" } })).id
    session.userId = (await prisma.user.create({ data: { email: `purchase-directory-${randomUUID()}@example.test` } })).id
    foreignUserId = (await prisma.user.create({ data: { email: `foreign-purchase-directory-${randomUUID()}@example.test` } })).id
    membershipId = (await prisma.membership.create({ data: { companyId: session.companyId, userId: session.userId, role: "OWNER", status: "ACTIVE" } })).id
    foreignMemberId = (await prisma.membership.create({ data: { companyId: foreignCompanyId, userId: foreignUserId, role: "OWNER", status: "ACTIVE" } })).id
    agencyId = (await prisma.agency.create({ data: { companyId: session.companyId, code: "LOCAL", name: "Allowed agency" } })).id
    otherAgencyId = (await prisma.agency.create({ data: { companyId: session.companyId, code: "OTHER", name: "Other agency" } })).id
    await prisma.agencyMembership.create({ data: { membershipId, agencyId } })
    clientId = (await prisma.client.create({ data: { companyId: session.companyId, name: "Local client" } })).id
    foreignClientId = (await prisma.client.create({ data: { companyId: foreignCompanyId, name: "Foreign client" } })).id
    projectId = (await prisma.project.create({ data: { companyId: session.companyId, agencyId, clientId, name: "Historic project" } })).id
    otherProjectId = (await prisma.project.create({ data: { companyId: session.companyId, agencyId: otherAgencyId, clientId, name: "Other project" } })).id
    supplierId = (await prisma.supplier.create({ data: { companyId: session.companyId, name: "Historic supplier" } })).id
    foreignSupplierId = (await prisma.supplier.create({ data: { companyId: foreignCompanyId, name: "Foreign supplier" } })).id
    foreignProductId = (await prisma.product.create({ data: { companyId: foreignCompanyId, sku: "FOREIGN", label: "Foreign product" } })).id
    await prisma.purchaseOrder.createMany({ data: Array.from({ length: 151 }, (_, i) => ({ companyId: session.companyId, supplierId, projectId, number: `COMPLETE-${String(i).padStart(3, "0")}`, status: "SENT", createdAt: new Date("2020-01-01T00:00:00Z") })) })
    oldestId = (await prisma.purchaseOrder.findFirstOrThrow({ where: { companyId: session.companyId, number: "COMPLETE-000" } })).id
    lineId = (await prisma.purchaseOrderLine.create({ data: { purchaseOrderId: oldestId, label: "Historic free service", quantity: 1, unitPriceCents: 500 } })).id
    await prisma.purchaseOrder.update({ where: { id: oldestId }, data: { supplierReference: "HISTORIC-REFERENCE" } })
    await prisma.purchaseOrder.createMany({ data: Array.from({ length: 101 }, (_, i) => ({ companyId: session.companyId, supplierId, projectId, number: `CLOSED-${i}`, status: "RECEIVED", createdAt: new Date("2030-01-01T00:00:00Z") })) })
    await prisma.purchaseOrder.createMany({ data: [
      { companyId: session.companyId, supplierId, projectId: otherProjectId, number: "OTHER-AGENCY", status: "SENT" },
      { companyId: session.companyId, supplierId, number: "GENERAL", status: "CANCELED" },
      { companyId: foreignCompanyId, supplierId: foreignSupplierId, number: "FOREIGN", status: "SENT" },
    ] })
  })
  afterEach(async () => {
    vi.restoreAllMocks(); vi.unstubAllEnvs()
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "OWNER", status: "ACTIVE" } })
    await prisma.purchaseOrder.update({ where: { id: oldestId }, data: { supplierId, projectId, approvedByMembershipId: null, status: "SENT" } })
    await prisma.project.update({ where: { id: projectId }, data: { clientId } })
    await prisma.purchaseOrderLine.update({ where: { id: lineId }, data: { productId: null } })
  })
  afterAll(async () => {
    const where = { companyId: { in: [session.companyId, foreignCompanyId] } }
    await prisma.purchaseOrder.deleteMany({ where }); await prisma.product.deleteMany({ where }); await prisma.supplier.deleteMany({ where })
    await prisma.project.deleteMany({ where }); await prisma.client.deleteMany({ where }); await prisma.company.deleteMany({ where: { id: { in: [session.companyId, foreignCompanyId] } } })
    await prisma.user.deleteMany({ where: { id: { in: [session.userId, foreignUserId] } } })
  })
  it("pages through 151 active purchases with stable tied dates and no overlaps", async () => {
    const ids: string[] = []
    for (let page = 1; page <= 7; page++) {
      const result = await getPurchaseOrderDirectory({ agencyId, status: "SENT", page })
      expect(result).toMatchObject({ total: 151, page })
      expect(result.items).toHaveLength(page === 7 ? 1 : 25)
      ids.push(...result.items.map(item => item.id))
    }
    expect(new Set(ids).size).toBe(151); expect(ids).toContain(oldestId)
    expect(ids).toEqual([...ids].sort())
  })
  it.each([" COMPLETE-000 ", "historic-reference", "Historic free service"])("searches older purchases before pagination: %s", async search => {
    const result = await getPurchaseOrderDirectory({ agencyId, search, page: 99 })
    expect(result).toMatchObject({ total: 1, page: 1 }); expect(result.items.map(item => item.id)).toEqual([oldestId])
    expect(result.items[0].draftRevision).toMatch(/^[a-f0-9]{64}$/)
  })
  it.each(["Historic supplier", "Historic project"])("searches %s across the whole portfolio", async search => {
    expect(await getPurchaseOrderDirectory({ agencyId, search })).toMatchObject({ total: 252 })
  })
  it("combines status and search, and clamps empty or removed pages", async () => {
    expect(await getPurchaseOrderDirectory({ agencyId, search: "CLOSED", status: "SENT", page: 7 })).toMatchObject({ total: 0, page: 1, items: [] })
    await prisma.purchaseOrder.update({ where: { id: oldestId }, data: { status: "CANCELED" } })
    expect(await getPurchaseOrderDirectory({ agencyId, status: "SENT", page: 7 })).toMatchObject({ total: 150, page: 6 })
  })
  it("counts all active purchases even behind 101 newer closed orders", async () => {
    const summary = await getPurchaseOrderSummary({ agencyId })
    expect(summary.activeCount).toBe(151); expect(summary.items).toHaveLength(5)
    expect(summary.items.every(item => item.status === "SENT")).toBe(true)
    expect((await getPurchaseOrderSummary()).activeCount).toBe(152)
    expect((await getPurchaseOrderSummary({ agencyId: otherAgencyId })).activeCount).toBe(1)
  })
  it("dashboard bounds its initial payload and carries the complete purchase count", async () => {
    const dashboard = await getOperationsDashboard()
    expect(dashboard.purchaseOrders).toHaveLength(25)
    expect(dashboard.purchaseSummary).toMatchObject({ activeCount: 152 })
    expect(dashboard.purchaseSummary.items).toHaveLength(5)
  })
  it("separates company, agency and general supplies", async () => {
    expect((await getPurchaseOrderDirectory()).total).toBe(254)
    expect((await getPurchaseOrderDirectory({ agencyId })).total).toBe(252)
    expect((await getPurchaseOrderDirectory({ agencyId: otherAgencyId })).total).toBe(1)
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "OPERATIONS" } })
    expect((await getPurchaseOrderDirectory()).total).toBe(252)
    await expect(getPurchaseOrderDirectory({ agencyId: otherAgencyId })).rejects.toThrow("AGENCY_ACCESS_DENIED")
    await expect(getPurchaseOrderSummary({ agencyId: otherAgencyId })).rejects.toThrow("AGENCY_ACCESS_DENIED")
  })
  it.each(["supplier", "client", "product", "approver"])("excludes a foreign %s from list and summary", async kind => {
    if (kind === "supplier") await prisma.purchaseOrder.update({ where: { id: oldestId }, data: { supplierId: foreignSupplierId } })
    if (kind === "client") await prisma.project.update({ where: { id: projectId }, data: { clientId: foreignClientId } })
    if (kind === "product") await prisma.purchaseOrderLine.update({ where: { id: lineId }, data: { productId: foreignProductId } })
    if (kind === "approver") await prisma.purchaseOrder.update({ where: { id: oldestId }, data: { approvedByMembershipId: foreignMemberId } })
    expect(await getPurchaseOrderDirectory({ search: "COMPLETE-000" })).toMatchObject({ total: 0, items: [] })
    expect((await getPurchaseOrderSummary({ agencyId })).activeCount).toBe(kind === "client" ? 0 : 150)
  })
  it("rereads revoked assignments and suspended memberships", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "OPERATIONS" } })
    await prisma.agencyMembership.deleteMany({ where: { membershipId, agencyId } })
    try {
      expect(await getPurchaseOrderDirectory()).toMatchObject({ total: 0, items: [] })
      expect(await getPurchaseOrderSummary()).toMatchObject({ activeCount: 0, items: [] })
    } finally { await prisma.agencyMembership.create({ data: { membershipId, agencyId } }) }
    await prisma.membership.update({ where: { id: membershipId }, data: { status: "SUSPENDED" } })
    await expect(getPurchaseOrderDirectory()).rejects.toThrow("plus accès")
    await expect(getPurchaseOrderSummary()).rejects.toThrow("plus accès")
  })
  it("keeps Viewer and public demo reads without mutation controls", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "VIEWER" } })
    expect(await getPurchaseOrderDirectory()).toMatchObject({ total: 252, canManagePurchases: false, canApprovePurchases: false })
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "OWNER" } })
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    expect(await getPurchaseOrderDirectory()).toMatchObject({ total: 254, canManagePurchases: false, canApprovePurchases: false })
  })
  it.each([{ page: 0 }, { page: 100001 }, { search: "x".repeat(201) }, { status: "INVALID" }, { agencyId: "invalid" }, { extra: true }])("rejects malformed directory input: %j", async input => {
    await expect(getPurchaseOrderDirectory(input)).rejects.toThrow()
  })
})
