import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
import prisma from "@/lib/prisma"
import { createInvoiceFromCustomerOrder } from "@/actions/operations"
import { getCustomerOrderDirectory } from "@/actions/operations-orders"
import { requestContext } from "@/lib/context"

describe.sequential("Finance roles actually create order invoice drafts on SQL", () => {
  let membershipId: string, clientId: string, projectId: string, agencyId: string
  beforeAll(async () => {
    session.companyId = (await prisma.company.create({ data: { name: "Fictional order billing role diagnostic" } })).id
    session.userId = (await prisma.user.create({ data: { email: `order-billing-role-${randomUUID()}@example.test` } })).id
    membershipId = (await prisma.membership.create({ data: { companyId: session.companyId, userId: session.userId, role: "OWNER", status: "ACTIVE" } })).id
    const agency = await prisma.agency.create({ data: { companyId: session.companyId, code: "LOCAL", name: "Fictional billing agency" } })
    agencyId = agency.id
    await prisma.agencyMembership.create({ data: { agencyId: agency.id, membershipId } })
    clientId = (await prisma.client.create({ data: { companyId: session.companyId, name: "Local billing role client" } })).id
    projectId = (await prisma.project.create({ data: { companyId: session.companyId, clientId, agencyId: agency.id, name: "Local billing role project" } })).id
  })
  afterEach(async () => {
    vi.unstubAllEnvs()
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "OWNER" } })
    await prisma.invoice.deleteMany({ where: { companyId: session.companyId } })
    await prisma.customerOrder.deleteMany({ where: { companyId: session.companyId } })
    await prisma.auditLog.deleteMany({ where: { userId: session.userId } })
  })
  async function newOrder() {
    return prisma.customerOrder.create({ data: { companyId: session.companyId, clientId, projectId, number: randomUUID(), totalHtCents: 10000, totalTvaCents: 2000, totalTtcCents: 12000, depositCents: 3000 } })
  }
  for (const mode of ["DEPOSIT", "BALANCE"] as const) {
    it(`refuses ${mode} after Accounting loses agency access`, async () => {
      const order = await newOrder()
      await prisma.membership.update({ where: { id: membershipId }, data: { role: "ACCOUNTING" } })
      await prisma.agencyMembership.deleteMany({ where: { membershipId, agencyId } })
      try {
        await expect(createInvoiceFromCustomerOrder({ customerOrderId: order.id, mode })).rejects.toThrow("Commande client introuvable")
        expect(await prisma.invoice.count({ where: { customerOrderId: order.id } })).toBe(0)
      } finally { await prisma.agencyMembership.create({ data: { membershipId, agencyId } }) }
    })
    it(`refuses ${mode} in the public demo`, async () => {
      const order = await newOrder()
      await prisma.membership.update({ where: { id: membershipId }, data: { role: "ACCOUNTING" } })
      vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
      await expect(createInvoiceFromCustomerOrder({ customerOrderId: order.id, mode })).rejects.toThrow("lecture seule")
      expect(await prisma.invoice.count({ where: { customerOrderId: order.id } })).toBe(0)
    })
    it(`refuses ${mode} for Viewer before billing`, async () => {
      const order = await newOrder()
      await prisma.membership.update({ where: { id: membershipId }, data: { role: "VIEWER" } })
      await expect(createInvoiceFromCustomerOrder({ customerOrderId: order.id, mode })).rejects.toThrow("droits nécessaires")
      expect(await prisma.invoice.count({ where: { customerOrderId: order.id } })).toBe(0)
    })
  }
  it.each(["price", "mixed", "update", "delete", "create", "no Finance context", "Viewer"])("keeps %s outside the Finance claim permission", async kind => {
    const order = await newOrder()
    const context = { userId: session.userId, companyId: session.companyId, membershipId, agencyIds: [agencyId], role: kind === "Viewer" ? "VIEWER" as const : "ACCOUNTING" as const, actionPermission: kind === "no Finance context" ? undefined : "finance.write" as const }
    await expect(requestContext.run(context, async () => {
      if (kind === "create") return prisma.customerOrder.create({ data: { companyId: session.companyId, clientId, projectId, number: randomUUID() } })
      if (kind === "delete") return prisma.customerOrder.delete({ where: { id: order.id } })
      if (kind === "update") return prisma.customerOrder.update({ where: { id: order.id }, data: { billingStatus: "INVOICED" } })
      return prisma.customerOrder.updateMany({ where: { id: order.id }, data: kind === "price" ? { totalTtcCents: 1 } : kind === "mixed" ? { billingStatus: "INVOICED", totalTtcCents: 1 } : { billingStatus: "INVOICED" } })
    })).rejects.toThrow("FORBIDDEN:operations.write")
    expect(await prisma.customerOrder.findUnique({ where: { id: order.id } })).toMatchObject({ billingStatus: "NOT_INVOICED", totalTtcCents: 12000 })
  })
  afterAll(async () => {
    await prisma.project.deleteMany({ where: { companyId: session.companyId } })
    await prisma.client.deleteMany({ where: { companyId: session.companyId } })
    await prisma.company.delete({ where: { id: session.companyId } })
    await prisma.user.delete({ where: { id: session.userId } })
  })
  for (const role of ["OWNER", "ADMIN", "ACCOUNTING"]) {
    for (const mode of ["DEPOSIT", "BALANCE"] as const) {
      it(`creates a coherent ${mode} draft for ${role}`, async () => {
        const order = await prisma.customerOrder.create({ data: { companyId: session.companyId, clientId, projectId, number: randomUUID(), totalHtCents: 10000, totalTvaCents: 2000, totalTtcCents: 12000, depositCents: 3000 } })
        await prisma.membership.update({ where: { id: membershipId }, data: { role } })
        expect((await getCustomerOrderDirectory()).canBillOrders).toBe(true)
        let error: string | null = null
        try { await createInvoiceFromCustomerOrder({ customerOrderId: order.id, mode }) }
        catch (cause) { error = cause instanceof Error ? cause.message : String(cause) }
        expect(error).toBeNull()
        const invoice = await prisma.invoice.findFirst({ where: { customerOrderId: order.id } })
        expect({ error, invoice: invoice ? { status: invoice.status, totalTtcCents: invoice.totalTtcCents } : null }).toEqual({ error: null, invoice: { status: "DRAFT", totalTtcCents: mode === "DEPOSIT" ? 3000 : 12000 } })
      })
    }
  }
})
