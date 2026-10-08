import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"

const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
import prisma from "@/lib/prisma"
import { getBankingDashboard, getBankingTargets, importBankTransactions } from "@/actions/bank"

describe.sequential("complete bank history and reconciliation candidates", () => {
  let membershipId: string, agencyId: string, foreignCompanyId: string, expenseId: string, invoiceId: string, debitId: string, creditId: string, foreignMovementId: string, excludedInvoiceId: string
  beforeAll(async () => {
    session.companyId = (await prisma.company.create({ data: { name: "Fictional complete banking" } })).id
    foreignCompanyId = (await prisma.company.create({ data: { name: "Fictional foreign bank" } })).id
    session.userId = (await prisma.user.create({ data: { email: `bank-lists-${randomUUID()}@example.test` } })).id
    membershipId = (await prisma.membership.create({ data: { companyId: session.companyId, userId: session.userId, role: "OWNER", status: "ACTIVE" } })).id
    agencyId = (await prisma.agency.create({ data: { companyId: session.companyId, code: "BANK", name: "Fictional permitted agency" } })).id
    await prisma.agencyMembership.create({ data: { membershipId, agencyId } })
    const client = await prisma.client.create({ data: { companyId: session.companyId, name: "Fictional bank client" } })
    const project = await prisma.project.create({ data: { companyId: session.companyId, clientId: client.id, agencyId, name: "Fictional bank project" } })
    for (let index = 0; index < 251; index++) {
      const row = await prisma.bankTransaction.create({ data: { companyId: session.companyId, label: `History ${String(index).padStart(3, "0")}`, reference: `Reference ${index}`, date: new Date(Date.UTC(2030, 0, 1, 0, index)), amountCents: index === 250 ? 100 : -100, fingerprint: randomUUID() } })
      if (!index) debitId = row.id
      if (index === 250) creditId = row.id
    }
    foreignMovementId = (await prisma.bankTransaction.create({ data: { companyId: foreignCompanyId, label: "Foreign confidential movement", amountCents: -100, date: new Date(), fingerprint: randomUUID() } })).id
    for (let index = 0; index < 101; index++) {
      const row = await prisma.expense.create({ data: { companyId: session.companyId, projectId: project.id, label: `Expense ${String(index).padStart(3, "0")}`, amountCents: 100, category: "Autre", date: new Date(Date.UTC(2030, 0, 1, 0, index)) } })
      if (!index) expenseId = row.id
    }
    for (let index = 0; index < 26; index++) {
      const row = await prisma.invoice.create({ data: { id: `bank-list-${randomUUID()}-${String(index).padStart(3, "0")}`, companyId: session.companyId, projectId: project.id, clientId: client.id, number: `Invoice ${index}`, object: "Fictional bank", status: "SENT", dueDate: new Date(), totalHtCents: 200, totalTvaCents: 0, totalTtcCents: 200, paidAmountCents: 50 } })
      if (!index) invoiceId = row.id
    }
    excludedInvoiceId = (await prisma.invoice.create({ data: { companyId: session.companyId, projectId: project.id, clientId: client.id, number: "Insufficient balance", object: "Fictional partial payment", status: "SENT", dueDate: new Date(), totalHtCents: 200, totalTvaCents: 0, totalTtcCents: 200, paidAmountCents: 150 } })).id
    await prisma.invoice.create({ data: { companyId: session.companyId, clientId: client.id, number: "Other agency invoice", object: "Confidential agency", status: "SENT", dueDate: new Date(), totalHtCents: 200, totalTvaCents: 0, totalTtcCents: 200 } })
  })
  afterEach(async () => {
    vi.unstubAllEnvs()
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "OWNER", status: "ACTIVE" } })
    await prisma.agency.update({ where: { id: agencyId }, data: { active: true } })
  })
  afterAll(async () => {
    await prisma.bankTransaction.deleteMany({ where: { companyId: { in: [session.companyId, foreignCompanyId] } } })
    await prisma.invoice.deleteMany({ where: { companyId: session.companyId } })
    await prisma.expense.deleteMany({ where: { companyId: session.companyId } })
    await prisma.project.deleteMany({ where: { companyId: session.companyId } })
    await prisma.client.deleteMany({ where: { companyId: session.companyId } })
    await prisma.company.deleteMany({ where: { id: { in: [session.companyId, foreignCompanyId] } } })
    await prisma.user.delete({ where: { id: session.userId } })
  })
  it("counts the full history, clamps the final page and keeps global cards independent of search", async () => {
    const last = await getBankingDashboard({ page: 999 })
    expect(last).toMatchObject({ total: 251, page: 11, pageCount: 11, transactions: [{ id: debitId }], totals: { inflow: 100, outflow: -25000, unmatched: 251 } })
    const search = await getBankingDashboard({ search: "reference 0" })
    expect(search.transactions.map(row => row.id)).toEqual([debitId])
    expect(search.totals).toEqual(last.totals)
  })
  it("finds an expense beyond the former 100-row cap and preserves selection outside the query", async () => {
    expect(await getBankingTargets({ transactionId: debitId, page: 99 })).toMatchObject({ total: 101, page: 5, rows: [{ id: expenseId }] })
    expect(await getBankingTargets({ transactionId: debitId, search: "Expense 100", selectedId: expenseId })).toMatchObject({ total: 1, selected: { id: expenseId }, rows: [{ label: expect.stringContaining("Expense 100") }] })
  })
  it("counts invoice eligibility before pagination and rechecks an off-page selection", async () => {
    const page = await getBankingTargets({ transactionId: creditId, page: 2, selectedId: invoiceId })
    expect(page).toMatchObject({ total: 27, page: 2, pageCount: 2, selected: { id: invoiceId } })
    expect(page.rows).toHaveLength(2)
    const excluded = await getBankingTargets({ transactionId: creditId, search: "Insufficient balance", selectedId: excludedInvoiceId })
    expect(excluded).toMatchObject({ total: 0, rows: [], selected: null })
  })
  it("returns empty foreign selections and refuses a foreign movement", async () => {
    await expect(getBankingTargets({ transactionId: foreignMovementId })).rejects.toThrow("introuvable")
    expect(await getBankingTargets({ transactionId: debitId, selectedId: foreignMovementId })).toMatchObject({ selected: null })
    expect((await getBankingDashboard({ search: "confidential" })).total).toBe(0)
  })
  it("crosses the invoice scan boundary without losing rows or returning a false final page", async () => {
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } })
    const prefix = `Stream invoice ${randomUUID()}`
    await prisma.invoice.createMany({ data: Array.from({ length: 201 }, (_, index) => ({ companyId: session.companyId, projectId: invoice.projectId, clientId: invoice.clientId, number: `${prefix} ${index}`, object: "Fictional stream boundary", status: "SENT", dueDate: new Date(), totalHtCents: 200, totalTvaCents: 0, totalTtcCents: 200 })) })
    try {
      expect(await getBankingTargets({ transactionId: creditId, search: prefix, page: 999 })).toMatchObject({ total: 201, page: 9, pageCount: 9 })
      expect((await getBankingTargets({ transactionId: creditId, search: prefix, page: 9 })).rows).toHaveLength(1)
    } finally { await prisma.invoice.deleteMany({ where: { companyId: session.companyId, number: { startsWith: prefix } } }) }
  })
  it("rechecks finance membership and agency visibility on every candidate read", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "ACCOUNTING" } })
    expect((await getBankingTargets({ transactionId: creditId })).total).toBe(26)
    await prisma.agency.update({ where: { id: agencyId }, data: { active: false } })
    expect(await getBankingTargets({ transactionId: creditId, selectedId: invoiceId })).toMatchObject({ total: 0, selected: null })
    expect((await getBankingTargets({ transactionId: debitId })).total).toBe(0)
    await prisma.membership.update({ where: { id: membershipId }, data: { status: "SUSPENDED" } })
    await expect(getBankingTargets({ transactionId: debitId })).rejects.toThrow("plus accès")
  })
  it("allows all protected reads in public demo and refuses writes", async () => {
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    expect((await getBankingDashboard()).total).toBe(251)
    expect((await getBankingTargets({ transactionId: creditId })).total).toBe(27)
    await expect(importBankTransactions({ rows: [] })).rejects.toThrow("lecture seule")
  })
  it.each([{ page: 0 }, { search: "x".repeat(201) }, { status: "INVALID" }])("rejects unbounded or invalid history queries %j", async query => {
    await expect(getBankingDashboard(query)).rejects.toThrow()
  })
  it("filters matched rows before counting and hides an inaccessible invoice label", async () => {
    const payment = await prisma.invoicePayment.create({ data: { invoiceId, amountCents: 100, method: "TRANSFER", date: new Date() } })
    await prisma.bankTransaction.update({ where: { id: creditId }, data: { matchedPaymentId: payment.id } })
    try {
      expect((await getBankingDashboard({ status: "MATCHED" })).total).toBe(1)
      expect((await getBankingDashboard({ status: "UNMATCHED" })).total).toBe(250)
      await prisma.membership.update({ where: { id: membershipId }, data: { role: "ACCOUNTING" } })
      await prisma.agency.update({ where: { id: agencyId }, data: { active: false } })
      const rows = (await getBankingDashboard({ status: "MATCHED" })).transactions
      expect(rows[0]).toMatchObject({ matchedPaymentId: payment.id, matchedPayment: null })
      await expect(getBankingTargets({ transactionId: creditId })).rejects.toThrow("déjà rapprochée")
    } finally {
      await prisma.bankTransaction.update({ where: { id: creditId }, data: { matchedPaymentId: null } })
      await prisma.invoicePayment.delete({ where: { id: payment.id } })
    }
  })
  it.each(["2030-02-31", "2030-02-29", "2030-04-31", "2030-00-01", "2030-13-01", "not-a-date"])("rejects %s before any row in the file is written", async date => {
    await expect(importBankTransactions({ rows: [{ date: "2030-01-01", label: "Valid mixed row", amountCents: 100 }, { date, label: "Impossible date", amountCents: 100 }] })).rejects.toThrow(`Date bancaire invalide : ${date}`)
    expect(await prisma.bankTransaction.count({ where: { companyId: session.companyId } })).toBe(251)
  })
  it("preserves a leap date and deduplicates its replay", async () => {
    const rows = [{ date: "2032-02-29", label: "Fictional leap day", amountCents: 100 }]
    try {
      expect(await importBankTransactions({ rows })).toEqual({ imported: 1, ignored: 0 })
      const row = await prisma.bankTransaction.findFirstOrThrow({ where: { companyId: session.companyId, label: rows[0].label } })
      expect([row.date.getFullYear(), row.date.getMonth() + 1, row.date.getDate()]).toEqual([2032, 2, 29])
      expect(await importBankTransactions({ rows })).toEqual({ imported: 0, ignored: 1 })
    } finally { await prisma.bankTransaction.deleteMany({ where: { companyId: session.companyId, label: rows[0].label } }) }
  })
})
