import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"

type ReadGate = { model: "invoice" | "bankTransaction"; arrived: number; values: unknown[]; wait: Promise<void>; release: () => void }
const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
const coordination = vi.hoisted(() => ({ gate: null as ReadGate | null }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/prisma", async importOriginal => {
  const prismaModule = await importOriginal<typeof import("@/lib/prisma")>()
  const real = prismaModule.default
  const transaction = real.$transaction.bind(real)
  type Callback = Parameters<typeof transaction>[0]
  const scheduled = (callback: Callback, options?: Parameters<typeof transaction>[1]) => transaction(async tx => {
    let observed = false
    const scheduledTx = new Proxy(tx, {
      get(target, model) {
        const delegate = Reflect.get(target, model)
        if (!coordination.gate || model !== coordination.gate.model) return delegate
        return new Proxy(delegate, {
          get(modelTarget, operation) {
            const read = Reflect.get(modelTarget, operation)
            if (operation !== "findFirst") return read
            return async (...args: unknown[]) => {
              const value = await Reflect.apply(read, modelTarget, args)
              const gate = coordination.gate
              if (gate && !observed && gate.arrived < 2) {
                observed = true
                gate.values.push(value)
                if (++gate.arrived === 2) gate.release()
                await gate.wait
              }
              return value
            }
          },
        })
      },
    })
    return callback(scheduledTx)
  }, options)
  // The actions await interactive transactions. Only their read scheduling is
  // instrumented; real SQL, the DAL, writes, rollback and authentication remain.
  return { ...prismaModule, default: new Proxy(real, { get(target, key) { return key === "$transaction" ? scheduled : Reflect.get(target, key) } }) }
})
import prisma from "@/lib/prisma"
import { createExpenseFromTransaction, matchTransactionToExpense, matchTransactionToInvoice } from "@/actions/bank"

async function concurrent<T>(model: ReadGate["model"], actions: Array<() => Promise<T>>) {
  // SQLite serializes these interactive transactions on its single connection.
  // PostgreSQL must also pass with both actors forced to read the initial state.
  const postgres = process.env.DATABASE_URL?.startsWith("postgres")
  let release!: () => void
  const wait = new Promise<void>(resolve => { release = resolve })
  const gate: ReadGate = { model, arrived: 0, values: [], wait, release }
  const deadline = setTimeout(release, 2000)
  if (postgres) coordination.gate = gate
  try {
    const settled = await Promise.allSettled(actions.map(action => action()))
    if (postgres) {
      expect(gate.arrived).toBe(2)
      expect(gate.values).toEqual(Array.from({ length: 2 }, () => expect.objectContaining(model === "invoice" ? { paidAmountCents: 0 } : { matchedExpenseId: null, matchedPaymentId: null })))
    }
    return settled
  } finally { release(); clearTimeout(deadline); coordination.gate = null }
}

describe.sequential("bank reconciliation preserves persisted payment and expense invariants", () => {
  let invoiceIds: string[]
  beforeAll(async () => {
    const companyId = session.companyId = (await prisma.company.create({ data: { name: "Fictional bank reconciliation" } })).id
    session.userId = (await prisma.user.create({ data: { email: `bank-match-${randomUUID()}@example.test` } })).id
    await prisma.membership.create({ data: { companyId, userId: session.userId, role: "OWNER", status: "ACTIVE" } })
    const client = await prisma.client.create({ data: { companyId, name: "Fictional payment client" } })
    const invoices = await Promise.all([0, 1].map(index => prisma.invoice.create({ data: { companyId, clientId: client.id, number: `FICTIONAL-${index}`, object: "Fictional reconciliation", status: "SENT", dueDate: new Date("2030-01-01"), totalHtCents: 200, totalTvaCents: 0, totalTtcCents: 200 } })))
    invoiceIds = invoices.map(invoice => invoice.id)
  })
  afterEach(async () => {
    await prisma.bankTransaction.deleteMany({ where: { companyId: session.companyId } })
    await prisma.invoicePayment.deleteMany({ where: { invoice: { companyId: session.companyId } } })
    await prisma.invoice.updateMany({ where: { companyId: session.companyId }, data: { paidAmountCents: 0, status: "SENT" } })
    await prisma.expense.deleteMany({ where: { companyId: session.companyId } })
    await prisma.auditLog.deleteMany({ where: { userId: session.userId } })
  })
  afterAll(async () => {
    await prisma.invoice.deleteMany({ where: { companyId: session.companyId } })
    await prisma.client.deleteMany({ where: { companyId: session.companyId } })
    await prisma.company.delete({ where: { id: session.companyId } })
    await prisma.user.delete({ where: { id: session.userId } })
  })
  const movement = (amountCents: number) => prisma.bankTransaction.create({ data: { companyId: session.companyId, date: new Date("2030-01-01"), label: "Fictional reconciliation movement", amountCents, fingerprint: randomUUID() } })
  it("retains partial payment, settles the exact balance and refuses a replay", async () => {
    const first = await movement(50), second = await movement(150)
    await matchTransactionToInvoice(first.id, invoiceIds[0])
    expect(await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceIds[0] } })).toMatchObject({ paidAmountCents: 50, status: "SENT" })
    await matchTransactionToInvoice(second.id, invoiceIds[0])
    expect(await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceIds[0] } })).toMatchObject({ paidAmountCents: 200, status: "PAID" })
    await expect(matchTransactionToInvoice(second.id, invoiceIds[0])).rejects.toThrow("déjà rapprochée")
    expect(await prisma.invoicePayment.count({ where: { invoiceId: invoiceIds[0] } })).toBe(2)
  })
  it("does not lose either of two eligible concurrent payments on one invoice", async () => {
    const first = await movement(100), second = await movement(100)
    const results = await concurrent("invoice", [() => matchTransactionToInvoice(first.id, invoiceIds[0]), () => matchTransactionToInvoice(second.id, invoiceIds[0])])
    expect(results.map(result => result.status)).toEqual(["fulfilled", "fulfilled"])
    expect(await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceIds[0] } })).toMatchObject({ paidAmountCents: 200, status: "PAID" })
    expect((await prisma.invoicePayment.aggregate({ where: { invoiceId: invoiceIds[0] }, _sum: { amountCents: true } }))._sum.amountCents).toBe(200)
    expect(await prisma.bankTransaction.count({ where: { companyId: session.companyId, matchedPaymentId: { not: null } } })).toBe(2)
  })
  it("uses a bank credit only once when two different invoices compete", async () => {
    const credit = await movement(100)
    const results = await concurrent("bankTransaction", invoiceIds.map(invoiceId => () => matchTransactionToInvoice(credit.id, invoiceId)))
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1)
    expect(await prisma.invoicePayment.count({ where: { invoice: { companyId: session.companyId } } })).toBe(1)
    expect((await prisma.invoice.aggregate({ where: { companyId: session.companyId }, _sum: { paidAmountCents: true } }))._sum.paidAmountCents).toBe(100)
    expect((await prisma.bankTransaction.findUniqueOrThrow({ where: { id: credit.id } })).matchedPaymentId).not.toBeNull()
  })
  it("creates exactly one expense when a bank debit is converted concurrently", async () => {
    const debit = await movement(-100)
    const results = await concurrent("bankTransaction", [() => createExpenseFromTransaction(debit.id), () => createExpenseFromTransaction(debit.id)])
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1)
    expect(await prisma.expense.count({ where: { companyId: session.companyId } })).toBe(1)
    expect((await prisma.bankTransaction.findUniqueOrThrow({ where: { id: debit.id } })).matchedExpenseId).not.toBeNull()
  })
  it("does not overwrite an expense match when two existing expenses compete", async () => {
    const debit = await movement(-100)
    const expenses = await Promise.all([0, 1].map(index => prisma.expense.create({ data: { companyId: session.companyId, label: `Fictional expense ${index}`, amountCents: 100, category: "Autre", date: debit.date } })))
    const results = await concurrent("bankTransaction", expenses.map(expense => () => matchTransactionToExpense(debit.id, expense.id)))
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1)
    expect(await prisma.expense.count({ where: { companyId: session.companyId } })).toBe(2)
    expect(expenses.map(expense => expense.id)).toContain((await prisma.bankTransaction.findUniqueOrThrow({ where: { id: debit.id } })).matchedExpenseId)
  })
})
