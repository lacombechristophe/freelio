"use server"

import { calendarPeriods } from "@/lib/calendar-days"
import { withAuth } from "@/lib/auth-wrapper"
import { messageReadSelect } from "@/lib/communications/inbox-reader"
import {
  diagnosticSteps,
  diagnosticStringList,
  equipmentWarrantyStatus,
  scoreDiagnosticGuide,
} from "@/lib/operations/service-diagnostics"
import { scoreServiceDuplicate } from "@/lib/operations/service-duplicates"
import { serviceFirstResponseTarget, serviceResolutionTarget, serviceSlaPolicy } from "@/lib/operations/service-sla"
import { readHelpDeskDashboard } from "@/lib/operations/help-desk"
import { hasPermission } from "@/lib/permissions"
import { clientWithAccessibleMetrics } from "@/lib/client-metrics-access"
import { isPublicReadOnlyDemo } from "@/lib/demo-policy"
import { readStockDirectory } from "@/lib/operations/stock-directory"
import { operationsDashboardScope } from "@/lib/operations/dashboard-scope"
import prisma from "@/lib/prisma"
import {
  readSupplierProducts,
  readSupplierOrders,
  readSupplierReturns,
  readSupplierMetrics,
  supplierHistoryQuery,
} from "@/lib/operations/supplier-history"
import { purchaseDraftRevision } from "@/lib/operations/purchase-drafts"
import { readPurchaseOrderDirectory, readPurchaseOrderSummary } from "@/lib/operations/purchase-directory"
import { readOperationsProjectChoices } from "@/lib/operations/project-choices"
import { activitySummaryQuery, readOperationsActivity } from "@/lib/operations/activity-summary"
import { readOperationsTicketDirectory, readOperationsInterventionDirectory, readOperationsMaintenanceDirectory } from "@/lib/operations/service-directory"
import { readOperationsPlanningSummary } from "@/lib/operations/planning-summary"
import { id } from "./schemas"
import { serviceMacroText, renderServiceMacro } from "./service-macros"

export async function getOperationsProjectChoices(input: unknown = {}) {
  return withAuth(context => readOperationsProjectChoices(context, input), "operations.read")
}

export async function getOperationsTicketDirectory(input: unknown = {}) {
  return withAuth(context => readOperationsTicketDirectory(context, input), "operations.read")
}

export async function getOperationsInterventionDirectory(input: unknown = {}) {
  return withAuth(context => readOperationsInterventionDirectory(context, input), "operations.read")
}

export async function getOperationsMaintenanceDirectory(input: unknown = {}) {
  return withAuth(context => readOperationsMaintenanceDirectory(context, input), "operations.read")
}

export async function getOperationsPlanningSummary(input: unknown = {}) {
  return withAuth(context => readOperationsPlanningSummary(context, input), "operations.read")
}

export async function getOperationsActivitySummary(input: unknown = {}) {
  return withAuth(async ({ companyId, agencyIds }) => {
    const query = activitySummaryQuery.parse(input)
    const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { serviceTimezone: true } })
    const now = new Date()
    return readOperationsActivity(companyId, agencyIds, now, calendarPeriods(now, company.serviceTimezone).tomorrowStart, query.agencyId)
  }, "operations.read")
}

export async function getOperationsDashboard() {
  return withAuth(async ({ companyId, role, agencyIds }) => {
    const canReadFinance = hasPermission(role, "finance.read")
    const scope = operationsDashboardScope(companyId, agencyIds)
    const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { serviceTimezone: true } })
    const now = new Date()
    const [
      agencies,
      sites,
      stock,
      warehouses,
      purchaseOrders,
      equipments,
      tickets,
      interventions,
      contracts,
      projects,
      members,
      customerOrders,
      goodsReceipts,
      reservations,
      deliveryNotes,
      stockTransfers,
      purchaseSummary,
      activity,
    ] = await Promise.all([
      prisma.agency.findMany({
        where: { ...scope.agency, active: true },
        select: { id: true, code: true, name: true, isDefault: true,
          _count: { select: { customerSites: { where: scope.site }, projects: { where: { ...scope.project, status: "ACTIVE" } } } },
        },
        orderBy: [{ isDefault: "desc" }, { name: "asc" }],
      }),
      prisma.customerSite.findMany({
        where: scope.site,
        include: { client: { select: { name: true } }, _count: { select: { equipments: { where: scope.equipment }, serviceTickets: { where: scope.ticket } } } },
        orderBy: { updatedAt: "desc" },
        take: 100,
      }),
      readStockDirectory(companyId, agencyIds, { search: "", page: 1 }),
      prisma.warehouse.findMany({
        where: { ...scope.warehouse, active: true },
        orderBy: { name: "asc" },
      }),
      readPurchaseOrderDirectory(companyId, agencyIds, { search: "", page: 1, status: "ALL" }),
      prisma.equipment.findMany({
        where: scope.equipment,
        include: { site: { include: { client: { select: { name: true } } } }, product: { select: { label: true, sku: true } } },
        orderBy: { updatedAt: "desc" },
        take: 200,
      }),
      prisma.serviceTicket.findMany({
        where: { ...scope.ticket, status: { not: "MERGED" } },
        include: {
          client: { select: { name: true } },
          site: { select: { label: true, agencyId: true } },
          equipment: { select: { label: true } },
          assignedMembership: { include: { user: { select: { name: true, email: true } } } },
          _count: { select: { interventions: { where: scope.intervention } } },
        },
        orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
        take: 200,
      }),
      prisma.fieldIntervention.findMany({
        where: scope.intervention,
        include: {
          site: { include: { client: { select: { name: true } } } },
          ticket: { select: { number: true } },
          assignedMembership: { include: { user: { select: { name: true, email: true } } } },
          files: { orderBy: { createdAt: "asc" }, select: { id: true, name: true, mimeType: true, size: true, kind: true, createdAt: true } },
          stockMovements: {
            where: { ...scope.stockMovement, type: "OUT" },
            include: { product: { select: { label: true, sku: true } }, warehouse: { select: { name: true } } },
            orderBy: { happenedAt: "asc" },
          },
          expenses: { where: scope.expense, select: { id: true, label: true, amountCents: true, status: true }, orderBy: { createdAt: "asc" } },
          reservations: { where: { companyId }, orderBy: { createdAt: "asc" } },
        },
        orderBy: { scheduledStart: "asc" },
        take: 200,
      }),
      prisma.maintenanceContract.findMany({
        where: scope.contract,
        omit: { currentRenewalProposalId: true, acceptedRenewalProposalId: true },
        include: {
          client: { select: { name: true } },
          site: { select: { label: true, agencyId: true } },
          recurringInvoice: { select: { id: true, isActive: true } },
          renewedFrom: { select: { id: true, number: true } },
          renewalProposals: { where: { companyId, client: { companyId } }, select: { id: true, number: true, status: true }, orderBy: { createdAt: "desc" }, take: 1 },
          _count: { select: { equipments: { where: { equipment: scope.equipment } }, renewedContracts: { where: scope.contract } } },
        },
        orderBy: [{ endDate: "asc" }, { nextVisitAt: "asc" }],
        take: 200,
      }),
      prisma.project.findMany({
        where: { ...scope.project, status: "ACTIVE" },
        select: { id: true, name: true, clientId: true, siteId: true, agencyId: true },
        orderBy: { name: "asc" },
        take: 300,
      }),
      prisma.membership.findMany({
        where: { companyId, status: "ACTIVE" },
        include: { user: { select: { name: true, email: true } }, agencyMemberships: { where: { agency: scope.agency }, select: { agencyId: true, isPrimary: true } } },
        orderBy: { createdAt: "asc" },
      }),
      prisma.customerOrder.findMany({
        where: scope.customerOrder,
        include: {
          client: { select: { name: true } },
          project: { select: { name: true, agencyId: true } },
          lines: true,
          invoices: canReadFinance ? { where: scope.invoice, select: { id: true, type: true, status: true } } : false,
          _count: { select: { deliveryNotes: { where: scope.deliveryNote }, stockReservations: { where: scope.reservation } } },
        },
        orderBy: { createdAt: "desc" },
        take: 150,
      }),
      prisma.goodsReceipt.findMany({
        where: scope.goodsReceipt,
        include: {
          purchaseOrder: { include: { supplier: { select: { name: true } } } },
          warehouse: { select: { name: true, agencyId: true } },
          lines: { where: scope.receiptLine, include: { product: { select: { sku: true, label: true } }, issues: { where: scope.purchaseIssue } } },
        },
        orderBy: { receivedAt: "desc" },
        take: 100,
      }),
      prisma.stockReservation.findMany({
        where: { ...scope.reservation, status: "ACTIVE" },
        include: {
          warehouse: { select: { name: true, agencyId: true } },
          product: { select: { sku: true, label: true } },
          project: { select: { name: true, agencyId: true } },
          customerOrder: { select: { number: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 150,
      }),
      prisma.deliveryNote.findMany({
        where: scope.deliveryNote,
        omit: { signedDocument: true },
        include: { customerOrder: { include: { client: { select: { name: true } }, project: { select: { agencyId: true } } } }, lines: true },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      prisma.stockTransfer.findMany({
        where: scope.stockTransfer,
        include: {
          fromWarehouse: { select: { name: true, agencyId: true } },
          toWarehouse: { select: { name: true, agencyId: true } },
          product: { select: { sku: true, label: true } },
        },
        orderBy: { happenedAt: "desc" },
        take: 100,
      }),
      readPurchaseOrderSummary(companyId, agencyIds),
      readOperationsActivity(companyId, agencyIds, now, calendarPeriods(now, company.serviceTimezone).tomorrowStart),
    ])
    return {
      generatedAt: now.toISOString(),
      timeZone: company.serviceTimezone,
      tomorrowStart: calendarPeriods(now, company.serviceTimezone).tomorrowStart.toISOString(),
      agencies,
      sites,
      stock,
      warehouses,
      purchaseOrders: purchaseOrders.items,
      purchaseSummary,
      activity,
      equipments,
      tickets,
      interventions,
      contracts: contracts.map(contract => ({ ...contract,
        canManageRenewal: hasPermission(role, "service.write") && !isPublicReadOnlyDemo(),
        canCreateRenewalProposal: hasPermission(role, "sales.write") && !isPublicReadOnlyDemo(),
        canRenew: hasPermission(role, "service.write") && hasPermission(role, "operations.write") && (!(contract.autoInvoice || contract.recurringInvoice?.isActive) || hasPermission(role, "finance.write")) && !isPublicReadOnlyDemo(),
      })),
      projects,
      members,
      customerOrders: customerOrders.map(order => ({
        ...order,
        billingStatus: canReadFinance ? order.billingStatus : null,
        invoices: canReadFinance ? order.invoices : [],
        _count: { ...order._count, invoices: canReadFinance ? order.invoices.length : null },
      })),
      goodsReceipts,
      reservations,
      deliveryNotes,
      stockTransfers,
      canApprovePurchases: hasPermission(role, "purchases.approve"),
      canManagePurchases: hasPermission(role, "operations.write") && !isPublicReadOnlyDemo(),
      canManageDeliveries: hasPermission(role, "operations.write") && !isPublicReadOnlyDemo(),
      canBillOrders: hasPermission(role, "finance.write") && !isPublicReadOnlyDemo(),
      canAutomateMaintenanceBilling: hasPermission(role, "finance.write") && !isPublicReadOnlyDemo(),
    }
  }, "operations.read")
}

export async function getServiceTicketDetail(ticketId: string) {
  return withAuth(async ({ companyId, role, agencyIds }) => {
    const parsedId = id.safeParse(ticketId)
    if (!parsedId.success) return null
    const scope = operationsDashboardScope(companyId, agencyIds)
    const ticketScope = { ...scope.ticket, ...(agencyIds === null ? {} : { site: scope.site }) }
    const noteScope = { companyId, OR: [{ authorMembershipId: null }, { authorMembership: { companyId } }] }
    const diagnosticScope = { companyId, AND: [
      { OR: [{ performedByMembershipId: null }, { performedByMembership: { companyId } }] },
      { OR: [{ guideId: null }, { guide: { companyId } }] },
    ] }
    const threadScope = { companyId, AND: [
      { OR: [{ channelId: null }, { channel: { companyId } }] },
      { OR: [{ clientId: null }, { client: { companyId } }] },
      { OR: [{ contactId: null }, { contact: { client: { companyId } } }] },
      { OR: [{ leadCaptureId: null }, { leadCapture: { companyId } }] },
    ] }
    const messages = { where: { companyId }, select: { ...messageReadSelect,
      events: { ...messageReadSelect.events, where: { companyId } },
    }, orderBy: { createdAt: "asc" as const }, take: 200 }
    const [ticket, members, company, serviceMacros, diagnosticGuides] = await Promise.all([
      prisma.serviceTicket.findFirst({
        where: { id: parsedId.data, ...ticketScope },
        include: {
          client: {
            include: {
              contacts: { orderBy: [{ isPrimary: "desc" }, { lastName: "asc" }] },
              emailThreads: {
                where: { serviceTicketId: null, ...threadScope },
                select: { id: true, subject: true, lastMessageAt: true, unreadCount: true },
                orderBy: { lastMessageAt: "desc" },
                take: 50,
              },
            },
          },
          site: true,
          equipment: true,
          assignedMembership: { include: { user: { select: { name: true, email: true } } } },
          mergedTickets: {
            where: ticketScope,
            include: {
              interventions: {
                where: scope.intervention,
                include: {
                  assignedMembership: { include: { user: { select: { name: true, email: true } } } },
                  files: { orderBy: { createdAt: "asc" } },
                  reservations: { where: { companyId }, orderBy: { createdAt: "desc" } },
                },
                orderBy: { scheduledStart: "desc" },
              },
              emailThreads: {
                where: threadScope,
                select: { id: true, subject: true, lastMessageAt: true, unreadCount: true, messages },
                orderBy: { lastMessageAt: "asc" },
              },
              notes: { where: noteScope, include: { authorMembership: { include: { user: { select: { name: true, email: true } } } } }, orderBy: { createdAt: "asc" }, take: 200 },
              diagnostics: { where: diagnosticScope, include: { performedByMembership: { include: { user: { select: { name: true, email: true } } } } }, orderBy: { completedAt: "desc" }, take: 50 },
            },
            orderBy: { mergedAt: "asc" },
          },
          interventions: {
            where: scope.intervention,
            include: {
              assignedMembership: { include: { user: { select: { name: true, email: true } } } },
              files: { orderBy: { createdAt: "asc" } },
              reservations: { where: { companyId }, orderBy: { createdAt: "desc" } },
            },
            orderBy: { scheduledStart: "desc" },
          },
          emailThreads: {
            where: threadScope,
            select: { id: true, subject: true, lastMessageAt: true, unreadCount: true, messages },
            orderBy: { lastMessageAt: "asc" },
          },
          notes: { where: noteScope, include: { authorMembership: { include: { user: { select: { name: true, email: true } } } } }, orderBy: { createdAt: "asc" }, take: 200 },
          diagnostics: { where: diagnosticScope, include: { performedByMembership: { include: { user: { select: { name: true, email: true } } } } }, orderBy: { completedAt: "desc" }, take: 50 },
        },
      }),
      prisma.membership.findMany({ where: { companyId, status: "ACTIVE" }, include: { user: { select: { name: true, email: true } } }, orderBy: { createdAt: "asc" } }),
      prisma.company.findUnique({
        where: { id: companyId },
        select: {
          name: true,
          serviceTimezone: true,
          serviceDayStart: true,
          serviceDayEnd: true,
          serviceWorkdays: true,
          serviceHolidays: true,
          serviceFirstResponseHours: true,
          serviceResolutionHours: true,
        },
      }),
      prisma.emailTemplate.findMany({
        where: { companyId, category: "SERVICE", status: "ACTIVE" },
        select: { id: true, name: true, subject: true, bodyHtml: true },
        orderBy: { name: "asc" },
        take: 200,
      }),
      prisma.serviceDiagnosticGuide.findMany({ where: { companyId, status: "ACTIVE" }, orderBy: [{ priority: "desc" }, { updatedAt: "desc" }], take: 200 }),
    ])
    if (!ticket) return null
    const mergedInto = ticket.mergedIntoTicketId
      ? await prisma.serviceTicket.findFirst({
          where: { id: ticket.mergedIntoTicketId, ...ticketScope },
          select: { id: true, number: true, title: true },
        })
      : null
    if (ticket.mergedIntoTicketId && !mergedInto) return null
    const duplicateRecords =
      ticket.status === "MERGED"
        ? []
        : await prisma.serviceTicket.findMany({
            where: {
              ...ticketScope,
              clientId: ticket.clientId,
              id: { not: ticket.id },
              status: { not: "MERGED" },
              mergedIntoTicketId: null,
              requestedAt: {
                gte: new Date(ticket.requestedAt.getTime() - 90 * 24 * 60 * 60 * 1_000),
                lte: new Date(ticket.requestedAt.getTime() + 90 * 24 * 60 * 60 * 1_000),
              },
            },
            select: { id: true, clientId: true, siteId: true, equipmentId: true, number: true, title: true, description: true, type: true, status: true, requestedAt: true },
            orderBy: { requestedAt: "desc" },
            take: 200,
          })
    const duplicateCandidates = duplicateRecords
      .flatMap((candidate) => {
        const match = scoreServiceDuplicate(ticket, candidate)
        return match ? [{ ...candidate, ...match }] : []
      })
      .sort((left, right) => right.score - left.score || left.requestedAt.getTime() - right.requestedAt.getTime())
      .slice(0, 10)
    const mergedTicketSummaries = ticket.mergedTickets.map((mergedTicket) => ({
      id: mergedTicket.id,
      number: mergedTicket.number,
      title: mergedTicket.title,
      previousStatus: mergedTicket.preMergeStatus,
      requestedAt: mergedTicket.requestedAt,
      mergedAt: mergedTicket.mergedAt,
      interventionCount: mergedTicket.interventions.length,
      conversationCount: mergedTicket.emailThreads.length,
      noteCount: mergedTicket.notes.length,
    }))
    const interventions = [
      ...ticket.interventions.map((item) => ({ ...item, mergedFrom: null })),
      ...ticket.mergedTickets.flatMap((source) => source.interventions.map((item) => ({ ...item, mergedFrom: { id: source.id, number: source.number } }))),
    ].sort((left, right) => right.scheduledStart.getTime() - left.scheduledStart.getTime())
    const emailThreads = [
      ...ticket.emailThreads.map((item) => ({ ...item, mergedFrom: null })),
      ...ticket.mergedTickets.flatMap((source) => source.emailThreads.map((item) => ({ ...item, mergedFrom: { id: source.id, number: source.number } }))),
    ].sort((left, right) => left.lastMessageAt.getTime() - right.lastMessageAt.getTime())
    const notes = [
      ...ticket.notes.map((item) => ({ ...item, mergedFrom: null })),
      ...ticket.mergedTickets.flatMap((source) => source.notes.map((item) => ({ ...item, mergedFrom: { id: source.id, number: source.number } }))),
    ].sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
    const diagnosticView = (item: (typeof ticket.diagnostics)[number], mergedFrom: { id: string; number: string } | null) => {
      const snapshot = item.guideSnapshot && typeof item.guideSnapshot === "object" && !Array.isArray(item.guideSnapshot) ? (item.guideSnapshot as Record<string, unknown>) : {}
      return {
        id: item.id,
        guideName: typeof snapshot.name === "string" ? snapshot.name : "Guide archivé",
        steps: diagnosticSteps(snapshot.steps),
        completedStepIds: diagnosticStringList(item.completedStepIds),
        warrantyStatus: item.warrantyStatus,
        symptom: item.symptom,
        outcome: item.outcome,
        recommendedAction: item.recommendedAction,
        completedAt: item.completedAt,
        performedBy: item.performedByMembership?.user.name || item.performedByMembership?.user.email || "Membre",
        mergedFrom,
      }
    }
    const diagnostics = [
      ...ticket.diagnostics.map((item) => diagnosticView(item, null)),
      ...ticket.mergedTickets.flatMap((source) => source.diagnostics.map((item) => diagnosticView(item, { id: source.id, number: source.number }))),
    ].sort((left, right) => right.completedAt.getTime() - left.completedAt.getTime())
    const guides = diagnosticGuides
      .map((guide) => {
        const match = scoreDiagnosticGuide(guide, ticket)
        return {
          id: guide.id,
          name: guide.name,
          productCategory: guide.productCategory,
          manufacturer: guide.manufacturer,
          modelPattern: guide.modelPattern,
          symptom: guide.symptom,
          steps: diagnosticSteps(guide.steps),
          resolutionHints: diagnosticStringList(guide.resolutionHints),
          warrantyInstructions: guide.warrantyInstructions,
          outOfWarrantyInstructions: guide.outOfWarrantyInstructions,
          suggested: Boolean(match),
          score: match?.score || 0,
          reasons: match?.reasons || [],
        }
      })
      .filter((guide) => guide.steps.length > 0)
      .sort((left, right) => Number(right.suggested) - Number(left.suggested) || right.score - left.score || left.name.localeCompare(right.name, "fr"))
    const warrantyStatus = equipmentWarrantyStatus(ticket.equipment?.warrantyUntil)
    const policy = serviceSlaPolicy(company)
    const contact = ticket.client.contacts[0]
    const variables = {
      "ticket.number": ticket.number,
      "ticket.title": ticket.title,
      "client.name": ticket.client.name,
      "contact.firstName": contact?.firstName || "",
      "contact.lastName": contact?.lastName || "",
      "assigned.name": ticket.assignedMembership?.user.name || ticket.assignedMembership?.user.email || "notre équipe",
      "company.name": company?.name || "notre entreprise",
    }
    const macros = serviceMacros.map((macro) => ({
      id: macro.id,
      name: macro.name,
      subject: renderServiceMacro(macro.subject, variables),
      bodyText: renderServiceMacro(serviceMacroText(macro.bodyHtml), variables),
    }))
    return {
      ...ticket,
      client: clientWithAccessibleMetrics(ticket.client, { role, agencyIds }),
      mergedInto,
      mergedTickets: mergedTicketSummaries,
      interventions,
      emailThreads,
      notes,
      diagnostics,
      diagnosticGuides: guides,
      warrantyStatus,
      duplicateCandidates,
      sla: { resolution: serviceResolutionTarget(ticket, policy), firstResponse: serviceFirstResponseTarget(ticket, policy), policy },
      macros,
      members: members.map((member) => ({ id: member.id, name: member.user.name || member.user.email || "Membre" })),
    }
  }, "service.read")
}

export async function getFieldInterventionDetail(interventionId: string) {
  return withAuth(async ({ companyId, role, agencyIds }) => {
    const parsedId = id.safeParse(interventionId)
    if (!parsedId.success) return null
    const scope = operationsDashboardScope(companyId, agencyIds)
    const intervention = await prisma.fieldIntervention.findFirst({
      where: { id: parsedId.data, ...scope.intervention },
      include: {
        site: { include: { client: { include: { contacts: { orderBy: [{ isPrimary: "desc" }, { lastName: "asc" }] } } } } },
        ticket: { select: { id: true, number: true, title: true } },
        project: { select: { id: true, name: true } },
        maintenanceContract: { select: { id: true, number: true, label: true } },
        assignedMembership: { include: { user: { select: { name: true, email: true } } } },
        files: { orderBy: { createdAt: "asc" } },
        stockMovements: { where: scope.stockMovement, include: { product: { select: { id: true, label: true } }, warehouse: { select: { id: true, name: true } } }, orderBy: { happenedAt: "desc" } },
        expenses: { where: scope.expense, orderBy: { date: "desc" } },
        reservations: { where: { companyId }, orderBy: { createdAt: "desc" } },
      },
    })
    return intervention ? { ...intervention, site: { ...intervention.site, client: clientWithAccessibleMetrics(intervention.site.client, { role, agencyIds }) } } : null
  }, "operations.read")
}

export async function getEquipmentDetail(equipmentId: string) {
  return withAuth(async ({ companyId, role, agencyIds }) => {
    const parsedId = id.safeParse(equipmentId)
    if (!parsedId.success) return null
    const scope = operationsDashboardScope(companyId, agencyIds)
    const equipment = await prisma.equipment.findFirst({
      where: { id: parsedId.data, ...scope.equipment },
      include: {
        site: { include: { client: { include: { contacts: { orderBy: [{ isPrimary: "desc" }, { lastName: "asc" }] } } } } },
        product: { select: { id: true, sku: true, label: true, manufacturer: true, supplier: { select: { id: true, name: true } } } },
        tickets: {
          where: { ...scope.ticket, ...(agencyIds === null ? {} : { site: scope.site }) },
          select: { id: true, number: true, title: true, description: true, status: true, priority: true, requestedAt: true, assignedMembership: { include: { user: { select: { name: true, email: true } } } }, _count: { select: { interventions: { where: scope.intervention } } } },
          orderBy: { requestedAt: "desc" },
        },
        maintenanceContracts: { where: { contract: scope.contract }, include: { contract: { select: { id: true, number: true, label: true, status: true, frequency: true, nextVisitAt: true } } }, orderBy: { contract: { createdAt: "desc" } } },
      },
    })
    return equipment ? { ...equipment, canManage: hasPermission(role, "operations.write"), site: { ...equipment.site, client: clientWithAccessibleMetrics(equipment.site.client, { role, agencyIds }) } } : null
  }, "operations.read")
}

export async function getSupplierDetail(supplierId: string) {
  return withAuth(async ({ companyId, role, agencyIds }) => {
    const parsedId = id.safeParse(supplierId)
    if (!parsedId.success) return null
    return prisma.$transaction(async tx => {
      const supplier = await tx.supplier.findFirst({ where: { id: parsedId.data, companyId } })
      if (!supplier) return null
      const scope = { companyId, agencyIds, supplierId: supplier.id }
      const query = supplierHistoryQuery.parse({})
      const metrics = await readSupplierMetrics(tx, scope)
      const products = await readSupplierProducts(tx, scope, query)
      const purchaseOrders = await readSupplierOrders(tx, scope, query)
      const supplierReturns = await readSupplierReturns(tx, scope, query)
      return { ...supplier, metrics, products, purchaseOrders, supplierReturns, canManage: hasPermission(role, "operations.write") }
    }, { isolationLevel: "Serializable" })
  }, "operations.read")
}

export async function getPurchaseOrderDetail(purchaseOrderId: string) {
  return withAuth(async ({ companyId, role, agencyIds }) => {
    const parsedId = id.safeParse(purchaseOrderId)
    if (!parsedId.success) return null
    const scope = operationsDashboardScope(companyId, agencyIds)
    const order = await prisma.purchaseOrder.findFirst({
      where: { id: parsedId.data, ...scope.purchaseOrder },
      include: {
        supplier: true,
        project: { select: { id: true, name: true, client: { select: { id: true, name: true } } } },
        approvedByMembership: { include: { user: { select: { name: true, email: true } } } },
        lines: {
          include: {
            product: true,
            receiptLines: { where: scope.receiptLine, include: { goodsReceipt: { include: { warehouse: true } }, issues: { where: scope.purchaseIssue } } },
            supplierReturns: { where: scope.supplierReturn, include: { warehouse: true, product: true } },
          },
          orderBy: { order: "asc" },
        },
        goodsReceipts: { where: scope.goodsReceipt, include: { warehouse: true, lines: { where: scope.receiptLine, include: { product: true, issues: { where: scope.purchaseIssue } } } }, orderBy: { receivedAt: "desc" } },
        issues: { where: scope.purchaseIssue, include: { product: true, purchaseOrderLine: true }, orderBy: { createdAt: "desc" } },
        supplierReturns: { where: scope.supplierReturn, include: { product: true, warehouse: true }, orderBy: { shippedAt: "desc" } },
      },
    })
    return order ? { ...order, draftRevision: purchaseDraftRevision(order), canManagePurchases: hasPermission(role, "operations.write") && !isPublicReadOnlyDemo(), canApprovePurchases: hasPermission(role, "purchases.approve") } : null
  }, "operations.read")
}

export async function getHelpDeskDashboard(input: unknown = {}) {
  return withAuth(context => readHelpDeskDashboard(context, input), "service.read")
}
