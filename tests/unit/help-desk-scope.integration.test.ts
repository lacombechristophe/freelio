import { PrismaClient } from "@prisma/client"
import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createOperationsDashboardFixture } from "../helpers/operations-dashboard-fixture"

const session = vi.hoisted(() => ({ userId: "", companyId: "", authenticated: true }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => session.authenticated ? { user: { id: session.userId }, companyId: session.companyId } : null }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
import { getHelpDeskDashboard } from "@/actions/operations"
import * as desk from "@/lib/operations/help-desk"

const db = new PrismaClient()
const read = getHelpDeskDashboard
describe.sequential("Main Help Desk uses a complete authorized ticket scope", () => {
  let fixture: Awaited<ReturnType<typeof createOperationsDashboardFixture>>
  const users: string[] = []
  beforeEach(async () => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2030-06-17T12:00:00Z")); fixture = await createOperationsDashboardFixture(db); session.userId = fixture.user.id; session.companyId = fixture.companyId; session.authenticated = true })
  afterEach(async () => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs(); if (fixture) await fixture.cleanup(); if (users.length) await db.user.deleteMany({ where: { id: { in: users.splice(0) } } }) })
  afterAll(async () => { await db.$disconnect() })
  it("keeps a coherent own ticket consultable without changing any record", async () => {
    const before = await fixture.snapshot(), result = await read()
    expect(result.tickets.some(ticket => ticket.id === fixture.positive.tickets)).toBe(true)
    expect(await fixture.snapshot()).toEqual(before)
  })
  it("excludes a ticket whose client belongs to another company", async () => {
    const before = await fixture.snapshot(), result = await read()
    expect(result.tickets.some(ticket => ticket.id === fixture.negative.tickets)).toBe(false)
    expect(await fixture.snapshot()).toEqual(before)
  })
  it("excludes a ticket assigned to another company's membership", async () => {
    const invalid = fixture.extra.find(row => row.key === "tickets")!
    const before = await fixture.snapshot(), result = await read()
    expect(result.tickets.some(ticket => ticket.id === invalid.id)).toBe(false)
    expect(await fixture.snapshot()).toEqual(before)
  })
  it("excludes foreign equipment independently of its own ticket root", async () => {
    await db.serviceTicket.update({ where: { id: fixture.ticket.id }, data: { equipmentId: fixture.foreignEquipment.id } })
    const before = await fixture.snapshot(), result = await read()
    expect(result.tickets.some(ticket => ticket.id === fixture.ticket.id)).toBe(false)
    expect(await fixture.snapshot()).toEqual(before)
  })
  it("counts only coherent interventions below an otherwise coherent ticket", async () => {
    const result = await read(), ticket = result.tickets.find(row => row.id === fixture.ticket.id)!
    expect(ticket._count.interventions).toBe(2)
  })
  it("also restricts nested intervention counts to the current agencies", async () => {
    await db.membership.update({ where: { id: fixture.member.id }, data: { role: "SERVICE" } })
    const result = await read(), ticket = result.tickets.find(row => row.id === fixture.ticket.id)!
    expect(ticket._count.interventions).toBe(1)
  })
  it("does not count a foreign-client assignment in a member's workload", async () => {
    await db.serviceTicket.update({ where: { id: fixture.negative.tickets }, data: { assignedMembershipId: fixture.member.id } })
    const result = await read()
    expect(result.members.find(member => member.id === fixture.member.id)?.openTickets).toBe(1)
  })
  it("does not offer a responsible member from an inaccessible agency", async () => {
    await db.membership.update({ where: { id: fixture.member.id }, data: { role: "SERVICE" } })
    await db.membership.update({ where: { id: fixture.foreignMember.id }, data: { companyId: fixture.companyId } })
    await db.agencyMembership.create({ data: { membershipId: fixture.foreignMember.id, agencyId: fixture.otherAgency.id } })
    const result = await read()
    expect(result.members.some(member => member.id === fixture.foreignMember.id)).toBe(false)
  })
  it("puts HIGH before NORMAL rather than using lexical priority order", async () => {
    await db.serviceTicket.updateMany({ where: { companyId: fixture.companyId }, data: { status: "CLOSED" } })
    await db.serviceTicket.createMany({ data: ["NORMAL", "HIGH"].map(priority => ({ companyId: fixture.companyId, clientId: fixture.ticket.clientId, siteId: fixture.site.id, number: `PRIORITY-${priority}`, title: `Fictional ${priority}`, description: "Fictional diagnostic", priority })) })
    const result = await read()
    expect(result.tickets.map(ticket => ticket.priority)).toEqual(["HIGH", "NORMAL"])
  })
  it("counts the 501st coherent ticket beyond the old hard cap", async () => {
    await db.serviceTicket.updateMany({ where: { companyId: fixture.companyId }, data: { status: "CLOSED" } })
    await db.serviceTicket.createMany({ data: Array.from({ length: 501 }, (_, index) => ({ companyId: fixture.companyId, clientId: fixture.ticket.clientId, siteId: fixture.site.id, number: `VOLUME-${index}`, title: `Fictional full queue ${index}`, description: "Fictional diagnostic", priority: "URGENT", requestedAt: new Date("2030-06-17T08:00:00Z"), dueAt: new Date("2030-06-17T12:00:00Z") })) })
    const result = await read()
    expect(result.total ?? result.tickets.length).toBe(501)
  })
  it("retains an optional-site ticket for Owner", async () => {
    expect((await read()).tickets.some(ticket => ticket.id === fixture.optionalTicket.id)).toBe(true)
  })
  async function queue(count: number) {
    await db.serviceTicket.updateMany({ where: { companyId: fixture.companyId }, data: { status: "CLOSED" } })
    await db.serviceTicket.createMany({ data: Array.from({ length: count }, (_, index) => ({ companyId: fixture.companyId, clientId: fixture.ticket.clientId, siteId: fixture.site.id,
      number: `QUEUE-${String(index).padStart(4, "0")}`, title: "Fictional complete queue", description: "Private fictional diagnostic", priority: "URGENT", requestedAt: new Date("2030-06-17T08:00:00Z"), dueAt: new Date("2030-06-17T09:00:00Z") })) })
    return db.serviceTicket.findMany({ where: { companyId: fixture.companyId, number: { startsWith: "QUEUE-" } }, orderBy: { id: "asc" } })
  }
  it("makes all 51 tied tickets reachable once, clamps pages and retains global metrics", async () => {
    const rows = await queue(51), ids: string[] = []
    for (let page = 1; page <= 3; page++) {
      const result = await read({ page })
      expect(result).toMatchObject({ total: 51, page, metrics: { breached: 51, firstResponseBreached: 51, urgent: 51, unassigned: 51, waiting: 0 } })
      expect(result.tickets).toHaveLength(page === 3 ? 1 : 25); ids.push(...result.tickets.map(row => row.id))
    }
    expect(ids).toEqual(rows.map(row => row.id))
    expect(await read({ page: 100000 })).toMatchObject({ total: 51, page: 3 })
  })
  it("counts late and unassigned tickets outside the requested page", async () => {
    await queue(501)
    const result = await read({ page: 21 })
    expect(result).toMatchObject({ total: 501, page: 21, metrics: { breached: 501, firstResponseBreached: 501, urgent: 501, unassigned: 501, waiting: 0 } })
    expect(result.tickets).toHaveLength(1)
    expect(result.asOf.toISOString()).toBe("2030-06-17T12:00:00.000Z"); expect(result.timeZone).toBe("Europe/Paris")
  })
  it("searches number, title and authorized client before pagination", async () => {
    const rows = await queue(51), target = rows[50]
    expect(await read({ search: target.number, page: 99 })).toMatchObject({ total: 1, page: 1, tickets: [{ id: target.id }] })
    expect(await read({ search: "COMPLETE QUEUE" })).toMatchObject({ total: 51 })
    expect(await read({ search: "permitted client" })).toMatchObject({ total: 51 })
    expect(await read({ search: "no fictional match", page: 99 })).toMatchObject({ total: 0, page: 1, tickets: [], metrics: { breached: 0, firstResponseBreached: 0, urgent: 0, unassigned: 0, waiting: 0 } })
  })
  it("orders equal priorities by their computed SLA deadline, then oldest request and ID", async () => {
    await queue(0)
    const future = await db.serviceTicket.create({ data: { companyId: fixture.companyId, clientId: fixture.ticket.clientId, siteId: fixture.site.id, number: "POLICY", title: "Fictional policy target", description: "Fictional", requestedAt: new Date("2030-06-17T08:00:00Z") } })
    const manual = await db.serviceTicket.create({ data: { companyId: fixture.companyId, clientId: fixture.ticket.clientId, siteId: fixture.site.id, number: "MANUAL", title: "Fictional custom target", description: "Fictional", requestedAt: new Date("2030-06-17T09:00:00Z"), dueAt: new Date("2030-06-17T10:00:00Z") } })
    expect((await read()).tickets.map(row => row.id)).toEqual([manual.id, future.id])
  })
  it("combines status, priority, responsible member and search for both rows and metrics", async () => {
    const rows = await queue(3)
    await db.serviceTicket.update({ where: { id: rows[2].id }, data: { status: "WAITING", priority: "HIGH", assignedMembershipId: fixture.member.id, firstRespondedAt: new Date("2030-06-17T10:00:00Z") } })
    const result = await read({ status: "WAITING", priority: "HIGH", assignedMembershipId: fixture.member.id, search: rows[2].number })
    expect(result).toMatchObject({ total: 1, tickets: [{ id: rows[2].id }], metrics: { breached: 1, firstResponseBreached: 0, urgent: 0, unassigned: 0, waiting: 1 } })
    expect(result.members.find(member => member.id === fixture.member.id)?.openTickets).toBe(1)
    expect(await read({ status: "OPEN", priority: "HIGH" })).toMatchObject({ total: 0 })
  })
  it("does not return diagnostic or membership internals in the page payload", async () => {
    const result = await read()
    for (const ticket of result.tickets) { expect(ticket).not.toHaveProperty("description"); expect(ticket).not.toHaveProperty("clientId"); if (ticket.assignedMembership) expect(ticket.assignedMembership).not.toHaveProperty("companyId") }
  })
  it("puts unknown historical priorities after all known priorities", async () => {
    const rows = await queue(5)
    await Promise.all(["LOW", "NORMAL", "HIGH", "URGENT", "HISTORICAL"].map((priority, index) => db.serviceTicket.update({ where: { id: rows[index].id }, data: { priority } })))
    expect((await read()).tickets.map(row => row.priority)).toEqual(["URGENT", "HIGH", "NORMAL", "LOW", "HISTORICAL"])
  })
  it("paginates and searches responsible members while retaining an off-page choice", async () => {
    const created: string[] = []
    for (let index = 0; index < 26; index++) {
      const user = await db.user.create({ data: { email: `helpdesk-${randomUUID()}@example.test`, name: `Fictional member ${index}` } }); users.push(user.id)
      const member = await db.membership.create({ data: { companyId: fixture.companyId, userId: user.id, role: "SERVICE", status: "ACTIVE", agencyMemberships: { create: { agencyId: fixture.agency.id } } } }); created.push(member.id)
    }
    const first = await read(), second = await read({ memberPage: 99 })
    expect(first).toMatchObject({ memberTotal: 27, memberPage: 1 }); expect(first.members).toHaveLength(25)
    expect(second).toMatchObject({ memberTotal: 27, memberPage: 2 }); expect(second.members).toHaveLength(2)
    expect(new Set([...first.members, ...second.members].map(member => member.id)).size).toBe(27)
    const filtered = await read({ memberSearch: "MEMBER 25", assignedMembershipId: fixture.member.id })
    expect(filtered).toMatchObject({ memberTotal: 1, members: [{ id: created[25] }], selectedMember: { id: fixture.member.id } })
  })
  it.each(["SALES", "ACCOUNTING"])("refuses %s before the business reader", async role => {
    await db.membership.update({ where: { id: fixture.member.id }, data: { role } }); const reader = vi.spyOn(desk, "readHelpDeskDashboard"), before = await fixture.snapshot()
    await expect(read()).rejects.toThrow("droits nécessaires"); expect(reader).not.toHaveBeenCalled(); expect(await fixture.snapshot()).toEqual(before)
  })
  it("requires authentication and a current active membership", async () => {
    const before = await fixture.snapshot(); session.authenticated = false
    await expect(read()).rejects.toThrow("Authentification requise"); session.authenticated = true
    await db.membership.update({ where: { id: fixture.member.id }, data: { status: "SUSPENDED" } })
    await expect(read()).rejects.toThrow("plus accès"); expect(await fixture.snapshot()).toEqual(before)
  })
  it("revokes both ticket and member reads with an agency assignment", async () => {
    await db.membership.update({ where: { id: fixture.member.id }, data: { role: "SERVICE" } })
    await db.agencyMembership.deleteMany({ where: { membershipId: fixture.member.id } })
    expect(await read()).toMatchObject({ total: 0, tickets: [], members: [], memberTotal: 0 })
  })
  it("remains read-only in the public demo", async () => {
    const before = await fixture.snapshot(); vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    expect((await read()).total).toBeGreaterThan(0); expect(await fixture.snapshot()).toEqual(before)
  })
  it.each([{ page: 0 }, { page: 1.5 }, { search: "x".repeat(201) }, { memberPage: 0 }, { status: "UNKNOWN" }, { assignedMembershipId: "invalid" }])("rejects invalid query %j", async input => {
    const before = await fixture.snapshot(); await expect(read(input)).rejects.toThrow(); expect(await fixture.snapshot()).toEqual(before)
  })
})
