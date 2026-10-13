import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"

const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
import prisma from "@/lib/prisma"
import { addOpportunityActivity, deleteOpportunity, getOpportunityDetail, getPipeline, updateOpportunity } from "@/actions/pipeline"
import { getWorkspaceOverview } from "@/actions/workspaces"
import { getRecordCrmProperties, updateRecordCrmProperties } from "@/actions/crm-properties"
import { resolveAuthContext } from "@/lib/auth-wrapper"
import { loadExecutiveReport } from "@/lib/reporting-data"
import { COMPANY_ROLES, hasPermission } from "@/lib/permissions"
import { DEFAULT_PIPELINE_STAGES } from "@/lib/pipeline-rules"

describe.sequential("pipeline relation boundaries on real SQL", () => {
  let foreignCompanyId: string, foreignUserId: string, membershipId: string, pipelineId: string
  let clientId: string, foreignClientId: string, foreignOwnerId: string, inactiveOwnerId: string
  let validId: string, inactiveId: string, foreignClientDealId: string, foreignOwnerDealId: string, foreignPipelineDealId: string
  const audits = () => prisma.auditLog.count({ where: { userId: session.userId } })
  const deal = (extra = {}) => prisma.opportunity.create({ data: { pipelineId, clientId, title: "Fictional coherent deal", status: "PROSPECT", valueCents: 12345, probability: 30, ...extra } })
  beforeAll(async () => {
    session.companyId = (await prisma.company.create({ data: { name: "Fictional pipeline relations recipe" } })).id
    foreignCompanyId = (await prisma.company.create({ data: { name: "Fictional other pipeline relations tenant" } })).id
    session.userId = (await prisma.user.create({ data: { email: `pipeline-relations-${randomUUID()}@example.test` } })).id
    foreignUserId = (await prisma.user.create({ data: { name: "FOREIGN-OWNER-MARKER", email: `foreign-pipeline-${randomUUID()}@example.test` } })).id
    membershipId = (await prisma.membership.create({ data: { companyId: session.companyId, userId: session.userId, role: "OWNER", status: "ACTIVE" } })).id
    foreignOwnerId = (await prisma.membership.create({ data: { companyId: foreignCompanyId, userId: foreignUserId, role: "SALES", status: "ACTIVE" } })).id
    inactiveOwnerId = (await prisma.membership.create({ data: { companyId: session.companyId, userId: foreignUserId, role: "SALES", status: "INACTIVE" } })).id
    clientId = (await prisma.client.create({ data: { companyId: session.companyId, name: "Fictional own pipeline client" } })).id
    foreignClientId = (await prisma.client.create({ data: { companyId: foreignCompanyId, name: "FOREIGN-CLIENT-MARKER" } })).id
    pipelineId = (await prisma.pipeline.create({ data: { companyId: session.companyId, name: "Fictional relation pipeline", isDefault: true, stages: DEFAULT_PIPELINE_STAGES } })).id
    const foreignPipelineId = (await prisma.pipeline.create({ data: { companyId: foreignCompanyId, name: "Foreign pipeline", stages: DEFAULT_PIPELINE_STAGES } })).id
    validId = (await deal()).id
    inactiveId = (await deal({ ownerMembershipId: inactiveOwnerId, title: "Fictional local historical owner" })).id
    foreignClientDealId = (await deal({ clientId: foreignClientId, title: "FOREIGN-CLIENT-DEAL", valueCents: 999999 })).id
    foreignOwnerDealId = (await deal({ ownerMembershipId: foreignOwnerId, title: "FOREIGN-OWNER-DEAL", valueCents: 888888 })).id
    foreignPipelineDealId = (await deal({ pipelineId: foreignPipelineId, title: "FOREIGN-PIPELINE-DEAL" })).id
  })
  afterEach(async () => {
    vi.restoreAllMocks(); vi.unstubAllEnvs()
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "OWNER", status: "ACTIVE" } })
    await prisma.opportunity.update({ where: { id: validId }, data: { clientId, ownerMembershipId: null } })
    await prisma.auditLog.deleteMany({ where: { userId: session.userId } })
  })
  afterAll(async () => {
    const companies = { companyId: { in: [session.companyId, foreignCompanyId] } }
    await prisma.crmPropertyHistory.deleteMany({ where: companies })
    await prisma.crmPropertyValue.deleteMany({ where: companies })
    await prisma.crmPropertyDefinition.deleteMany({ where: companies })
    await prisma.opportunityActivity.deleteMany({ where: { opportunity: { pipeline: companies } } })
    await prisma.clientActivity.deleteMany({ where: { client: companies } })
    await prisma.opportunity.deleteMany({ where: { pipeline: companies } })
    await prisma.pipeline.deleteMany({ where: companies })
    await prisma.client.deleteMany({ where: companies })
    await prisma.company.deleteMany({ where: { id: { in: [session.companyId, foreignCompanyId] } } })
    await prisma.user.deleteMany({ where: { id: { in: [session.userId, foreignUserId] } } })
  })
  it.each(COMPANY_ROLES)("applies coherent reads and the existing Sales permission for %s", async role => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    if (!hasPermission(role, "sales.read")) {
      const read = vi.spyOn(prisma.pipeline, "findMany")
      await expect(getPipeline(pipelineId)).rejects.toThrow("droits nécessaires")
      await expect(getOpportunityDetail(validId)).rejects.toThrow("droits nécessaires")
      expect(read).not.toHaveBeenCalled()
      return
    }
    const board = await getPipeline(pipelineId)
    expect(board.opportunities.map(row => row.id).sort()).toEqual([validId, inactiveId].sort())
    expect(board.pipelines.find(row => row.id === pipelineId)?.opportunityCount).toBe(2)
    expect((await getOpportunityDetail(validId))?.id).toBe(validId)
    expect((await getOpportunityDetail(inactiveId))?.ownerMembershipId).toBe(inactiveOwnerId)
    for (const id of [foreignClientDealId, foreignOwnerDealId, foreignPipelineDealId]) expect(await getOpportunityDetail(id)).toBeNull()
    expect(JSON.stringify(board)).not.toContain("FOREIGN-CLIENT-MARKER")
    expect(board.opportunities.some(row => row.ownerMembershipId === foreignOwnerId)).toBe(false)
  })
  it("uses the same open counts and amounts in CRM, Sales and the executive report", async () => {
    for (const scope of ["CRM", "SALES"] as const) {
      const overview = await getWorkspaceOverview(scope)
      expect(overview).toMatchObject({ openDeals: 2, openDealValueCents: 24690 })
      expect(JSON.stringify(overview)).not.toContain("FOREIGN-CLIENT-MARKER")
      expect(JSON.stringify(overview)).not.toContain("FOREIGN-OWNER-DEAL")
    }
    const context = await resolveAuthContext()
    if (!context) throw new Error("Missing fixture context")
    const report = await loadExecutiveReport(context, 30)
    expect(report.sales).toMatchObject({ openOpportunities: 2, openPipelineCents: 24690 })
  })
  it.each(["client", "owner", "pipeline"])("refuses every ordinary action on the foreign %s relation without writes or audit", async kind => {
    const id = kind === "client" ? foreignClientDealId : kind === "owner" ? foreignOwnerDealId : foreignPipelineDealId
    const before = await prisma.opportunity.findUniqueOrThrow({ where: { id } })
    await expect(updateOpportunity(id, { title: "Fictional refused edit", clientId, ownerMembershipId: null })).resolves.toMatchObject({ success: false, error: "Opportunité introuvable" })
    await expect(deleteOpportunity(id)).resolves.toMatchObject({ success: false, error: "Opportunité introuvable" })
    await expect(addOpportunityActivity(id, { type: "NOTE", content: "Fictional refused note" })).resolves.toMatchObject({ success: false, error: "Opportunité introuvable" })
    await expect(updateRecordCrmProperties({ objectType: "OPPORTUNITY", recordId: id, values: {} })).resolves.toMatchObject({ success: false, error: "Opportunité introuvable" })
    expect(await getRecordCrmProperties("OPPORTUNITY", id)).toBeNull()
    expect(await prisma.opportunity.findUniqueOrThrow({ where: { id } })).toEqual(before)
    expect(await prisma.opportunityActivity.count({ where: { opportunityId: id } })).toBe(0)
    expect(await audits()).toBe(0)
  })
  it.each(["update", "delete", "activity", "properties"])("rechecks a relation changed before the %s write", async operation => {
    const read = prisma.opportunity.findFirst.bind(prisma.opportunity)
    vi.spyOn(prisma.opportunity, "findFirst").mockImplementationOnce((async (args: Parameters<typeof read>[0]) => {
      const result = await read(args)
      await prisma.opportunity.update({ where: { id: validId }, data: { ownerMembershipId: foreignOwnerId } })
      return result
    }) as typeof prisma.opportunity.findFirst)
    const action = operation === "update" ? updateOpportunity(validId, { title: "Refused race" })
      : operation === "delete" ? deleteOpportunity(validId)
      : operation === "activity" ? addOpportunityActivity(validId, { type: "NOTE", content: "Refused race" })
      : updateRecordCrmProperties({ objectType: "OPPORTUNITY", recordId: validId, values: {} })
    await expect(action).resolves.toMatchObject({ success: false, error: "Opportunité introuvable" })
    expect(await prisma.opportunity.findUniqueOrThrow({ where: { id: validId } })).toMatchObject({ title: "Fictional coherent deal", ownerMembershipId: foreignOwnerId })
    expect(await prisma.opportunityActivity.count({ where: { opportunityId: validId } })).toBe(0)
    expect(await audits()).toBe(0)
  })
  it.each(["OWNER", "ADMIN", "SALES"])("preserves coherent edit, activity and deletion for %s", async role => {
    const row = await deal()
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    await updateOpportunity(row.id, { title: "Fictional accepted edit" })
    await addOpportunityActivity(row.id, { type: "NOTE", content: "Fictional accepted activity" })
    expect(await prisma.opportunityActivity.count({ where: { opportunityId: row.id } })).toBe(1)
    expect(await prisma.clientActivity.count({ where: { clientId, content: "Fictional accepted activity" } })).toBeGreaterThan(0)
    // The existing FK policy still protects deals with activities from deletion.
    await prisma.opportunityActivity.deleteMany({ where: { opportunityId: row.id } })
    await deleteOpportunity(row.id)
    expect(await prisma.opportunity.count({ where: { id: row.id } })).toBe(0)
    expect(await audits()).toBe(3)
  })
  it.each(["OPERATIONS", "TECHNICIAN", "SERVICE", "ACCOUNTING", "VIEWER"])("denies mutations before business reads for %s", async role => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    const read = vi.spyOn(prisma.opportunity, "findFirst")
    await expect(updateOpportunity(validId, { title: "Refused edit" })).rejects.toThrow("droits nécessaires")
    await expect(deleteOpportunity(validId)).rejects.toThrow("droits nécessaires")
    await expect(addOpportunityActivity(validId, { type: "NOTE", content: "Refused activity" })).rejects.toThrow("droits nécessaires")
    expect(read).not.toHaveBeenCalled(); expect(await audits()).toBe(0)
  })
  it("rereads membership and preserves the public demo mutation block", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { status: "INACTIVE" } })
    await expect(getPipeline(pipelineId)).rejects.toThrow("plus accès")
    await prisma.membership.update({ where: { id: membershipId }, data: { status: "ACTIVE" } })
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    expect((await getPipeline(pipelineId)).opportunities).toHaveLength(2)
    await expect(updateOpportunity(validId, { title: "Refused demo edit" })).rejects.toThrow(/démonstration/i)
    await expect(deleteOpportunity(validId)).rejects.toThrow(/démonstration/i)
    await expect(addOpportunityActivity(validId, { type: "NOTE", content: "Refused demo note" })).rejects.toThrow(/démonstration/i)
    expect(await audits()).toBe(0)
  })
})
