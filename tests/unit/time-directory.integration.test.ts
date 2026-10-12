import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
const observation = vi.hoisted(() => ({ transactions: 0 }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/prisma", async importOriginal => {
  const prismaModule = await importOriginal<typeof import("@/lib/prisma")>()
  return { ...prismaModule, default: new Proxy(prismaModule.default, { get(target, key) {
    const operation = Reflect.get(target, key)
    if (key !== "$transaction") return operation
    return (...args: unknown[]) => { observation.transactions++; return Reflect.apply(operation, target, args) }
  } }) }
})
import prisma from "@/lib/prisma"
import { exportTimeEntries, getTimeDirectory, getTimeProjectChoices } from "@/actions/temps/directory"

describe.sequential("Complete time directory and export on real SQL", () => {
  let membershipId: string, agencyId: string, otherAgencyId: string, clientId: string, projectId: string, foreignCompanyId: string, foreignClientId: string, olderId: string
  beforeAll(async () => {
    session.companyId = (await prisma.company.create({ data: { name: "Fictional time directory", serviceTimezone: "Europe/Paris" } })).id
    foreignCompanyId = (await prisma.company.create({ data: { name: "Fictional foreign time directory" } })).id
    session.userId = (await prisma.user.create({ data: { email: `time-directory-${randomUUID()}@example.test` } })).id
    membershipId = (await prisma.membership.create({ data: { companyId: session.companyId, userId: session.userId, role: "OWNER", status: "ACTIVE" } })).id
    agencyId = (await prisma.agency.create({ data: { companyId: session.companyId, code: "LOCAL", name: "Fictional assigned agency" } })).id
    otherAgencyId = (await prisma.agency.create({ data: { companyId: session.companyId, code: "OTHER", name: "Fictional other agency" } })).id
    await prisma.agencyMembership.create({ data: { membershipId, agencyId } })
    clientId = (await prisma.client.create({ data: { companyId: session.companyId, name: "Fictional time customer", totalRevenueCents: 999999 } })).id
    foreignClientId = (await prisma.client.create({ data: { companyId: foreignCompanyId, name: "Fictional foreign customer" } })).id
  })
  beforeEach(async () => {
    vi.setSystemTime(new Date("2026-03-29T22:30:00Z")) // Monday in Paris, Sunday in UTC.
    projectId = (await prisma.project.create({ data: { companyId: session.companyId, clientId, agencyId, name: "ZZ ANCIEN CHANTIER", createdAt: new Date("2000-01-01") } })).id
    await prisma.project.createMany({ data: Array.from({ length: 100 }, (_, i) => ({ companyId: session.companyId, clientId, agencyId, name: `Recent time project ${String(i).padStart(3, "0")}` })) })
    olderId = (await prisma.timeEntry.create({ data: { projectId, durationSec: 60, description: "Ancienne intervention unique", date: new Date("2000-01-01") } })).id
    await prisma.timeEntry.createMany({ data: Array.from({ length: 500 }, () => ({ projectId, durationSec: 60, description: "Fictional recent time", date: new Date("2026-03-29T22:00:00Z") })) })
  })
  afterEach(async () => {
    vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs()
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "OWNER", status: "ACTIVE" } })
    const where = { companyId: { in: [session.companyId, foreignCompanyId] } }
    await prisma.timeEntry.deleteMany({ where: { project: where } }); await prisma.project.deleteMany({ where })
    await prisma.company.update({ where: { id: session.companyId }, data: { serviceTimezone: "Europe/Paris" } })
  })
  afterAll(async () => {
    await prisma.client.deleteMany({ where: { companyId: { in: [session.companyId, foreignCompanyId] } } })
    await prisma.company.deleteMany({ where: { id: { in: [session.companyId, foreignCompanyId] } } })
    await prisma.user.delete({ where: { id: session.userId } })
  })
  it("reaches the 501st entry and keeps full aggregates independent of the page", async () => {
    const first = await getTimeDirectory(), last = await getTimeDirectory({ page: 21 })
    expect(first).toMatchObject({ total: 501, page: 1, today: "2026-03-30", todaySec: 30000, weekSec: 30000 })
    expect(first.items).toHaveLength(25)
    expect(last).toMatchObject({ total: 501, page: 21, items: [{ id: olderId }], todaySec: 30000, weekSec: 30000 })
    expect(first.week.map(day => day.day)).toEqual(["2026-03-30", "2026-03-31", "2026-04-01", "2026-04-02", "2026-04-03", "2026-04-04", "2026-04-05"])
    expect(Object.keys(first.items[0].project.client).sort()).toEqual(["id", "name"])
    expect(Object.keys(first.items[0]).sort()).toEqual(["date", "description", "durationSec", "id", "isBillable", "project"])
  })
  it("uses deterministic ties without duplicates on adjacent pages", async () => {
    const first = await getTimeDirectory(), second = await getTimeDirectory({ page: 2 })
    expect(new Set([...first.items, ...second.items].map(entry => entry.id)).size).toBe(50)
    expect((await getTimeDirectory()).items.map(entry => entry.id)).toEqual(first.items.map(entry => entry.id))
  })
  it("searches old descriptions, projects and customers on the server and clamps the page", async () => {
    expect(await getTimeDirectory({ search: "  ANCIENNE INTERVENTION  ", page: 100 })).toMatchObject({ total: 1, page: 1, items: [{ id: olderId }], todaySec: 0, weekSec: 0 })
    expect(await getTimeDirectory({ search: "ancien chantier" })).toMatchObject({ total: 501 })
    expect(await getTimeDirectory({ search: "time customer" })).toMatchObject({ total: 501 })
    expect(await getTimeDirectory({ search: "no match", page: 100 })).toMatchObject({ total: 0, page: 1, items: [], todaySec: 0, weekSec: 0 })
  })
  it("exports all 1001 rows across two SQL batches in a read snapshot", async () => {
    await prisma.timeEntry.createMany({ data: Array.from({ length: 500 }, () => ({ projectId, durationSec: 60, description: "Additional fictional time", date: new Date("2026-03-29T22:00:00Z") })) })
    const result = await exportTimeEntries()
    expect(result.count).toBe(1001); expect(result.csv.split("\r\n")).toHaveLength(1002)
    expect(result.csv).toContain('"2000-01-01"'); expect(result.csv).toContain('"2026-03-30"')
    expect(result.csv).toContain('"Ancienne intervention unique"')
    expect(result.csv).not.toContain("999999")
  })
  it("exports the same search and quotes delimiters, newlines and spreadsheet formulas", async () => {
    await prisma.timeEntry.update({ where: { id: olderId }, data: { description: '=SUM(1;2)\n"fictional"' } })
    const result = await exportTimeEntries({ search: "SUM" })
    expect(result.count).toBe(1)
    expect(result.csv).toContain('"\'=SUM(1;2)\n""fictional"""')
    expect((await exportTimeEntries({ search: "absent" })).count).toBe(0)
  })
  it("reaches all 101 project choices and retains the older choice off page/search", async () => {
    const first = await getTimeProjectChoices(), last = await getTimeProjectChoices({ page: 5 })
    expect(first.total).toBe(101); expect(first.items).toHaveLength(25)
    expect(last.items).toMatchObject([{ id: projectId }])
    expect(await getTimeProjectChoices({ search: "absent", page: 999, selectedId: projectId })).toMatchObject({ total: 0, page: 1, items: [], selected: { id: projectId } })
    expect((await getTimeProjectChoices({ search: "time customer" })).total).toBe(101)
  })
  it.each(["OWNER", "ADMIN", "SALES", "OPERATIONS", "TECHNICIAN", "SERVICE", "ACCOUNTING", "VIEWER"])("scopes rows, export, aggregates and selected choices for %s", async role => {
    const other = await prisma.project.create({ data: { companyId: session.companyId, clientId, agencyId: otherAgencyId, name: "Other agency project" } })
    const invalid = await prisma.project.create({ data: { companyId: session.companyId, clientId: foreignClientId, agencyId, name: "Foreign client project" } })
    const foreign = await prisma.project.create({ data: { companyId: foreignCompanyId, clientId: foreignClientId, name: "Foreign project" } })
    await prisma.timeEntry.createMany({ data: [other, invalid, foreign].map(project => ({ projectId: project.id, durationSec: 3600, date: new Date("2026-03-29T22:00:00Z"), description: "Forbidden time marker" })) })
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    const global = role === "OWNER" || role === "ADMIN"
    expect(await getTimeDirectory()).toMatchObject({ total: global ? 502 : 501, todaySec: global ? 33600 : 30000 })
    const exported = await exportTimeEntries()
    expect(exported.count).toBe(global ? 502 : 501); expect(exported.csv).not.toContain("Foreign project")
    expect((await getTimeProjectChoices({ selectedId: other.id })).selected?.id ?? null).toBe(global ? other.id : null)
    expect((await getTimeProjectChoices({ selectedId: invalid.id })).selected).toBeNull()
    expect((await getTimeProjectChoices({ selectedId: foreign.id })).selected).toBeNull()
  })
  it("applies agency revocation to all readers including CSV and retained choices", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "TECHNICIAN" } })
    await prisma.agencyMembership.deleteMany({ where: { membershipId, agencyId } })
    try {
      expect(await getTimeDirectory()).toMatchObject({ total: 0, items: [], todaySec: 0, weekSec: 0 })
      expect((await exportTimeEntries()).count).toBe(0)
      expect(await getTimeProjectChoices({ selectedId: projectId })).toMatchObject({ total: 0, items: [], selected: null })
    } finally { await prisma.agencyMembership.create({ data: { membershipId, agencyId } }) }
  })
  it("denies suspended membership before reading a directory or exporting", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { status: "SUSPENDED" } })
    observation.transactions = 0
    for (const action of [getTimeDirectory, getTimeProjectChoices, exportTimeEntries]) await expect(action()).rejects.toThrow("plus accès")
    expect(observation.transactions).toBe(0)
  })
  it.each([{ page: 0 }, { page: 1.5 }, { page: 100001 }, { weekOffset: 5201 }, { search: "x".repeat(201) }, { companyId: "injected" }])("rejects invalid or injected directory input %j", async input => {
    await expect(getTimeDirectory(input)).rejects.toThrow()
  })
  it("validates selection and export arguments strictly", async () => {
    await expect(getTimeProjectChoices({ selectedId: "" })).rejects.toThrow()
    await expect(getTimeProjectChoices({ selectedId: "x".repeat(101) })).rejects.toThrow()
    await expect(exportTimeEntries({ companyId: "injected" })).rejects.toThrow()
    await expect(exportTimeEntries({ search: "x".repeat(201) })).rejects.toThrow()
  })
  it("keeps the previous civil week through daylight-saving time", async () => {
    const result = await getTimeDirectory({ weekOffset: -1 })
    expect(result.week.map(day => day.day)).toEqual(["2026-03-23", "2026-03-24", "2026-03-25", "2026-03-26", "2026-03-27", "2026-03-28", "2026-03-29"])
    expect(result.weekSec).toBe(0)
    expect(result.week[6].start.toISOString()).toBe("2026-03-28T23:00:00.000Z")
    expect(result.week[0].start.toISOString()).toBe("2026-03-22T23:00:00.000Z")
  })
  it("uses the configured Pacific date without depending on the process time zone", async () => {
    await prisma.company.update({ where: { id: session.companyId }, data: { serviceTimezone: "America/Los_Angeles" } })
    const result = await getTimeDirectory()
    expect(result.today).toBe("2026-03-29"); expect(result.week[0].day).toBe("2026-03-23")
    expect(result.todaySec).toBe(30000)
    expect((await exportTimeEntries({ search: "recent" })).csv).toContain('"2026-03-29"')
  })
  it("keeps all three reads available in the public read-only demo", async () => {
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    expect((await getTimeDirectory()).total).toBe(501)
    expect((await getTimeProjectChoices()).total).toBe(101)
    expect((await exportTimeEntries()).count).toBe(501)
  })
})
