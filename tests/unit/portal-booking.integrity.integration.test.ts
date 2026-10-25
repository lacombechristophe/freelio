import { createDatabaseClient } from "@/lib/database-client"
import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest"
const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
import { changePortalAppointment, getClientPortalAppointments, getPortalBookingCalendar, getPortalBookingMemberChoices, savePortalAppointment } from "@/actions/portal-bookings"
import { createFieldIntervention, rescheduleFieldIntervention, updateInterventionStatus } from "@/actions/operations"
import { resolveBookingLocalTime } from "@/lib/scheduling/booking-time"

const db = createDatabaseClient()
describe.sequential("CRM bookings share capacity with field work", () => {
  let clientId: string, memberId: string, secondMemberId: string, siteId: string, agencyId: string, otherAgencyId: string, foreignCompanyId: string, foreignMemberId: string
  const users: string[] = []
  const local = () => `${new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)}T10:00`
  const instant = () => resolveBookingLocalTime(local(), "Europe/Paris").date!
  async function member(companyId = session.companyId, agency = agencyId) {
    const user = await db.user.create({ data: { email: `${randomUUID()}@example.test`, name: `Fictional ${users.length}` } }); users.push(user.id)
    return db.membership.create({ data: { companyId, userId: user.id, role: "TECHNICIAN", status: "ACTIVE", ...(agency ? { agencyMemberships: { create: { agencyId: agency } } } : {}) } })
  }
  const request = () => db.clientPortalAppointmentRequest.create({ data: { companyId: session.companyId, clientId, subject: "Fictional booking", preferredStart: instant(), durationMinutes: 60 } })
  type Row = Awaited<ReturnType<typeof request>>
  const input = (row: Row, overrides = {}) => ({ id: row.id, status: "CONFIRMED", assignedMembershipId: memberId, scheduledLocalStart: local(), timeZone: "Europe/Paris", expectedUpdatedAt: row.updatedAt.toISOString(), ...overrides })
  const fresh = (id: string) => db.clientPortalAppointmentRequest.findUniqueOrThrow({ where: { id } })
  const field = (start = instant(), status = "PLANNED") => db.fieldIntervention.create({ data: { companyId: session.companyId, siteId, title: "Private field details must not escape", status, assignedMembershipId: memberId, scheduledStart: start, scheduledEnd: new Date(start.getTime() + 3_600_000) } })
  beforeEach(async () => {
    session.companyId = (await db.company.create({ data: { name: "Fictional booking integrity", serviceTimezone: "Europe/Paris" } })).id
    foreignCompanyId = (await db.company.create({ data: { name: "Fictional foreign bookings" } })).id
    agencyId = (await db.agency.create({ data: { companyId: session.companyId, name: "Fictional A", code: "A" } })).id
    otherAgencyId = (await db.agency.create({ data: { companyId: session.companyId, name: "Fictional B", code: "B" } })).id
    const own = await member(); memberId = own.id; session.userId = own.userId
    await db.membership.update({ where: { id: memberId }, data: { role: "OWNER" } })
    secondMemberId = (await member()).id; foreignMemberId = (await member(foreignCompanyId, "")).id
    clientId = (await db.client.create({ data: { companyId: session.companyId, name: "Fictional client" } })).id
    siteId = (await db.customerSite.create({ data: { companyId: session.companyId, clientId, agencyId, label: "Fictional site", address1: "Fictional address" } })).id
  })
  afterEach(async () => {
    vi.unstubAllEnvs(); vi.restoreAllMocks()
    await db.auditLog.deleteMany({ where: { userId: { in: users } } })
    const where = { companyId: { in: [session.companyId, foreignCompanyId] } }
    await db.fieldIntervention.deleteMany({ where })
    await db.customerSite.deleteMany({ where })
    await db.client.deleteMany({ where })
    await db.company.deleteMany({ where: { id: { in: [session.companyId, foreignCompanyId] } } })
    await db.user.deleteMany({ where: { id: { in: users.splice(0) } } })
  })
  afterAll(async () => { await db.$disconnect() })
  it.each(["OWNER", "ADMIN", "SALES"])("lets %s reserve without members.manage or changing member metadata", async role => {
    await db.membership.update({ where: { id: memberId }, data: { role } }); const before = await db.membership.findUniqueOrThrow({ where: { id: memberId } })
    const row = await request(); await changePortalAppointment(input(row))
    expect(await db.membership.findUniqueOrThrow({ where: { id: memberId } })).toEqual(before)
    const stored = await fresh(row.id); expect(stored.scheduledStart).toEqual(instant()); expect(stored.scheduledEnd!.getTime() - stored.scheduledStart!.getTime()).toBe(3_600_000)
    expect(await db.auditLog.count({ where: { resourceId: row.id } })).toBe(1)
  })
  it.each(["OPERATIONS", "TECHNICIAN", "SERVICE", "ACCOUNTING", "VIEWER"])("refuses %s before changing a request", async role => {
    const row = await request(); await db.membership.update({ where: { id: memberId }, data: { role } })
    await expect(changePortalAppointment(input(row))).rejects.toThrow("droits nécessaires"); expect(await fresh(row.id)).toEqual(row)
  })
  it.each(["foreign", "suspended", "otherAgency"])("refuses an ineligible %s resource", async kind => {
    let target = secondMemberId
    if (kind === "foreign") target = foreignMemberId
    if (kind === "suspended") await db.membership.update({ where: { id: target }, data: { status: "SUSPENDED" } })
    if (kind === "otherAgency") {
      target = (await member(session.companyId, otherAgencyId)).id
      await db.membership.update({ where: { id: memberId }, data: { role: "SALES" } })
    }
    const row = await request(); await expect(changePortalAppointment(input(row, { assignedMembershipId: target }))).rejects.toThrow("Membre de l’équipe introuvable")
    expect(await fresh(row.id)).toEqual(row)
  })
  it("refuses a foreign client and a historical foreign assignee without repairing them", async () => {
    const row = await request(); await db.clientPortalAppointmentRequest.update({ where: { id: row.id }, data: { assignedMembershipId: foreignMemberId } })
    await expect(changePortalAppointment(input(await fresh(row.id)))).rejects.toThrow("Demande de rendez-vous introuvable")
    const foreignClient = await db.client.create({ data: { companyId: foreignCompanyId, name: "Foreign" } })
    await db.clientPortalAppointmentRequest.update({ where: { id: row.id }, data: { assignedMembershipId: null, clientId: foreignClient.id } })
    await expect(changePortalAppointment(input(await fresh(row.id)))).rejects.toThrow("Demande de rendez-vous introuvable")
    expect(await db.auditLog.count({ where: { resourceId: row.id } })).toBe(0)
  })
  it("allows adjacent bookings and keeps cancelled history while releasing capacity", async () => {
    const first = await request(); await changePortalAppointment(input(first))
    const adjacent = await request(); await changePortalAppointment(input(adjacent, { scheduledLocalStart: local().replace("T10:00", "T11:00") }))
    const reserved = await fresh(first.id)
    await changePortalAppointment({ id: first.id, status: "CANCELLED", expectedUpdatedAt: reserved.updatedAt.toISOString(), response: "Fictional cancellation" })
    expect(await fresh(first.id)).toMatchObject({ status: "CANCELLED", assignedMembershipId: memberId, scheduledStart: reserved.scheduledStart, confirmedAt: reserved.confirmedAt })
    await changePortalAppointment(input(await request()))
  })
  it("reassigns capacity and preserves the original confirmation timestamp", async () => {
    const first = await request(); await changePortalAppointment(input(first)); const before = await fresh(first.id)
    await changePortalAppointment(input(before, { assignedMembershipId: secondMemberId }))
    expect((await fresh(first.id)).confirmedAt).toEqual(before.confirmedAt)
    await changePortalAppointment(input(await request()))
  })
  it("refuses private field overlap with only a generic explanation", async () => {
    await db.customerSite.update({ where: { id: siteId }, data: { agencyId: otherAgencyId } }); await field()
    await db.membership.update({ where: { id: memberId }, data: { role: "SALES" } })
    const row = await request(); const result = await savePortalAppointment(input(row))
    expect(result).toEqual({ success: false, error: "Ce membre est déjà occupé sur ce créneau. Choisissez un autre horaire ou un autre membre." }); expect(await fresh(row.id)).toEqual(row)
  })
  it.each(["create", "reschedule", "reactivate"])("blocks field %s overlapping a CRM booking", async kind => {
    await changePortalAppointment(input(await request()))
    const slot = { assignedMembershipId: memberId, scheduledStart: instant().toISOString(), scheduledEnd: new Date(instant().getTime() + 3_600_000).toISOString() }
    let result
    if (kind === "create") result = await createFieldIntervention({ ...slot, siteId, title: "Fictional field booking", type: "SAV" })
    else {
      const row = await field(kind === "reschedule" ? new Date(instant().getTime() + 7_200_000) : instant(), kind === "reactivate" ? "CANCELED" : "PLANNED")
      result = kind === "reschedule" ? await rescheduleFieldIntervention({ ...slot, interventionId: row.id }) : await updateInterventionStatus(row.id, "PLANNED")
      expect(await db.fieldIntervention.findUniqueOrThrow({ where: { id: row.id } })).toEqual(row)
    }
    expect(result).toMatchObject({ success: false, error: expect.stringContaining("déjà occupé") })
  })
  it.each(["create", "reschedule"])("returns invalid %s dates without changing a booking or exposing validation details", async kind => {
    const row = await field()
    for (const scheduledEnd of ["fictional invalid date", new Date(instant().getTime() - 3_600_000).toISOString()]) {
      const slot = { assignedMembershipId: memberId, scheduledStart: instant().toISOString(), scheduledEnd }
      const result = kind === "create"
        ? await createFieldIntervention({ ...slot, siteId, title: "Fictional invalid booking" })
        : await rescheduleFieldIntervention({ ...slot, interventionId: row.id })
      expect(result).toEqual({ success: false, error: "Créneau invalide. Vérifiez les dates de début et de fin." })
      expect(await db.fieldIntervention.findUniqueOrThrow({ where: { id: row.id } })).toEqual(row)
      expect(await db.fieldIntervention.count({ where: { companyId: session.companyId } })).toBe(1)
      expect(await db.auditLog.count({ where: { userId: session.userId } })).toBe(0)
    }
  })
  it("uses one hour for a field interval without an end and permits its exact end", async () => {
    const row = await field(); await db.fieldIntervention.update({ where: { id: row.id }, data: { scheduledEnd: null } })
    await expect(changePortalAppointment(input(await request()))).rejects.toThrow("déjà occupé")
    await changePortalAppointment(input(await request(), { scheduledLocalStart: local().replace("T10:00", "T11:00") }))
  })
  it.each(["twoRequests", "sameRevision"])("serializes %s without double reservation", async kind => {
    const a = await request(), b = kind === "twoRequests" ? await request() : a
    const results = await Promise.allSettled([changePortalAppointment(input(a)), changePortalAppointment(input(b))])
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1)
    expect(await db.clientPortalAppointmentRequest.count({ where: { companyId: session.companyId, status: "CONFIRMED" } })).toBe(1)
    expect(await db.auditLog.count({ where: { userId: session.userId, action: "UPDATE_CLIENT_PORTAL_APPOINTMENT" } })).toBe(1)
  })
  it("serializes CRM confirmation against a simultaneous field creation", async () => {
    const row = await request()
    const results = await Promise.allSettled([changePortalAppointment(input(row)), createFieldIntervention({ siteId, title: "Fictional competing work", assignedMembershipId: memberId,
      scheduledStart: instant().toISOString(), scheduledEnd: new Date(instant().getTime() + 3_600_000).toISOString() })])
    const winners = results.filter(result => result.status === "fulfilled" && result.value?.success)
    expect(winners).toHaveLength(1)
    expect(await db.clientPortalAppointmentRequest.count({ where: { companyId: session.companyId, status: "CONFIRMED" } }) + await db.fieldIntervention.count({ where: { companyId: session.companyId } })).toBe(1)
  })
  it.each([0, 14, 481])("refuses invalid stored duration %i", async durationMinutes => {
    const row = await request(); await db.clientPortalAppointmentRequest.update({ where: { id: row.id }, data: { durationMinutes } })
    await expect(changePortalAppointment(input(await fresh(row.id)))).rejects.toThrow("durée")
  })
  it("returns a known refusal as data and blocks mutation in the public demo", async () => {
    const row = await request(); vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    expect(await savePortalAppointment(input(row))).toMatchObject({ success: false, error: expect.stringContaining("lecture seule") }); expect(await fresh(row.id)).toEqual(row)
  })
  it("keeps legacy confirmations unreserved until an explicit new booking", async () => {
    const row = await request(); await db.clientPortalAppointmentRequest.update({ where: { id: row.id }, data: { status: "CONFIRMED" } })
    const page = await getClientPortalAppointments({ clientId }); expect(page.items[0]).toMatchObject({ status: "CONFIRMED", scheduledStart: null, assignedMembershipId: null })
    expect((await getPortalBookingCalendar({ from: local().slice(0, 10), to: new Date(instant().getTime() + 86_400_000).toISOString().slice(0, 10) })).total).toBe(0)
  })
  it("retains an actual booking in calendar history when its member has been removed", async () => {
    const row = await request(); await changePortalAppointment(input(row, { assignedMembershipId: secondMemberId }))
    await db.membership.delete({ where: { id: secondMemberId } })
    const calendar = await getPortalBookingCalendar({ from: local().slice(0, 10), to: new Date(instant().getTime() + 86_400_000).toISOString().slice(0, 10) })
    expect(calendar.total).toBe(1); expect(calendar.items[0]).toMatchObject({ id: row.id, member: "Membre historique indisponible", scheduledStart: instant().toISOString() })
  })
  it("pages all eligible members, retaining a selection outside the search page", async () => {
    for (let i = 0; i < 26; i++) await member()
    const first = await getPortalBookingMemberChoices({ clientId }); const next = await getPortalBookingMemberChoices({ clientId, page: 2, selectedId: first.items[0].id })
    expect(first.total).toBe(28); expect(first.items).toHaveLength(25); expect(next.items).toHaveLength(3); expect(next.selected?.id).toBe(first.items[0].id)
    expect((await getPortalBookingMemberChoices({ clientId, search: "absent", selectedId: first.items[0].id })).selected?.id).toBe(first.items[0].id)
  })
  it("pages the complete client history and calendar without exposing foreign resources", async () => {
    for (let i = 0; i < 27; i++) {
      const row = await request(); await db.clientPortalAppointmentRequest.update({ where: { id: row.id }, data: { status: "CONFIRMED", assignedMembershipId: memberId,
        scheduledStart: new Date(instant().getTime() + i * 3_600_000), scheduledEnd: new Date(instant().getTime() + (i + 1) * 3_600_000) } })
    }
    const bad = await request(); await db.clientPortalAppointmentRequest.update({ where: { id: bad.id }, data: { assignedMembershipId: foreignMemberId } })
    const list = await getClientPortalAppointments({ clientId, page: 2 }); expect(list.total).toBe(27); expect(list.items).toHaveLength(2)
    const calendar = await getPortalBookingCalendar({ from: local().slice(0, 10), to: new Date(instant().getTime() + 3 * 86_400_000).toISOString().slice(0, 10), page: 2 })
    expect(calendar.total).toBe(27); expect(calendar.items).toHaveLength(2)
    expect(JSON.stringify(list)).not.toContain(foreignMemberId)
  })
  it("rolls back the reservation when its audit cannot be stored", async () => {
    const row = await request()
    const postgres = process.env.DATABASE_URL?.startsWith("postgres")
    if (postgres) {
      await db.$executeRawUnsafe("CREATE FUNCTION reject_booking_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action = 'UPDATE_CLIENT_PORTAL_APPOINTMENT' THEN RAISE EXCEPTION 'fictional audit failure'; END IF; RETURN NEW; END $$")
      await db.$executeRawUnsafe('CREATE TRIGGER reject_booking_audit BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION reject_booking_audit()')
    } else await db.$executeRawUnsafe("CREATE TRIGGER reject_booking_audit BEFORE INSERT ON AuditLog WHEN NEW.action = 'UPDATE_CLIENT_PORTAL_APPOINTMENT' BEGIN SELECT RAISE(ABORT, 'fictional audit failure'); END")
    try { await expect(changePortalAppointment(input(row))).rejects.toThrow(); expect(await fresh(row.id)).toEqual(row) }
    finally {
      await db.$executeRawUnsafe(postgres ? 'DROP TRIGGER reject_booking_audit ON "AuditLog"' : "DROP TRIGGER reject_booking_audit")
      if (postgres) await db.$executeRawUnsafe("DROP FUNCTION reject_booking_audit()")
    }
  })
})
