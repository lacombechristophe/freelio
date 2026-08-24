"use server"

import prisma from "@/lib/prisma"
import { withAuth } from "@/lib/auth-wrapper"
import {
  DEFAULT_HOURLY_RATE_CENTS,
  computeProjectRisk,
  computeUnbilledValueCents,
  isInvoiceActionable,
  isQuoteStale,
} from "@/lib/operations-cockpit"

function toIso(value: Date | null | undefined) {
  return value ? value.toISOString() : null
}

function startOfDay(date = new Date()) {
  const result = new Date(date)
  result.setHours(0, 0, 0, 0)
  return result
}

function endOfDay(date = new Date()) {
  const result = startOfDay(date)
  result.setDate(result.getDate() + 1)
  return result
}

function startOfWeek(date = new Date()) {
  const result = startOfDay(date)
  const day = result.getDay()
  const diff = result.getDate() - day + (day === 0 ? -6 : 1)
  result.setDate(diff)
  return result
}

function addDays(date: Date, days: number) {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

export async function getDashboardStats() {
  return await withAuth(async ({ companyId }) => {
    const currentYear = new Date().getFullYear()
    const yearStart = new Date(currentYear, 0, 1)
    const [paidInvoices, pendingInvoices, expenses, activeClientsCount, activeProjectsCount, openOrdersCount, openServiceTicketsCount, upcomingInterventionsCount, inventory] =
      await Promise.all([
        prisma.invoice.aggregate({
          where: { companyId, status: "PAID", date: { gte: yearStart } },
          _sum: { totalHtCents: true },
        }),
        prisma.invoice.aggregate({
          where: { companyId, status: { in: ["SENT", "OVERDUE"] } },
          _sum: { totalTtcCents: true, paidAmountCents: true },
        }),
        prisma.expense.aggregate({
          where: { companyId, date: { gte: yearStart } },
          _sum: { amountCents: true, tvaCents: true },
        }),
        prisma.client.count({ where: { companyId } }),
        prisma.project.count({ where: { companyId, status: "ACTIVE" } }),
        prisma.customerOrder.count({ where: { companyId, status: { in: ["CONFIRMED", "IN_PREPARATION"] } } }),
        prisma.serviceTicket.count({ where: { companyId, status: { notIn: ["RESOLVED", "CLOSED"] } } }),
        prisma.fieldIntervention.count({ where: { companyId, status: { in: ["PLANNED", "EN_ROUTE", "IN_PROGRESS"] } } }),
        prisma.inventoryItem.findMany({ where: { companyId }, select: { quantity: true, reservedQuantity: true, reorderPoint: true } }),
      ])

    const encoursTotal =
      (pendingInvoices._sum.totalTtcCents || 0) -
      (pendingInvoices._sum.paidAmountCents || 0)

    const totalRevenueCents = paidInvoices._sum.totalHtCents || 0
    const expenseHtCents = (expenses._sum.amountCents || 0) - (expenses._sum.tvaCents || 0)
    return {
      currentYear,
      totalRevenueCents,
      totalEncoursCents: encoursTotal,
      activeClientsCount,
      activeProjectsCount,
      openOrdersCount,
      openServiceTicketsCount,
      upcomingInterventionsCount,
      lowStockCount: inventory.filter((item) => item.quantity - item.reservedQuantity <= item.reorderPoint).length,
      directMarginCents: totalRevenueCents - expenseHtCents,
    }
  })
}

export async function getOperationsCockpitData() {
  return await withAuth(async ({ companyId }) => {
    const now = new Date()
    const todayStart = startOfDay(now)
    const tomorrowStart = endOfDay(now)
    const weekStart = startOfWeek(now)
    const weekEnd = addDays(weekStart, 7)

    const [
      todayTasks,
      weekTasks,
      invoices,
      quotes,
      unbilledEntries,
      projects,
    ] = await Promise.all([
      prisma.organisationTask.findMany({
        where: {
          companyId,
          status: { not: "DONE" },
          OR: [
            { scheduledDate: { gte: todayStart, lt: tomorrowStart } },
            { dueDate: { gte: todayStart, lt: tomorrowStart } },
            { scheduledDate: null, dueDate: null, priority: { lte: 2 } },
          ],
        },
        include: {
          client: { select: { id: true, name: true } },
          project: { select: { id: true, name: true, client: { select: { id: true, name: true } } } },
          goal: { select: { id: true, title: true, scope: true } },
        },
        orderBy: [{ priority: "asc" }, { scheduledDate: "asc" }, { dueDate: "asc" }, { updatedAt: "desc" }],
        take: 8,
      }),
      prisma.organisationTask.findMany({
        where: {
          companyId,
          status: { not: "DONE" },
          OR: [
            { scheduledDate: { gte: weekStart, lt: weekEnd } },
            { dueDate: { gte: weekStart, lt: weekEnd } },
          ],
        },
        select: { id: true, estimateMin: true, priority: true, status: true },
        take: 200,
      }),
      prisma.invoice.findMany({
        where: {
          companyId,
          status: { in: ["SENT", "OVERDUE"] },
        },
        include: { client: { select: { id: true, name: true } } },
        orderBy: [{ dueDate: "asc" }, { updatedAt: "desc" }],
        take: 20,
      }),
      prisma.quote.findMany({
        where: {
          companyId,
          status: { in: ["DRAFT", "SENT"] },
        },
        include: {
          client: { select: { id: true, name: true } },
          versions: {
            orderBy: { version: "desc" },
            take: 1,
            select: { totalTtcCents: true },
          },
        },
        orderBy: [{ validUntil: "asc" }, { updatedAt: "asc" }],
        take: 24,
      }),
      prisma.timeEntry.findMany({
        where: {
          isBillable: true,
          invoiceId: null,
          project: { companyId },
        },
        include: {
          project: { select: { id: true, name: true, client: { select: { id: true, name: true } } } },
        },
        orderBy: { date: "desc" },
        take: 300,
      }),
      prisma.project.findMany({
        where: {
          companyId,
          status: "ACTIVE",
        },
        select: {
          id: true,
          name: true,
          budgetCents: true,
          consumedCents: true,
          endDate: true,
          client: { select: { id: true, name: true } },
        },
        orderBy: [{ endDate: "asc" }, { updatedAt: "desc" }],
        take: 100,
      }),
    ])

    const actionableInvoices = invoices
      .filter((invoice) => isInvoiceActionable(invoice.status, invoice.dueDate, now))
      .slice(0, 5)

    const staleQuotes = quotes
      .filter((quote) => isQuoteStale({
        status: quote.status,
        validUntil: quote.validUntil,
        updatedAt: quote.updatedAt,
        today: now,
      }))
      .slice(0, 5)

    const unbilledSeconds = unbilledEntries.reduce((sum, entry) => sum + entry.durationSec, 0)
    const unbilledByProject = Array.from(
      unbilledEntries.reduce((map, entry) => {
        const existing = map.get(entry.projectId) ?? {
          id: entry.projectId,
          name: entry.project.name,
          clientName: entry.project.client.name,
          durationSec: 0,
          entryCount: 0,
        }
        existing.durationSec += entry.durationSec
        existing.entryCount += 1
        map.set(entry.projectId, existing)
        return map
      }, new Map<string, { id: string; name: string; clientName: string; durationSec: number; entryCount: number }>())
        .values()
    )
      .sort((a, b) => b.durationSec - a.durationSec)
      .slice(0, 5)

    const projectRisks = projects
      .map((project) => ({
        project,
        risk: computeProjectRisk({
          budgetCents: project.budgetCents,
          consumedCents: project.consumedCents,
          endDate: project.endDate,
          today: now,
        }),
      }))
      .filter(({ risk }) => risk.level !== "normal")
      .sort((a, b) => {
        const levelScore = { critical: 0, warning: 1, normal: 2 }
        if (levelScore[a.risk.level] !== levelScore[b.risk.level]) {
          return levelScore[a.risk.level] - levelScore[b.risk.level]
        }
        return b.risk.budgetUsagePct - a.risk.budgetUsagePct
      })
      .slice(0, 5)

    const weekPlannedMinutes = weekTasks.reduce((sum, task) => sum + (task.estimateMin ?? 0), 0)
    const weekHighPriority = weekTasks.filter((task) => task.priority === 1).length
    const blockedTasks = todayTasks.filter((task) => task.status === "BLOCKED").length

    type SuggestedAction = {
      id: string
      label: string
      detail: string
      href: string
      tone: "danger" | "warning" | "primary" | "neutral"
    }

    const suggestedActions = [
      actionableInvoices.length > 0 && {
        id: "invoice-follow-up",
        label: `Relancer ${actionableInvoices.length} facture(s)`,
        detail: "Encaissement à sécuriser",
        href: "/dashboard/factures",
        tone: "danger" as const,
      },
      staleQuotes.length > 0 && {
        id: "quote-follow-up",
        label: `Relancer ${staleQuotes.length} devis`,
        detail: "Pipeline à convertir",
        href: "/dashboard/devis",
        tone: "warning" as const,
      },
      unbilledEntries.length > 0 && {
        id: "unbilled-time",
        label: "Facturer le temps non facturé",
        detail: `${unbilledEntries.length} entrée(s) à transformer`,
        href: "/dashboard/factures/temps-non-facture",
        tone: "primary" as const,
      },
      todayTasks.length > 0 && {
        id: "today-focus",
        label: "Traiter les priorités du jour",
        detail: `${todayTasks.length} tâche(s) à cadrer`,
        href: "/dashboard/organisation",
        tone: "neutral" as const,
      },
      projectRisks.length > 0 && {
        id: "project-risk",
        label: "Revoir les projets à risque",
        detail: `${projectRisks.length} projet(s) à surveiller`,
        href: "/dashboard/projets",
        tone: "warning" as const,
      },
    ].filter((action): action is SuggestedAction => Boolean(action)).slice(0, 4)

    return {
      generatedAt: now.toISOString(),
      today: {
        date: todayStart.toISOString(),
        tasks: todayTasks.map((task) => ({
          id: task.id,
          title: task.title,
          status: task.status,
          priority: task.priority,
          category: task.category,
          estimateMin: task.estimateMin,
          scheduledDate: toIso(task.scheduledDate),
          dueDate: toIso(task.dueDate),
          project: task.project
            ? {
                id: task.project.id,
                name: task.project.name,
                clientName: task.project.client.name,
              }
            : null,
          client: task.client ? { id: task.client.id, name: task.client.name } : null,
          goal: task.goal ? { id: task.goal.id, title: task.goal.title, scope: task.goal.scope } : null,
        })),
        blockedTasks,
      },
      week: {
        plannedMinutes: weekPlannedMinutes,
        openTasks: weekTasks.length,
        highPriorityTasks: weekHighPriority,
      },
      relances: {
        invoices: actionableInvoices.map((invoice) => ({
          id: invoice.id,
          number: invoice.number,
          object: invoice.object,
          clientName: invoice.client.name,
          dueDate: invoice.dueDate.toISOString(),
          remainingCents: invoice.totalTtcCents - invoice.paidAmountCents,
          status: invoice.status,
        })),
        quotes: staleQuotes.map((quote) => ({
          id: quote.id,
          number: quote.number,
          object: quote.object,
          clientName: quote.client.name,
          validUntil: toIso(quote.validUntil),
          updatedAt: quote.updatedAt.toISOString(),
          totalTtcCents: quote.versions[0]?.totalTtcCents ?? 0,
          status: quote.status,
        })),
      },
      unbilled: {
        entryCount: unbilledEntries.length,
        durationSec: unbilledSeconds,
        estimatedCents: computeUnbilledValueCents(unbilledSeconds, DEFAULT_HOURLY_RATE_CENTS),
        hourlyRateCents: DEFAULT_HOURLY_RATE_CENTS,
        projects: unbilledByProject.map((project) => ({
          ...project,
          estimatedCents: computeUnbilledValueCents(project.durationSec, DEFAULT_HOURLY_RATE_CENTS),
        })),
      },
      projectRisks: projectRisks.map(({ project, risk }) => ({
        id: project.id,
        name: project.name,
        clientName: project.client.name,
        budgetCents: project.budgetCents,
        consumedCents: project.consumedCents,
        endDate: toIso(project.endDate),
        risk,
      })),
      suggestedActions,
    }
  })
}

/** Snapshot financier annuel de l’espace courant. Les indicateurs restent précomptables. */
export async function getAccountingSnapshot() {
  return await withAuth(async ({ companyId }) => {
    const now = new Date()
    const yearStart = new Date(now.getFullYear(), 0, 1)
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    const [invoicesYear, invoicesMonth, paymentsYear, expensesYear, recentPaid, settings, projects, outstanding] = await Promise.all([
      prisma.invoice.findMany({
        where: {
          companyId,
          status: { in: ["SENT", "PAID", "OVERDUE"] },
          date: { gte: yearStart },
        },
        select: {
          totalHtCents: true,
          totalTvaCents: true,
          totalTtcCents: true,
          paidAmountCents: true,
          status: true,
        },
      }),
      prisma.invoice.findMany({
        where: {
          companyId,
          status: { in: ["SENT", "PAID", "OVERDUE"] },
          date: { gte: monthStart },
        },
        select: { totalHtCents: true, totalTtcCents: true, paidAmountCents: true, status: true },
      }),
      prisma.invoicePayment.findMany({
        where: { invoice: { companyId }, date: { gte: yearStart } },
        select: { amountCents: true },
      }),
      prisma.expense.findMany({
        where: { companyId, date: { gte: yearStart } },
        select: { amountCents: true, tvaCents: true },
      }),
      prisma.invoice.findMany({
        where: { companyId, status: "PAID" },
        orderBy: { date: "desc" },
        take: 20,
        select: {
          id: true,
          number: true,
          date: true,
          totalTtcCents: true,
          paidAmountCents: true,
          client: { select: { id: true, name: true } },
        },
      }),
      prisma.company.findUnique({
        where: { id: companyId },
        select: {
          isTvaApplicable: true,
        },
      }),
      prisma.project.findMany({
        where: { companyId },
        select: {
          id: true,
          name: true,
          client: { select: { name: true } },
          timeEntries: {
            where: { date: { gte: yearStart } },
            select: { durationSec: true, isBillable: true },
          },
          invoices: {
            where: { date: { gte: yearStart }, status: { in: ["SENT", "PAID", "OVERDUE"] } },
            select: { totalHtCents: true },
          },
          expenses: {
            where: { date: { gte: yearStart } },
            select: { amountCents: true },
          },
        },
      }),
      prisma.invoice.findMany({
        where: { companyId, status: { in: ["SENT", "OVERDUE"] } },
        select: { dueDate: true, totalTtcCents: true, paidAmountCents: true },
      }),
    ])

    const caYearCents = invoicesYear.reduce((sum, i) => sum + i.totalHtCents, 0)
    const billedYearTtcCents = invoicesYear.reduce((sum, i) => sum + i.totalTtcCents, 0)
    const caMonthCents = invoicesMonth.reduce((sum, i) => sum + i.totalHtCents, 0)
    const paidYearCents = paymentsYear.reduce((sum, payment) => sum + payment.amountCents, 0)
    const expensesYearCents = expensesYear.reduce((sum, e) => sum + e.amountCents, 0)
    const expenseHtCents = expensesYear.reduce((sum, expense) => sum + expense.amountCents - expense.tvaCents, 0)
    const directMarginCents = caYearCents - expenseHtCents
    const tvaCollectedCents = invoicesYear.reduce((sum, invoice) => sum + invoice.totalTvaCents, 0)
    const tvaDeductibleCents = expensesYear.reduce((sum, expense) => sum + expense.tvaCents, 0)
    const tvaBalanceCents = tvaCollectedCents - tvaDeductibleCents
    const outstandingCents = outstanding.reduce((sum, invoice) => sum + Math.max(0, invoice.totalTtcCents - invoice.paidAmountCents), 0)
    const overdue = outstanding.filter((invoice) => invoice.dueDate.getTime() < now.getTime())
    const overdueCents = overdue.reduce((sum, invoice) => sum + Math.max(0, invoice.totalTtcCents - invoice.paidAmountCents), 0)
    const nowMs = now.getTime()
    const forecast = (days: number) => outstanding
      .filter((invoice) => invoice.dueDate.getTime() <= nowMs + days * 86_400_000)
      .reduce((sum, invoice) => sum + Math.max(0, invoice.totalTtcCents - invoice.paidAmountCents), 0)
    const projectProfitability = projects.map((project) => {
      const revenueCents = project.invoices.reduce((sum, invoice) => sum + invoice.totalHtCents, 0)
      const expenseCents = project.expenses.reduce((sum, expense) => sum + expense.amountCents, 0)
      const totalSeconds = project.timeEntries.reduce((sum, entry) => sum + entry.durationSec, 0)
      const billableSeconds = project.timeEntries
        .filter((entry) => entry.isBillable)
        .reduce((sum, entry) => sum + entry.durationSec, 0)
      return {
        id: project.id,
        name: project.name,
        clientName: project.client.name,
        revenueCents,
        expenseCents,
        marginCents: revenueCents - expenseCents,
        totalSeconds,
        billableSeconds,
        effectiveHourlyRateCents: totalSeconds > 0 ? Math.round(revenueCents / (totalSeconds / 3600)) : 0,
      }
    }).filter((project) => project.totalSeconds > 0 || project.revenueCents !== 0)
      .sort((a, b) => b.revenueCents - a.revenueCents)

    return {
      caYearCents,
      billedYearTtcCents,
      caMonthCents,
      paidYearCents,
      expensesYearCents,
      expenseHtCents,
      directMarginCents,
      outstandingCents,
      overdueCents,
      overdueCount: overdue.length,
      tvaCollectedCents,
      tvaDeductibleCents,
      tvaBalanceCents,
      isTvaApplicable: settings?.isTvaApplicable ?? false,
      cashForecast: {
        days30Cents: forecast(30),
        days60Cents: forecast(60),
        days90Cents: forecast(90),
      },
      projectProfitability,
      recentPaid,
    }
  })
}
