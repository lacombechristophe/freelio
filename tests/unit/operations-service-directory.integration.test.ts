import { randomUUID } from "node:crypto"
import { PrismaClient } from "@prisma/client"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { createOperationsDashboardFixture } from "../helpers/operations-dashboard-fixture"

const session = vi.hoisted(() => ({ userId: "", companyId: "", authenticated: true }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => session.authenticated ? { user: { id: session.userId }, companyId: session.companyId } : null }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
import prisma from "@/lib/prisma"
import * as service from "@/actions/operations"
import { getOperationsDashboard } from "@/actions/operations"
const database = new PrismaClient()

describe.sequential("Operations service lists exceed historical dashboard caches", () => {
  let siteId: string, clientId: string, membershipId: string
  let lastTicket: string, lastContract: string, currentIntervention: string
  let dashboard: Awaited<ReturnType<typeof getOperationsDashboard>>
  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2030-06-17T12:00:00Z"))
    session.companyId = (await prisma.company.create({ data: { name: "Fictional full service directory", serviceTimezone: "Europe/Paris" } })).id
    session.userId = (await prisma.user.create({ data: { email: `service-directory-${randomUUID()}@example.test` } })).id
    membershipId = (await prisma.membership.create({ data: { companyId: session.companyId, userId: session.userId, role: "OWNER", status: "ACTIVE" } })).id
    clientId = (await prisma.client.create({ data: { companyId: session.companyId, name: "Fictional service client" } })).id
    siteId = (await prisma.customerSite.create({ data: { companyId: session.companyId, clientId, label: "Fictional service site", address1: "Fictional address" } })).id
    await prisma.serviceTicket.createMany({ data: Array.from({ length: 200 }, (_, index) => ({ companyId: session.companyId, clientId, siteId, number: `NORMAL-${index}`, title: `Fictional normal ticket ${index}`, description: "Fictional description" })) })
    lastTicket = (await prisma.serviceTicket.create({ data: { companyId: session.companyId, clientId, siteId, number: "HIGH-LAST", title: "Fictional high ticket beyond cache", description: "Fictional description", priority: "HIGH" } })).id
    await prisma.fieldIntervention.createMany({ data: Array.from({ length: 200 }, (_, index) => ({ companyId: session.companyId, siteId, title: `Fictional historical intervention ${index}`, scheduledStart: new Date("2000-01-01T10:00:00Z"), status: "COMPLETED" })) })
    currentIntervention = (await prisma.fieldIntervention.create({ data: { companyId: session.companyId, siteId, assignedMembershipId: membershipId, title: "Fictional current intervention beyond cache", scheduledStart: new Date("2030-06-18T10:00:00Z"), scheduledEnd: new Date("2030-06-18T11:00:00Z") } })).id
    await prisma.maintenanceContract.createMany({ data: Array.from({ length: 200 }, (_, index) => ({ companyId: session.companyId, clientId, siteId, number: `OLD-${index}`, label: `Fictional historical maintenance ${index}`, startDate: new Date("1999-01-01"), endDate: new Date("2000-01-01") })) })
    lastContract = (await prisma.maintenanceContract.create({ data: { companyId: session.companyId, clientId, siteId, number: "LATEST", label: "Fictional maintenance beyond cache", startDate: new Date("2030-01-01"), endDate: new Date("2031-01-01") } })).id
    dashboard = await getOperationsDashboard()
  })
  afterAll(async () => {
    vi.useRealTimers()
    await prisma.fieldIntervention.deleteMany({ where: { companyId: session.companyId } })
    await prisma.serviceTicket.deleteMany({ where: { companyId: session.companyId } })
    await prisma.maintenanceContract.deleteMany({ where: { companyId: session.companyId } })
    await prisma.customerSite.deleteMany({ where: { companyId: session.companyId } })
    await prisma.client.deleteMany({ where: { companyId: session.companyId } })
    await prisma.company.delete({ where: { id: session.companyId } })
    await prisma.user.delete({ where: { id: session.userId } })
  })
  const tickets = (search = "") => service.getOperationsTicketDirectory({ search })
  const interventions = (search = "") => service.getOperationsInterventionDirectory({ search })
  const maintenance = (search = "") => service.getOperationsMaintenanceDirectory({ search })
  const planning = () => service.getOperationsPlanningSummary()
  afterEach(async () => {
    await prisma.serviceTicket.deleteMany({ where: { companyId: session.companyId, number: { startsWith: "EXTRA-" } } })
    for (;;) {
      const rows = await prisma.fieldIntervention.findMany({ where: { companyId: session.companyId, title: { startsWith: "EXTRA-" } }, select: { id: true }, take: 250 })
      if (!rows.length) break
      await prisma.fieldIntervention.deleteMany({ where: { id: { in: rows.map(row => row.id) } } })
    }
  }, 30_000) // Bounded teardown of the 10001-slot fixture; assertions keep their normal timeout.
  it("counts all 201 tickets rather than 200 cached tickets", async () => expect((await tickets()).total).toBe(201))
  it("finds the high-priority ticket beyond the old cache", async () => expect((await tickets("high ticket beyond cache")).items.map(row => row.id)).toEqual([lastTicket]))
  it("finds the current intervention beyond 200 historical entries", async () => expect((await interventions("current intervention beyond cache")).items.map(row => row.id)).toEqual([currentIntervention]))
  it("counts all 201 maintenance contracts", async () => expect((await maintenance()).total).toBe(201))
  it("finds the maintenance contract beyond the old cache", async () => expect((await maintenance("maintenance beyond cache")).items.map(row => row.id)).toEqual([lastContract]))
  it("shows a HIGH ticket before NORMAL tickets in the priority preview", () => expect(dashboard.activity.priorityTickets[0].id).toBe(lastTicket))
  it("includes the current intervention in weekly capacity", async () => expect((await planning()).members.find(row => row.id === membershipId)).toMatchObject({ interventions: 1, plannedMinutes: 60 }))
  it("includes the complete upcoming day in route totals", async () => expect((await planning()).days.reduce((sum, day) => sum + day.count, 0)).toBe(1))
  it("keeps initially visible historical data consultable", async () => {
    expect((await tickets("normal ticket 0")).items.length).toBeGreaterThan(0)
    expect((await interventions("historical intervention 0")).items.length).toBeGreaterThan(0)
    expect((await maintenance("historical maintenance 0")).items.length).toBeGreaterThan(0)
  })
  const readers = [
    { name: "tickets", read: service.getOperationsTicketDirectory },
    { name: "interventions", read: service.getOperationsInterventionDirectory },
    { name: "maintenance", read: service.getOperationsMaintenanceDirectory },
  ]
  it.each(readers)("makes every one of the 201 $name reachable once", async ({ read }) => {
    const ids: string[] = []
    for (let page = 1; page <= 9; page++) {
      const result = await read({ page })
      expect(result).toMatchObject({ total: 201, page })
      expect(result.items).toHaveLength(page === 9 ? 1 : 25)
      ids.push(...result.items.map(row => row.id))
    }
    expect(new Set(ids).size).toBe(201)
    expect(await read({ page: 100000 })).toMatchObject({ total: 201, page: 9 })
  })
  it.each(readers)("searches the complete $name scope before pagination", async ({ read }) => {
    expect(await read({ search: "BEYOND CACHE", page: 99 })).toMatchObject({ total: 1, page: 1 })
    expect(await read({ search: "no fictitious match" })).toMatchObject({ total: 0, page: 1, items: [] })
  })
  it("orders all known ticket priorities before unknown historical values", async () => {
    await prisma.serviceTicket.createMany({ data: ["LOW", "URGENT", "HISTORICAL"].map(priority => ({ companyId: session.companyId, clientId, siteId, number: `EXTRA-${priority}`, title: `Fictional ${priority}`, description: "Fictional description", priority })) })
    const first = await tickets()
    expect(first.items.slice(0, 3).map(row => row.priority)).toEqual(["URGENT", "HIGH", "NORMAL"])
    const last = await service.getOperationsTicketDirectory({ page: 100000 })
    expect(last.items.slice(-2).map(row => row.priority)).toEqual(["LOW", "HISTORICAL"])
    expect((await service.getOperationsActivitySummary()).priorityTickets.slice(0, 3).map(row => row.priority)).toEqual(["URGENT", "HIGH", "NORMAL"])
  })
  it("combines the complete ticket status and priority filters", async () => {
    expect(await service.getOperationsTicketDirectory({ status: "ACTIVE", priority: "HIGH" })).toMatchObject({ total: 1, items: [{ id: lastTicket }] })
    expect(await service.getOperationsTicketDirectory({ status: "CLOSED", priority: "HIGH" })).toMatchObject({ total: 0 })
  })
  it("combines intervention state and the company's inclusive civil date bounds", async () => {
    expect(await service.getOperationsInterventionDirectory({ status: "PLANNED", from: "2030-06-18", to: "2030-06-18" })).toMatchObject({ total: 1, items: [{ id: currentIntervention }] })
    expect(await service.getOperationsInterventionDirectory({ status: "COMPLETED", from: "2030-06-18" })).toMatchObject({ total: 0 })
    expect(await service.getOperationsInterventionDirectory({ status: "COMPLETED" })).toMatchObject({ total: 200 })
  })
  it.each([{ from: "2030-02-31" }, { to: "2030-13-01" }, { from: "2030-06-20", to: "2030-06-18" }])("rejects an impossible or reversed period %j", async input => {
    await expect(service.getOperationsInterventionDirectory(input)).rejects.toThrow()
  })
  it("aggregates an entire 251-slot day while limiting its preview to six", async () => {
    const start = Date.parse("2030-06-20T08:00:00Z")
    await prisma.fieldIntervention.createMany({ data: Array.from({ length: 251 }, (_, index) => ({ companyId: session.companyId, siteId, assignedMembershipId: membershipId, title: `EXTRA-volume-${index}`, scheduledStart: new Date(start + index * 60000), scheduledEnd: new Date(start + (index + 1) * 60000) })) })
    const result = await planning(), day = result.days.find(row => row.key === "2030-06-20")!
    expect(day).toMatchObject({ count: 251, conflicts: 0, invalidSlots: 0, totalLegs: 250, measuredLegs: 0 })
    expect(day.items).toHaveLength(6)
    expect(result.members.find(row => row.id === membershipId)).toMatchObject({ interventions: 252, plannedMinutes: 3825 })
  })
  it("detects conflicts outside the six visible route previews", async () => {
    const start = Date.parse("2030-06-20T08:00:00Z")
    await prisma.fieldIntervention.createMany({ data: Array.from({ length: 8 }, (_, index) => ({ companyId: session.companyId, siteId, assignedMembershipId: membershipId, title: `EXTRA-hidden-conflict-${index}`, scheduledStart: new Date(start + index * 3600000), scheduledEnd: new Date(start + index * 3600000 + 3600000 + (index === 6 ? 1800000 : 0)) })) })
    const day = (await planning()).days.find(row => row.key === "2030-06-20")!
    expect(day).toMatchObject({ count: 8, conflicts: 2 })
    expect(day.items.every(row => !row.conflict)).toBe(true)
  })
  it("detects a slot crossing civil midnight before the current week", async () => {
    await prisma.fieldIntervention.createMany({ data: [
      { companyId: session.companyId, siteId, assignedMembershipId: membershipId, title: "EXTRA-previous-week-night", scheduledStart: new Date("2030-06-16T21:30:00Z"), scheduledEnd: new Date("2030-06-16T23:00:00Z") },
      { companyId: session.companyId, siteId, assignedMembershipId: membershipId, title: "EXTRA-current-week-night", scheduledStart: new Date("2030-06-16T22:30:00Z"), scheduledEnd: new Date("2030-06-16T23:30:00Z") },
    ] })
    const day = (await planning()).days.find(row => row.key === "2030-06-17")!
    expect(day).toMatchObject({ count: 1, conflicts: 1 })
    expect(day.items[0].conflict).toBe(true)
  })
  it("checks the final displayed day against a conflicting slot on day fifteen", async () => {
    const start = Date.parse("2030-06-20T08:00:00Z")
    await prisma.fieldIntervention.createMany({ data: Array.from({ length: 15 }, (_, index) => ({ companyId: session.companyId, siteId, assignedMembershipId: membershipId, title: `EXTRA-day-${index}`, scheduledStart: new Date(start + index * 86400000), scheduledEnd: new Date(start + index * 86400000 + (index === 12 ? 90000000 : 3600000)) })) })
    const result = await planning()
    expect(result.days).toHaveLength(14) // Existing June 18 plus June 20 to July 2.
    const last = result.days.at(-1)!
    expect(last.key).toBe("2030-07-02")
    expect(last.conflicts).toBe(1)
    expect(last.items[0].conflict).toBe(true)
  })
  it("does not label an impossible interval as a coherent planning slot", async () => {
    await prisma.fieldIntervention.create({ data: { companyId: session.companyId, siteId, assignedMembershipId: membershipId, title: "EXTRA-invalid-slot", scheduledStart: new Date("2030-06-20T10:00:00Z"), scheduledEnd: new Date("2030-06-20T09:00:00Z") } })
    expect((await planning()).days.find(row => row.key === "2030-06-20")).toMatchObject({ count: 1, invalidSlots: 1, conflicts: 0 })
  })
  it("matches an independent pairwise conflict oracle across civil days", async () => {
    const base = Date.parse("2030-06-20T20:00:00Z")
    const slots = Array.from({ length: 100 }, (_, index) => {
      const start = base + ((index * 37) % 100) * 900000
      return { title: `EXTRA-oracle-${index}`, start, end: start + (((index * 11) % 8) + 1) * 900000, assigned: index % 5 !== 0 }
    })
    const conflicted = (item: typeof slots[number]) => item.assigned && slots.some(other => other !== item && other.assigned && item.start < other.end && other.start < item.end)
    await prisma.fieldIntervention.createMany({ data: slots.map(item => ({ companyId: session.companyId, siteId, assignedMembershipId: item.assigned ? membershipId : null, title: item.title, scheduledStart: new Date(item.start), scheduledEnd: new Date(item.end) })) })
    const result = await planning()
    for (const key of ["2030-06-20", "2030-06-21"]) {
      const expected = slots.filter(item => (item.start < Date.parse("2030-06-20T22:00:00Z") ? "2030-06-20" : "2030-06-21") === key)
      const day = result.days.find(item => item.key === key)!
      expect(day.count).toBe(expected.length)
      expect(day.conflicts).toBe(expected.filter(conflicted).length)
      for (const preview of day.items) expect(preview.conflict).toBe(conflicted(slots.find(item => item.title === preview.title)!))
    }
    expect(result.unassigned).toBe(20)
    expect(result.members.find(item => item.id === membershipId)?.plannedMinutes).toBe(60 + slots.filter(item => item.assigned).reduce((sum, item) => sum + (item.end - item.start) / 60000, 0))
  })
  it("reads 10001 same-day slots without returning an unbounded route payload", async () => {
    const start = Date.parse("2030-06-20T08:00:00Z")
    await prisma.fieldIntervention.createMany({ data: Array.from({ length: 10001 }, (_, index) => ({ companyId: session.companyId, siteId, assignedMembershipId: membershipId, title: `EXTRA-ten-thousand-${index}`, scheduledStart: new Date(start + index * 1000), scheduledEnd: new Date(start + (index + 1) * 1000) })) })
    const started = performance.now()
    const result = await planning()
    const durationMs = performance.now() - started
    const day = result.days.find(row => row.key === "2030-06-20")!
    expect(day).toMatchObject({ count: 10001, conflicts: 0, totalLegs: 10000 })
    expect(day.items).toHaveLength(6)
    expect(result.members.find(row => row.id === membershipId)).toMatchObject({ interventions: 10002, plannedMinutes: 150075 })
    expect(JSON.stringify(result).length).toBeLessThan(25000)
    console.info("PLANNING_VOLUME_OBSERVATION", JSON.stringify({ rows: 10001, durationMs: Math.round(durationMs), responseBytes: Buffer.byteLength(JSON.stringify(result)), scope: "One isolated database read; fixture creation excluded, not an SLO or load qualification" }))
  }, 30_000) // Includes inserting 10,001 rows on the PostgreSQL CI service.
})

describe.sequential("Operations service directories preserve scope and current permissions", () => {
  let fixture: Awaited<ReturnType<typeof createOperationsDashboardFixture>>
  const readers = [
    { key: "tickets", read: service.getOperationsTicketDirectory },
    { key: "interventions", read: service.getOperationsInterventionDirectory },
    { key: "contracts", read: service.getOperationsMaintenanceDirectory },
  ] as const
  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2030-01-01T12:00:00Z"))
    fixture = await createOperationsDashboardFixture(database)
    session.userId = fixture.user.id; session.companyId = fixture.companyId
  })
  afterEach(async () => {
    vi.unstubAllEnvs(); session.authenticated = true
    await prisma.membership.update({ where: { id: fixture.member.id }, data: { role: "OWNER", status: "ACTIVE" } })
    await prisma.fieldIntervention.deleteMany({ where: { companyId: fixture.companyId, title: { startsWith: "EXTRA-" } } })
  })
  afterAll(async () => { vi.useRealTimers(); if (fixture) await fixture.cleanup(); await database.$disconnect() })
  it.each(readers)("retains coherent $key while excluding foreign parent references", async ({ key, read }) => {
    const result = await read()
    expect(result.items.map(row => row.id)).toContain(fixture.positive[key])
    expect(result.items.map(row => row.id)).not.toContain(fixture.negative[key])
    expect(JSON.stringify(result)).not.toContain("FOREIGN-OPERATIONS-")
  })
  it("preserves filtered intervention costs, reservations and files", async () => {
    const result = await service.getOperationsInterventionDirectory({ search: "Fictional" })
    const item = result.items.find(row => row.id === fixture.positive.interventions)!
    expect(item.expenses.map(row => row.id)).toEqual([fixture.goodExpense.id])
    expect(item.stockMovements.map(row => row.id)).toEqual([fixture.goodMovement.id])
    expect(item.reservations.map(row => row.title)).toEqual(["Fictional permitted reservation"])
  })
  it("preserves filtered maintenance counters and renewal history", async () => {
    const item = (await service.getOperationsMaintenanceDirectory()).items.find(row => row.id === fixture.positive.contracts)!
    expect(item._count).toEqual({ equipments: 1, renewedContracts: 1 })
    expect(item.renewalProposals.map(row => row.id)).toEqual([fixture.proposal.id])
    expect(item.recurringInvoice?.id).toBe(fixture.recurring.id)
  })
  it.each(readers)("refuses an inaccessible agency in $key", async ({ read }) => {
    await prisma.membership.update({ where: { id: fixture.member.id }, data: { role: "OPERATIONS" } })
    await expect(read({ agencyId: fixture.otherAgency.id })).rejects.toThrow("AGENCY_ACCESS_DENIED")
    expect(JSON.stringify(await read({ agencyId: fixture.agency.id }))).not.toContain(fixture.otherSite.id)
  })
  it("applies agency access to weekly capacity and route previews", async () => {
    await prisma.membership.update({ where: { id: fixture.member.id }, data: { role: "OPERATIONS" } })
    const result = await service.getOperationsPlanningSummary({ agencyId: fixture.agency.id })
    expect(result.days.flatMap(day => day.items).map(row => row.id)).toContain(fixture.positive.interventions)
    expect(JSON.stringify(result)).not.toContain(fixture.otherIntervention.id)
    expect(JSON.stringify(result)).not.toContain("FOREIGN-OPERATIONS-")
    await expect(service.getOperationsPlanningSummary({ agencyId: fixture.otherAgency.id })).rejects.toThrow("AGENCY_ACCESS_DENIED")
  })
  it("requires finance permission when renewal would create billing", async () => {
    await prisma.membership.update({ where: { id: fixture.member.id }, data: { role: "SERVICE" } })
    const item = (await service.getOperationsMaintenanceDirectory()).items.find(row => row.id === fixture.positive.contracts)!
    expect(item).toMatchObject({ canManageRenewal: true, canCreateRenewalProposal: false, canRenew: false })
  })
  it.each(["SERVICE", "VIEWER", "ACCOUNTING"])("keeps intervention writes disabled for %s", async role => {
    await prisma.membership.update({ where: { id: fixture.member.id }, data: { role } })
    expect((await service.getOperationsInterventionDirectory()).canManage).toBe(false)
  })
  it.each(readers)("reads $key in the public demo without exposing mutation controls", async ({ read }) => {
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    const before = await prisma.auditLog.count()
    const result = await read()
    expect(result.items.length).toBeGreaterThan(0)
    if ("canManage" in result) expect(result.canManage).toBe(false)
    if ("canManageRenewal" in result.items[0]) for (const item of result.items) expect(item).toMatchObject({ canManageRenewal: false, canCreateRenewalProposal: false, canRenew: false })
    expect(await prisma.auditLog.count()).toBe(before)
  })
  it("reads complete planning in the public demo", async () => {
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    expect((await service.getOperationsPlanningSummary()).days.length).toBeGreaterThan(0)
  })
  it.each(readers)("rejects unknown query fields in $key", async ({ read }) => {
    await expect(read({ companyId: fixture.foreignCompanyId })).rejects.toThrow()
    await expect(read({ agencyId: "forged" })).rejects.toThrow()
    await expect(read({ page: 0 })).rejects.toThrow()
    await expect(read({ search: "x".repeat(201) })).rejects.toThrow()
  })
  it("rejects malformed planning scope", async () => {
    await expect(service.getOperationsPlanningSummary({ companyId: fixture.foreignCompanyId })).rejects.toThrow()
    await expect(service.getOperationsPlanningSummary({ agencyId: "forged" })).rejects.toThrow()
  })
  it("requires authentication before all service reads", async () => {
    session.authenticated = false
    for (const { read } of readers) await expect(read()).rejects.toThrow()
    await expect(service.getOperationsPlanningSummary()).rejects.toThrow()
  })
  it("does not retain rights from a suspended membership", async () => {
    await prisma.membership.update({ where: { id: fixture.member.id }, data: { status: "SUSPENDED" } })
    for (const { read } of readers) await expect(read()).rejects.toThrow()
    await expect(service.getOperationsPlanningSummary()).rejects.toThrow()
  })
  it.each([
    ["spring", "2026-03-29", "2026-03-28T23:00:00Z", "2026-03-29T22:00:00Z"],
    ["autumn", "2026-10-25", "2026-10-24T22:00:00Z", "2026-10-25T23:00:00Z"],
  ])("uses both boundaries of the company's %s civil day", async (_label, day, from, to) => {
    const starts = [Date.parse(from) - 1, Date.parse(from), Date.parse(to) - 1, Date.parse(to)]
    await prisma.fieldIntervention.createMany({ data: starts.map((start, index) => ({ companyId: fixture.companyId, siteId: fixture.site.id, title: `EXTRA-DST-${index}`, scheduledStart: new Date(start) })) })
    const result = await service.getOperationsInterventionDirectory({ from: day, to: day })
    expect(result.total).toBe(2)
    expect(result.items.map(row => row.title)).toEqual(["EXTRA-DST-1", "EXTRA-DST-2"])
  })
})
