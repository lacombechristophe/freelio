"use server"

import { withAuth } from "@/lib/auth-wrapper"
import type { FieldSnapshot } from "@/lib/field/offline"
import prisma from "@/lib/prisma"

export async function getFieldWorkspace(): Promise<FieldSnapshot | null> {
  return withAuth(async ({ companyId, membershipId, role }) => {
    const now = new Date()
    const recentCompleted = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1_000)
    const futureLimit = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1_000)
    const technicianScope = role === "TECHNICIAN" ? { assignedMembershipId: membershipId } : {}
    const [company, interventions] = await Promise.all([
      prisma.company.findUnique({ where: { id: companyId }, select: { id: true, name: true } }),
      prisma.fieldIntervention.findMany({
        where: {
          companyId,
          ...technicianScope,
          status: { not: "CANCELED" },
          OR: [
            { status: { not: "COMPLETED" }, scheduledStart: { lte: futureLimit } },
            { status: "COMPLETED", completedAt: { gte: recentCompleted } },
          ],
        },
        include: {
          site: { include: { client: { select: { name: true } } } },
          ticket: { select: { number: true } },
          assignedMembership: { include: { user: { select: { name: true, email: true } } } },
          files: { orderBy: { createdAt: "asc" }, select: { id: true, name: true, mimeType: true, size: true, kind: true } },
        },
        orderBy: [{ scheduledStart: "asc" }, { createdAt: "asc" }],
        take: 80,
      }),
    ])
    if (!company) return null
    const cachedAt = new Date()
    return {
      companyId: company.id,
      companyName: company.name,
      cachedAt: cachedAt.toISOString(),
      expiresAt: new Date(cachedAt.getTime() + 24 * 60 * 60 * 1_000).toISOString(),
      assignments: interventions.map((item) => ({
        id: item.id,
        title: item.title,
        type: item.type,
        status: item.status,
        scheduledStart: item.scheduledStart.toISOString(),
        scheduledEnd: item.scheduledEnd?.toISOString() ?? null,
        report: item.report,
        laborMinutes: item.laborMinutes,
        customerName: item.customerName,
        site: {
          label: item.site.label,
          address1: item.site.address1,
          address2: item.site.address2,
          postalCode: item.site.postalCode,
          city: item.site.city,
          clientName: item.site.client.name,
        },
        ticketNumber: item.ticket?.number ?? null,
        technician: item.assignedMembership?.user.name || item.assignedMembership?.user.email || null,
        files: item.files,
      })),
    }
  }, "operations.read")
}
