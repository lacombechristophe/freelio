import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
import prisma from "@/lib/prisma"
import { createInvoiceFromCustomerOrder } from "@/actions/operations"

describe.sequential("Order linked invoice coherence diagnostic on real SQL", () => {
  let foreignCompanyId: string, clientId: string, otherClientId: string, foreignClientId: string, projectId: string, otherProjectId: string, membershipId: string
  beforeAll(async () => {
    session.companyId = (await prisma.company.create({ data: { name: "Fictitious linked invoice diagnostic" } })).id
    foreignCompanyId = (await prisma.company.create({ data: { name: "Foreign linked invoice diagnostic" } })).id
    session.userId = (await prisma.user.create({ data: { email: `linked-invoice-${randomUUID()}@example.test` } })).id
    membershipId = (await prisma.membership.create({ data: { companyId: session.companyId, userId: session.userId, role: "OWNER", status: "ACTIVE" } })).id
    const agency = await prisma.agency.create({ data: { companyId: session.companyId, code: "LOCAL", name: "Linked invoice agency" } })
    await prisma.agencyMembership.create({ data: { membershipId, agencyId: agency.id } })
    clientId = (await prisma.client.create({ data: { companyId: session.companyId, name: "Order client" } })).id
    otherClientId = (await prisma.client.create({ data: { companyId: session.companyId, name: "Other local client" } })).id
    foreignClientId = (await prisma.client.create({ data: { companyId: foreignCompanyId, name: "Foreign client" } })).id
    projectId = (await prisma.project.create({ data: { companyId: session.companyId, clientId, agencyId: agency.id, name: "Order project" } })).id
    otherProjectId = (await prisma.project.create({ data: { companyId: session.companyId, clientId, name: "Other local project" } })).id
  })
  afterEach(async () => {
    vi.restoreAllMocks()
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "OWNER" } })
    await prisma.invoice.deleteMany({ where: { companyId: { in: [session.companyId, foreignCompanyId] } } })
    await prisma.customerOrder.deleteMany({ where: { companyId: session.companyId } })
    await prisma.auditLog.deleteMany({ where: { userId: session.userId } })
  })
  afterAll(async () => {
    await prisma.project.deleteMany({ where: { companyId: session.companyId } })
    await prisma.client.deleteMany({ where: { companyId: { in: [session.companyId, foreignCompanyId] } } })
    await prisma.company.deleteMany({ where: { id: { in: [session.companyId, foreignCompanyId] } } })
    await prisma.user.delete({ where: { id: session.userId } })
  })
  for (const mode of ["DEPOSIT", "BALANCE"] as const) {
    for (const relation of ["foreign company", "other client", "other project", "missing project", "coherent", "changed after read", "Accounting"]) {
      it(`${mode} with ${relation} invoice`, async () => {
        const order = await prisma.customerOrder.create({ data: { companyId: session.companyId, clientId, projectId, number: randomUUID(), totalHtCents: 10000, totalTvaCents: 2000, totalTtcCents: 12000, depositCents: 3000 } })
        const linked = await prisma.invoice.create({ data: { companyId: relation === "foreign company" ? foreignCompanyId : session.companyId, clientId: relation === "foreign company" ? foreignClientId : relation === "other client" ? otherClientId : clientId, projectId: ["foreign company", "missing project"].includes(relation) ? null : relation === "other project" ? otherProjectId : projectId, customerOrderId: order.id, number: randomUUID(), object: "Fictitious linked deposit", dueDate: new Date("2030-01-01"), type: "DEPOSIT", status: "DRAFT", totalHtCents: 2500, totalTvaCents: 500, totalTtcCents: 3000 } })
        if (relation === "Accounting") await prisma.membership.update({ where: { id: membershipId }, data: { role: "ACCOUNTING" } })
        if (relation === "changed after read") {
          const findOrder = prisma.customerOrder.findFirst.bind(prisma.customerOrder)
          vi.spyOn(prisma.customerOrder, "findFirst").mockImplementationOnce((async (...args: Parameters<typeof findOrder>) => {
            const initial = await findOrder(...args)
            await prisma.invoice.update({ where: { id: linked.id }, data: { clientId: otherClientId } })
            return initial
          }) as typeof prisma.customerOrder.findFirst)
        }
        let error: string | null = null, returnedLinkedInvoice = false
        try {
          const result = await createInvoiceFromCustomerOrder({ customerOrderId: order.id, mode })
          returnedLinkedInvoice = result.id === linked.id
        } catch (cause) { error = cause instanceof Error ? cause.message : String(cause) }
        if (["coherent", "Accounting"].includes(relation)) {
          expect(error).toBeNull()
          if (mode === "DEPOSIT") expect(returnedLinkedInvoice).toBe(true)
          else expect(await prisma.invoice.findFirst({ where: { customerOrderId: order.id, type: "STANDARD" } })).toMatchObject({ clientId, projectId, totalTtcCents: 9000 })
        } else {
          expect({ error, returnedLinkedInvoice, invoices: await prisma.invoice.count({ where: { customerOrderId: order.id } }), billingStatus: (await prisma.customerOrder.findUniqueOrThrow({ where: { id: order.id } })).billingStatus, audits: await prisma.auditLog.count({ where: { userId: session.userId } }) }).toEqual({ error: "Commande client introuvable", returnedLinkedInvoice: false, invoices: 1, billingStatus: "NOT_INVOICED", audits: 0 })
        }
      })
    }
  }
})
