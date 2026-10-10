import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
import prisma from "@/lib/prisma"
import { createInvoiceFromCustomerOrder } from "@/actions/operations"

describe.sequential("Order billing reference diagnostic on real SQL", () => {
  let foreignCompanyId: string, clientId: string, foreignClientId: string, projectId: string, invalidProjectId: string, foreignProjectId: string, otherClientId: string, otherProjectId: string
  beforeAll(async () => {
    session.companyId = (await prisma.company.create({ data: { name: "Fictional order billing reference diagnostic" } })).id
    foreignCompanyId = (await prisma.company.create({ data: { name: "Foreign order billing diagnostic" } })).id
    session.userId = (await prisma.user.create({ data: { email: `order-billing-reference-${randomUUID()}@example.test` } })).id
    await prisma.membership.create({ data: { companyId: session.companyId, userId: session.userId, role: "OWNER", status: "ACTIVE" } })
    clientId = (await prisma.client.create({ data: { companyId: session.companyId, name: "Local diagnostic client" } })).id
    foreignClientId = (await prisma.client.create({ data: { companyId: foreignCompanyId, name: "Foreign diagnostic client" } })).id
    projectId = (await prisma.project.create({ data: { companyId: session.companyId, clientId, name: "Local diagnostic project" } })).id
    invalidProjectId = (await prisma.project.create({ data: { companyId: session.companyId, clientId: foreignClientId, name: "Inconsistent diagnostic project" } })).id
    foreignProjectId = (await prisma.project.create({ data: { companyId: foreignCompanyId, clientId: foreignClientId, name: "Foreign diagnostic project" } })).id
    otherClientId = (await prisma.client.create({ data: { companyId: session.companyId, name: "Other local client" } })).id
    otherProjectId = (await prisma.project.create({ data: { companyId: session.companyId, clientId: otherClientId, name: "Other local project" } })).id
  })
  afterEach(async () => {
    vi.restoreAllMocks()
    await prisma.project.update({ where: { id: projectId }, data: { clientId } })
    await prisma.invoice.deleteMany({ where: { companyId: session.companyId } })
    await prisma.customerOrder.deleteMany({ where: { companyId: session.companyId } })
    await prisma.auditLog.deleteMany({ where: { userId: session.userId } })
  })
  afterAll(async () => {
    await prisma.project.deleteMany({ where: { companyId: { in: [session.companyId, foreignCompanyId] } } })
    await prisma.client.deleteMany({ where: { companyId: { in: [session.companyId, foreignCompanyId] } } })
    await prisma.company.deleteMany({ where: { id: { in: [session.companyId, foreignCompanyId] } } })
    await prisma.user.delete({ where: { id: session.userId } })
  })
  for (const mode of ["DEPOSIT", "BALANCE"] as const) {
    for (const reference of ["foreign client", "foreign project client", "foreign project", "other local client"]) {
      it(`refuses ${mode} with ${reference} without changing SQL`, async () => {
        const order = await prisma.customerOrder.create({ data: { companyId: session.companyId, clientId: reference === "foreign client" ? foreignClientId : clientId, projectId: reference === "other local client" ? otherProjectId : reference === "foreign project" ? foreignProjectId : reference === "foreign project client" ? invalidProjectId : projectId, number: randomUUID(), totalHtCents: 10000, totalTvaCents: 2000, totalTtcCents: 12000, depositCents: 3000 } })
        let error: string | null = null
        try { await createInvoiceFromCustomerOrder({ customerOrderId: order.id, mode }) }
        catch (cause) { error = cause instanceof Error ? cause.message : String(cause) }
        const persisted = await prisma.customerOrder.findUniqueOrThrow({ where: { id: order.id } })
        expect({ error, invoices: await prisma.invoice.count({ where: { customerOrderId: order.id } }), billingStatus: persisted.billingStatus, audits: await prisma.auditLog.count({ where: { userId: session.userId } }) }).toEqual({ error: "Commande client introuvable", invoices: 0, billingStatus: "NOT_INVOICED", audits: 0 })
      })
    }
    it(`preserves a coherent ${mode} draft`, async () => {
      const order = await prisma.customerOrder.create({ data: { companyId: session.companyId, clientId, projectId, number: randomUUID(), totalHtCents: 10000, totalTvaCents: 2000, totalTtcCents: 12000, depositCents: 3000 } })
      const result = await createInvoiceFromCustomerOrder({ customerOrderId: order.id, mode })
      expect(result.success).toBe(true)
      expect(await prisma.invoice.findUnique({ where: { id: result.id } })).toMatchObject({ companyId: session.companyId, clientId, projectId, status: "DRAFT", totalTtcCents: mode === "DEPOSIT" ? 3000 : 12000 })
    })
    it(`rechecks a changed project client before claiming ${mode}`, async () => {
      const order = await prisma.customerOrder.create({ data: { companyId: session.companyId, clientId, projectId, number: randomUUID(), totalHtCents: 10000, totalTvaCents: 2000, totalTtcCents: 12000, depositCents: 3000 } })
      const findOrder = prisma.customerOrder.findFirst.bind(prisma.customerOrder)
      vi.spyOn(prisma.customerOrder, "findFirst").mockImplementationOnce((async (...args: Parameters<typeof findOrder>) => {
        const initial = await findOrder(...args)
        await prisma.project.update({ where: { id: projectId }, data: { clientId: otherClientId } })
        return initial
      }) as typeof prisma.customerOrder.findFirst)
      await expect(createInvoiceFromCustomerOrder({ customerOrderId: order.id, mode })).rejects.toThrow("Commande client introuvable")
      expect(await prisma.invoice.count({ where: { customerOrderId: order.id } })).toBe(0)
      expect((await prisma.customerOrder.findUniqueOrThrow({ where: { id: order.id } })).billingStatus).toBe("NOT_INVOICED")
      expect(await prisma.auditLog.count({ where: { userId: session.userId } })).toBe(0)
    })
    it(`allows ${mode} without a project for Owner`, async () => {
      const order = await prisma.customerOrder.create({ data: { companyId: session.companyId, clientId, number: randomUUID(), totalHtCents: 10000, totalTvaCents: 2000, totalTtcCents: 12000, depositCents: 3000 } })
      const result = await createInvoiceFromCustomerOrder({ customerOrderId: order.id, mode })
      expect(await prisma.invoice.findUnique({ where: { id: result.id } })).toMatchObject({ clientId, projectId: null, status: "DRAFT" })
    })
  }
})
