import { randomUUID } from "node:crypto"
import { PrismaClient } from "@prisma/client"
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
import { updateClientPortalAppointment } from "@/actions/portal"

const db = new PrismaClient()
describe.sequential("portal confirmation must reserve actual member capacity", () => {
  let clientId: string, memberId: string
  beforeEach(async () => {
    session.companyId = (await db.company.create({ data: { name: "Fictional booking baseline", serviceTimezone: "Europe/Paris" } })).id
    session.userId = (await db.user.create({ data: { email: `${randomUUID()}@example.test` } })).id
    memberId = (await db.membership.create({ data: { companyId: session.companyId, userId: session.userId, role: "OWNER", status: "ACTIVE" } })).id
    clientId = (await db.client.create({ data: { companyId: session.companyId, name: "Fictional booking client" } })).id
  })
  afterEach(async () => {
    await db.auditLog.deleteMany({ where: { userId: session.userId } })
    await db.client.delete({ where: { id: clientId } }); await db.company.delete({ where: { id: session.companyId } }); await db.user.delete({ where: { id: session.userId } })
  })
  afterAll(async () => { await db.$disconnect() })
  const local = () => `${new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)}T10:00`
  const request = () => db.clientPortalAppointmentRequest.create({ data: { companyId: session.companyId, clientId, subject: "Fictional capacity request", durationMinutes: 60, preferredStart: new Date(Date.now() + 7 * 86_400_000) } })
  async function confirm(row: Awaited<ReturnType<typeof request>>) {
    return updateClientPortalAppointment({ id: row.id, status: "CONFIRMED", expectedUpdatedAt: row.updatedAt.toISOString(), assignedMembershipId: memberId, scheduledLocalStart: local(), timeZone: "Europe/Paris" })
  }
  it("retains a coherent refusal without a reservation", async () => {
    const row = await request()
    await updateClientPortalAppointment({ id: row.id, status: "DECLINED", expectedUpdatedAt: row.updatedAt.toISOString(), response: "Fictional refusal" })
    expect(await db.clientPortalAppointmentRequest.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({ status: "DECLINED", response: "Fictional refusal" })
  })
  it("records the resource, exact instants and duration on confirmation", async () => {
    const row = await request(); await confirm(row)
    const stored = await db.clientPortalAppointmentRequest.findUniqueOrThrow({ where: { id: row.id } })
    expect(stored).toMatchObject({ assignedMembershipId: memberId, scheduledStart: expect.any(Date), scheduledEnd: expect.any(Date), confirmedAt: expect.any(Date) })
  })
  it("refuses a second reservation overlapping the same member", async () => {
    const first = await request(), second = await request(); await confirm(first)
    await expect(confirm(second)).rejects.toThrow("déjà occupé")
    expect((await db.clientPortalAppointmentRequest.findUniqueOrThrow({ where: { id: second.id } })).status).toBe("PENDING")
  })
  it("refuses a version changed before the confirmation click", async () => {
    const row = await request()
    await db.clientPortalAppointmentRequest.update({ where: { id: row.id }, data: { response: "Fictional legitimate edit", updatedAt: new Date(row.updatedAt.getTime() + 1_000) } })
    await expect(confirm(row)).rejects.toThrow("demande a changé")
    expect((await db.clientPortalAppointmentRequest.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("PENDING")
  })
  it("does not call a confirmation without a member and a time a reservation", async () => {
    const row = await request()
    await expect(updateClientPortalAppointment({ id: row.id, status: "CONFIRMED", expectedUpdatedAt: row.updatedAt.toISOString() })).rejects.toThrow("membre et un horaire")
    expect((await db.clientPortalAppointmentRequest.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("PENDING")
  })
})
