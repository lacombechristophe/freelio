"use server"

import { withAuth } from "@/lib/auth-wrapper"
import prisma from "@/lib/prisma"

export async function getWorkspaceOverview() {
  return withAuth(async ({ companyId }) => {
    const now = new Date()
    const [
      clients, contacts, activeLeads, openDeals, activeProjects, openTickets,
      scheduledInterventions, invoices, overdueInvoices, pendingPurchases,
      unreadEmail, activeWorkflows, activeSegments, activeProducts,
      maintenanceContracts, teamMembers, migrationRuns, activeConnections,
      quotes, contracts, dueTasks,
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
    }
  }, "crm.read")
}
