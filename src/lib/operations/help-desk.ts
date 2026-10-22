import "server-only"

import { z } from "zod"
import type { Prisma } from "@prisma/client"
import prisma from "@/lib/prisma"
import type { AuthContext } from "@/lib/auth-wrapper"
import { DIRECTORY_PAGE_SIZE } from "@/lib/directory-query"
import { operationsDashboardScope } from "./dashboard-scope"
import { ticketPriorities } from "./ticket-priority"
import { serviceFirstResponseTarget, serviceResolutionTarget, serviceSlaPolicy } from "./service-sla"

const page = z.number().int().min(1).max(100000).default(1)
export const helpDeskQuery = z.object({
  status: z.enum(["ACTIVE", "OPEN", "QUALIFIED", "PLANNED", "WAITING", "RESOLVED", "CLOSED", "ALL"]).default("ACTIVE"),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT", "ALL"]).default("ALL"),
  assignedMembershipId: z.union([z.string().cuid(), z.literal("ALL"), z.literal("UNASSIGNED")]).default("ALL"),
  search: z.string().trim().max(200).default(""), page,
  memberSearch: z.string().trim().max(200).default(""), memberPage: page,
}).strict()

const activeStatuses = ["OPEN", "QUALIFIED", "PLANNED", "WAITING"]
const pageNumber = (page: number, total: number) => Math.min(page, Math.max(1, Math.ceil(total / DIRECTORY_PAGE_SIZE)))
const text = (search: string) => ({ contains: search, ...(process.env.DATABASE_URL?.startsWith("postgres") ? { mode: "insensitive" as const } : {}) })
const priorityRank = (priority: string) => { const rank = (ticketPriorities as readonly string[]).indexOf(priority); return rank < 0 ? ticketPriorities.length : rank }
type Rank = { id: string; priority: string; requestedAt: Date; targetAt: Date; slaSource: "CUSTOM" | "POLICY"; firstResponseTargetAt: Date }

export async function readHelpDeskDashboard(context: AuthContext, input: unknown) {
  const query = helpDeskQuery.parse(input), scope = operationsDashboardScope(context.companyId, context.agencyIds), match = text(query.search)
  const where: Prisma.ServiceTicketWhereInput = { AND: [scope.ticket,
    ...(query.search ? [{ OR: [{ number: match }, { title: match }, { client: { name: match } }, { site: { label: match } }, { equipment: { label: match } }] }] : []),
  ], status: query.status === "ACTIVE" ? { in: activeStatuses } : query.status === "ALL" ? { not: "MERGED" } : query.status,
    ...(query.priority !== "ALL" ? { priority: query.priority } : {}),
    ...(query.assignedMembershipId !== "ALL" ? { assignedMembershipId: query.assignedMembershipId === "UNASSIGNED" ? null : query.assignedMembershipId } : {}),
  }
  return prisma.$transaction(async tx => {
    const company = await tx.company.findUniqueOrThrow({ where: { id: context.companyId }, select: {
      serviceTimezone: true, serviceDayStart: true, serviceDayEnd: true, serviceWorkdays: true, serviceHolidays: true, serviceFirstResponseHours: true, serviceResolutionHours: true,
    } })
    const policy = serviceSlaPolicy(company), asOf = new Date()
    const metrics = { breached: 0, firstResponseBreached: 0, urgent: 0, unassigned: 0, waiting: 0 }
    const ranks: Rank[] = []
    let cursor: string | undefined
    // SLA deadlines depend on business hours and pauses. Read their minimal
    // source in bounded batches; only the requested page receives identities.
    for (;;) {
      const rows = await tx.serviceTicket.findMany({ where: { AND: [where, ...(cursor ? [{ id: { gt: cursor } }] : [])] }, take: 250, orderBy: { id: "asc" },
        select: { id: true, priority: true, status: true, requestedAt: true, dueAt: true, firstRespondedAt: true, waitingSince: true, pausedMinutes: true, assignedMembershipId: true },
      })
      for (const row of rows) {
        const resolution = serviceResolutionTarget(row, policy, asOf), firstResponse = serviceFirstResponseTarget(row, policy, asOf)
        ranks.push({ id: row.id, priority: row.priority, requestedAt: row.requestedAt, targetAt: resolution.targetAt, slaSource: resolution.source, firstResponseTargetAt: firstResponse.targetAt })
        const active = !["RESOLVED", "CLOSED"].includes(row.status)
        if (active && resolution.targetAt < asOf) metrics.breached++
        if (active && !row.firstRespondedAt && firstResponse.targetAt < asOf) metrics.firstResponseBreached++
        if (active && row.priority === "URGENT") metrics.urgent++
        if (active && !row.assignedMembershipId) metrics.unassigned++
        if (row.status === "WAITING") metrics.waiting++
      }
      if (rows.length < 250) break
      cursor = rows.at(-1)!.id
    }
    ranks.sort((left, right) => priorityRank(left.priority) - priorityRank(right.priority) || left.targetAt.getTime() - right.targetAt.getTime() || left.requestedAt.getTime() - right.requestedAt.getTime() || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
    const total = ranks.length, page = pageNumber(query.page, total), selected = ranks.slice((page - 1) * DIRECTORY_PAGE_SIZE, page * DIRECTORY_PAGE_SIZE)
    const rows = await tx.serviceTicket.findMany({ where: { AND: [where, { id: { in: selected.map(row => row.id) } }] }, select: {
      id: true, number: true, title: true, status: true, priority: true, firstRespondedAt: true,
      client: { select: { name: true } }, site: { select: { label: true, city: true } }, equipment: { select: { label: true, warrantyUntil: true } },
      assignedMembership: { select: { user: { select: { name: true, email: true } } } }, _count: { select: { interventions: { where: scope.intervention } } },
    } })
    const byId = new Map(rows.map(row => [row.id, row]))
    const memberScope: Prisma.MembershipWhereInput = { companyId: context.companyId, status: "ACTIVE",
      ...(context.agencyIds === null ? {} : { agencyMemberships: { some: { agency: { ...scope.agency, active: true } } } }),
    }
    const memberMatch = text(query.memberSearch)
    const memberWhere: Prisma.MembershipWhereInput = { AND: [memberScope, ...(query.memberSearch ? [{ user: { OR: [{ name: memberMatch }, { email: memberMatch }] } }] : [])] }
    const memberTotal = await tx.membership.count({ where: memberWhere }), memberPage = pageNumber(query.memberPage, memberTotal)
    const members = await tx.membership.findMany({ where: memberWhere, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: DIRECTORY_PAGE_SIZE, skip: (memberPage - 1) * DIRECTORY_PAGE_SIZE,
      select: { id: true, serviceTicketCapacity: true, serviceAvailable: true, user: { select: { name: true, email: true } },
        _count: { select: { assignedTickets: { where: { AND: [scope.ticket, { status: { in: activeStatuses } }] } } } } },
    })
    const selectedMember = ["ALL", "UNASSIGNED"].includes(query.assignedMembershipId) ? null : await tx.membership.findFirst({ where: { AND: [memberScope, { id: query.assignedMembershipId }] }, select: { id: true, user: { select: { name: true, email: true } } } })
    return { filters: { ...query, page, memberPage }, total, page, metrics, asOf, timeZone: policy.timezone,
      tickets: selected.map(rank => ({ ...byId.get(rank.id)!, targetAt: rank.targetAt, slaSource: rank.slaSource, firstResponseTargetAt: rank.firstResponseTargetAt })),
      members: members.map(member => ({ id: member.id, name: member.user.name || member.user.email || "Membre", openTickets: member._count.assignedTickets, capacity: member.serviceTicketCapacity, available: member.serviceAvailable })),
      memberTotal, memberPage, selectedMember: selectedMember ? { id: selectedMember.id, name: selectedMember.user.name || selectedMember.user.email || "Membre" } : null,
    }
  }, { isolationLevel: "Serializable" })
}
