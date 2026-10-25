import "server-only"

import type { Prisma } from "@/generated/prisma/client"
import { z } from "zod"
import prisma from "@/lib/prisma"
import type { AgencyAccess } from "@/lib/agency-access"
import { operationsDashboardScope } from "./dashboard-scope"
import { ticketPriorityBuckets } from "./ticket-priority"

export const activitySummaryQuery = z.object({ agencyId: z.string().cuid().optional() }).strict()

export async function readOperationsActivity(companyId: string, agencyIds: AgencyAccess, now: Date, tomorrowStart: Date, agencyId?: string) {
  const scope = operationsDashboardScope(companyId, agencyIds)
  return prisma.$transaction(async tx => {
    if (agencyId && !await tx.agency.findFirst({ where: { AND: [scope.agency, { id: agencyId, active: true }] }, select: { id: true } })) {
      throw new Error("AGENCY_ACCESS_DENIED")
    }
    const tickets: Prisma.ServiceTicketWhereInput = {
      AND: [scope.ticket, ...(agencyId ? [{ site: { agencyId } }] : [])],
      status: { notIn: ["RESOLVED", "CLOSED", "MERGED"] },
    }
    const interventions: Prisma.FieldInterventionWhereInput = {
      AND: [scope.intervention, ...(agencyId ? [{ site: { agencyId } }] : [])],
      status: { notIn: ["COMPLETED", "CANCELED"] },
    }
    const due = { ...interventions, scheduledStart: { lt: tomorrowStart } }
    // Counts and their bounded previews share one snapshot and the same predicates.
    const [openTickets, comingInterventions, dueInterventions, upcomingInterventions] = await Promise.all([
      tx.serviceTicket.count({ where: tickets }),
      tx.fieldIntervention.count({ where: { ...interventions, scheduledStart: { gte: now } } }),
      tx.fieldIntervention.count({ where: due }),
      tx.fieldIntervention.findMany({ where: due, take: 6, orderBy: [{ scheduledStart: "asc" }, { id: "asc" }],
        select: { id: true, title: true, scheduledStart: true,
          site: { select: { label: true, client: { select: { name: true } } } },
          assignedMembership: { select: { user: { select: { name: true, email: true } } } },
        },
      }),
    ])
    const select = { id: true, number: true, title: true, priority: true, client: { select: { name: true } }, equipment: { select: { label: true } } } as const
    const priorityTickets: Prisma.ServiceTicketGetPayload<{ select: typeof select }>[] = []
    for (const where of ticketPriorityBuckets(tickets)) {
      if (priorityTickets.length === 6) break
      priorityTickets.push(...await tx.serviceTicket.findMany({ where, select, take: 6 - priorityTickets.length, orderBy: [{ updatedAt: "desc" }, { id: "asc" }] }))
    }
    return { openTickets, comingInterventions, dueInterventions, priorityTickets, upcomingInterventions }
  }, { isolationLevel: "Serializable" })
}
