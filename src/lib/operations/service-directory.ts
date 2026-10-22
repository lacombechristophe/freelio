import "server-only"

import type { Prisma } from "@prisma/client"
import { z } from "zod"
import prisma, { type TransactionClient } from "@/lib/prisma"
import type { AuthContext } from "@/lib/auth-wrapper"
import { DIRECTORY_PAGE_SIZE } from "@/lib/directory-query"
import { hasPermission } from "@/lib/permissions"
import { isPublicReadOnlyDemo } from "@/lib/demo-policy"
import { calendarDayStart, shiftCalendarDay } from "@/lib/calendar-days"
import { operationsDashboardScope } from "./dashboard-scope"
import { ticketPriorityBuckets } from "./ticket-priority"

const baseQuery = z.object({ search: z.string().trim().max(200).default(""), page: z.number().int().min(1).max(100000).default(1), agencyId: z.string().cuid().optional() }).strict()
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T12:00:00Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}, "Date invalide")
const ticketQuery = baseQuery.extend({ status: z.enum(["ALL", "ACTIVE", "OPEN", "QUALIFIED", "PLANNED", "WAITING", "RESOLVED", "CLOSED"]).default("ALL"), priority: z.enum(["ALL", "URGENT", "HIGH", "NORMAL", "LOW"]).default("ALL") })
const interventionQuery = baseQuery.extend({ status: z.enum(["ALL", "PLANNED", "EN_ROUTE", "IN_PROGRESS", "COMPLETED", "CANCELED"]).default("ALL"), from: day.optional(), to: day.optional() }).refine(value => !value.from || !value.to || value.from <= value.to, "Période invalide")
const maintenanceQuery = baseQuery.extend({ status: z.enum(["ALL", "ACTIVE", "SUSPENDED", "EXPIRED", "CANCELED"]).default("ALL") })
type Scope = ReturnType<typeof operationsDashboardScope>

export function ticketDirectoryInclude(scope: Scope) {
  return { client: { select: { name: true } }, site: { select: { label: true, agencyId: true } }, equipment: { select: { label: true } },
    assignedMembership: { include: { user: { select: { name: true, email: true } } } }, _count: { select: { interventions: { where: scope.intervention } } },
  } as const satisfies Prisma.ServiceTicketInclude
}
export function interventionDirectoryInclude(scope: Scope, companyId: string) {
  return { site: { include: { client: { select: { name: true } } } }, ticket: { select: { number: true } },
    assignedMembership: { include: { user: { select: { name: true, email: true } } } },
    files: { orderBy: { createdAt: "asc" }, select: { id: true, name: true, mimeType: true, size: true, kind: true, createdAt: true } },
    stockMovements: { where: { ...scope.stockMovement, type: "OUT" }, include: { product: { select: { label: true, sku: true } }, warehouse: { select: { name: true } } }, orderBy: { happenedAt: "asc" } },
    expenses: { where: scope.expense, select: { id: true, label: true, amountCents: true, status: true }, orderBy: { createdAt: "asc" } },
    reservations: { where: { companyId }, orderBy: { createdAt: "asc" } },
  } as const satisfies Prisma.FieldInterventionInclude
}
export function maintenanceDirectoryInclude(scope: Scope, companyId: string) {
  return { client: { select: { name: true } }, site: { select: { label: true, agencyId: true } }, recurringInvoice: { select: { id: true, isActive: true } },
    renewedFrom: { select: { id: true, number: true } }, renewalProposals: { where: { companyId, client: { companyId } }, select: { id: true, number: true, status: true }, orderBy: { createdAt: "desc" }, take: 1 },
    _count: { select: { equipments: { where: { equipment: scope.equipment } }, renewedContracts: { where: scope.contract } } },
  } as const satisfies Prisma.MaintenanceContractInclude
}

const text = (search: string) => ({ contains: search, ...(process.env.DATABASE_URL?.startsWith("postgres") ? { mode: "insensitive" as const } : {}) })
const pageNumber = (page: number, total: number) => Math.min(page, Math.max(1, Math.ceil(total / DIRECTORY_PAGE_SIZE)))

export async function checkServiceAgency(tx: TransactionClient, context: Pick<AuthContext, "companyId" | "agencyIds">, agencyId?: string) {
  if (!agencyId) return
  const scope = operationsDashboardScope(context.companyId, context.agencyIds)
  if (!await tx.agency.findFirst({ where: { AND: [scope.agency, { id: agencyId, active: true }] }, select: { id: true } })) throw new Error("AGENCY_ACCESS_DENIED")
}

export async function readOperationsTicketDirectory(context: AuthContext, input: unknown) {
  const query = ticketQuery.parse(input), scope = operationsDashboardScope(context.companyId, context.agencyIds)
  const match = text(query.search)
  const where: Prisma.ServiceTicketWhereInput = { AND: [scope.ticket,
    ...(query.agencyId ? [{ site: { agencyId: query.agencyId } }] : []),
    ...(query.search ? [{ OR: [{ number: match }, { title: match }, { client: { name: match } }, { site: { label: match } }, { equipment: { label: match } }] }] : []),
  ], status: query.status === "ACTIVE" ? { in: ["OPEN", "QUALIFIED", "PLANNED", "WAITING"] } : query.status === "ALL" ? { not: "MERGED" } : query.status,
  ...(query.priority !== "ALL" ? { priority: query.priority } : {}) }
  return prisma.$transaction(async tx => {
    await checkServiceAgency(tx, context, query.agencyId)
    const buckets = ticketPriorityBuckets(where)
    const counts = await Promise.all(buckets.map(where => tx.serviceTicket.count({ where })))
    const total = counts.reduce((sum, count) => sum + count, 0), page = pageNumber(query.page, total)
    const include = ticketDirectoryInclude(scope)
    const items: Prisma.ServiceTicketGetPayload<{ include: typeof include }>[] = []
    let skip = (page - 1) * DIRECTORY_PAGE_SIZE
    for (let index = 0; index < buckets.length && items.length < DIRECTORY_PAGE_SIZE; index++) {
      if (skip >= counts[index]) { skip -= counts[index]; continue }
      items.push(...await tx.serviceTicket.findMany({ where: buckets[index], include, skip, take: DIRECTORY_PAGE_SIZE - items.length, orderBy: [{ updatedAt: "desc" }, { id: "asc" }] }))
      skip = 0
    }
    return { items, total, page }
  }, { isolationLevel: "Serializable" })
}

export async function readOperationsInterventionDirectory(context: AuthContext, input: unknown) {
  const query = interventionQuery.parse(input), scope = operationsDashboardScope(context.companyId, context.agencyIds)
  const match = text(query.search)
  return prisma.$transaction(async tx => {
    await checkServiceAgency(tx, context, query.agencyId)
    const company = await tx.company.findUniqueOrThrow({ where: { id: context.companyId }, select: { serviceTimezone: true } })
    const where: Prisma.FieldInterventionWhereInput = { AND: [scope.intervention,
      ...(query.agencyId ? [{ site: { agencyId: query.agencyId } }] : []),
      ...(query.search ? [{ OR: [{ title: match }, { site: { label: match } }, { site: { client: { name: match } } }, { ticket: { number: match } }] }] : []),
    ], ...(query.status !== "ALL" ? { status: query.status } : {}),
      ...((query.from || query.to) ? { scheduledStart: { ...(query.from ? { gte: calendarDayStart(query.from, company.serviceTimezone) } : {}), ...(query.to ? { lt: calendarDayStart(shiftCalendarDay(query.to, 1), company.serviceTimezone) } : {}) } } : {}),
    }
    const total = await tx.fieldIntervention.count({ where }), page = pageNumber(query.page, total)
    const items = await tx.fieldIntervention.findMany({ where, include: interventionDirectoryInclude(scope, context.companyId), skip: (page - 1) * DIRECTORY_PAGE_SIZE, take: DIRECTORY_PAGE_SIZE, orderBy: [{ scheduledStart: "asc" }, { id: "asc" }] })
    return { items, total, page, canManage: hasPermission(context.role, "operations.write") && !isPublicReadOnlyDemo() }
  }, { isolationLevel: "Serializable" })
}

export async function readOperationsMaintenanceDirectory(context: AuthContext, input: unknown) {
  const query = maintenanceQuery.parse(input), scope = operationsDashboardScope(context.companyId, context.agencyIds)
  const match = text(query.search)
  const where: Prisma.MaintenanceContractWhereInput = { AND: [scope.contract,
    ...(query.agencyId ? [{ site: { agencyId: query.agencyId } }] : []),
    ...(query.search ? [{ OR: [{ number: match }, { label: match }, { client: { name: match } }, { site: { label: match } }] }] : []),
  ], ...(query.status !== "ALL" ? { status: query.status } : {}) }
  return prisma.$transaction(async tx => {
    await checkServiceAgency(tx, context, query.agencyId)
    const total = await tx.maintenanceContract.count({ where }), page = pageNumber(query.page, total)
    const items = await tx.maintenanceContract.findMany({ where, include: maintenanceDirectoryInclude(scope, context.companyId), skip: (page - 1) * DIRECTORY_PAGE_SIZE, take: DIRECTORY_PAGE_SIZE, orderBy: [{ endDate: "asc" }, { nextVisitAt: "asc" }, { id: "asc" }] })
    const writable = !isPublicReadOnlyDemo()
    return { total, page, items: items.map(contract => ({ ...contract,
      canManageRenewal: writable && hasPermission(context.role, "service.write"),
      canCreateRenewalProposal: writable && hasPermission(context.role, "sales.write"),
      canRenew: writable && hasPermission(context.role, "service.write") && hasPermission(context.role, "operations.write") && (!(contract.autoInvoice || contract.recurringInvoice?.isActive) || hasPermission(context.role, "finance.write")),
    })) }
  }, { isolationLevel: "Serializable" })
}
