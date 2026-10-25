import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"

const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

import prisma from "@/lib/prisma"
import { getPipeline } from "@/actions/pipeline"
import { getTeamOverview } from "@/actions/team"
import { getAgencyManagement } from "@/actions/agencies"
import { getBillingOverview } from "@/actions/billing"
import { getMigrationDashboard } from "@/actions/migrations"
import { getCampaignDashboard } from "@/actions/campaigns"
import { getRecurringInvoices } from "@/actions/factures"
import { DEFAULT_PIPELINE_STAGES } from "@/lib/pipeline-rules"
import { Prisma } from "@/generated/prisma/client"
import { requestContext } from "@/lib/context"

describe.sequential("public demo module reads", () => {
  let membershipId: string
  beforeAll(async () => {
    session.companyId = (await prisma.company.create({ data: { name: "Fictional readonly module recipe" } })).id
    session.userId = (await prisma.user.create({ data: { email: `demo-pages-${randomUUID()}@example.test` } })).id
    membershipId = (await prisma.membership.create({ data: { companyId: session.companyId, userId: session.userId, role: "OWNER", status: "ACTIVE" } })).id
  })
  afterEach(async () => {
    vi.unstubAllEnvs()
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "OWNER" } })
    await prisma.pipeline.deleteMany({ where: { companyId: session.companyId } })
    await prisma.saasSubscription.deleteMany({ where: { companyId: session.companyId } })
  })
  afterAll(async () => {
    await prisma.company.delete({ where: { id: session.companyId } })
    await prisma.user.delete({ where: { id: session.userId } })
  })

  const reads = [
    ["Pipeline", () => getPipeline()], ["Équipe", () => getTeamOverview()],
    ["Agences", () => getAgencyManagement()], ["Abonnement", () => getBillingOverview()],
    ["Migrations", () => getMigrationDashboard()], ["Campagnes", () => getCampaignDashboard()],
    ["Récurrences", () => getRecurringInvoices()],
  ] as const

  it.each(reads)("renders %s without initializing or mutating business rows", async (_name, read) => {
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    await expect(read()).resolves.toBeTruthy()
    expect(await prisma.pipeline.count({ where: { companyId: session.companyId } })).toBe(0)
    expect(await prisma.saasSubscription.count({ where: { companyId: session.companyId } })).toBe(0)
  })

  it("reads an existing non-default pipeline without changing its flag", async () => {
    const pipeline = await prisma.pipeline.create({ data: { companyId: session.companyId, name: "Fictional existing pipeline", stages: DEFAULT_PIPELINE_STAGES, isDefault: false } })
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    expect((await getPipeline()).id).toBe(pipeline.id)
    expect((await prisma.pipeline.findUniqueOrThrow({ where: { id: pipeline.id } })).isDefault).toBe(false)
  })

  it.each([
    ["Équipe", () => getTeamOverview()], ["Agences", () => getAgencyManagement()],
    ["Migrations", () => getMigrationDashboard()],
  ] as const)("keeps the management permission for %s reads", async (_name, read) => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "VIEWER" } })
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    await expect(read()).rejects.toThrow("droits nécessaires")
  })

  it("keeps raw SQL denied outside its exact statement and read domain", async () => {
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    const statement = Prisma.sql`SELECT "id" FROM "Company" WHERE "id" = ${session.companyId}`
    const context = { ...session, membershipId, role: "OWNER" as const, agencyIds: null, actionPermission: "automation.read" as const }
    await requestContext.run(context, async () => {
      await expect(prisma.$transaction(tx => tx.$queryRaw(statement))).rejects.toThrow("lecture seule")
    })
    await requestContext.run({ ...context, recurringInvoiceReadSql: statement.sql }, async () => {
      await expect(prisma.$transaction(tx => tx.$queryRaw(statement))).rejects.toThrow("lecture seule")
    })
    await requestContext.run({ ...context, campaignAttributionReadSql: statement.sql }, async () => {
      await expect(prisma.$transaction(tx => tx.$queryRaw`SELECT "name" FROM "Company"`)).rejects.toThrow("lecture seule")
      await expect(prisma.$transaction(tx => tx.$executeRaw(statement))).rejects.toThrow("lecture seule")
    })
  })
})
