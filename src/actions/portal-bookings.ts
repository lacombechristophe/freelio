"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { AuthorizationError, withAuth } from "@/lib/auth-wrapper"
import { calendarDayStart, shiftCalendarDay } from "@/lib/calendar-days"
import { DEMO_READ_ONLY_MESSAGE } from "@/lib/demo-policy"
import { hasPermission } from "@/lib/permissions"
import prisma from "@/lib/prisma"
import { resolveBookingLocalTime } from "@/lib/scheduling/booking-time"
import { readPortalAppointments } from "@/lib/scheduling/appointment-reader"
import { assertSchedulingSlotFree, lockSchedulingMembers, portalAppointmentScope, schedulingMemberWhere, SchedulingError } from "@/lib/scheduling/resource-slots"

const id = z.string().cuid()
const updateSchema = z.object({ id, status: z.enum(["PENDING", "CONFIRMED", "DECLINED", "CANCELLED", "COMPLETED"]),
  response: z.string().trim().max(1_000).default(""), expectedUpdatedAt: z.string().datetime().optional(),
  assignedMembershipId: id.nullable().optional(), scheduledLocalStart: z.string().max(30).optional(), timeZone: z.string().max(100).optional() }).strict()

export async function changePortalAppointment(input: unknown) {
  return withAuth(async ({ companyId, userId, agencyIds }) => {
    const data = updateSchema.parse(input), scope = portalAppointmentScope(companyId, agencyIds)
    const before = await prisma.clientPortalAppointmentRequest.findFirst({ where: { ...scope, id: data.id } })
    if (!before) throw new SchedulingError("Demande de rendez-vous introuvable")
    if (!data.expectedUpdatedAt) throw new SchedulingError("Rechargez la demande avant de la modifier. Votre saisie est conservée.")
    const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { serviceTimezone: true } })
    let start: Date | null = null, end: Date | null = null
    if (data.status === "CONFIRMED") {
      if (!data.assignedMembershipId || !data.scheduledLocalStart) throw new SchedulingError("Choisissez un membre et un horaire pour réserver ce rendez-vous.")
      if (data.timeZone !== company.serviceTimezone) throw new SchedulingError("Le fuseau de la société a changé. Rechargez la demande avant de réserver.")
      const parsed = resolveBookingLocalTime(data.scheduledLocalStart, company.serviceTimezone)
      if (!parsed.date) throw new SchedulingError(parsed.error!)
      start = parsed.date
      if (!Number.isInteger(before.durationMinutes) || before.durationMinutes < 15 || before.durationMinutes > 480) throw new SchedulingError("La durée de cette demande est invalide.")
      end = new Date(start.getTime() + before.durationMinutes * 60_000)
      if (start.getTime() <= Date.now() || start.getTime() > Date.now() + 18 * 30 * 86_400_000) throw new SchedulingError("Choisissez un créneau futur dans les 18 prochains mois.")
    }
    const updatedAt = await prisma.$transaction(async tx => {
      await lockSchedulingMembers(tx, companyId, [before.assignedMembershipId, data.status === "CONFIRMED" ? data.assignedMembershipId : null])
      const current = await tx.clientPortalAppointmentRequest.findFirst({ where: { ...scope, id: data.id, clientId: before.clientId } })
      if (!current) throw new SchedulingError("Demande de rendez-vous introuvable")
      if (current.updatedAt.toISOString() !== data.expectedUpdatedAt || current.updatedAt.getTime() !== before.updatedAt.getTime()) throw new SchedulingError("Cette demande a changé. Rechargez-la ; votre saisie est conservée.")
      if (current.status === "COMPLETED" && data.status !== "COMPLETED") throw new SchedulingError("Un rendez-vous terminé ne peut pas être réouvert. Créez une nouvelle demande.")
      if (current.status === "CONFIRMED" && !["CONFIRMED", "CANCELLED", "COMPLETED"].includes(data.status)) throw new SchedulingError("Annulez le rendez-vous pour libérer son créneau.")
      if (data.status === "COMPLETED" && current.status !== "COMPLETED" && (current.status !== "CONFIRMED" || !current.scheduledEnd || current.scheduledEnd.getTime() > Date.now())) throw new SchedulingError("Seul un rendez-vous réservé et arrivé à son terme peut être terminé.")
      if (data.status === "CONFIRMED") {
        const currentCompany = await tx.company.findUniqueOrThrow({ where: { id: companyId }, select: { serviceTimezone: true } })
        if (currentCompany.serviceTimezone !== data.timeZone) throw new SchedulingError("Le fuseau de la société a changé. Rechargez la demande avant de réserver.")
        if (!await tx.membership.findFirst({ where: { ...schedulingMemberWhere(companyId, agencyIds), id: data.assignedMembershipId! }, select: { id: true } })) throw new SchedulingError("Membre de l’équipe introuvable ou inaccessible.")
        await assertSchedulingSlotFree(tx, { companyId, membershipId: data.assignedMembershipId!, start: start!, end: end!, excludeAppointmentId: current.id })
      }
      const revision = new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1))
      const changed = await tx.clientPortalAppointmentRequest.updateMany({ where: { ...scope, id: current.id, clientId: before.clientId, updatedAt: current.updatedAt }, data: {
        status: data.status, response: data.response || null, updatedAt: revision,
        ...(data.status === "CONFIRMED" ? { assignedMembershipId: data.assignedMembershipId!, scheduledStart: start!, scheduledEnd: end!, confirmedAt: current.confirmedAt ?? new Date() } : {}),
      } })
      if (changed.count !== 1) throw new SchedulingError("Cette demande a changé. Rechargez-la ; votre saisie est conservée.")
      await tx.auditLog.create({ data: { userId, action: "UPDATE_CLIENT_PORTAL_APPOINTMENT", resource: "CLIENT_PORTAL_APPOINTMENT", resourceId: current.id,
        payload: { clientId: current.clientId, fromStatus: current.status, status: data.status,
          ...(data.status === "CONFIRMED" ? { assignedMembershipId: data.assignedMembershipId!, scheduledStart: start!.toISOString(), scheduledEnd: end!.toISOString() } : {}) } } })
      return revision.toISOString()
    }, { isolationLevel: "Serializable" })
    revalidatePath(`/dashboard/clients/${before.clientId}`); revalidatePath("/portal"); revalidatePath("/dashboard/organisation"); revalidatePath("/dashboard/operations")
    return { success: true as const, updatedAt }
  }, "crm.write")
}

export async function savePortalAppointment(input: unknown) {
  try {
    return await changePortalAppointment(input) ?? { success: false as const, error: "Votre espace n’est plus disponible. Votre saisie est conservée." }
  } catch (error) {
    if (error instanceof SchedulingError || error instanceof AuthorizationError || error instanceof Error && error.message === DEMO_READ_ONLY_MESSAGE) return { success: false as const, error: error.message }
    if (error instanceof z.ZodError) return { success: false as const, error: "Les valeurs saisies sont invalides. Vérifiez les champs." }
    if (error && typeof error === "object" && "code" in error && error.code === "P2034") return { success: false as const, error: "Le planning a changé pendant la réservation. Rechargez puis réessayez ; votre saisie est conservée." }
    throw error
  }
}

export async function getPortalBookingMemberChoices(input: unknown) {
  return withAuth(async ({ companyId, role, agencyIds }) => {
    if (!hasPermission(role, "crm.write")) throw new AuthorizationError("Accès CRM en écriture requis")
    const query = z.object({ clientId: id, search: z.string().trim().max(200).default(""), page: z.number().int().min(1).max(100_000).default(1), selectedId: id.optional() }).strict().parse(input)
    if (!await prisma.client.findFirst({ where: { id: query.clientId, companyId }, select: { id: true } })) throw new SchedulingError("Client introuvable")
    const eligible = schedulingMemberWhere(companyId, agencyIds)
    const contains = { contains: query.search, ...(process.env.DATABASE_URL?.startsWith("postgres") ? { mode: "insensitive" as const } : {}) }
    const where = { AND: [eligible, ...(query.search ? [{ user: { OR: [{ name: contains }, { email: contains }] } }] : [])] }
    return prisma.$transaction(async tx => {
      const total = await tx.membership.count({ where }), page = Math.min(query.page, Math.max(1, Math.ceil(total / 25)))
      const select = { id: true, user: { select: { name: true, email: true } } } as const
      const [items, selected, company] = await Promise.all([
        tx.membership.findMany({ where, select, take: 25, skip: (page - 1) * 25, orderBy: [{ user: { name: "asc" } }, { id: "asc" }] }),
        query.selectedId ? tx.membership.findFirst({ where: { AND: [eligible, { id: query.selectedId }] }, select }) : null,
        tx.company.findUniqueOrThrow({ where: { id: companyId }, select: { serviceTimezone: true } }),
      ])
      const option = (row: NonNullable<typeof selected>) => ({ id: row.id, label: row.user.name || row.user.email || "Membre de l’équipe" })
      return { items: items.map(option), selected: selected ? option(selected) : null, page, total, timeZone: company.serviceTimezone }
    }, { isolationLevel: "Serializable" })
  }, "crm.read")
}

export async function getClientPortalAppointments(input: unknown) {
  return withAuth(async ({ companyId, agencyIds }) => {
    const query = z.object({ clientId: id, page: z.number().int().min(1).max(100_000).default(1) }).strict().parse(input)
    if (!await prisma.client.findFirst({ where: { id: query.clientId, companyId }, select: { id: true } })) throw new SchedulingError("Client introuvable")
    return readPortalAppointments(companyId, query.clientId, agencyIds, query.page)
  }, "crm.read")
}

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => { const date = new Date(`${value}T00:00:00Z`); return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value })
export async function getPortalBookingCalendar(input: unknown) {
  return withAuth(async ({ companyId, agencyIds }) => {
    const query = z.object({ from: day, to: day, page: z.number().int().min(1).max(100_000).default(1) }).strict().parse(input)
    const days = (Date.parse(query.to) - Date.parse(query.from)) / 86_400_000
    if (days <= 0 || days > 31 || shiftCalendarDay(query.from, days) !== query.to) throw new SchedulingError("Choisissez une période de 1 à 31 jours.")
    const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { serviceTimezone: true } })
    const from = calendarDayStart(query.from, company.serviceTimezone), to = calendarDayStart(query.to, company.serviceTimezone)
    const where = { ...portalAppointmentScope(companyId, agencyIds), status: { in: ["CONFIRMED", "COMPLETED"] },
      scheduledStart: { lt: to }, scheduledEnd: { gt: from } }
    return prisma.$transaction(async tx => {
      const total = await tx.clientPortalAppointmentRequest.count({ where }), page = Math.min(query.page, Math.max(1, Math.ceil(total / 25)))
      const items = await tx.clientPortalAppointmentRequest.findMany({ where, take: 25, skip: (page - 1) * 25, orderBy: [{ scheduledStart: "asc" }, { id: "asc" }],
        select: { id: true, subject: true, status: true, scheduledStart: true, scheduledEnd: true, client: { select: { id: true, name: true } }, assignedMembership: { select: { user: { select: { name: true, email: true } } } } } })
      return { items: items.map(item => ({ id: item.id, subject: item.subject, status: item.status, client: item.client,
        scheduledStart: item.scheduledStart!.toISOString(), scheduledEnd: item.scheduledEnd!.toISOString(), member: item.assignedMembership?.user.name || item.assignedMembership?.user.email || "Membre historique indisponible" })),
        total, page, timeZone: company.serviceTimezone }
    }, { isolationLevel: "Serializable" })
  }, "crm.read")
}
