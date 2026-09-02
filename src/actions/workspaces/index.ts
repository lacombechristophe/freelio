"use server"

import { withAuth } from "@/lib/auth-wrapper"
import prisma from "@/lib/prisma"

function dateKey(value: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(value)
}

function dailySeries(days: number, now: Date, groups: Array<{ name: string; dates: Date[] }>) {
  const start = new Date(now)
  start.setDate(start.getDate() - days + 1)
  start.setHours(0, 0, 0, 0)
  const labels = Array.from({ length: days }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    return { key: dateKey(date), label: new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", timeZone: "Europe/Paris" }).format(date) }
  })
  return {
    labels: labels.map((item) => item.label),
    series: groups.map((group) => {
      const counts = new Map<string, number>()
      for (const date of group.dates) counts.set(dateKey(date), (counts.get(dateKey(date)) ?? 0) + 1)
      return { name: group.name, values: labels.map((item) => counts.get(item.key) ?? 0) }
    }),
  }
}

function dailyAmountSeries(days: number, now: Date, events: Array<{ date: Date; amountCents: number }>) {
  const start = new Date(now)
  start.setDate(start.getDate() - days + 1)
  start.setHours(0, 0, 0, 0)
  const labels = Array.from({ length: days }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    return { key: dateKey(date), label: new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", timeZone: "Europe/Paris" }).format(date) }
  })
  const amounts = new Map<string, number>()
  for (const event of events) amounts.set(dateKey(event.date), (amounts.get(dateKey(event.date)) ?? 0) + event.amountCents)
  return { labels: labels.map((item) => item.label), series: [{ name: "Encaissements", values: labels.map((item) => Math.round((amounts.get(item.key) ?? 0) / 100)) }] }
}

export type WorkspaceScope = "ALL" | "CRM" | "SALES" | "MARKETING" | "SERVICE" | "REVENUE"

export async function getWorkspaceOverview(scope: WorkspaceScope = "ALL") {
  return withAuth(async ({ companyId }) => {
    const now = new Date()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1_000)
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1_000)
    const needs = (...scopes: WorkspaceScope[]) => scope === "ALL" || scopes.includes(scope)
    const [
      clients, contacts, activeLeads, openDeals, activeProjects, openTickets,
      scheduledInterventions, invoices, overdueInvoices, pendingPurchases,
      unreadEmail, activeWorkflows, activeSegments, activeProducts,
      maintenanceContracts, teamMembers, migrationRuns, activeConnections,
      quotes, contracts, dueTasks, recentClients, priorityTasks,
      opportunities, campaigns, workflows, priorityTickets, recentInvoices,
      recentLeads, conversations, recentQuotes, sequences, activityEvents,
      leadEvents, messageEvents, leadSourceEvents, paymentEvents,
      outstandingInvoices, clientHealth,
    ] = await Promise.all([
      prisma.client.count({ where: { companyId } }),
      prisma.contact.count({ where: { client: { companyId } } }),
      prisma.leadCapture.count({ where: { companyId, status: { notIn: ["ARCHIVED", "SPAM"] } } }),
      prisma.opportunity.aggregate({ where: { pipeline: { companyId }, status: { notIn: ["WON", "LOST"] } }, _count: { _all: true }, _sum: { valueCents: true } }),
      prisma.project.count({ where: { companyId, status: "ACTIVE" } }),
      prisma.serviceTicket.count({ where: { companyId, status: { notIn: ["RESOLVED", "CLOSED", "CANCELLED"] } } }),
      prisma.fieldIntervention.count({ where: { companyId, status: { in: ["PLANNED", "IN_PROGRESS"] }, scheduledStart: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1_000) } } }),
      prisma.invoice.aggregate({ where: { companyId, status: { in: ["SENT", "OVERDUE"] } }, _sum: { totalTtcCents: true, paidAmountCents: true } }),
      prisma.invoice.count({ where: { companyId, status: { in: ["SENT", "OVERDUE"] }, dueDate: { lt: now } } }),
      prisma.purchaseOrder.count({ where: { companyId, status: { in: ["DRAFT", "SUBMITTED", "APPROVED", "SENT", "ACKNOWLEDGED", "PARTIALLY_RECEIVED"] } } }),
      prisma.emailThread.aggregate({ where: { companyId, status: "OPEN" }, _sum: { unreadCount: true } }),
      prisma.automationWorkflow.count({ where: { companyId, status: "ACTIVE" } }),
      prisma.marketingSegment.count({ where: { companyId, status: "ACTIVE" } }),
      prisma.product.count({ where: { companyId, active: true } }),
      prisma.maintenanceContract.count({ where: { companyId, status: "ACTIVE" } }),
      prisma.membership.count({ where: { companyId, status: "ACTIVE" } }),
      prisma.migrationRun.count({ where: { companyId } }),
      prisma.dataSourceConnection.count({ where: { companyId, status: "ACTIVE" } }),
      prisma.quote.count({ where: { companyId, status: { not: "ARCHIVED" } } }),
      prisma.contract.count({ where: { companyId, status: { not: "ARCHIVED" } } }),
      prisma.organisationTask.count({ where: { companyId, status: { notIn: ["DONE"] }, dueDate: { lte: new Date(now.getTime() + 48 * 60 * 60 * 1_000) } } }),
      needs("CRM") ? prisma.client.findMany({
        where: { companyId },
        select: { id: true, name: true, relationScore: true, nextActionAt: true, nextActionLabel: true, _count: { select: { contacts: true, projects: true } } },
        orderBy: { updatedAt: "desc" },
        take: 5,
      }) : Promise.resolve([]),
      needs("CRM", "SALES") ? prisma.organisationTask.findMany({
        where: { companyId, status: { notIn: ["DONE"] }, OR: [{ dueDate: { lte: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1_000) } }, { priority: 1 }] },
        select: { id: true, title: true, priority: true, status: true, dueDate: true, client: { select: { name: true } }, project: { select: { name: true } } },
        orderBy: [{ priority: "asc" }, { dueDate: "asc" }, { updatedAt: "desc" }],
        take: 6,
      }) : Promise.resolve([]),
      needs("SALES") ? prisma.opportunity.findMany({
        where: { pipeline: { companyId }, status: { notIn: ["WON", "LOST"] } },
        select: { id: true, title: true, status: true, valueCents: true, probability: true, closeDate: true, client: { select: { name: true } } },
        orderBy: [{ closeDate: "asc" }, { updatedAt: "desc" }],
        take: 6,
      }) : Promise.resolve([]),
      needs("MARKETING") ? prisma.marketingCampaign.findMany({
        where: { companyId, status: { not: "ARCHIVED" } },
        select: { id: true, name: true, objective: true, status: true, budgetCents: true, startAt: true, _count: { select: { assets: true, sequences: true } } },
        orderBy: { updatedAt: "desc" },
        take: 6,
      }) : Promise.resolve([]),
      needs("MARKETING") ? prisma.automationWorkflow.findMany({
        where: { companyId, status: { not: "ARCHIVED" } },
        select: { id: true, name: true, trigger: true, status: true, _count: { select: { runs: true } } },
        orderBy: { updatedAt: "desc" },
        take: 6,
      }) : Promise.resolve([]),
      needs("SERVICE") ? prisma.serviceTicket.findMany({
        where: { companyId, status: { notIn: ["RESOLVED", "CLOSED", "CANCELLED", "MERGED"] } },
        select: { id: true, number: true, title: true, priority: true, status: true, dueAt: true, client: { select: { name: true } } },
        orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
        take: 8,
      }) : Promise.resolve([]),
      needs("REVENUE") ? prisma.invoice.findMany({
        where: { companyId, status: { not: "CANCELLED" } },
        select: { id: true, number: true, object: true, status: true, dueDate: true, totalTtcCents: true, paidAmountCents: true, client: { select: { name: true } } },
        orderBy: { date: "desc" },
        take: 8,
      }) : Promise.resolve([]),
      needs("CRM", "MARKETING") ? prisma.leadCapture.findMany({
        where: { companyId, status: { notIn: ["ARCHIVED", "SPAM"] } },
        select: { id: true, firstName: true, lastName: true, city: true, projectType: true, source: true, status: true, score: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 6,
      }) : Promise.resolve([]),
      needs("CRM", "MARKETING") ? prisma.emailThread.findMany({
        where: { companyId, status: "OPEN" },
        select: { id: true, subject: true, unreadCount: true, lastMessageAt: true, client: { select: { name: true } }, leadCapture: { select: { firstName: true, lastName: true } } },
        orderBy: { lastMessageAt: "desc" },
        take: 6,
      }) : Promise.resolve([]),
      needs("SALES") ? prisma.quote.findMany({
        where: { companyId, status: { not: "ARCHIVED" } },
        select: { id: true, number: true, object: true, status: true, validUntil: true, client: { select: { name: true } }, versions: { select: { totalHtCents: true, totalTtcCents: true }, orderBy: { version: "desc" }, take: 1 } },
        orderBy: { updatedAt: "desc" },
        take: 6,
      }) : Promise.resolve([]),
      needs("MARKETING") ? prisma.emailSequence.findMany({
        where: { companyId, status: { not: "ARCHIVED" } },
        select: { id: true, name: true, status: true, _count: { select: { enrollments: true, deliveries: true, steps: true } } },
        orderBy: { updatedAt: "desc" },
        take: 6,
      }) : Promise.resolve([]),
      needs("CRM", "MARKETING") ? prisma.clientActivity.findMany({ where: { client: { companyId }, happenedAt: { gte: thirtyDaysAgo } }, select: { happenedAt: true }, take: 2_000 }) : Promise.resolve([]),
      needs("CRM", "MARKETING") ? prisma.leadCapture.findMany({ where: { companyId, createdAt: { gte: thirtyDaysAgo } }, select: { createdAt: true }, take: 2_000 }) : Promise.resolve([]),
      needs("CRM", "MARKETING") ? prisma.emailMessage.findMany({ where: { companyId, createdAt: { gte: thirtyDaysAgo } }, select: { createdAt: true, direction: true }, take: 3_000 }) : Promise.resolve([]),
      needs("MARKETING") ? prisma.leadCapture.findMany({ where: { companyId, createdAt: { gte: ninetyDaysAgo }, status: { notIn: ["ARCHIVED", "SPAM"] } }, select: { source: true, utmSource: true, createdAt: true }, take: 3_000 }) : Promise.resolve([]),
      needs("REVENUE") ? prisma.invoicePayment.findMany({ where: { invoice: { companyId }, date: { gte: ninetyDaysAgo } }, select: { amountCents: true, date: true }, take: 3_000 }) : Promise.resolve([]),
      needs("REVENUE") ? prisma.invoice.findMany({
        where: { companyId, status: { in: ["SENT", "OVERDUE"] } },
        select: { id: true, number: true, object: true, status: true, dueDate: true, totalTtcCents: true, paidAmountCents: true, client: { select: { name: true } } },
        orderBy: { dueDate: "asc" },
        take: 100,
      }) : Promise.resolve([]),
      needs("CRM", "SERVICE") ? prisma.client.findMany({ where: { companyId }, select: { relationScore: true }, take: 2_000 }) : Promise.resolve([]),
    ])

    return {
      clients,
      contacts,
      activeLeads,
      openDeals: openDeals._count._all,
      openDealValueCents: openDeals._sum.valueCents ?? 0,
      activeProjects,
      openTickets,
      scheduledInterventions,
      outstandingCents: Math.max(0, (invoices._sum.totalTtcCents ?? 0) - (invoices._sum.paidAmountCents ?? 0)),
      overdueInvoices,
      pendingPurchases,
      unreadEmail: unreadEmail._sum.unreadCount ?? 0,
      activeWorkflows,
      activeSegments,
      activeProducts,
      maintenanceContracts,
      teamMembers,
      migrationRuns,
      activeConnections,
      quotes,
      contracts,
      dueTasks,
      recentClients,
      priorityTasks,
      opportunities,
      campaigns,
      workflows,
      priorityTickets,
      recentInvoices,
      recentLeads,
      conversations,
      recentQuotes,
      sequences,
      activitySeries: dailySeries(30, now, [
        { name: "Nouveaux prospects", dates: leadEvents.map((event) => event.createdAt) },
        { name: "Interactions", dates: activityEvents.map((event) => event.happenedAt) },
        { name: "E-mails", dates: messageEvents.map((event) => event.createdAt) },
      ]),
      leadSources: Object.entries(leadSourceEvents.reduce<Record<string, number>>((accumulator, lead) => {
        const source = (lead.utmSource || lead.source || "Autre").trim()
        accumulator[source] = (accumulator[source] ?? 0) + 1
        return accumulator
      }, {})).sort((left, right) => right[1] - left[1]).slice(0, 6).map(([name, value]) => ({ name, value })),
      paymentSeries: dailyAmountSeries(30, now, paymentEvents),
      paymentsLast90DaysCents: paymentEvents.reduce((sum, payment) => sum + payment.amountCents, 0),
      outstandingInvoices,
      clientHealth: {
        healthy: clientHealth.filter((client) => client.relationScore >= 80).length,
        watch: clientHealth.filter((client) => client.relationScore >= 60 && client.relationScore < 80).length,
        risk: clientHealth.filter((client) => client.relationScore < 60).length,
      },
    }
  }, "crm.read")
}
