import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
import prisma from "@/lib/prisma"
import { getWorkspaceOverview } from "@/actions/workspaces"

describe.sequential("workspace domain access on real SQL", () => {
  let membershipId: string
  beforeAll(async () => {
    session.companyId = (await prisma.company.create({ data: { name: "Fictional workspace access probe" } })).id
    session.userId = (await prisma.user.create({ data: { email: `workspace-access-${randomUUID()}@example.test` } })).id
    membershipId = (await prisma.membership.create({ data: { companyId: session.companyId, userId: session.userId, role: "OWNER", status: "ACTIVE" } })).id
    const clientId = (await prisma.client.create({ data: { companyId: session.companyId, name: "Fictional workspace client" } })).id
    for (const [code, amount] of [["LOCAL", 10000], ["OTHER", 20000]] as const) {
      const agencyId = (await prisma.agency.create({ data: { companyId: session.companyId, code, name: `Fictional ${code} agency` } })).id
      if (code === "LOCAL") await prisma.agencyMembership.create({ data: { membershipId, agencyId } })
      const projectId = (await prisma.project.create({ data: { companyId: session.companyId, clientId, agencyId, name: `Fictional ${code} project` } })).id
      await prisma.invoice.create({ data: { companyId: session.companyId, clientId, projectId, number: code, object: "Fictional invoice", status: "SENT", dueDate: new Date("2020-01-01"), totalHtCents: amount, totalTvaCents: 0, totalTtcCents: amount } })
      const siteId = (await prisma.customerSite.create({ data: { companyId: session.companyId, clientId, agencyId, label: `Fictional ${code} site`, address1: "Fictional address" } })).id
      await prisma.serviceTicket.create({ data: { companyId: session.companyId, clientId, siteId, number: code, title: `Fictional ${code} ticket`, description: "Fictional ticket" } })
    }
  })
  afterEach(async () => { vi.restoreAllMocks(); await prisma.membership.update({ where: { id: membershipId }, data: { role: "OWNER", status: "ACTIVE" } }) })
  afterAll(async () => {
    const where = { companyId: session.companyId }
    await prisma.serviceTicket.deleteMany({ where })
    await prisma.customerSite.deleteMany({ where })
    await prisma.invoice.deleteMany({ where })
    await prisma.project.deleteMany({ where })
    await prisma.client.deleteMany({ where })
    await prisma.company.delete({ where: { id: session.companyId } })
    await prisma.user.delete({ where: { id: session.userId } })
  })
  it.each(["TECHNICIAN", "SERVICE", "SALES"].flatMap(role => ["CRM", "SERVICE"].map(scope => ({ role, scope }))))("does not serialize unused financial amounts in $scope for $role", async ({ role, scope }) => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    if (scope === "SERVICE" && role === "SALES") await expect(getWorkspaceOverview("SERVICE")).rejects.toThrow("droits nécessaires")
    else expect((await getWorkspaceOverview(scope as "CRM" | "SERVICE")).outstandingCents).toBeNull()
  })
  it.each(["TECHNICIAN", "SERVICE", "SALES"])("refuses the Finance workspace reader to %s", async role => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    await expect(getWorkspaceOverview("REVENUE")).rejects.toThrow("droits nécessaires")
  })
  it.each(["TECHNICIAN", "SERVICE"])("refuses the Sales workspace reader to %s", async role => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    await expect(getWorkspaceOverview("SALES")).rejects.toThrow("droits nécessaires")
  })
  it("limits Service overview counts and details to assigned agencies", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "SERVICE" } })
    const result = await getWorkspaceOverview("SERVICE")
    expect(result.openTickets).toBe(1)
    expect(result.priorityTickets.map(ticket => ticket.number)).toEqual(["LOCAL"])
  })
  it("limits a Viewer financial overview to its assigned agency", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "VIEWER" } })
    const result = await getWorkspaceOverview("REVENUE")
    expect(result.outstandingCents).toBe(10000)
    expect(result.recentInvoices.map(invoice => invoice.number)).toEqual(["LOCAL"])
  })
  it("preserves Owner company-wide financial totals", async () => {
    expect((await getWorkspaceOverview("REVENUE")).outstandingCents).toBe(30000)
  })
  it("preserves Owner company-wide Service tickets", async () => {
    expect((await getWorkspaceOverview("SERVICE")).openTickets).toBe(2)
  })
  it("does not count another agency projects in recent CRM clients", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "SERVICE" } })
    expect((await getWorkspaceOverview("CRM")).recentClients[0]._count.projects).toBe(1)
  })
  it("preserves Owner recent CRM client project count", async () => {
    expect((await getWorkspaceOverview("CRM")).recentClients[0]._count.projects).toBe(2)
  })
  it.each([{ role: "TECHNICIAN", scope: "MARKETING" }, { role: "VIEWER", scope: "MARKETING" }, { role: "ACCOUNTING", scope: "MARKETING" }, { role: "SALES", scope: "SERVICE" }, { role: "ACCOUNTING", scope: "SERVICE" }])("refuses a $scope workspace without its domain permission to $role", async ({ role, scope }) => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    await expect(getWorkspaceOverview(scope as "MARKETING" | "SERVICE")).rejects.toThrow("droits nécessaires")
  })
  it("refuses workspace consultation after suspension", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { status: "SUSPENDED" } })
    await expect(getWorkspaceOverview("CRM")).rejects.toThrow("plus accès")
  })
  it.each([
    { role: "SALES", scope: "SALES" },
    { role: "SERVICE", scope: "MARKETING" },
    { role: "ACCOUNTING", scope: "REVENUE" },
    { role: "TECHNICIAN", scope: "SERVICE" },
  ] as const)("preserves the authorized $scope domain for $role", async ({ role, scope }) => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    await expect(getWorkspaceOverview(scope)).resolves.toHaveProperty("clients", 1)
  })
  it("omits all forbidden domain fields from the combined reader", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "TECHNICIAN" } })
    const result = await getWorkspaceOverview()
    expect(result.access).toEqual({ finance: false, sales: false, automation: false, service: true })
    for (const value of [result.openDeals, result.openDealValueCents, result.quotes, result.contracts, result.outstandingCents, result.overdueInvoices, result.paymentsLast90DaysCents, result.activeWorkflows, result.activeSegments]) expect(value).toBeNull()
    for (const list of [result.opportunities, result.recentQuotes, result.recentInvoices, result.outstandingInvoices, result.campaigns, result.workflows, result.sequences, result.leadSources]) expect(list).toEqual([])
    expect(result.paymentSeries.series[0].values.every(value => value === 0)).toBe(true)
    expect(result.priorityTickets.map(ticket => ticket.number)).toEqual(["LOCAL"])
  })
  it("does not query forbidden financial, sales or automation tables", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "TECHNICIAN" } })
    const forbiddenReads = [
      vi.spyOn(prisma.invoice, "aggregate"), vi.spyOn(prisma.invoice, "count"), vi.spyOn(prisma.invoice, "findMany"),
      vi.spyOn(prisma.invoicePayment, "findMany"), vi.spyOn(prisma.opportunity, "aggregate"), vi.spyOn(prisma.opportunity, "findMany"),
      vi.spyOn(prisma.quote, "count"), vi.spyOn(prisma.quote, "findMany"), vi.spyOn(prisma.contract, "count"),
      vi.spyOn(prisma.automationWorkflow, "count"), vi.spyOn(prisma.automationWorkflow, "findMany"),
      vi.spyOn(prisma.marketingSegment, "count"), vi.spyOn(prisma.marketingCampaign, "findMany"), vi.spyOn(prisma.emailSequence, "findMany"),
    ]
    await getWorkspaceOverview()
    for (const read of forbiddenReads) expect(read).not.toHaveBeenCalled()
  })
  it("rechecks a role downgrade without changing the session", async () => {
    expect((await getWorkspaceOverview("REVENUE")).outstandingCents).toBe(30000)
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "SERVICE" } })
    await expect(getWorkspaceOverview("REVENUE")).rejects.toThrow("droits nécessaires")
    expect((await getWorkspaceOverview("CRM")).outstandingCents).toBeNull()
  })
  it("rejects an unknown scope instead of falling back to the combined reader", async () => {
    await expect(getWorkspaceOverview("UNKNOWN" as "ALL")).rejects.toThrow()
  })
})
