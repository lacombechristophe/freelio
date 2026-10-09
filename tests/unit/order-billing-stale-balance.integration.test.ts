import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
import prisma from "@/lib/prisma"
import { createInvoiceFromCustomerOrder } from "@/actions/operations"

describe.sequential("order billing after a linked draft changes", () => {
  let clientId: string, projectId: string
  beforeAll(async () => {
    session.companyId = (await prisma.company.create({ data: { name: "Fictitious order amount diagnostic" } })).id
    session.userId = (await prisma.user.create({ data: { email: `order-amount-${randomUUID()}@example.test` } })).id
    await prisma.membership.create({ data: { companyId: session.companyId, userId: session.userId, role: "OWNER", status: "ACTIVE" } })
    clientId = (await prisma.client.create({ data: { companyId: session.companyId, name: "Order amount client" } })).id
    projectId = (await prisma.project.create({ data: { companyId: session.companyId, clientId, name: "Order amount project" } })).id
  })
  afterAll(async () => {
    vi.restoreAllMocks()
    await prisma.invoice.deleteMany({ where: { companyId: session.companyId } })
    await prisma.customerOrder.deleteMany({ where: { companyId: session.companyId } })
    await prisma.auditLog.deleteMany({ where: { userId: session.userId } })
    await prisma.project.deleteMany({ where: { companyId: session.companyId } })
    await prisma.client.deleteMany({ where: { companyId: session.companyId } })
    await prisma.company.delete({ where: { id: session.companyId } })
    await prisma.user.delete({ where: { id: session.userId } })
  })
  afterEach(async () => {
    vi.restoreAllMocks()
    await prisma.invoice.deleteMany({ where: { companyId: session.companyId } })
    await prisma.customerOrder.deleteMany({ where: { companyId: session.companyId } })
    await prisma.auditLog.deleteMany({ where: { userId: session.userId } })
  })
  for (const mode of ["DEPOSIT", "BALANCE"] as const) {
    for (const mutation of ["amount", "status", "unchanged"]) {
      it(`${mode} rechecks ${mutation} and allows a fresh retry`, async () => {
        const order = await prisma.customerOrder.create({ data: { companyId: session.companyId, clientId, projectId, number: randomUUID(), totalHtCents: 10000, totalTvaCents: 2000, totalTtcCents: 12000, billingStatus: "PARTIALLY_INVOICED", depositCents: 3000 } })
        const linked = await prisma.invoice.create({ data: { companyId: session.companyId, clientId, projectId, customerOrderId: order.id, number: randomUUID(), object: "Fictitious deposit", dueDate: new Date("2030-01-01"), type: "DEPOSIT", status: "DRAFT", totalHtCents: 2500, totalTvaCents: 500, totalTtcCents: 3000 } })
        if (mutation !== "unchanged") {
        const findOrder = prisma.customerOrder.findFirst.bind(prisma.customerOrder)
        vi.spyOn(prisma.customerOrder, "findFirst").mockImplementationOnce((async (...args: Parameters<typeof findOrder>) => {
          const initial = await findOrder(...args)
          await prisma.invoice.update({ where: { id: linked.id }, data: mutation === "amount" ? { totalHtCents: 5000, totalTvaCents: 1000, totalTtcCents: 6000 } : { status: "CANCELLED" } })
          return initial
        }) as typeof prisma.customerOrder.findFirst)
        }
        let error: string | null = null
        let firstResult: Awaited<ReturnType<typeof createInvoiceFromCustomerOrder>> | undefined
        try { firstResult = await createInvoiceFromCustomerOrder({ customerOrderId: order.id, mode }) }
        catch (cause) { error = cause instanceof Error ? cause.message : String(cause) }
        const invoices = await prisma.invoice.findMany({ where: { customerOrderId: order.id } })
        if (mutation !== "unchanged") {
          expect(error).toBe("La facturation de cette commande a changé. Rechargez la page puis réessayez.")
          expect(invoices).toHaveLength(1)
          expect(invoices[0]).toMatchObject(mutation === "amount" ? { totalTtcCents: 6000, status: "DRAFT" } : { totalTtcCents: 3000, status: "CANCELLED" })
          expect((await prisma.customerOrder.findUniqueOrThrow({ where: { id: order.id } })).billingStatus).toBe("PARTIALLY_INVOICED")
          expect(await prisma.auditLog.count({ where: { userId: session.userId } })).toBe(0)
        } else expect(error).toBeNull()
        const result = mutation === "unchanged" ? firstResult : await createInvoiceFromCustomerOrder({ customerOrderId: order.id, mode })
        expect(result).toBeDefined()
        const expectedTtc = mode === "DEPOSIT" ? mutation === "amount" ? 6000 : 3000 : mutation === "amount" ? 6000 : mutation === "status" ? 12000 : 9000
        expect(await prisma.invoice.findUnique({ where: { id: result!.id } })).toMatchObject({ totalTtcCents: expectedTtc, status: "DRAFT" })
        const active = await prisma.invoice.findMany({ where: { customerOrderId: order.id, status: { not: "CANCELLED" } } })
        expect(active.reduce((sum, invoice) => sum + invoice.totalTtcCents, 0)).toBe(mode === "BALANCE" ? 12000 : expectedTtc)
      })
    }
  }
})
