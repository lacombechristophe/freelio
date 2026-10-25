import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
import prisma from "@/lib/prisma"
import { getOrganisationDashboardData } from "@/actions/organisation"
import { calendarDayKey } from "@/lib/calendar-days"

describe.sequential("Organisation document permissions on real SQL", () => {
  let membershipId: string, agencyId: string, foreignCompanyId: string
  let invoiceId: string, quoteId: string, projectId: string, taskId: string, goalId: string, timeEntryId: string
  beforeAll(async () => {
    session.companyId = (await prisma.company.create({ data: { name: "Fictional Organisation permissions" } })).id
    session.userId = (await prisma.user.create({ data: { email: `organisation-scope-${randomUUID()}@example.test` } })).id
    membershipId = (await prisma.membership.create({ data: { companyId: session.companyId, userId: session.userId, role: "OWNER", status: "ACTIVE" } })).id
    agencyId = (await prisma.agency.create({ data: { companyId: session.companyId, code: "LOCAL", name: "Fictional assigned agency" } })).id
    await prisma.agencyMembership.create({ data: { agencyId, membershipId } })
    const otherAgency = await prisma.agency.create({ data: { companyId: session.companyId, code: "OTHER", name: "Fictional other agency" } })
    const client = await prisma.client.create({ data: { companyId: session.companyId, name: "Fictional Organisation client" } })
    projectId = (await prisma.project.create({ data: { companyId: session.companyId, clientId: client.id, agencyId, name: "Fictional operational project", budgetCents: 12300, consumedCents: 4500 } })).id
    const otherProject = await prisma.project.create({ data: { companyId: session.companyId, clientId: client.id, agencyId: otherAgency.id, name: "Fictional other project" } })
    foreignCompanyId = (await prisma.company.create({ data: { name: "Fictional foreign company" } })).id
    const foreignClient = await prisma.client.create({ data: { companyId: foreignCompanyId, name: "Fictional foreign client" } })
    for (const [marker, companyId, clientId, linkedProjectId] of [
      ["ALLOWED", session.companyId, client.id, projectId],
      ["OTHER-AGENCY", session.companyId, client.id, otherProject.id],
      ["UNASSIGNED", session.companyId, client.id, null],
      ["FOREIGN-CLIENT", session.companyId, foreignClient.id, projectId],
      ["FOREIGN-TENANT", foreignCompanyId, foreignClient.id, projectId],
    ] as const) {
      const scope = { companyId, clientId, projectId: linkedProjectId }
      const amounts = { totalHtCents: 34000, totalTvaCents: 0, totalTtcCents: 34000 }
      const invoice = await prisma.invoice.create({ data: { ...scope, ...amounts, number: `FINANCE-${marker}`, object: marker, dueDate: new Date("2000-01-01"), status: "OVERDUE" } })
      const quote = await prisma.quote.create({ data: { ...scope, number: `SALES-${marker}`, object: marker, versions: { create: { version: 1, ...amounts } } } })
      if (marker === "ALLOWED") { invoiceId = invoice.id; quoteId = quote.id }
    }
    goalId = (await prisma.organisationGoal.create({ data: { companyId: session.companyId, title: "Fictional retained goal" } })).id
    taskId = (await prisma.organisationTask.create({ data: { companyId: session.companyId, projectId, clientId: client.id, goalId, title: "Fictional blocked task", status: "BLOCKED" } })).id
    timeEntryId = (await prisma.timeEntry.create({ data: { projectId, date: new Date(calendarDayKey(new Date(), "Europe/Paris")), durationSec: 3600 } })).id
  })
  afterEach(async () => {
    vi.restoreAllMocks()
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "OWNER" } })
  })
  afterAll(async () => {
    const where = { companyId: { in: [session.companyId, foreignCompanyId] } }
    await prisma.invoice.deleteMany({ where })
    await prisma.quote.deleteMany({ where })
    await prisma.organisationTask.deleteMany({ where })
    await prisma.organisationGoal.deleteMany({ where })
    await prisma.project.deleteMany({ where })
    await prisma.client.deleteMany({ where })
    await prisma.company.deleteMany({ where: { id: { in: [session.companyId, foreignCompanyId] } } })
    await prisma.user.delete({ where: { id: session.userId } })
  })

  it.each(["SALES", "OPERATIONS", "SERVICE", "TECHNICIAN"])("does not query or disclose invoices without Finance for %s", async role => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    const query = vi.spyOn(prisma.invoice, "findMany")
    const data = await getOrganisationDashboardData()
    expect(data.watchlist.invoices).toEqual([])
    expect(data.canReadFinance).toBe(false)
    expect(query).not.toHaveBeenCalled()
  })
  it.each(["SERVICE", "TECHNICIAN"])("does not query or disclose quotes without Sales for %s", async role => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    const query = vi.spyOn(prisma.quote, "findMany")
    const data = await getOrganisationDashboardData()
    expect(data.watchlist.quotes).toEqual([])
    expect(data.canReadSales).toBe(false)
    expect(query).not.toHaveBeenCalled()
  })
  it.each(["OWNER", "ADMIN", "ACCOUNTING", "VIEWER"])("preserves permitted documents and excludes foreign clients/tenants for %s", async role => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    const data = await getOrganisationDashboardData()
    expect(data).toMatchObject({ canReadFinance: true, canReadSales: true })
    const expected = role === "OWNER" || role === "ADMIN" ? ["ALLOWED", "OTHER-AGENCY", "UNASSIGNED"] : ["ALLOWED"]
    expect(data.watchlist.invoices.map(item => item.object).sort()).toEqual(expected)
    expect(data.watchlist.quotes.map(item => item.object).sort()).toEqual(expected)
    expect(data.watchlist.invoices.find(item => item.id === invoiceId)?.totalTtcCents).toBe(34000)
    expect(data.watchlist.quotes.find(item => item.id === quoteId)?.totalTtcCents).toBe(34000)
  })
  it.each(["SALES", "OPERATIONS"])("keeps permitted quotes for %s", async role => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    const data = await getOrganisationDashboardData()
    expect(data.canReadSales).toBe(true)
    expect(data.watchlist.quotes.map(item => item.id)).toEqual([quoteId])
    expect(data.watchlist.invoices).toEqual([])
  })
  it("preserves tasks, goals, time and operational budgets without document permissions", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "TECHNICIAN" } })
    const data = await getOrganisationDashboardData()
    expect(data.tasks.find(item => item.id === taskId)?.status).toBe("BLOCKED")
    expect(data.goals.find(item => item.id === goalId)).toMatchObject({ taskCount: 1, doneTaskCount: 0 })
    expect(data.weekTimeEntries.find(item => item.id === timeEntryId)?.durationSec).toBe(3600)
    expect(data.projects.find(item => item.id === projectId)).toMatchObject({ budgetCents: 12300, consumedCents: 4500 })
  })
  it("reevaluates document permissions after a role change in the same session", async () => {
    expect((await getOrganisationDashboardData()).watchlist.invoices.length).toBeGreaterThan(0)
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "SERVICE" } })
    expect((await getOrganisationDashboardData()).watchlist).toMatchObject({ invoices: [], quotes: [] })
  })
  it("removes both document domains after agency access is revoked", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "ACCOUNTING" } })
    expect((await getOrganisationDashboardData()).watchlist.invoices.map(item => item.id)).toEqual([invoiceId])
    await prisma.agencyMembership.deleteMany({ where: { membershipId, agencyId } })
    try { expect((await getOrganisationDashboardData()).watchlist).toMatchObject({ invoices: [], quotes: [] }) }
    finally { await prisma.agencyMembership.create({ data: { membershipId, agencyId } }) }
  })
})
