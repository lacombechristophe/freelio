import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"

const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
import prisma from "@/lib/prisma"
import { getClients, getClientById } from "@/actions/clients"
import { getClientDirectory } from "@/actions/directories"
import { getWorkspaceOverview } from "@/actions/workspaces"
import { getAutomationDashboard, simulateAutomationWorkflow } from "@/actions/automations"
import { directoryQuerySchema } from "@/lib/directory-query"

describe.sequential("shared global health permissions on real SQL", () => {
  let membershipId: string, clientId: string, healthWorkflowId: string, leadWorkflowId: string, leadId: string, foreignCompanyId: string, foreignClientId: string, foreignWorkflowId: string
  beforeAll(async () => {
    session.companyId = (await prisma.company.create({ data: { name: "Fictional shared health probe" } })).id
    session.userId = (await prisma.user.create({ data: { email: `shared-health-${randomUUID()}@example.test` } })).id
    membershipId = (await prisma.membership.create({ data: { companyId: session.companyId, userId: session.userId, role: "OWNER", status: "ACTIVE" } })).id
    clientId = (await prisma.client.create({ data: { companyId: session.companyId, name: "Fictional shared health client", relationScore: 37 } })).id
    await prisma.customerHealthSnapshot.createMany({ data: [
      { companyId: session.companyId, clientId, score: 91, status: "HEALTHY", factors: [], computedAt: new Date("2030-01-01") },
      { companyId: session.companyId, clientId, score: 37, status: "RISK", factors: [], computedAt: new Date("2035-01-01") },
    ] })
    const actions = [{ type: "CREATE_TASK", title: "Fictional follow-up", delayHours: 0, priority: 2 }]
    healthWorkflowId = (await prisma.automationWorkflow.create({ data: { companyId: session.companyId, name: "Fictional health simulation", trigger: "CUSTOMER_HEALTH_CHANGED", conditions: { healthScoreBelow: 50, healthScoreDropAtLeast: 10 }, actions } })).id
    leadWorkflowId = (await prisma.automationWorkflow.create({ data: { companyId: session.companyId, name: "Fictional lead simulation", trigger: "LEAD_CREATED", actions } })).id
    leadId = (await prisma.leadCapture.create({ data: { companyId: session.companyId, firstName: "Fictional", lastName: "Lead", privacyAccepted: true, fingerprint: randomUUID() } })).id
    foreignCompanyId = (await prisma.company.create({ data: { name: "Fictional foreign shared health probe" } })).id
    foreignClientId = (await prisma.client.create({ data: { companyId: foreignCompanyId, name: "Fictional foreign health client", relationScore: 99 } })).id
    foreignWorkflowId = (await prisma.automationWorkflow.create({ data: { companyId: foreignCompanyId, name: "Fictional foreign health simulation", trigger: "CUSTOMER_HEALTH_CHANGED", actions } })).id
    await prisma.customerHealthSnapshot.create({ data: { companyId: foreignCompanyId, clientId, score: 9, status: "RISK", factors: [], computedAt: new Date("2040-01-01") } })
  })
  afterEach(async () => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "OWNER", status: "ACTIVE" } })
  })
  afterAll(async () => {
    await prisma.client.deleteMany({ where: { companyId: { in: [session.companyId, foreignCompanyId] } } })
    await prisma.company.deleteMany({ where: { id: { in: [session.companyId, foreignCompanyId] } } })
    await prisma.user.delete({ where: { id: session.userId } })
  })
  it.each(["SALES", "OPERATIONS", "TECHNICIAN", "SERVICE", "ACCOUNTING", "VIEWER"].flatMap(role => ["list", "detail", "directory", "CRM", "SERVICE"].map(reader => ({ role, reader }))))("does not expose global health through $reader to $role", async ({ role, reader }) => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    if (reader === "list") expect((await getClients()).clients[0].relationScore).toBeNull()
    else if (reader === "detail") expect((await getClientById(clientId))?.relationScore).toBeNull()
    else if (reader === "directory") expect((await getClientDirectory(directoryQuerySchema.parse({}))).rows[0].relationScore).toBeNull()
    else if (reader === "SERVICE" && ["SALES", "ACCOUNTING"].includes(role)) await expect(getWorkspaceOverview("SERVICE")).rejects.toThrow("droits nécessaires")
    else expect((await getWorkspaceOverview(reader as "CRM" | "SERVICE")).clientHealth).toBeNull()
  })
  it.each(["SALES", "SERVICE", "OPERATIONS"])("does not expose global health in automation subject choices to %s", async role => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    expect((await getAutomationDashboard()).clients[0].score).toBeNull()
  })
  it("preserves Owner list and detail scores", async () => {
    expect((await getClients()).clients[0].relationScore).toBe(37)
    expect((await getClientById(clientId))?.relationScore).toBe(37)
  })
  it("preserves Owner directory and workspace health", async () => {
    expect((await getClientDirectory(directoryQuerySchema.parse({}))).rows[0].relationScore).toBe(37)
    expect((await getWorkspaceOverview("CRM")).clientHealth).toEqual({ healthy: 0, watch: 0, risk: 1 })
  })
  it("preserves Owner automation subject score", async () => {
    expect((await getAutomationDashboard()).clients[0].score).toBe(37)
  })
  it.each(["SALES", "OPERATIONS", "TECHNICIAN", "SERVICE", "ACCOUNTING", "VIEWER"])("does not filter the directory using an inaccessible score for %s", async role => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    const filter = { id: "fictional-score-filter", field: "relation", operator: "equals", value: "37" }
    expect((await getClientDirectory(directoryQuerySchema.parse({ filters: [filter] }))).total).toBe(0)
    expect((await getClientDirectory(directoryQuerySchema.parse({ filters: [{ ...filter, operator: "is_empty", value: "" }] }))).total).toBe(1)
  })
  it.each(["SALES", "OPERATIONS", "TECHNICIAN", "SERVICE", "ACCOUNTING", "VIEWER"])("does not order the directory by hidden score for %s", async role => {
    const secondId = (await prisma.client.create({ data: { companyId: session.companyId, name: "Fictional second client", relationScore: 91 } })).id
    try {
      await prisma.membership.update({ where: { id: membershipId }, data: { role } })
      const result = await getClientDirectory(directoryQuerySchema.parse({ sort: { field: "relation", direction: "desc" } }))
      expect(result.rows.map(client => client.relationScore)).toEqual([null, null])
      expect(result.rows.map(client => client.id)).toEqual([clientId, secondId].sort((left, right) => left.localeCompare(right)))
    } finally { await prisma.client.delete({ where: { id: secondId } }) }
  })
  it.each(["SALES", "SERVICE", "OPERATIONS"])("does not disclose previous score or derived status to %s", async role => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    const result = await getAutomationDashboard()
    expect(result.access.globalHealth).toBe(false)
    expect(result.clients[0]).toMatchObject({ score: null, previousScore: null, status: null })
  })
  it.each(["OWNER", "ADMIN"])("preserves authorized health simulation without effects for %s", async role => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    expect((await simulateAutomationWorkflow(healthWorkflowId, clientId)).matches).toBe(true)
    expect((await getAutomationDashboard()).clients[0]).toMatchObject({ score: 37, previousScore: 91, status: "RISK" })
    expect((await getWorkspaceOverview("CRM")).recentClients[0].relationScore).toBe(37)
    expect(await prisma.organisationTask.count({ where: { companyId: session.companyId } })).toBe(0)
    expect(await prisma.automationRun.count({ where: { companyId: session.companyId } })).toBe(0)
  })
  it.each(["SALES", "SERVICE", "OPERATIONS"])("refuses direct health simulation for %s", async role => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    await expect(simulateAutomationWorkflow(healthWorkflowId, clientId)).rejects.toThrow("Historique global indisponible")
    expect(await prisma.organisationTask.count({ where: { companyId: session.companyId } })).toBe(0)
  })
  it.each(["TECHNICIAN", "VIEWER"])("preserves automation-read denial for %s", async role => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    await expect(getAutomationDashboard()).rejects.toThrow("droits nécessaires")
    await expect(simulateAutomationWorkflow(healthWorkflowId, clientId)).rejects.toThrow("droits nécessaires")
  })
  it("preserves Sales lead simulation without effects", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "SALES" } })
    expect((await simulateAutomationWorkflow(leadWorkflowId, leadId)).matches).toBe(true)
    expect(await prisma.organisationTask.count({ where: { companyId: session.companyId } })).toBe(0)
  })
  it("does not select global scores or cohorts in the restricted CRM overview", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "SERVICE" } })
    const find = vi.spyOn(prisma.client, "findMany")
    const result = await getWorkspaceOverview("CRM")
    expect(result.recentClients[0].relationScore).toBeNull()
    expect(find).toHaveBeenCalledTimes(1)
    expect(find.mock.calls[0][0]?.select?.relationScore).toBe(false)
  })
  it("rereads a downgraded role with the same session", async () => {
    expect((await getWorkspaceOverview("CRM")).clientHealth?.risk).toBe(1)
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "SERVICE" } })
    expect((await getWorkspaceOverview("CRM")).clientHealth).toBeNull()
    await expect(simulateAutomationWorkflow(healthWorkflowId, clientId)).rejects.toThrow("Historique global indisponible")
  })
  it("preserves restricted public-demo reads without global health", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "SERVICE" } })
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    expect((await getClients()).clients[0].relationScore).toBeNull()
    expect((await getAutomationDashboard()).clients[0].previousScore).toBeNull()
  })
  it("refuses foreign clients and workflows even with global health access", async () => {
    expect((await getClients()).clients.map(client => client.id)).toEqual([clientId])
    expect(await getClientById(foreignClientId)).toBeNull()
    await expect(simulateAutomationWorkflow(foreignWorkflowId, clientId)).rejects.toThrow("Scénario introuvable")
    await expect(simulateAutomationWorkflow(healthWorkflowId, foreignClientId)).rejects.toThrow("Client introuvable")
  })
  it("excludes a foreign-company historical snapshot linked to a local client", async () => {
    expect((await getAutomationDashboard()).clients[0].previousScore).toBe(91)
    expect((await simulateAutomationWorkflow(healthWorkflowId, clientId)).matches).toBe(true)
  })
  it("refuses consultation after membership suspension", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { status: "SUSPENDED" } })
    await expect(getWorkspaceOverview("CRM")).rejects.toThrow("plus accès")
  })
})
