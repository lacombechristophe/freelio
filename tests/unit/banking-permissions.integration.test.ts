import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"

const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

import prisma from "@/lib/prisma"
import { getAccountingSnapshot } from "@/actions/accounting"
import { createExpenseFromTransaction, getBankingDashboard, importBankTransactions, matchTransactionToExpense, matchTransactionToInvoice } from "@/actions/bank"

describe.sequential("bank actions enforce current financial membership permissions", () => {
  let membershipId: string, transactionId: string
  beforeAll(async () => {
    const company = await prisma.company.create({ data: { name: "Fictional banking permissions" } })
    session.companyId = company.id
    const user = await prisma.user.create({ data: { email: `fictional-banking-${randomUUID()}@example.test` } })
    session.userId = user.id
    const member = await prisma.membership.create({ data: { companyId: company.id, userId: user.id, role: "OWNER", status: "ACTIVE" } })
    membershipId = member.id
    const transaction = await prisma.bankTransaction.create({ data: { companyId: company.id, date: new Date("2030-01-01T12:00:00Z"), label: "Fictional confidential movement", amountCents: -12500, fingerprint: randomUUID() } })
    transactionId = transaction.id
  })
  afterEach(async () => {
    vi.unstubAllEnvs()
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "OWNER", status: "ACTIVE" } })
  })
  afterAll(async () => {
    await prisma.company.delete({ where: { id: session.companyId } })
    await prisma.user.delete({ where: { id: session.userId } })
  })
  it.each(["SALES", "OPERATIONS", "TECHNICIAN", "SERVICE"])("refuses a direct banking read by %s", async role => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    await expect(getBankingDashboard()).rejects.toThrow("droits nécessaires")
  })
  it.each(["OWNER", "ADMIN", "ACCOUNTING", "VIEWER"])("permits a financial read by %s under the current company", async role => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    expect((await getBankingDashboard()).transactions).toMatchObject([{ id: transactionId, companyId: session.companyId }])
    expect(await prisma.bankTransaction.count({ where: { companyId: session.companyId } })).toBe(1)
  })
  it.each(["SALES", "OPERATIONS", "TECHNICIAN", "SERVICE"])("refuses a direct accounting snapshot read by %s", async role => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    await expect(getAccountingSnapshot()).rejects.toThrow("droits nécessaires")
  })
  it.each(["OWNER", "ADMIN", "ACCOUNTING", "VIEWER"])("preserves the accounting snapshot for %s", async role => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    expect(await getAccountingSnapshot()).toMatchObject({ caYearCents: 0, cashForecast: { days30Cents: 0, days60Cents: 0, days90Cents: 0 } })
  })
  const writes = [
    ["import", () => importBankTransactions({})],
    ["invoice match", () => matchTransactionToInvoice(transactionId, "fictional-invoice")],
    ["expense match", () => matchTransactionToExpense(transactionId, "fictional-expense")],
    ["expense creation", () => createExpenseFromTransaction(transactionId)],
  ] as const
  it.each(writes)("refuses a viewer's %s before validation or financial processing", async (_label, action) => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "VIEWER" } })
    await expect(action()).rejects.toThrow("droits nécessaires")
    expect(await prisma.bankTransaction.findUniqueOrThrow({ where: { id: transactionId } })).toMatchObject({ matchedPaymentId: null, matchedExpenseId: null })
    expect(await prisma.expense.count({ where: { companyId: session.companyId } })).toBe(0)
  })
  it("rejects a revoked membership despite the still-authenticated session", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { status: "SUSPENDED" } })
    await expect(getBankingDashboard()).rejects.toThrow("plus accès")
  })
  it.each(writes)("blocks public-demo %s before validation or financial processing", async (_label, action) => {
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    await expect(action()).rejects.toThrow("lecture seule")
    expect(await prisma.bankTransaction.findUniqueOrThrow({ where: { id: transactionId } })).toMatchObject({ matchedPaymentId: null, matchedExpenseId: null })
  })
})
