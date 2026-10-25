import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
import prisma from "@/lib/prisma"
import { getOpportunityDetail } from "@/actions/pipeline"
import { DEFAULT_PIPELINE_STAGES } from "@/lib/pipeline-rules"

describe.sequential("opportunity nested client read scope on real SQL", () => {
  let membershipId: string, clientId: string, foreignCompanyId: string, opportunityId: string, inconsistentId: string, foreignId: string, localProjectId: string, localQuoteId: string, localAgencyId: string, otherAgencyId: string
  beforeAll(async () => {
    session.companyId = (await prisma.company.create({ data: { name: "Fictional opportunity read recipe" } })).id
    session.userId = (await prisma.user.create({ data: { email: `opportunity-read-${randomUUID()}@example.test` } })).id
    membershipId = (await prisma.membership.create({ data: { companyId: session.companyId, userId: session.userId, role: "OWNER", status: "ACTIVE" } })).id
    clientId = (await prisma.client.create({ data: { companyId: session.companyId, name: "Fictional scoped opportunity client", totalRevenueCents: 45678, totalUnpaidCents: 9876, renewalAmountCents: 12345, relationScore: 37 } })).id
    const pipelineId = (await prisma.pipeline.create({ data: { companyId: session.companyId, name: "Fictional local pipeline", stages: DEFAULT_PIPELINE_STAGES } })).id
    opportunityId = (await prisma.opportunity.create({ data: { pipelineId, clientId, title: "Fictional local opportunity", status: "PROSPECT" } })).id
    for (const code of ["LOCAL", "OTHER"]) {
      const agencyId = (await prisma.agency.create({ data: { companyId: session.companyId, code, name: `Fictional ${code} opportunity agency` } })).id
      if (code === "LOCAL") { localAgencyId = agencyId; await prisma.agencyMembership.create({ data: { membershipId, agencyId } }) }
      else otherAgencyId = agencyId
      const projectId = (await prisma.project.create({ data: { companyId: session.companyId, clientId, agencyId, name: `Fictional ${code} opportunity project` } })).id
      const quoteId = (await prisma.quote.create({ data: { companyId: session.companyId, clientId, projectId, number: code, object: "Fictional scoped opportunity quote" } })).id
      if (code === "LOCAL") { localProjectId = projectId; localQuoteId = quoteId }
    }
    foreignCompanyId = (await prisma.company.create({ data: { name: "Fictional foreign opportunity recipe" } })).id
    const foreignClientId = (await prisma.client.create({ data: { companyId: foreignCompanyId, name: "Fictional foreign opportunity client" } })).id
    const foreignPipelineId = (await prisma.pipeline.create({ data: { companyId: foreignCompanyId, name: "Fictional foreign pipeline", stages: DEFAULT_PIPELINE_STAGES } })).id
    foreignId = (await prisma.opportunity.create({ data: { pipelineId: foreignPipelineId, clientId: foreignClientId, title: "Fictional foreign opportunity", status: "PROSPECT" } })).id
    inconsistentId = (await prisma.opportunity.create({ data: { pipelineId, clientId: foreignClientId, title: "Fictional inconsistent opportunity", status: "PROSPECT" } })).id
    await prisma.quote.create({ data: { companyId: foreignCompanyId, clientId, projectId: localProjectId, number: "FOREIGN", object: "Fictional inconsistent foreign quote" } })
    const foreignProjectId = (await prisma.project.create({ data: { companyId: foreignCompanyId, clientId, name: "Fictional inconsistent foreign project" } })).id
    await prisma.quote.create({ data: { companyId: session.companyId, clientId, projectId: foreignProjectId, number: "FOREIGN-PROJECT", object: "Fictional foreign project quote" } })
    await prisma.quote.create({ data: { companyId: session.companyId, clientId, number: "UNASSIGNED", object: "Fictional unassigned quote" } })
  })
  afterEach(async () => { vi.unstubAllEnvs(); if (membershipId) await prisma.membership.update({ where: { id: membershipId }, data: { role: "OWNER", status: "ACTIVE" } }) })
  afterAll(async () => {
    const companies = [session.companyId, foreignCompanyId].filter(Boolean)
    if (companies.length) {
      const where = { companyId: { in: companies } }
      await prisma.quote.deleteMany({ where })
      await prisma.project.deleteMany({ where })
      await prisma.opportunity.deleteMany({ where: { pipeline: where } })
      await prisma.pipeline.deleteMany({ where })
      await prisma.client.deleteMany({ where })
      await prisma.company.deleteMany({ where: { id: { in: companies } } })
    }
    if (session.userId) await prisma.user.delete({ where: { id: session.userId } })
  })
  it.each(["totalRevenueCents", "totalUnpaidCents", "renewalAmountCents", "relationScore"] as const)("omits inaccessible %s from the Sales detail", async field => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "SALES" } })
    expect((await getOpportunityDetail(opportunityId))?.client[field]).toBeNull()
  })
  it.each(["totalRevenueCents", "totalUnpaidCents", "relationScore"] as const)("omits global %s from the agency-limited Viewer detail", async field => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "VIEWER" } })
    expect((await getOpportunityDetail(opportunityId))?.client[field]).toBeNull()
  })
  it("limits nested projects to assigned agencies", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "SALES" } })
    expect((await getOpportunityDetail(opportunityId))?.client.projects.map(project => project.id)).toEqual([localProjectId])
  })
  it("limits nested quotes to company and assigned agencies", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "SALES" } })
    expect((await getOpportunityDetail(opportunityId))?.client.quotes.map(quote => quote.id)).toEqual([localQuoteId])
  })
  it("does not include a foreign quote even for Owner", async () => {
    expect((await getOpportunityDetail(opportunityId))?.client.quotes.every(quote => quote.companyId === session.companyId)).toBe(true)
  })
  it("refuses an opportunity whose client belongs to another company", async () => { expect(await getOpportunityDetail(inconsistentId)).toBeNull() })
  it("preserves the Owner company-wide client values and projects", async () => {
    const result = await getOpportunityDetail(opportunityId)
    expect(result?.client).toMatchObject({ totalRevenueCents: 45678, totalUnpaidCents: 9876, renewalAmountCents: 12345, relationScore: 37 })
    expect(result?.client.projects).toHaveLength(2)
  })
  it("refuses a foreign pipeline", async () => { expect(await getOpportunityDetail(foreignId)).toBeNull() })
  it("refuses consultation after membership suspension", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { status: "SUSPENDED" } })
    await expect(getOpportunityDetail(opportunityId)).rejects.toThrow("plus accès")
  })
  it("preserves Admin values and only coherent company references", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "ADMIN" } })
    const result = await getOpportunityDetail(opportunityId)
    expect(result?.client).toMatchObject({ totalRevenueCents: 45678, totalUnpaidCents: 9876, renewalAmountCents: 12345, relationScore: 37 })
    expect(result?.client.projects).toHaveLength(2)
    expect(result?.client.quotes.map(quote => quote.number).sort()).toEqual(["LOCAL", "OTHER", "UNASSIGNED"])
  })
  it("keeps the financial renewal field for Accounting without global caches", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "ACCOUNTING" } })
    expect((await getOpportunityDetail(opportunityId))?.client).toMatchObject({ totalRevenueCents: null, totalUnpaidCents: null, renewalAmountCents: 12345, relationScore: null })
  })
  it.each(["TECHNICIAN", "SERVICE"])("refuses the detail without Sales read permission to %s", async role => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    await expect(getOpportunityDetail(opportunityId)).rejects.toThrow("droits nécessaires")
  })
  it("rereads the scope after a role downgrade", async () => {
    expect((await getOpportunityDetail(opportunityId))?.client.totalRevenueCents).toBe(45678)
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "SALES" } })
    const result = await getOpportunityDetail(opportunityId)
    expect(result?.client.totalRevenueCents).toBeNull()
    expect(result?.client.projects.map(project => project.id)).toEqual([localProjectId])
  })
  it("returns no operational references after agency revocation", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "SALES" } })
    await prisma.agencyMembership.delete({ where: { agencyId_membershipId: { agencyId: localAgencyId, membershipId } } })
    try {
      const result = await getOpportunityDetail(opportunityId)
      expect(result?.client.projects).toEqual([])
      expect(result?.client.quotes).toEqual([])
    } finally { await prisma.agencyMembership.create({ data: { agencyId: localAgencyId, membershipId } }) }
  })
  it("permits a scoped read in the public readonly demo", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "VIEWER" } })
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    expect((await getOpportunityDetail(opportunityId))?.client.quotes.map(quote => quote.id)).toEqual([localQuoteId])
  })
  it("rejects an invalid opportunity id without loading a detail", async () => { expect(await getOpportunityDetail("invalid")).toBeNull() })
  it("filters references before applying the recent-list limit", async () => {
    const projects: string[] = [], quotes: string[] = []
    try {
      for (let index = 0; index < 11; index++) {
        const project = await prisma.project.create({ data: { companyId: session.companyId, clientId, agencyId: otherAgencyId, name: `Fictional inaccessible recent project ${index}`, updatedAt: new Date("2099-01-01") } })
        projects.push(project.id)
        const quote = await prisma.quote.create({ data: { companyId: session.companyId, clientId, projectId: project.id, number: `RECENT-${index}`, object: "Fictional inaccessible recent quote", updatedAt: new Date("2099-01-01") } })
        quotes.push(quote.id)
      }
      await prisma.membership.update({ where: { id: membershipId }, data: { role: "SALES" } })
      const result = await getOpportunityDetail(opportunityId)
      expect(result?.client.projects.map(project => project.id)).toEqual([localProjectId])
      expect(result?.client.quotes.map(quote => quote.id)).toEqual([localQuoteId])
    } finally {
      await prisma.quote.deleteMany({ where: { id: { in: quotes } } })
      await prisma.project.deleteMany({ where: { id: { in: projects } } })
    }
  })
})
