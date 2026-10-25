import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"

type ReadGate = { arrived: number; values: unknown[]; wait: Promise<void>; release: () => void }
const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
const coordination = vi.hoisted(() => ({ gate: null as ReadGate | null }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/prisma", async importOriginal => {
  const prismaModule = await importOriginal<typeof import("@/lib/prisma")>()
  const real = prismaModule.default
  const transaction = real.$transaction.bind(real)
  async function observe(value: unknown) {
    const gate = coordination.gate
    if (gate && gate.arrived < 2) {
      gate.values.push(value)
      if (++gate.arrived === 2) gate.release()
      await gate.wait
    }
    return value
  }
  function invoice(delegate: typeof real.invoice) {
    return new Proxy(delegate, { get(target, key) {
      const operation = Reflect.get(target, key)
      if (key !== "findFirst") return operation
      return async (...args: unknown[]) => observe(await Reflect.apply(operation, target, args))
    } })
  }
  const scheduled = (callback: Parameters<typeof transaction>[0], options?: Parameters<typeof transaction>[1]) => transaction(tx => callback(new Proxy(tx, {
    get(target, key) { return key === "invoice" ? invoice(target.invoice) : Reflect.get(target, key) },
  })), options)
  return { ...prismaModule, default: new Proxy(real, { get(target, key) {
    if (key === "$transaction") return scheduled
    if (key === "invoice") return invoice(target.invoice)
    return Reflect.get(target, key)
  } }) }
})
import prisma from "@/lib/prisma"
import { recordPayment } from "@/actions/factures"
import { matchTransactionToInvoice } from "@/actions/bank"

async function concurrent(actions: Array<() => Promise<unknown>>) {
  let release!: () => void
  const wait = new Promise<void>(resolve => { release = resolve })
  const gate: ReadGate = { arrived: 0, values: [], wait, release }
  const postgres = process.env.DATABASE_URL?.startsWith("postgres")
  const deadline = setTimeout(release, 2000)
  if (postgres) coordination.gate = gate
  try {
    const results = await Promise.allSettled(actions.map(action => action()))
    if (postgres) {
      expect(gate.arrived).toBe(2)
      expect(gate.values).toEqual([expect.objectContaining({ paidAmountCents: 0 }), expect.objectContaining({ paidAmountCents: 0 })])
    }
    expect(results.some(result => result.status === "fulfilled")).toBe(true)
    for (const result of results) {
      if (result.status === "rejected") expect(result.reason).toMatchObject({ message: expect.stringMatching(/La facture a reçu une autre opération|Facture non rapprochable|Le virement dépasse le reste à payer/) })
    }
    return results
  } finally { release(); clearTimeout(deadline); coordination.gate = null }
}

describe.sequential("manual payments and bank reconciliation preserve persisted invoice balances", () => {
  let invoiceId: string
  beforeAll(async () => {
    session.companyId = (await prisma.company.create({ data: { name: "Fictional payment concurrency" } })).id
    session.userId = (await prisma.user.create({ data: { email: `payment-concurrency-${randomUUID()}@example.test` } })).id
    await prisma.membership.create({ data: { companyId: session.companyId, userId: session.userId, role: "OWNER", status: "ACTIVE" } })
    const client = await prisma.client.create({ data: { companyId: session.companyId, name: "Fictional payment customer" } })
    invoiceId = (await prisma.invoice.create({ data: { companyId: session.companyId, clientId: client.id, number: "FICTIONAL-PAYMENT", object: "Fictional payment", status: "SENT", dueDate: new Date("2030-01-01"), totalHtCents: 200, totalTvaCents: 0, totalTtcCents: 200 } })).id
  })
  afterEach(async () => {
    await prisma.bankTransaction.deleteMany({ where: { companyId: session.companyId } })
    await prisma.invoicePayment.deleteMany({ where: { invoiceId } })
    await prisma.invoice.update({ where: { id: invoiceId }, data: { paidAmountCents: 0, status: "SENT" } })
    await prisma.auditLog.deleteMany({ where: { userId: session.userId } })
  })
  afterAll(async () => {
    await prisma.invoice.deleteMany({ where: { companyId: session.companyId } })
    await prisma.client.deleteMany({ where: { companyId: session.companyId } })
    await prisma.company.delete({ where: { id: session.companyId } })
    await prisma.user.delete({ where: { id: session.userId } })
  })
  async function assertPersistedBalance() {
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } })
    const payments = await prisma.invoicePayment.findMany({ where: { invoiceId } })
    const sum = payments.reduce((total, payment) => total + payment.amountCents, 0)
    expect(sum).toBeGreaterThan(0)
    expect(sum).toBeLessThanOrEqual(200)
    expect(invoice.paidAmountCents).toBe(sum)
    expect(invoice.status).toBe(sum === 200 ? "PAID" : "SENT")
    return payments
  }
  it.each([100, 200])("preserves a %i-cent manual payment racing with bank reconciliation", async amountCents => {
    const movement = await prisma.bankTransaction.create({ data: { companyId: session.companyId, date: new Date("2030-01-01"), label: "Fictional concurrent payment", amountCents, fingerprint: randomUUID() } })
    const results = await concurrent([
      () => recordPayment({ invoiceId, amountCents, method: "CASH", reference: "FICTIONAL-MANUAL" }),
      () => matchTransactionToInvoice(movement.id, invoiceId),
    ])
    const payments = await assertPersistedBalance()
    const persisted = await prisma.bankTransaction.findUniqueOrThrow({ where: { id: movement.id } })
    if (results[1].status === "fulfilled") expect(payments.some(payment => payment.id === persisted.matchedPaymentId && payment.amountCents === amountCents)).toBe(true)
    else expect(persisted.matchedPaymentId).toBeNull()
    expect(payments).toHaveLength(results.filter(result => result.status === "fulfilled").length)
    if (amountCents === 200) expect(payments).toHaveLength(1)
  })
  it.each([false, true])("preserves concurrent manual payments with shared reference %s", async sharedReference => {
    await concurrent([0, 1].map(index => () => recordPayment({ invoiceId, amountCents: 100, method: "CASH", reference: sharedReference ? "FICTIONAL-SHARED" : `FICTIONAL-${index}` })))
    const payments = await assertPersistedBalance()
    if (sharedReference) expect(payments).toHaveLength(1)
    expect(new Set(payments.map(payment => payment.reference)).size).toBe(payments.length)
  })
})
