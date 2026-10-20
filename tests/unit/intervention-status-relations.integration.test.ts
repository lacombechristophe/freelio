import { PrismaClient } from "@prisma/client"
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createOperationsDashboardFixture } from "../helpers/operations-dashboard-fixture"

const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
import { resolveInterventionReservation, updateInterventionStatus } from "@/actions/operations"
import prisma from "@/lib/prisma"

const db = new PrismaClient()

describe.sequential("intervention state changes preserve relation boundaries", () => {
  let fixture: Awaited<ReturnType<typeof createOperationsDashboardFixture>>
  let reservationId: string
  beforeEach(async () => {
    fixture = await createOperationsDashboardFixture(db)
    session.companyId = fixture.companyId
    session.userId = fixture.user.id
    reservationId = (await db.interventionReservation.findFirstOrThrow({ where: { companyId: fixture.companyId, interventionId: fixture.positive.interventions } })).id
  })
  afterEach(async () => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    if (fixture) {
      await db.auditLog.deleteMany({ where: { userId: fixture.user.id } })
      await fixture.cleanup()
    }
  })
  afterAll(async () => { await db.$disconnect() })
  async function snapshot() {
    return Promise.all([fixture.snapshot(), db.interventionReservation.findMany({
      where: { companyId: { in: [fixture.companyId, fixture.foreignCompanyId] } }, orderBy: { id: "asc" },
    })])
  }
  it("keeps coherent intervention state changes and their start time", async () => {
    await updateInterventionStatus(fixture.positive.interventions, "IN_PROGRESS")
    expect(await db.fieldIntervention.findUniqueOrThrow({ where: { id: fixture.positive.interventions } })).toMatchObject({ status: "IN_PROGRESS", startedAt: expect.any(Date) })
  })
  it("resolves a coherent reservation once, preserving its resolution and audit on replay", async () => {
    await resolveInterventionReservation(reservationId)
    const beforeReplay = await snapshot()
    expect(await resolveInterventionReservation(reservationId)).toMatchObject({ alreadyResolved: true })
    expect(await snapshot()).toEqual(beforeReplay)
    expect(await db.interventionReservation.findUniqueOrThrow({ where: { id: reservationId } })).toMatchObject({ status: "RESOLVED", resolvedAt: expect.any(Date) })
  })
  it.each(["status", "reservation"] as const)("refuses %s writes through a foreign client without mutation or audit", async action => {
    const badReservation = await db.interventionReservation.create({ data: { companyId: fixture.companyId, interventionId: fixture.negative.interventions, title: "Fictional incoherent reservation" } })
    const before = await snapshot()
    if (action === "status") await expect(updateInterventionStatus(fixture.negative.interventions, "IN_PROGRESS")).rejects.toThrow("Intervention introuvable")
    else await expect(resolveInterventionReservation(badReservation.id)).rejects.toThrow("Réserve introuvable")
    expect(await snapshot()).toEqual(before)
  })
  it.each(["siteId", "ticketId", "projectId", "maintenanceContractId", "assignedMembershipId"] as const)("refuses both commands with an inaccessible %s", async field => {
    const values = { siteId: fixture.negative.sites, ticketId: fixture.negative.tickets, projectId: fixture.negative.projects,
      maintenanceContractId: fixture.negative.contracts, assignedMembershipId: fixture.foreignMember.id }
    await db.fieldIntervention.update({ where: { id: fixture.positive.interventions }, data: { [field]: values[field] } })
    const before = await snapshot()
    await expect(updateInterventionStatus(fixture.positive.interventions, "IN_PROGRESS")).rejects.toThrow("Intervention introuvable")
    await expect(resolveInterventionReservation(reservationId)).rejects.toThrow("Réserve introuvable")
    expect(await snapshot()).toEqual(before)
  })
  it("keeps a technician within the assigned reservation and accessible agency", async () => {
    await db.membership.update({ where: { id: fixture.member.id }, data: { role: "TECHNICIAN" } })
    const other = await db.interventionReservation.create({ data: { companyId: fixture.companyId, interventionId: fixture.otherIntervention.id, title: "Fictional other agency reservation" } })
    const before = await snapshot()
    await expect(updateInterventionStatus(fixture.otherIntervention.id, "IN_PROGRESS")).rejects.toThrow("Intervention introuvable")
    await expect(resolveInterventionReservation(other.id)).rejects.toThrow("Réserve introuvable")
    expect(await snapshot()).toEqual(before)
    await resolveInterventionReservation(reservationId)
  })
  it("refuses writes after an agency access revocation", async () => {
    await db.membership.update({ where: { id: fixture.member.id }, data: { role: "OPERATIONS" } })
    await db.agencyMembership.deleteMany({ where: { membershipId: fixture.member.id, agencyId: fixture.agency.id } })
    const before = await snapshot()
    await expect(updateInterventionStatus(fixture.positive.interventions, "IN_PROGRESS")).rejects.toThrow("Intervention introuvable")
    await expect(resolveInterventionReservation(reservationId)).rejects.toThrow("Réserve introuvable")
    expect(await snapshot()).toEqual(before)
  })
  it("requires Operations write before changing either record", async () => {
    await db.membership.update({ where: { id: fixture.member.id }, data: { role: "VIEWER" } })
    const before = await snapshot()
    await expect(updateInterventionStatus(fixture.positive.interventions, "IN_PROGRESS")).rejects.toThrow("droits nécessaires")
    await expect(resolveInterventionReservation(reservationId)).rejects.toThrow("droits nécessaires")
    expect(await snapshot()).toEqual(before)
  })
  it("claims a reservation once under two concurrent calls", async () => {
    const results = await Promise.all([resolveInterventionReservation(reservationId), resolveInterventionReservation(reservationId)])
    expect(results.filter(result => "alreadyResolved" in result && result.alreadyResolved)).toHaveLength(1)
    expect(await db.auditLog.count({ where: { userId: fixture.user.id, resourceId: reservationId, action: "RESOLVE_INTERVENTION_RESERVATION" } })).toBe(1)
  })
  it("rechecks intervention relations between initial lookup and transactional update", async () => {
    const original = prisma.fieldIntervention.findFirst.bind(prisma.fieldIntervention)
    const delegate: { findFirst(args: Parameters<typeof original>[0]): Promise<Awaited<ReturnType<typeof original>>> } = prisma.fieldIntervention
    vi.spyOn(delegate, "findFirst").mockImplementationOnce(async args => {
      const observed = await original(args)
      await db.fieldIntervention.update({ where: { id: fixture.positive.interventions }, data: { ticketId: fixture.negative.tickets } })
      return observed
    })
    await expect(updateInterventionStatus(fixture.positive.interventions, "IN_PROGRESS")).rejects.toThrow("Intervention introuvable")
    expect(await db.fieldIntervention.findUniqueOrThrow({ where: { id: fixture.positive.interventions } })).toMatchObject({ ticketId: fixture.negative.tickets, status: "PLANNED", startedAt: null })
  })
  it("rechecks parent relations before resolving a reservation", async () => {
    const original = prisma.interventionReservation.updateMany.bind(prisma.interventionReservation)
    const delegate: { updateMany(args: Parameters<typeof original>[0]): Promise<Awaited<ReturnType<typeof original>>> } = prisma.interventionReservation
    vi.spyOn(delegate, "updateMany").mockImplementationOnce(async args => {
      await db.fieldIntervention.update({ where: { id: fixture.positive.interventions }, data: { siteId: fixture.negative.sites } })
      return original(args)
    })
    await expect(resolveInterventionReservation(reservationId)).rejects.toThrow("Réserve introuvable")
    expect(await db.interventionReservation.findUniqueOrThrow({ where: { id: reservationId } })).toMatchObject({ status: "OPEN", resolvedAt: null })
    expect(await db.auditLog.count({ where: { userId: fixture.user.id } })).toBe(0)
  })
  it("refuses both writes in the public read-only demo", async () => {
    const before = await snapshot()
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    await expect(updateInterventionStatus(fixture.positive.interventions, "IN_PROGRESS")).rejects.toThrow()
    await expect(resolveInterventionReservation(reservationId)).rejects.toThrow()
    expect(await snapshot()).toEqual(before)
  })
})
