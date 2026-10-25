import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
import prisma from "@/lib/prisma"
import { archiveCustomerHealthRule, createCustomerHealthRule, getCustomerSuccessWorkspace, installDefaultCustomerHealthRules, updateClientSuccessProfile } from "@/actions/customer-success"
import { loadCustomerHealthMetrics } from "@/lib/operations/customer-health-metrics"
describe.sequential("customer-success financial permissions on real SQL", () => {
  let membershipId: string, agencyId: string, clientId: string, financialRuleId: string, foreignCompanyId: string, foreignClientId: string
  beforeAll(async () => {
    session.companyId = (await prisma.company.create({ data: { name: "Fictional customer-success permission probe" } })).id
    session.userId = (await prisma.user.create({ data: { email: `success-permissions-${randomUUID()}@example.test` } })).id
    membershipId = (await prisma.membership.create({ data: { companyId: session.companyId, userId: session.userId, role: "OWNER", status: "ACTIVE" } })).id
    const agency = await prisma.agency.create({ data: { companyId: session.companyId, code: "PROBE", name: "Fictional permitted agency" } })
    agencyId = agency.id
    await prisma.agencyMembership.create({ data: { agencyId: agency.id, membershipId } })
    const client = await prisma.client.create({ data: { companyId: session.companyId, name: "Fictional success customer", renewalAmountCents: 12345, relationScore: 37, createdAt: new Date("2020-01-01") } })
    clientId = client.id
    const project = await prisma.project.create({ data: { companyId: session.companyId, clientId: client.id, agencyId: agency.id, name: "Fictional success project" } })
    await prisma.invoice.create({ data: { companyId: session.companyId, clientId: client.id, projectId: project.id, number: "FICTIONAL-SUCCESS-PROBE", object: "Fictional invoice", status: "SENT", dueDate: new Date("2020-01-01"), totalHtCents: 321, totalTvaCents: 0, totalTtcCents: 321 } })
    const otherAgency = await prisma.agency.create({ data: { companyId: session.companyId, code: "OTHER", name: "Fictional other agency" } })
    const otherProject = await prisma.project.create({ data: { companyId: session.companyId, clientId, agencyId: otherAgency.id, name: "Fictional other project" } })
    foreignCompanyId = (await prisma.company.create({ data: { name: "Fictional foreign success company" } })).id
    foreignClientId = (await prisma.client.create({ data: { companyId: foreignCompanyId, name: "Foreign success customer" } })).id
    const foreignProject = await prisma.project.create({ data: { companyId: foreignCompanyId, clientId, name: "Fictional foreign project" } })
    for (const [number, companyId, projectId, amount] of [["OTHER", session.companyId, otherProject.id, 700], ["FOREIGN_PROJECT", session.companyId, foreignProject.id, 900], ["FOREIGN", foreignCompanyId, foreignProject.id, 1000]] as const) {
      await prisma.invoice.create({ data: { companyId, clientId, projectId, number, object: "Fictional health scope", status: "SENT", dueDate: new Date("2020-01-01"), totalHtCents: amount, totalTvaCents: 0, totalTtcCents: amount } })
    }
    financialRuleId = (await prisma.customerHealthRule.create({ data: { companyId: session.companyId, name: "Facture échue non réglée", metric: "OVERDUE_BALANCE_CENTS", operator: "GTE", threshold: 1, impact: -60 } })).id
    await prisma.customerHealthSnapshot.create({ data: { companyId: session.companyId, clientId, score: 35, status: "RISK", factors: [] } })
  })
  afterEach(async () => {
    vi.unstubAllEnvs()
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "OWNER", status: "ACTIVE" } })
    await prisma.agency.update({ where: { id: agencyId }, data: { active: true } })
    await prisma.agencyMembership.upsert({ where: { agencyId_membershipId: { agencyId, membershipId } }, update: {}, create: { agencyId, membershipId } })
    await prisma.client.update({ where: { id: clientId }, data: { renewalAmountCents: 12345 } })
    await prisma.customerHealthRule.deleteMany({ where: { companyId: session.companyId, id: { not: financialRuleId } } })
    await prisma.customerHealthRule.update({ where: { id: financialRuleId }, data: { status: "ACTIVE", impact: -60 } })
    await prisma.auditLog.deleteMany({ where: { userId: session.userId } })
  })
  afterAll(async () => {
    const where = { companyId: { in: [session.companyId, foreignCompanyId] } }
    await prisma.invoice.deleteMany({ where }); await prisma.project.deleteMany({ where }); await prisma.client.deleteMany({ where })
    await prisma.company.deleteMany({ where: { id: where.companyId } }); await prisma.user.delete({ where: { id: session.userId } })
  })
  it("preserves authorized Owner values", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "OWNER" } })
    const client = (await getCustomerSuccessWorkspace()).portfolio[0]
    expect(client.renewalAmountCents).toBe(12345)
    expect(client.metrics.OVERDUE_BALANCE_CENTS).toBe(1021)
    expect(client.score).toBe(40)
    expect(client.previousScore).toBe(35)
    expect(client.storedScore).toBe(37)
  })
  it.each(["TECHNICIAN", "SERVICE"].flatMap(role => ["renewal", "overdue"].map(field => ({ role, field }))))("does not disclose $field amount to $role", async ({ role, field }) => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    const client = (await getCustomerSuccessWorkspace()).portfolio[0]
    expect(field === "renewal" ? client.renewalAmountCents : client.metrics.OVERDUE_BALANCE_CENTS).toBeNull()
  })
  it.each(["TECHNICIAN", "SERVICE"])("does not expose Finance factors or global scores to %s", async role => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    const workspace = await getCustomerSuccessWorkspace()
    const client = workspace.portfolio[0]
    expect(client.factors).toEqual([])
    expect(client.previousScore).toBeNull()
    expect(client.storedScore).toBeNull()
    expect(workspace.rules).toEqual([])
    expect(client.score).toBe(100)
  })
  it.each(["TECHNICIAN", "SERVICE"])("does not expose Finance through status filters or counters for %s", async role => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    const risk = await getCustomerSuccessWorkspace({ status: "RISK" })
    expect(risk.total).toBe(0)
    expect(risk.metrics).toEqual({ healthy: 1, watch: 0, risk: 0, renewals90Days: 0 })
    expect((await getCustomerSuccessWorkspace({ status: "HEALTHY" })).total).toBe(1)
  })
  it.each(["TECHNICIAN", "SERVICE"])("excludes invoice activity from %s operational metrics", async role => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    expect((await getCustomerSuccessWorkspace()).portfolio[0].metrics.DAYS_SINCE_ACTIVITY).toBeGreaterThan(1000)
  })
  it.each(["TECHNICIAN", "SERVICE"])("preserves the hidden renewal amount when %s saves other fields", async role => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    await updateClientSuccessProfile({ clientId, nextActionLabel: "Fictional service follow-up" })
    const client = await prisma.client.findUniqueOrThrow({ where: { id: clientId } })
    expect(client.renewalAmountCents).toBe(12345)
    expect(client.nextActionLabel).toBe("Fictional service follow-up")
  })
  it.each(["TECHNICIAN", "SERVICE"])("rejects a direct financial profile write by %s", async role => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    await expect(updateClientSuccessProfile({ clientId, renewalAmountEuros: 0 })).rejects.toThrow("Accès Finance requis")
    expect((await prisma.client.findUniqueOrThrow({ where: { id: clientId } })).renewalAmountCents).toBe(12345)
  })
  it("rejects direct creation of a financial rule by Service", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "SERVICE" } })
    await expect(createCustomerHealthRule({ name: "Fictional financial rule", metric: "OVERDUE_BALANCE_CENTS", operator: "GTE", threshold: 100, impact: -10 })).rejects.toThrow("Accès Finance requis")
  })
  it("rejects direct archiving of a financial rule by Service", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "SERVICE" } })
    await expect(archiveCustomerHealthRule(financialRuleId)).rejects.toThrow("Accès Finance requis")
    expect((await prisma.customerHealthRule.findUniqueOrThrow({ where: { id: financialRuleId } })).status).toBe("ACTIVE")
  })
  it("installs operational defaults without overwriting the existing financial rule", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "SERVICE" } })
    await installDefaultCustomerHealthRules()
    expect((await prisma.customerHealthRule.findUniqueOrThrow({ where: { id: financialRuleId } })).impact).toBe(-60)
    const workspace = await getCustomerSuccessWorkspace()
    expect(workspace.rules).toHaveLength(5)
    expect(workspace.rules.every(rule => rule.metric !== "OVERDUE_BALANCE_CENTS")).toBe(true)
  })
  it.each(["ACTIVE", "ARCHIVED"])("preserves %s financial rules in default-name collisions for Service", async status => {
    const existing = await prisma.customerHealthRule.create({ data: {
      companyId: session.companyId, name: "Au moins un ticket hors délai", metric: "OVERDUE_BALANCE_CENTS",
      operator: "GT", threshold: 777, impact: -77, priority: 42, status,
    } })
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "SERVICE" } })
    await installDefaultCustomerHealthRules()
    expect(await prisma.customerHealthRule.findUniqueOrThrow({ where: { id: existing.id } })).toEqual(existing)
    expect((await getCustomerSuccessWorkspace()).rules).toHaveLength(4)
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { userId: session.userId, action: "INSTALL_CUSTOMER_HEALTH_RULES" } })
    expect(audit.payload).toEqual({ count: 4 })
  })
  it("keeps authorized Owner updates available in default-name collisions", async () => {
    const existing = await prisma.customerHealthRule.create({ data: {
      companyId: session.companyId, name: "Au moins un ticket hors délai", metric: "OVERDUE_BALANCE_CENTS",
      operator: "GT", threshold: 777, impact: -77, priority: 42, status: "ARCHIVED",
    } })
    await installDefaultCustomerHealthRules()
    expect(await prisma.customerHealthRule.findUniqueOrThrow({ where: { id: existing.id } })).toMatchObject({
      metric: "OVERDUE_TICKETS", operator: "GTE", threshold: 1, impact: -20, priority: 90, status: "ACTIVE",
    })
  })
  it("keeps authorized financial writes and rule management available to Owner", async () => {
    await updateClientSuccessProfile({ clientId, renewalAmountEuros: 99.9 })
    expect((await prisma.client.findUniqueOrThrow({ where: { id: clientId } })).renewalAmountCents).toBe(9990)
    const rule = await createCustomerHealthRule({ name: "Authorized fictional rule", metric: "OVERDUE_BALANCE_CENTS", operator: "GT", threshold: 500, impact: -10 })
    await archiveCustomerHealthRule(rule.id)
    expect((await prisma.customerHealthRule.findUniqueOrThrow({ where: { id: rule.id } })).status).toBe("ARCHIVED")
  })
  it("keeps Finance-readable Viewer values within the assigned agency and refuses writes", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "VIEWER" } })
    const workspace = await getCustomerSuccessWorkspace()
    expect(workspace.portfolio[0].renewalAmountCents).toBe(12345)
    expect(workspace.portfolio[0].metrics.OVERDUE_BALANCE_CENTS).toBe(321)
    expect(workspace.access).toEqual({ financeRead: true, financeWrite: false, globalHistory: false })
    expect(workspace.portfolio[0].previousScore).toBeNull()
    expect(workspace.portfolio[0].storedScore).toBeNull()
    await expect(updateClientSuccessProfile({ clientId, renewalAmountEuros: 1 })).rejects.toThrow("droits nécessaires")
  })
  it("does not query invoice aggregates or debts when Finance is unavailable", async () => {
    const aggregates = vi.spyOn(prisma.invoice, "groupBy")
    const debts = vi.spyOn(prisma.invoice, "findMany")
    try {
      const client = await prisma.client.findUniqueOrThrow({ where: { id: clientId } })
      const metrics = await loadCustomerHealthMetrics(prisma, session.companyId, [client], new Date(), { finance: false, agencyIds: [agencyId] })
      expect(metrics.get(clientId)!.metrics.OVERDUE_BALANCE_CENTS).toBeNull()
      expect(aggregates).not.toHaveBeenCalled()
      expect(debts).not.toHaveBeenCalled()
    } finally { aggregates.mockRestore(); debts.mockRestore() }
  })
  it.each(["inactive", "unassigned"])("rereads %s agency access for Finance-readable metrics", async condition => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "VIEWER" } })
    if (condition === "inactive") await prisma.agency.update({ where: { id: agencyId }, data: { active: false } })
    else await prisma.agencyMembership.deleteMany({ where: { agencyId, membershipId } })
    expect((await getCustomerSuccessWorkspace()).portfolio[0].metrics.OVERDUE_BALANCE_CENTS).toBe(0)
  })
  it("refuses suspended membership", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { status: "SUSPENDED" } })
    await expect(getCustomerSuccessWorkspace()).rejects.toThrow("plus accès")
  })
  it("does not return or update a foreign client", async () => {
    expect((await getCustomerSuccessWorkspace({ search: "Foreign success customer" })).portfolio).toEqual([])
    await expect(updateClientSuccessProfile({ clientId: foreignClientId, nextActionLabel: "Fictional attempt" })).rejects.toThrow("Client introuvable")
  })
  it("keeps the public demo readable while refusing profile writes", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "SERVICE" } })
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    expect((await getCustomerSuccessWorkspace()).portfolio[0].renewalAmountCents).toBeNull()
    await expect(updateClientSuccessProfile({ clientId, nextActionLabel: "Fictional attempt" })).rejects.toThrow(/lecture seule|démonstration/i)
  })
})
