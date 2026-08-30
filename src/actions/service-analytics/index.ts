"use server"

import { z } from "zod"

import { withAuth } from "@/lib/auth-wrapper"
import { buildServiceAnalytics } from "@/lib/operations/service-analytics"
import { businessMinutesBetween, serviceFirstResponseTarget, serviceResolutionTarget, serviceSlaPolicy } from "@/lib/operations/service-sla"
import prisma from "@/lib/prisma"

const filtersSchema = z.object({
  days: z.coerce.number().int().refine((value) => [30, 90, 180, 365].includes(value)).default(90),
  assignedMembershipId: z.string().cuid().optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
})

function guideName(snapshot: unknown) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return "Guide archivé"
  const name = (snapshot as Record<string, unknown>).name
  return typeof name === "string" && name.trim() ? name : "Guide archivé"
}

export async function getServiceAnalytics(input: unknown = {}) {
  return withAuth(async ({ companyId }) => {
    const filters = filtersSchema.parse(input)
    const now = new Date()
    const startAt = new Date(now.getTime() - filters.days * 86_400_000)
    const ticketScope = {
      companyId,
      status: { not: "MERGED" },
      mergedIntoTicketId: null,
      ...(filters.assignedMembershipId ? { assignedMembershipId: filters.assignedMembershipId } : {}),
      ...(filters.priority ? { priority: filters.priority } : {}),
    }
    const [company, tickets, diagnostics, satisfaction, health, members] = await Promise.all([
      prisma.company.findUnique({ where: { id: companyId }, select: { serviceTimezone: true, serviceDayStart: true, serviceDayEnd: true, serviceWorkdays: true, serviceHolidays: true, serviceFirstResponseHours: true, serviceResolutionHours: true } }),
      prisma.serviceTicket.findMany({
        where: { ...ticketScope, OR: [{ requestedAt: { gte: startAt } }, { closedAt: { gte: startAt } }, { status: { in: ["OPEN", "QUALIFIED", "PLANNED", "WAITING"] } }] },
        select: {
          id: true, status: true, priority: true, requestedAt: true, firstRespondedAt: true, closedAt: true, dueAt: true, pausedMinutes: true, waitingSince: true,
          assignedMembershipId: true,
          assignedMembership: { include: { user: { select: { name: true, email: true } } } },
        },
        orderBy: { requestedAt: "asc" },
      }),
      prisma.serviceTicketDiagnostic.findMany({
        where: {
          companyId,
          completedAt: { gte: startAt },
          ticket: {
            status: { not: "MERGED" },
            mergedIntoTicketId: null,
            ...(filters.assignedMembershipId ? { assignedMembershipId: filters.assignedMembershipId } : {}),
            ...(filters.priority ? { priority: filters.priority } : {}),
          },
        },
        select: { ticketId: true, guideSnapshot: true, completedAt: true },
        orderBy: { completedAt: "asc" },
      }),
      prisma.satisfactionRequest.findMany({ where: { companyId, respondedAt: { gte: startAt }, score: { not: null } }, select: { score: true, survey: { select: { scaleMin: true, scaleMax: true } } }, orderBy: { respondedAt: "asc" } }),
      prisma.client.findMany({ where: { companyId }, select: { relationScore: true } }),
      prisma.membership.findMany({ where: { companyId, status: "ACTIVE" }, include: { user: { select: { name: true, email: true } } }, orderBy: { createdAt: "asc" } }),
    ])
    const policy = serviceSlaPolicy(company)
    const analytics = buildServiceAnalytics({
      tickets: tickets.map((ticket) => ({
        id: ticket.id,
        status: ticket.status,
        priority: ticket.priority,
        requestedAt: ticket.requestedAt,
        firstRespondedAt: ticket.firstRespondedAt,
        closedAt: ticket.closedAt,
        firstResponseTargetAt: serviceFirstResponseTarget(ticket, policy, now).targetAt,
        resolutionTargetAt: serviceResolutionTarget(ticket, policy, now).targetAt,
        firstResponseMinutes: ticket.firstRespondedAt ? businessMinutesBetween(ticket.requestedAt, ticket.firstRespondedAt, policy) : null,
        resolutionMinutes: ticket.closedAt ? Math.max(0, businessMinutesBetween(ticket.requestedAt, ticket.closedAt, policy) - ticket.pausedMinutes) : null,
        assigneeId: ticket.assignedMembershipId,
        assigneeName: ticket.assignedMembership?.user.name || ticket.assignedMembership?.user.email || "Non affecté",
      })),
      diagnostics: diagnostics.map((item) => ({ ticketId: item.ticketId, guideName: guideName(item.guideSnapshot), completedAt: item.completedAt })),
      satisfaction: satisfaction.flatMap((item) => item.score == null ? [] : [{ score: item.score, scaleMin: item.survey.scaleMin, scaleMax: item.survey.scaleMax }]),
      health: health.map((client) => ({ score: client.relationScore })),
      startAt,
      endAt: now,
      now,
    })
    return {
      ...analytics,
      filters,
      startAt,
      endAt: now,
      members: members.map((member) => ({ id: member.id, name: member.user.name || member.user.email || "Membre" })),
    }
  }, "service.read")
}
