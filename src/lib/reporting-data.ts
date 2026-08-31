import "server-only"

import type { AuthContext } from "@/lib/auth-wrapper"
import { requestContext } from "@/lib/context"
import { hasPermission } from "@/lib/permissions"
import prisma from "@/lib/prisma"
import {
  buildExecutiveReport,
  reportWindow,
  type ReportPeriod,
  type ReportingInput,
} from "@/lib/reporting"

const MAX_ROWS_PER_SOURCE = 20_000

function empty<T>() {
  return Promise.resolve([] as T[])
}

export async function loadExecutiveReport(context: AuthContext, period: ReportPeriod, now = new Date()) {
  return requestContext.run(context, () => loadScopedExecutiveReport(context, period, now))
}

async function loadScopedExecutiveReport({ companyId, role }: AuthContext, period: ReportPeriod, now: Date) {
  const access = {
    crm: hasPermission(role, "crm.read"),
    sales: hasPermission(role, "sales.read"),
    finance: hasPermission(role, "finance.read"),
    operations: hasPermission(role, "operations.read"),
    service: hasPermission(role, "service.read"),
    marketing: hasPermission(role, "automation.read"),
  }
  const { previousStartAt } = reportWindow(period, now)
  const limit = MAX_ROWS_PER_SOURCE + 1

  const [leadsRaw, opportunitiesRaw, quotesRaw, invoicesRaw, paymentsRaw, expensesRaw, projectsRaw, purchaseOrdersRaw, interventionsRaw, ticketsRaw, deliveriesRaw] = await Promise.all([
    access.crm
      ? prisma.leadCapture.findMany({
          where: { companyId, createdAt: { gte: previousStartAt } },
          select: { status: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: limit,
        })
      : empty<ReportingInput["leads"][number]>(),
    access.sales
      ? prisma.opportunity.findMany({
          where: {
            pipeline: { companyId },
            OR: [
              { status: { notIn: ["WON", "LOST"] } },
              { closedAt: { gte: previousStartAt } },
            ],
          },
          select: { status: true, valueCents: true, probability: true, createdAt: true, closedAt: true },
          orderBy: { updatedAt: "desc" },
          take: limit,
        })
      : empty<ReportingInput["opportunities"][number]>(),
    access.sales
      ? prisma.quote.findMany({
          where: { companyId, date: { gte: previousStartAt } },
          select: { status: true, date: true },
          orderBy: { date: "desc" },
          take: limit,
        })
      : empty<ReportingInput["quotes"][number]>(),
    access.finance
      ? prisma.invoice.findMany({
          where: {
            companyId,
            OR: [
              { status: { in: ["SENT", "OVERDUE"] } },
              { date: { gte: previousStartAt } },
            ],
          },
          select: { status: true, totalTtcCents: true, paidAmountCents: true, date: true, dueDate: true },
          orderBy: { date: "desc" },
          take: limit,
        })
      : empty<ReportingInput["invoices"][number]>(),
    access.finance
      ? prisma.invoicePayment.findMany({
          where: { invoice: { companyId }, date: { gte: previousStartAt } },
          select: { amountCents: true, date: true },
          orderBy: { date: "desc" },
          take: limit,
        })
      : empty<ReportingInput["payments"][number]>(),
    access.finance
      ? prisma.expense.findMany({
          where: { companyId, date: { gte: previousStartAt } },
          select: { amountCents: true, date: true },
          orderBy: { date: "desc" },
          take: limit,
        })
      : empty<ReportingInput["expenses"][number]>(),
    access.operations
      ? prisma.project.findMany({
          where: {
            companyId,
            OR: [
              { status: "ACTIVE" },
              { endDate: { gte: previousStartAt } },
            ],
          },
          select: { status: true, budgetCents: true, consumedCents: true, endDate: true },
          orderBy: { updatedAt: "desc" },
          take: limit,
        })
      : empty<ReportingInput["projects"][number]>(),
    access.operations
      ? prisma.purchaseOrder.findMany({
          where: { companyId, status: { in: ["DRAFT", "SUBMITTED", "APPROVED", "SENT", "ACKNOWLEDGED", "PARTIALLY_RECEIVED"] } },
          select: { status: true, totalHtCents: true, expectedAt: true, confirmedExpectedAt: true },
          orderBy: { updatedAt: "desc" },
          take: limit,
        })
      : empty<ReportingInput["purchaseOrders"][number]>(),
    access.operations
      ? prisma.fieldIntervention.findMany({
          where: { companyId, scheduledStart: { gte: previousStartAt } },
          select: { status: true, scheduledStart: true, completedAt: true, laborMinutes: true },
          orderBy: { scheduledStart: "desc" },
          take: limit,
        })
      : empty<ReportingInput["interventions"][number]>(),
    access.service
      ? prisma.serviceTicket.findMany({
          where: {
            companyId,
            OR: [
              { status: { notIn: ["CLOSED", "RESOLVED", "MERGED"] } },
              { requestedAt: { gte: previousStartAt } },
              { closedAt: { gte: previousStartAt } },
            ],
          },
          select: { status: true, priority: true, requestedAt: true, dueAt: true, closedAt: true },
          orderBy: { requestedAt: "desc" },
          take: limit,
        })
      : empty<ReportingInput["tickets"][number]>(),
    access.marketing
      ? prisma.emailDelivery.findMany({
          where: { companyId, createdAt: { gte: previousStartAt } },
          select: { status: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: limit,
        })
      : empty<ReportingInput["deliveries"][number]>(),
  ])

  const truncatedSources: string[] = []
  function clip<T>(items: T[], source: string) {
    if (items.length <= MAX_ROWS_PER_SOURCE) return items
    truncatedSources.push(source)
    return items.slice(0, MAX_ROWS_PER_SOURCE)
  }

  return buildExecutiveReport({
    access,
    leads: clip(leadsRaw, "prospects"),
    opportunities: clip(opportunitiesRaw, "opportunités"),
    quotes: clip(quotesRaw, "devis"),
    invoices: clip(invoicesRaw, "factures"),
    payments: clip(paymentsRaw, "paiements"),
    expenses: clip(expensesRaw, "dépenses"),
    projects: clip(projectsRaw, "chantiers"),
    purchaseOrders: clip(purchaseOrdersRaw, "achats"),
    interventions: clip(interventionsRaw, "interventions"),
    tickets: clip(ticketsRaw, "tickets"),
    deliveries: clip(deliveriesRaw, "e-mails"),
    truncatedSources,
  }, period, now)
}
