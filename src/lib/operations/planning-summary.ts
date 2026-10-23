import "server-only"

import { z } from "zod"
import prisma from "@/lib/prisma"
import type { AuthContext } from "@/lib/auth-wrapper"
import { calendarDayKey, calendarPeriods } from "@/lib/calendar-days"
import { operationsDashboardScope } from "./dashboard-scope"
import { checkServiceAgency } from "./service-directory"
import { haversineKm, planningEnd } from "./planning"

const querySchema = z.object({ agencyId: z.string().cuid().optional() }).strict()
type Preview = { id: string; title: string; scheduledStart: Date; assignedName: string; clientName: string; siteLabel: string; conflict: boolean }
type RouteGroup = { lastSite?: { latitude: number | null; longitude: number | null } }
type OverlapGroup = { maxEnd: number; pending?: { end: number; day?: Day; preview?: Preview } }
type Day = { key: string; count: number; conflicts: number; invalidSlots: number; distanceKm: number; measuredLegs: number; totalLegs: number; items: Preview[]; groups: Map<string, RouteGroup> }

export async function readOperationsPlanningSummary(context: AuthContext, input: unknown) {
  const query = querySchema.parse(input), scope = operationsDashboardScope(context.companyId, context.agencyIds)
  return prisma.$transaction(async tx => {
    await checkServiceAgency(tx, context, query.agencyId)
    const company = await tx.company.findUniqueOrThrow({ where: { id: context.companyId }, select: { serviceTimezone: true } })
    const now = new Date(), timeZone = company.serviceTimezone
    const { weekStart, weekEnd, todayStart } = calendarPeriods(now, timeZone)
    const members = await tx.membership.findMany({ where: { companyId: context.companyId, status: "ACTIVE", role: { in: ["OWNER", "ADMIN", "OPERATIONS", "TECHNICIAN", "SERVICE"] },
      ...(query.agencyId ? { agencyMemberships: { some: { agencyId: query.agencyId, agency: scope.agency } } }
        : context.agencyIds === null ? {} : { agencyMemberships: { some: { agency: scope.agency } } }),
    }, select: { id: true, weeklyCapacityMinutes: true, user: { select: { name: true, email: true } } }, orderBy: { id: "asc" } })
    const weekly = new Map(members.map(member => [member.id, { interventions: 0, minutes: BigInt(0) }]))
    const days = new Map<string, Day>()
    const overlaps = new Map<string, OverlapGroup>()
    let unassigned = 0, cursor: { id: string; scheduledStart: Date } | undefined, finished = false
    const lowerBound = weekStart < todayStart ? weekStart : todayStart
    let lastVisibleEnd = todayStart.getTime()
    const where = { AND: [scope.intervention, ...(query.agencyId ? [{ site: { agencyId: query.agencyId } }] : []),
      { OR: [{ scheduledStart: { gte: new Date(lowerBound.getTime() - 3600000) } }, { scheduledStart: { lt: lowerBound }, scheduledEnd: { gt: lowerBound } }] },
    ], status: { not: "CANCELED" } }
    for (;;) {
      // Seek on the complete ordering: the date range remains indexable,
      // and the id keeps slots with the same start in successive batches.
      const rows = await tx.fieldIntervention.findMany({ where: { AND: [where, ...(cursor ? [{ OR: [
        { scheduledStart: { gt: cursor.scheduledStart } }, { scheduledStart: cursor.scheduledStart, id: { gt: cursor.id } },
      ] }] : [])] }, take: 250, orderBy: [{ scheduledStart: "asc" }, { id: "asc" }],
        select: { id: true, title: true, scheduledStart: true, scheduledEnd: true, assignedMembershipId: true,
          assignedMembership: { select: { user: { select: { name: true, email: true } } } },
          site: { select: { label: true, latitude: true, longitude: true, client: { select: { name: true } } } },
        },
      })
      for (const item of rows) {
        if (item.scheduledStart >= weekStart && item.scheduledStart < weekEnd) {
          if (!item.assignedMembershipId) unassigned++
          const member = item.assignedMembershipId ? weekly.get(item.assignedMembershipId) : undefined
          if (member) {
            member.interventions++
            member.minutes += BigInt(item.scheduledEnd ? Math.max(15, Math.round((item.scheduledEnd.getTime() - item.scheduledStart.getTime()) / 60000)) : 60)
          }
        }
        const start = item.scheduledStart.getTime(), end = planningEnd(item).getTime()
        let day: Day | undefined
        if (item.scheduledStart >= todayStart) {
          const key = calendarDayKey(item.scheduledStart, timeZone)
          day = days.get(key)
          if (!day && days.size < 14) {
            day = { key, count: 0, conflicts: 0, invalidSlots: 0, distanceKm: 0, measuredLegs: 0, totalLegs: 0, items: [], groups: new Map() }
            days.set(key, day)
          } else if (!day && item.scheduledStart >= weekEnd && start >= lastVisibleEnd) { finished = true; break }
        }
        const preview: Preview | undefined = day && day.items.length < 6 ? { id: item.id, title: item.title, scheduledStart: item.scheduledStart,
          assignedName: item.assignedMembership?.user.name || item.assignedMembership?.user.email || "Non affectée", clientName: item.site.client.name, siteLabel: item.site.label, conflict: false } : undefined
        if (day) {
          day.count++
          if (preview) day.items.push(preview)
          const memberKey = item.assignedMembershipId ?? "unassigned"
          const group: RouteGroup = day.groups.get(memberKey) ?? {}
          if (group.lastSite) {
            day.totalLegs++
            const distance = haversineKm(group.lastSite, item.site)
            if (distance !== null && Number.isFinite(distance)) { day.distanceKm += distance; day.measuredLegs++ }
          }
          group.lastSite = { latitude: item.site.latitude, longitude: item.site.longitude }
          day.groups.set(memberKey, group)
          if (end <= start) day.invalidSlots++
          else lastVisibleEnd = Math.max(lastVisibleEnd, end)
        }
        if (end > start && item.assignedMembershipId) {
          const group: OverlapGroup = overlaps.get(item.assignedMembershipId) ?? { maxEnd: -Infinity }
          // Starts are ordered. maxEnd detects any overlap; the only preceding
          // uncounted slot is retained until it overlaps or expires. This state
          // crosses civil days, including a slot that started before this week.
          if (start < group.maxEnd) {
            if (day) day.conflicts++
            if (preview) preview.conflict = true
            if (group.pending && group.pending.end > start) { if (group.pending.day) group.pending.day.conflicts++; if (group.pending.preview) group.pending.preview.conflict = true }
            group.pending = undefined
          } else group.pending = { end, day, preview }
          group.maxEnd = Math.max(group.maxEnd, end)
          overlaps.set(item.assignedMembershipId, group)
        }
      }
      if (finished || rows.length < 250) break
      const last = rows[rows.length - 1]
      cursor = { id: last.id, scheduledStart: last.scheduledStart }
    }
    return { generatedAt: now.toISOString(), timeZone, weekStart: weekStart.toISOString(), weekEnd: weekEnd.toISOString(), unassigned,
      members: members.map(member => {
        const data = weekly.get(member.id)!, plannedMinutes = data.minutes <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(data.minutes) : null
        const capacity = Math.max(member.weeklyCapacityMinutes, 60)
        return { id: member.id, name: member.user.name || member.user.email || "Membre", interventions: data.interventions, plannedMinutes, capacity, utilization: plannedMinutes === null ? null : Math.round(plannedMinutes / capacity * 100) }
      }).sort((left, right) => (right.utilization ?? -1) - (left.utilization ?? -1) || left.id.localeCompare(right.id)),
      days: [...days.values()].map(day => ({ key: day.key, count: day.count, conflicts: day.conflicts, invalidSlots: day.invalidSlots,
        distanceKm: day.distanceKm, measuredLegs: day.measuredLegs, totalLegs: day.totalLegs, items: day.items })),
    }
  }, { isolationLevel: "Serializable" })
}
