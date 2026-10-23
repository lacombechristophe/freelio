import "server-only"

import { sqlTimestamp } from "@/lib/sql-timestamp"
import { Prisma } from "@prisma/client"
import type { AgencyAccess } from "@/lib/agency-access"
import { assertDemoMutationAllowed } from "@/lib/demo-policy"
import type { TransactionClient } from "@/lib/prisma"

export class SchedulingError extends Error { constructor(message: string) { super(message); this.name = "SchedulingError" } }

export function schedulingMemberWhere(companyId: string, agencyIds: AgencyAccess): Prisma.MembershipWhereInput {
  return { companyId, status: "ACTIVE", ...(agencyIds === null ? {} : { agencyMemberships: { some: { agency: { companyId, active: true, id: { in: agencyIds } } } } }) }
}

export function portalAppointmentScope(companyId: string, agencyIds: AgencyAccess): Prisma.ClientPortalAppointmentRequestWhereInput {
  return { companyId, client: { companyId }, OR: [{ assignedMembershipId: null }, { assignedMembership: { companyId,
    ...(agencyIds === null ? {} : { agencyMemberships: { some: { agency: { companyId, active: true, id: { in: agencyIds } } } } }) } }] }
}

// CRM and Operations reserve capacity without gaining members.manage. The
// fixed-table, tenant-bound no-op locks rows and leaves member metadata intact.
export async function lockSchedulingMembers(tx: TransactionClient, companyId: string, ids: Array<string | null | undefined>) {
  assertDemoMutationAllowed()
  for (const id of [...new Set(ids.filter((id): id is string => Boolean(id)))].sort()) {
    const locked = await tx.$executeRaw(Prisma.sql`UPDATE "Membership" SET "updatedAt" = "updatedAt" WHERE "id" = ${id} AND "companyId" = ${companyId}`)
    if (locked !== 1) throw new SchedulingError("Membre de l’équipe introuvable ou inaccessible.")
  }
}

export async function assertSchedulingSlotFree(tx: TransactionClient, input: {
  companyId: string; membershipId: string; start: Date; end: Date; excludeAppointmentId?: string; excludeInterventionId?: string
}) {
  const { companyId, membershipId, start, end } = input
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) throw new SchedulingError("Créneau de rendez-vous invalide.")
  // Do not scope by the viewer's agencies or return titles: capacity includes
  // private work in another agency, but its content must remain undisclosed.
  const [appointment, interventions] = await Promise.all([
    tx.clientPortalAppointmentRequest.findFirst({ where: { companyId, assignedMembershipId: membershipId, status: "CONFIRMED",
      ...(input.excludeAppointmentId ? { id: { not: input.excludeAppointmentId } } : {}), scheduledStart: { lt: end }, scheduledEnd: { gt: start } }, select: { id: true } }),
    // Raw SELECT bypasses the request agency projection only for the resource's
    // occupied instants. No business identity or metadata leaves this helper.
    tx.$queryRaw<Array<{ occupied: number }>>(Prisma.sql`
      SELECT 1 AS "occupied" FROM "FieldIntervention"
      WHERE "companyId" = ${companyId} AND "assignedMembershipId" = ${membershipId}
        AND "status" <> 'CANCELED' AND "scheduledStart" < ${sqlTimestamp(end)}
        AND ("scheduledEnd" > ${sqlTimestamp(start)} OR ("scheduledEnd" IS NULL AND "scheduledStart" > ${sqlTimestamp(new Date(start.getTime() - 3_600_000))}))
        ${input.excludeInterventionId ? Prisma.sql`AND "id" <> ${input.excludeInterventionId}` : Prisma.empty} LIMIT 1`),
  ])
  if (appointment || interventions.length) {
    throw new SchedulingError("Ce membre est déjà occupé sur ce créneau. Choisissez un autre horaire ou un autre membre.")
  }
}
