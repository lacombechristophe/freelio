import "server-only"
import { Prisma } from "@prisma/client"
import { z } from "zod"
import prisma from "@/lib/prisma"

const pageQuery = z.object({ page: z.number().int().min(1).max(1_000_000).default(1), search: z.string().trim().max(200).default("") })
const idQuery = z.string().trim().min(1).max(128)
const contains = (search: string) => ({ contains: search, ...(process.env.DATABASE_URL?.startsWith("postgres") ? { mode: "insensitive" as const } : {}) })
const pagination = (total: number, requested: number) => { const pageCount = Math.max(1, Math.ceil(total / 25)); return { total, page: Math.min(requested, pageCount), pageCount } }
const windowArgs = (page: number) => ({ skip: (page - 1) * 25, take: 25 })

export async function readBankHistory(companyId: string, input: unknown = {}) {
  const query = pageQuery.extend({ status: z.enum(["ALL", "UNMATCHED", "MATCHED"]).default("ALL") }).parse(input)
  const unmatched = { companyId, matchedPaymentId: null, matchedExpenseId: null }
  const where: Prisma.BankTransactionWhereInput = { companyId, AND: [
    ...(query.status === "UNMATCHED" ? [unmatched] : query.status === "MATCHED" ? [{ OR: [{ matchedPaymentId: { not: null } }, { matchedExpenseId: { not: null } }] }] : []),
    ...(query.search ? [{ OR: [{ label: contains(query.search) }, { reference: contains(query.search) }] }] : []),
  ] }
  return prisma.$transaction(async tx => {
    const page = pagination(await tx.bankTransaction.count({ where }), query.page)
    const movements = await tx.bankTransaction.findMany({ where, ...windowArgs(page.page), orderBy: [{ date: "desc" }, { importedAt: "desc" }, { id: "desc" }] })
    const paymentIds = movements.flatMap(row => row.matchedPaymentId ? [row.matchedPaymentId] : [])
    const expenseIds = movements.flatMap(row => row.matchedExpenseId ? [row.matchedExpenseId] : [])
    // Read linked labels through their own protected models: a company-wide bank
    // movement does not grant access to an invoice in another agency.
    const invoices = await tx.invoice.findMany({ where: { companyId, payments: { some: { id: { in: paymentIds } } } }, select: { id: true, number: true, payments: { where: { id: { in: paymentIds } }, select: { id: true } } } })
    const expenses = await tx.expense.findMany({ where: { companyId, id: { in: expenseIds } }, select: { id: true, label: true } })
    const transactions = movements.map(row => {
      const invoice = invoices.find(invoice => invoice.payments.some(payment => payment.id === row.matchedPaymentId))
      return { ...row, matchedPayment: invoice ? { invoice: { id: invoice.id, number: invoice.number } } : null, matchedExpense: expenses.find(expense => expense.id === row.matchedExpenseId) ?? null }
    })
    const [inflow, outflow, remaining] = await Promise.all([
      tx.bankTransaction.aggregate({ where: { companyId, amountCents: { gt: 0 } }, _sum: { amountCents: true } }),
      tx.bankTransaction.aggregate({ where: { companyId, amountCents: { lt: 0 } }, _sum: { amountCents: true } }),
      tx.bankTransaction.count({ where: unmatched }),
    ])
    return { ...page, transactions, totals: { inflow: inflow._sum.amountCents ?? 0, outflow: outflow._sum.amountCents ?? 0, unmatched: remaining } }
  }, { isolationLevel: "Serializable" })
}

const invoiceSelect = { id: true, number: true, totalTtcCents: true, paidAmountCents: true, client: { select: { name: true } } } as const satisfies Prisma.InvoiceSelect
const euro = (cents: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100)

export async function readBankTargets(companyId: string, input: unknown) {
  const query = pageQuery.extend({ transactionId: idQuery, selectedId: idQuery.optional() }).parse(input)
  return prisma.$transaction(async tx => {
    const movement = await tx.bankTransaction.findFirst({ where: { companyId, id: query.transactionId, matchedPaymentId: null, matchedExpenseId: null } })
    if (!movement) throw new Error("Transaction introuvable ou déjà rapprochée")
    if (movement.amountCents <= 0) {
      const eligible = { companyId, bankTransaction: null, amountCents: Math.abs(movement.amountCents) }
      const where = { ...eligible, ...(query.search ? { label: contains(query.search) } : {}) }
      const page = pagination(await tx.expense.count({ where }), query.page)
      const select = { id: true, label: true, amountCents: true } as const
      const rows = await tx.expense.findMany({ where, select, orderBy: [{ date: "desc" }, { id: "desc" }], ...windowArgs(page.page) })
      const selected = query.selectedId ? await tx.expense.findFirst({ where: { ...eligible, id: query.selectedId }, select }) : null
      const dto = (row: (typeof rows)[number]) => ({ id: row.id, label: `${row.label} · ${euro(row.amountCents)}` })
      return { ...page, rows: rows.map(dto), selected: selected ? dto(selected) : null }
    }
    const eligible = { companyId, status: { in: ["SENT", "OVERDUE"] }, totalTtcCents: { gte: movement.amountCents } }
    const where: Prisma.InvoiceWhereInput = { ...eligible, ...(query.search ? { OR: [{ number: contains(query.search) }, { client: { name: contains(query.search) } }] } : {}) }
    type Invoice = Prisma.InvoiceGetPayload<{ select: typeof invoiceSelect }>
    let total = 0, cursor: string | undefined
    let rows: Invoice[] = [], lastPage: Invoice[] = []
    // Prisma cannot express total - paid >= movement. Scan bounded projections
    // through the protected client, retaining its tenant/agency and demo guards.
    for (;;) {
      const batch: Invoice[] = await tx.invoice.findMany({ where, select: invoiceSelect, orderBy: { id: "asc" }, take: 200, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) })
      for (const invoice of batch) {
        if (invoice.totalTtcCents - invoice.paidAmountCents < movement.amountCents) continue
        if (total % 25 === 0) lastPage = []
        lastPage.push(invoice)
        if (Math.floor(total / 25) === query.page - 1) rows.push(invoice)
        total++
      }
      if (batch.length < 200) break
      cursor = batch[batch.length - 1].id
    }
    const page = pagination(total, query.page)
    if (page.page !== query.page) rows = lastPage
    const selected = query.selectedId ? await tx.invoice.findFirst({ where: { ...eligible, id: query.selectedId }, select: invoiceSelect }) : null
    const dto = (row: Invoice) => ({ id: row.id, label: `${row.number} · ${row.client.name} · ${euro(row.totalTtcCents - row.paidAmountCents)}` })
    return { ...page, rows: rows.map(dto), selected: selected && selected.totalTtcCents - selected.paidAmountCents >= movement.amountCents ? dto(selected) : null }
  }, { isolationLevel: "Serializable", timeout: 20_000 })
}
