import "server-only"
import type { AgencyAccess } from "@/lib/agency-access"
import prisma from "@/lib/prisma"
import { portalAppointmentScope } from "./resource-slots"

export async function readPortalAppointments(companyId: string, clientId: string, agencyIds: AgencyAccess, requestedPage = 1) {
  const where = { ...portalAppointmentScope(companyId, agencyIds), clientId }
  return prisma.$transaction(async tx => {
    const total = await tx.clientPortalAppointmentRequest.count({ where })
    const page = Math.min(requestedPage, Math.max(1, Math.ceil(total / 25)))
    const rows = await tx.clientPortalAppointmentRequest.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: 25, skip: (page - 1) * 25,
      select: { id: true, subject: true, preferredStart: true, alternativeStart: true, durationMinutes: true, notes: true, status: true, response: true,
        updatedAt: true, assignedMembershipId: true, scheduledStart: true, scheduledEnd: true, confirmedAt: true,
        assignedMembership: { select: { user: { select: { name: true } } } } } })
    return { total, page, items: rows.map(row => ({ id: row.id, subject: row.subject, preferredStart: row.preferredStart.toISOString(),
      alternativeStart: row.alternativeStart?.toISOString() ?? null, durationMinutes: row.durationMinutes, notes: row.notes, status: row.status,
      response: row.response, updatedAt: row.updatedAt.toISOString(), assignedMembershipId: row.assignedMembershipId,
      scheduledStart: row.scheduledStart?.toISOString() ?? null, scheduledEnd: row.scheduledEnd?.toISOString() ?? null,
      confirmedAt: row.confirmedAt?.toISOString() ?? null, member: row.assignedMembership?.user.name ?? null })) }
  }, { isolationLevel: "Serializable" })
}
