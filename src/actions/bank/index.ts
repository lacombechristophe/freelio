"use server"

import { revalidatePath } from "next/cache"
import prisma from "@/lib/prisma"
import { withAuth } from "@/lib/auth-wrapper"
import { BankImportSchema } from "@/lib/validations"
import { bankTransactionFingerprint } from "@/lib/workflow-rules"

export async function getBankingDashboard() {
  return withAuth(async ({ companyId }) => {
    const [transactions, invoices, expenses] = await Promise.all([
      prisma.bankTransaction.findMany({
        where: { companyId },
        orderBy: [{ date: "desc" }, { importedAt: "desc" }],
        take: 250,
        include: {
          matchedPayment: { include: { invoice: { select: { id: true, number: true } } } },
          matchedExpense: { select: { id: true, label: true } },
        },
      }),
      prisma.invoice.findMany({
        where: { companyId, status: { in: ["SENT", "OVERDUE"] } },
        orderBy: { dueDate: "asc" },
        select: {
          id: true, number: true, totalTtcCents: true, paidAmountCents: true,
          client: { select: { name: true } },
        },
      }),
      prisma.expense.findMany({
        where: { companyId, bankTransaction: null },
        orderBy: { date: "desc" },
        take: 100,
        select: { id: true, label: true, amountCents: true, date: true },
      }),
    ])
    return { transactions, invoices, expenses }
  })
}

export async function importBankTransactions(input: unknown) {
  return withAuth(async ({ companyId }) => {
    const { rows } = BankImportSchema.parse(input)
    const prepared = rows.map((row) => {
      const date = new Date(`${row.date}T12:00:00`)
      if (Number.isNaN(date.getTime())) throw new Error(`Date invalide : ${row.date}`)
      return {
        companyId,
        date,
        label: row.label.trim(),
        amountCents: row.amountCents,
        reference: row.reference?.trim() || null,
        fingerprint: bankTransactionFingerprint({
          date,
          label: row.label,
          amountCents: row.amountCents,
          reference: row.reference,
        }),
      }
    })
    const existing = await prisma.bankTransaction.findMany({
      where: { companyId, fingerprint: { in: prepared.map((row) => row.fingerprint) } },
      select: { fingerprint: true },
    })
    const known = new Set(existing.map((row) => row.fingerprint))
    const unique = prepared.filter((row, index, array) => (
      !known.has(row.fingerprint) && array.findIndex((candidate) => candidate.fingerprint === row.fingerprint) === index
    ))
    if (unique.length) await prisma.bankTransaction.createMany({ data: unique })
    revalidatePath("/dashboard/comptabilite/banque")
    return { imported: unique.length, ignored: prepared.length - unique.length }
  })
}

export async function matchTransactionToInvoice(transactionId: string, invoiceId: string) {
  return withAuth(async ({ companyId, userId }) => prisma.$transaction(async (tx) => {
    const transaction = await tx.bankTransaction.findFirst({ where: { id: transactionId, companyId } })
    const invoice = await tx.invoice.findFirst({ where: { id: invoiceId, companyId } })
    if (!transaction || !invoice) throw new Error("Transaction ou facture introuvable")
    if (transaction.amountCents <= 0) throw new Error("Une sortie bancaire ne peut pas régler une facture")
    if (transaction.matchedPaymentId || transaction.matchedExpenseId) throw new Error("Transaction déjà rapprochée")
    if (!["SENT", "OVERDUE"].includes(invoice.status)) throw new Error("Facture non rapprochable")
    const remaining = invoice.totalTtcCents - invoice.paidAmountCents
    if (transaction.amountCents > remaining) throw new Error("Le virement dépasse le reste à payer")

    const payment = await tx.invoicePayment.create({
      data: {
        invoiceId,
        amountCents: transaction.amountCents,
        date: transaction.date,
        method: "TRANSFER",
        reference: transaction.reference || transaction.label,
      },
    })
    const paidAmountCents = invoice.paidAmountCents + transaction.amountCents
    await tx.invoice.update({
      where: { id: invoiceId },
      data: { paidAmountCents, status: paidAmountCents >= invoice.totalTtcCents ? "PAID" : invoice.status },
    })
    await tx.bankTransaction.update({ where: { id: transactionId }, data: { matchedPaymentId: payment.id } })
    await tx.auditLog.create({
      data: { userId, action: "MATCH_BANK_PAYMENT", resource: "INVOICE", resourceId: invoiceId, payload: { transactionId } },
    })
    revalidatePath("/dashboard/comptabilite/banque")
    revalidatePath(`/dashboard/factures/${invoiceId}`)
    return { ok: true }
  }))
}

export async function matchTransactionToExpense(transactionId: string, expenseId: string) {
  return withAuth(async ({ companyId }) => prisma.$transaction(async (tx) => {
    const transaction = await tx.bankTransaction.findFirst({ where: { id: transactionId, companyId } })
    const expense = await tx.expense.findFirst({ where: { id: expenseId, companyId } })
    if (!transaction || !expense) throw new Error("Transaction ou dépense introuvable")
    if (transaction.amountCents >= 0) throw new Error("Une entrée bancaire ne peut pas être une dépense")
    if (transaction.matchedPaymentId || transaction.matchedExpenseId) throw new Error("Transaction déjà rapprochée")
    if (Math.abs(transaction.amountCents) !== expense.amountCents) {
      throw new Error("Le montant de la dépense ne correspond pas exactement à la transaction")
    }
    await tx.bankTransaction.update({ where: { id: transactionId }, data: { matchedExpenseId: expenseId } })
    revalidatePath("/dashboard/comptabilite/banque")
    return { ok: true }
  }))
}

export async function createExpenseFromTransaction(transactionId: string) {
  return withAuth(async ({ companyId, userId }) => prisma.$transaction(async (tx) => {
    const transaction = await tx.bankTransaction.findFirst({ where: { id: transactionId, companyId } })
    if (!transaction) throw new Error("Transaction introuvable")
    if (transaction.amountCents >= 0) throw new Error("Cette transaction n'est pas une dépense")
    if (transaction.matchedPaymentId || transaction.matchedExpenseId) throw new Error("Transaction déjà rapprochée")
    const expense = await tx.expense.create({
      data: {
        companyId,
        label: transaction.label,
        provider: transaction.label,
        amountCents: Math.abs(transaction.amountCents),
        date: transaction.date,
        category: "Autre",
        status: "TO_JUSTIFY",
      },
    })
    await tx.bankTransaction.update({ where: { id: transactionId }, data: { matchedExpenseId: expense.id } })
    await tx.auditLog.create({
      data: { userId, action: "CREATE_EXPENSE_FROM_BANK", resource: "EXPENSE", resourceId: expense.id, payload: { transactionId } },
    })
    revalidatePath("/dashboard/comptabilite/banque")
    revalidatePath("/dashboard/depenses")
    return expense
  }))
}
