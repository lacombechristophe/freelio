import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
import prisma from "@/lib/prisma"
import { getOrganisationDashboardData } from "@/actions/organisation"
import { getOperationsDashboard } from "@/actions/operations"

describe.sequential("service calendar boundaries on real SQL", () => {
  beforeAll(async () => {
    session.companyId = (await prisma.company.create({ data: { name: "Fictional service calendar" } })).id
    session.userId = (await prisma.user.create({ data: { email: `service-calendar-${randomUUID()}@example.test` } })).id
    await prisma.membership.create({ data: { companyId: session.companyId, userId: session.userId, role: "OWNER", status: "ACTIVE" } })
    const client = await prisma.client.create({ data: { companyId: session.companyId, name: "Fictional calendar client" } })
    const project = await prisma.project.create({ data: { companyId: session.companyId, clientId: client.id, name: "Fictional calendar project" } })
    for (const date of ["2026-10-05", "2026-10-12", "2026-10-19"]) {
      await prisma.timeEntry.create({ data: { projectId: project.id, date: new Date(date), durationSec: 3600 } })
    }
  })
  afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })
  afterAll(async () => {
    await prisma.timeEntry.deleteMany({ where: { project: { companyId: session.companyId } } })
    await prisma.project.deleteMany({ where: { companyId: session.companyId } })
    await prisma.client.deleteMany({ where: { companyId: session.companyId } })
    await prisma.company.delete({ where: { id: session.companyId } })
    await prisma.user.delete({ where: { id: session.userId } })
  })

  for (const hostZone of ["Pacific/Kiritimati", "America/Los_Angeles"]) {
    it.each([
      ["Europe/Paris", "2026-10-12", "2026-10-11T22:00:00.000Z"],
      ["America/Los_Angeles", "2026-10-05", "2026-10-11T07:00:00.000Z"],
    ])(`uses %s for periods and civil time entries on a ${hostZone} host`, async (timeZone, includedDate, todayStart) => {
      vi.stubEnv("TZ", hostZone)
      vi.useFakeTimers({ toFake: ["Date"] })
      vi.setSystemTime(new Date("2026-10-12T00:30:00Z"))
      await prisma.company.update({ where: { id: session.companyId }, data: { serviceTimezone: timeZone } })
      const data = await getOrganisationDashboardData()
      expect(data.timeZone).toBe(timeZone)
      expect(data.periods.todayStart).toBe(todayStart)
      expect(data.weekTimeEntries.map(entry => entry.date.slice(0, 10))).toEqual([includedDate])
    })
  }

  it.each([
    ["Europe/Paris", "2026-10-25T23:00:00.000Z"],
    ["America/Los_Angeles", "2026-10-26T07:00:00.000Z"],
  ])("returns a stable observation time and next midnight for Operations in %s", async (timeZone, tomorrowStart) => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-10-25T12:00:00Z"))
    await prisma.company.update({ where: { id: session.companyId }, data: { serviceTimezone: timeZone } })
    expect(await getOperationsDashboard()).toMatchObject({ timeZone, tomorrowStart, generatedAt: "2026-10-25T12:00:00.000Z" })
  })
})
