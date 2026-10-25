import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
import prisma from "@/lib/prisma"
import { createInvoiceFromCustomerOrder, getOperationsDashboard } from "@/actions/operations"

describe.sequential("Operations order billing permissions on real SQL", () => {
  let membershipId: string, agencyId: string, orderId: string, invoiceId: string
  beforeAll(async () => {
    session.companyId = (await prisma.company.create({ data: { name: "Fictional order billing permissions" } })).id
    session.userId = (await prisma.user.create({ data: { email: `order-billing-${randomUUID()}@example.test` } })).id
    membershipId = (await prisma.membership.create({ data: { companyId: session.companyId, userId: session.userId, role: "OWNER", status: "ACTIVE" } })).id
    agencyId = (await prisma.agency.create({ data: { companyId: session.companyId, code: "LOCAL", name: "Fictional agency" } })).id
    await prisma.agencyMembership.create({ data: { agencyId, membershipId } })
    const client = await prisma.client.create({ data: { companyId: session.companyId, name: "Fictional order client" } })
    const project = await prisma.project.create({ data: { companyId: session.companyId, clientId: client.id, agencyId, name: "Fictional project" } })
    orderId = (await prisma.customerOrder.create({ data: { companyId: session.companyId, clientId: client.id, projectId: project.id, number: "BILLING", billingStatus: "INVOICED", totalTtcCents: 1200 } })).id
    invoiceId = (await prisma.invoice.create({ data: { companyId: session.companyId, clientId: client.id, projectId: project.id, customerOrderId: orderId, number: "BILLING", object: "Fictional invoice", dueDate: new Date("2030-01-01"), status: "ISSUED", totalHtCents: 1000, totalTvaCents: 200, totalTtcCents: 1200 } })).id
  })
  afterEach(async () => {
    vi.unstubAllEnvs()
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "OWNER" } })
  })
  afterAll(async () => {
    const where = { companyId: session.companyId }
    await prisma.invoice.deleteMany({ where })
    await prisma.customerOrder.deleteMany({ where })
    await prisma.project.deleteMany({ where })
    await prisma.client.deleteMany({ where })
    await prisma.company.delete({ where: { id: session.companyId } })
    await prisma.user.delete({ where: { id: session.userId } })
  })
  async function read() {
    const dashboard = await getOperationsDashboard()
    const order = dashboard.customerOrders.find(item => item.id === orderId)
    expect(order).toBeDefined()
    return { dashboard, order }
  }
  it.each(["TECHNICIAN", "OPERATIONS", "SERVICE"].flatMap(role => ["invoices", "count", "status"].map(field => ({ role, field }))))("excludes $field for $role without Finance", async ({ role, field }) => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    const { dashboard, order } = await read()
    if (field === "invoices") expect(order?.invoices).toEqual([])
    if (field === "count") expect(order?._count.invoices).toBeNull()
    if (field === "status") expect(order?.billingStatus).toBeNull()
    expect(dashboard.canBillOrders).toBe(false)
    expect(order).toMatchObject({ status: "CONFIRMED", totalTtcCents: 1200 })
  })
  it.each(["OWNER", "ADMIN", "ACCOUNTING"])("preserves Finance metadata and billing availability for %s", async role => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    const { dashboard, order } = await read()
    expect(order?.invoices.map(item => item.id)).toEqual([invoiceId])
    expect(order?._count.invoices).toBe(1)
    expect(order?.billingStatus).toBe("INVOICED")
    expect(dashboard.canBillOrders).toBe(true)
  })
  it("preserves Finance reads without billing commands for Viewer", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "VIEWER" } })
    const { dashboard, order } = await read()
    expect(order?.invoices.map(item => item.id)).toEqual([invoiceId])
    expect(order?._count.invoices).toBe(1)
    expect(order?.billingStatus).toBe("INVOICED")
    expect(dashboard.canBillOrders).toBe(false)
    await expect(createInvoiceFromCustomerOrder({ customerOrderId: orderId, mode: "BALANCE" })).rejects.toThrow("droits nécessaires")
  })
  it("reevaluates a role change in the same session", async () => {
    expect((await read()).dashboard.canBillOrders).toBe(true)
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "TECHNICIAN" } })
    const { dashboard, order } = await read()
    expect(dashboard.canBillOrders).toBe(false)
    expect(order).toMatchObject({ invoices: [], billingStatus: null, _count: { invoices: null } })
  })
  it("does not offer billing in the public read-only demo", async () => {
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    expect((await read()).dashboard.canBillOrders).toBe(false)
    await expect(createInvoiceFromCustomerOrder({ customerOrderId: orderId, mode: "BALANCE" })).rejects.toThrow("lecture seule")
    expect(await prisma.invoice.count({ where: { companyId: session.companyId } })).toBe(1)
  })
  it("removes the order after agency access is revoked", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "TECHNICIAN" } })
    await read()
    await prisma.agencyMembership.deleteMany({ where: { membershipId, agencyId } })
    try { expect((await getOperationsDashboard()).customerOrders).toEqual([]) }
    finally { await prisma.agencyMembership.create({ data: { membershipId, agencyId } }) }
  })
})
