import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"

const session = vi.hoisted(() => ({ userId: "", companyId: "", authenticated: true }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => session.authenticated ? { user: { id: session.userId }, companyId: session.companyId } : null }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
import prisma from "@/lib/prisma"
import { getOperationsActivitySummary as summary, getOperationsDashboard } from "@/actions/operations"
import { readOperationsActivity } from "@/lib/operations/activity-summary"

describe.sequential("Operations activity totals do not depend on preview caches", () => {
  let agencyId: string, clientId: string, siteId: string
  let data: Awaited<ReturnType<typeof getOperationsDashboard>>
  beforeAll(async () => {
    session.companyId = (await prisma.company.create({ data: { name: "Fictional activity summary", serviceTimezone: "Europe/Paris" } })).id
    session.userId = (await prisma.user.create({ data: { email: `activity-summary-${randomUUID()}@example.test` } })).id
    await prisma.membership.create({ data: { companyId: session.companyId, userId: session.userId, role: "OWNER", status: "ACTIVE" } })
    agencyId = (await prisma.agency.create({ data: { companyId: session.companyId, code: "SUMMARY", name: "Fictional summary agency" } })).id
    clientId = (await prisma.client.create({ data: { companyId: session.companyId, name: "Fictional summary client" } })).id
    await prisma.customerSite.createMany({ data: Array.from({ length: 101 }, (_, i) => ({ companyId: session.companyId, clientId, agencyId, label: `Fictional site ${i}`, address1: "Fictional address" })) })
    siteId = (await prisma.customerSite.findFirstOrThrow({ where: { companyId: session.companyId } })).id
    await prisma.project.createMany({ data: Array.from({ length: 301 }, (_, i) => ({ companyId: session.companyId, clientId, agencyId, name: `Fictional project ${i}` })) })
    await prisma.serviceTicket.createMany({ data: Array.from({ length: 201 }, (_, i) => ({ companyId: session.companyId, clientId, siteId, number: `CLOSED-${i}`, title: "Closed fictional ticket", description: "Fictional description", priority: "URGENT", status: "CLOSED" })) })
    await prisma.serviceTicket.createMany({ data: Array.from({ length: 2 }, (_, i) => ({ companyId: session.companyId, clientId, siteId, number: `OPEN-${i}`, title: "Open fictional ticket", description: "Fictional description" })) })
    await prisma.fieldIntervention.createMany({ data: Array.from({ length: 201 }, () => ({ companyId: session.companyId, siteId, title: "Completed fictional intervention", status: "COMPLETED", scheduledStart: new Date("2000-01-01T12:00:00Z") })) })
    await prisma.fieldIntervention.createMany({ data: [
      { companyId: session.companyId, siteId, title: "Future fictional intervention", scheduledStart: new Date("2099-01-01T12:00:00Z") },
      { companyId: session.companyId, siteId, title: "Other future fictional intervention", scheduledStart: new Date("2099-01-02T12:00:00Z") },
      { companyId: session.companyId, siteId, title: "Due fictional intervention", scheduledStart: new Date("2001-01-01T12:00:00Z") },
      { companyId: session.companyId, siteId, title: "Other due fictional intervention", scheduledStart: new Date("2001-01-02T12:00:00Z") },
    ] })
    data = await getOperationsDashboard()
  })
  afterAll(async () => {
    await prisma.fieldIntervention.deleteMany({ where: { companyId: session.companyId } })
    await prisma.serviceTicket.deleteMany({ where: { companyId: session.companyId } })
    await prisma.project.deleteMany({ where: { companyId: session.companyId } })
    await prisma.customerSite.deleteMany({ where: { companyId: session.companyId } })
    await prisma.client.deleteMany({ where: { companyId: session.companyId } })
    await prisma.company.delete({ where: { id: session.companyId } })
    await prisma.user.delete({ where: { id: session.userId } })
  })
  const activity = () => data.activity
  it("counts open SAV beyond 200 closed tickets", () => expect(activity().openTickets).toBe(2))
  it("counts future interventions beyond 200 historical interventions", () => expect(activity().comingInterventions).toBe(2))
  it("finds due interventions outside the historical cache", () => expect(activity().dueInterventions).toBe(2))
  it("keeps the actual open tickets in the priority preview", () => expect(activity().priorityTickets.map(row => row.number).sort()).toEqual(["OPEN-0", "OPEN-1"]))
  it("keeps the actual due interventions in the overview preview", () => expect(activity().upcomingInterventions.map(row => row.title)).toEqual(["Due fictional intervention", "Other due fictional intervention"]))
  it("counts all 101 sites in the agency comparison", () => {
    const agency = data.agencies.find(row => row.id === agencyId)!
    expect(agency._count.customerSites).toBe(101)
  })
  it("counts all 301 active projects in the agency comparison", () => {
    const agency = data.agencies.find(row => row.id === agencyId)!
    expect(agency._count.projects).toBe(301)
  })
  it("still keeps bounded dashboard caches for their other consumers", () => {
    expect(data.sites).toHaveLength(100); expect(data.projects).toHaveLength(300)
    expect(data.tickets).toHaveLength(200); expect(data.interventions).toHaveLength(200)
  })
})

describe.sequential("Operations activity boundaries, permissions and volume on real SQL", () => {
  let membershipId: string, agencyId: string, otherAgencyId: string, inactiveAgencyId: string
  let foreignCompanyId: string, foreignAgencyId: string, siteId: string
  let clientId: string, foreignClientId: string
  beforeAll(async () => {
    session.companyId = (await prisma.company.create({ data: { name: "Fictional scoped activity", serviceTimezone: "Europe/Paris" } })).id
    session.userId = (await prisma.user.create({ data: { email: `scoped-activity-${randomUUID()}@example.test` } })).id
    membershipId = (await prisma.membership.create({ data: { companyId: session.companyId, userId: session.userId, role: "OWNER", status: "ACTIVE" } })).id
    agencyId = (await prisma.agency.create({ data: { companyId: session.companyId, code: "A", name: "Fictional agency A" } })).id
    otherAgencyId = (await prisma.agency.create({ data: { companyId: session.companyId, code: "B", name: "Fictional agency B" } })).id
    inactiveAgencyId = (await prisma.agency.create({ data: { companyId: session.companyId, code: "I", name: "Fictional inactive agency", active: false } })).id
    await prisma.agencyMembership.create({ data: { membershipId, agencyId } })
    clientId = (await prisma.client.create({ data: { companyId: session.companyId, name: "Fictional scoped client" } })).id
    foreignCompanyId = (await prisma.company.create({ data: { name: "FOREIGN-ACTIVITY-COMPANY" } })).id
    foreignClientId = (await prisma.client.create({ data: { companyId: foreignCompanyId, name: "FOREIGN-ACTIVITY-CLIENT" } })).id
    foreignAgencyId = (await prisma.agency.create({ data: { companyId: foreignCompanyId, code: "F", name: "FOREIGN-ACTIVITY-AGENCY" } })).id
    for (const [index, owner, client, agency] of [[0, session.companyId, clientId, agencyId], [1, session.companyId, clientId, otherAgencyId], [2, foreignCompanyId, foreignClientId, foreignAgencyId], [3, session.companyId, foreignClientId, agencyId]] as const) {
      const site = await prisma.customerSite.create({ data: { companyId: owner, clientId: client, agencyId: agency, label: `Fictional scoped site ${index}`, address1: "Fictional address" } })
      if (index === 0) siteId = site.id
      await prisma.serviceTicket.create({ data: { companyId: owner, clientId: client, siteId: site.id, number: `SCOPED-${index}`, title: `Fictional scoped ticket ${index}`, description: "PRIVATE-ACTIVITY-DESCRIPTION" } })
      await prisma.fieldIntervention.create({ data: { companyId: owner, siteId: site.id, title: `Fictional scoped intervention ${index}`, scheduledStart: new Date("2099-01-01T12:00:00Z") } })
      await prisma.project.create({ data: { companyId: owner, clientId: client, agencyId: agency, name: `Fictional scoped project ${index}` } })
    }
    await prisma.serviceTicket.create({ data: { companyId: session.companyId, clientId, number: "NO-SITE", title: "Fictional ticket without site", description: "Fictional description" } })
    await prisma.serviceTicket.create({ data: { companyId: session.companyId, clientId, siteId, number: "MERGED", title: "Merged fictional ticket", description: "Fictional description", status: "MERGED" } })
    await prisma.project.create({ data: { companyId: session.companyId, clientId, agencyId, name: "Completed fictional project", status: "COMPLETED" } })
  })
  afterEach(async () => {
    vi.useRealTimers(); vi.unstubAllEnvs(); session.authenticated = true
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "OWNER", status: "ACTIVE" } })
    if (!await prisma.agencyMembership.findUnique({ where: { agencyId_membershipId: { agencyId, membershipId } } })) {
      await prisma.agencyMembership.create({ data: { membershipId, agencyId } })
    }
    // Keep each cleanup statement bounded: SQLite checks this self-referencing
    // table's foreign keys for every deleted row in the 10001-ticket fixture.
    for (;;) {
      const rows = await prisma.serviceTicket.findMany({ where: { companyId: session.companyId, number: { startsWith: "EXTRA-" } }, select: { id: true }, take: 250 })
      if (!rows.length) break
      await prisma.serviceTicket.deleteMany({ where: { id: { in: rows.map(row => row.id) } } })
    }
    await prisma.fieldIntervention.deleteMany({ where: { companyId: session.companyId, title: { startsWith: "EXTRA-" } } })
  }, 30_000) // Fixture teardown only; the activity query keeps the normal test timeout.
  afterAll(async () => {
    const companyId = { in: [session.companyId, foreignCompanyId] }
    await prisma.fieldIntervention.deleteMany({ where: { companyId } })
    await prisma.serviceTicket.deleteMany({ where: { companyId } })
    await prisma.project.deleteMany({ where: { companyId } })
    await prisma.customerSite.deleteMany({ where: { companyId } })
    await prisma.client.deleteMany({ where: { companyId } })
    await prisma.company.deleteMany({ where: { id: companyId } })
    await prisma.user.delete({ where: { id: session.userId } })
  })
  it("includes coherent unassigned tickets in the company total but excludes merged and foreign records", async () => {
    expect(await summary()).toMatchObject({ openTickets: 3, comingInterventions: 2, dueInterventions: 0 })
  })
  it("filters the complete counts and previews to one agency", async () => {
    const result = await summary({ agencyId })
    expect(result).toMatchObject({ openTickets: 1, comingInterventions: 1, dueInterventions: 0 })
    expect(result.priorityTickets.map(row => row.number)).toEqual(["SCOPED-0"])
    expect(await summary({ agencyId: otherAgencyId })).toMatchObject({ openTickets: 1, comingInterventions: 1 })
  })
  it("does not expose other agencies to an assigned Operations member", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "OPERATIONS" } })
    const result = await summary()
    expect(result).toMatchObject({ openTickets: 1, comingInterventions: 1 })
    expect(result.priorityTickets.map(row => row.number)).toEqual(["SCOPED-0"])
    await expect(summary({ agencyId: otherAgencyId })).rejects.toThrow("AGENCY_ACCESS_DENIED")
  })
  it("does not broaden the intervention perimeter when no agency is assigned", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "TECHNICIAN" } })
    await prisma.agencyMembership.delete({ where: { agencyId_membershipId: { agencyId, membershipId } } })
    expect(await summary()).toMatchObject({ openTickets: 0, comingInterventions: 0, upcomingInterventions: [] })
    await expect(summary({ agencyId })).rejects.toThrow("AGENCY_ACCESS_DENIED")
  })
  it("also enforces the supplied agency perimeter without relying on a request extension", async () => {
    await expect(readOperationsActivity(session.companyId, [agencyId], new Date(), new Date("2099-01-01"), otherAgencyId)).rejects.toThrow("AGENCY_ACCESS_DENIED")
  })
  it.each(["foreign", "inactive"])("rejects a %s agency even for an administrator", async kind => {
    await expect(summary({ agencyId: kind === "foreign" ? foreignAgencyId : inactiveAgencyId })).rejects.toThrow("AGENCY_ACCESS_DENIED")
  })
  it("keeps the same coherent, active project definition in the agency counters", async () => {
    const result = await getOperationsDashboard()
    expect(result.agencies.find(row => row.id === agencyId)?._count).toEqual({ customerSites: 1, projects: 1 })
    expect(result.agencies.find(row => row.id === otherAgencyId)?._count).toEqual({ customerSites: 1, projects: 1 })
    expect(result.agencies.map(row => row.id)).not.toContain(inactiveAgencyId)
  })
  it("returns only the fields required by the previews", async () => {
    const result = await summary()
    expect(Object.keys(result.priorityTickets[0]).sort()).toEqual(["client", "equipment", "id", "number", "priority", "title"])
    const payload = JSON.stringify(result)
    for (const marker of ["PRIVATE-ACTIVITY-DESCRIPTION", "FOREIGN-ACTIVITY-", foreignCompanyId, foreignClientId]) expect(payload).not.toContain(marker)
  })
  it.each([
    ["spring", "2026-03-29T00:00:00Z", "2026-03-29T21:59:59.999Z", "2026-03-29T22:00:00Z"],
    ["autumn", "2026-10-25T00:00:00Z", "2026-10-25T22:59:59.999Z", "2026-10-25T23:00:00Z"],
  ])("uses the company's civil day at the %s clock change", async (_label, now, before, boundary) => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(now))
    await prisma.fieldIntervention.createMany({ data: [before, boundary].map((start, index) => ({ companyId: session.companyId, siteId, title: `EXTRA-DST-${index}`, scheduledStart: new Date(start) })) })
    const result = await summary({ agencyId })
    expect(result).toMatchObject({ comingInterventions: 3, dueInterventions: 1 })
    expect(result.upcomingInterventions.map(row => row.title)).toEqual(["EXTRA-DST-0"])
  })
  it("includes the current instant in future interventions and excludes terminal states", async () => {
    const now = new Date("2030-02-20T12:00:00Z")
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now)
    await prisma.fieldIntervention.createMany({ data: ["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELED"].map(status => ({ companyId: session.companyId, siteId, title: `EXTRA-${status}`, status, scheduledStart: now })) })
    expect(await summary({ agencyId })).toMatchObject({ comingInterventions: 3, dueInterventions: 2 })
  })
  it("counts 10001 extra open tickets while returning only six previews", async () => {
    const started = performance.now()
    await prisma.serviceTicket.createMany({ data: Array.from({ length: 10001 }, (_, index) => ({ companyId: session.companyId, clientId, siteId, number: `EXTRA-${index}`, title: "Fictional volume ticket", description: "Fictional description", priority: "URGENT" })) })
    const prepared = performance.now()
    const result = await summary({ agencyId })
    const readMs = performance.now() - prepared
    expect(result.openTickets).toBe(10002)
    expect(result.priorityTickets).toHaveLength(6)
    expect(result.priorityTickets.every(row => row.priority === "URGENT")).toBe(true)
    expect(new Set(result.priorityTickets.map(row => row.id)).size).toBe(6)
    console.info("ACTIVITY_VOLUME_OBSERVATION", JSON.stringify({ rows: 10001, fixtureMs: Math.round(prepared - started), readMs: Math.round(readMs), scope: "One isolated database read, not an SLO or load qualification" }))
  }, 30_000) // Includes bulk fixture creation; the product's transaction timeout is unchanged.
  it.each([null, "invalid", { agencyId: 5 }, { agencyId: "not-a-cuid" }, { companyId: "forged" }, { agencyId: "" }])("rejects a malformed query %j", async input => {
    await expect(summary(input)).rejects.toThrow()
  })
  it("requires authentication before reading activity", async () => {
    session.authenticated = false
    await expect(summary()).rejects.toThrow()
  })
  it("requires an active membership", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { status: "SUSPENDED" } })
    await expect(summary()).rejects.toThrow()
  })
  it("reads fictitious activity in the public demo without any writes", async () => {
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    const before = await Promise.all([prisma.auditLog.count(), prisma.emailDelivery.count(), prisma.serviceTicket.count(), prisma.fieldIntervention.count()])
    expect(await summary({ agencyId })).toMatchObject({ openTickets: 1, comingInterventions: 1 })
    expect(await Promise.all([prisma.auditLog.count(), prisma.emailDelivery.count(), prisma.serviceTicket.count(), prisma.fieldIntervention.count()])).toEqual(before)
  })
})
