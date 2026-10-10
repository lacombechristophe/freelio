import { randomUUID } from "node:crypto"
import { strFromU8, unzipSync } from "fflate"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"

const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

import { getServiceAnalytics } from "@/actions/service-analytics"
import { GET } from "@/app/api/service/analytics/export/route"
import prisma from "@/lib/prisma"

describe.sequential("service analytics permissions on real SQL", () => {
  let membershipId: string, agencyId: string, foreignCompanyId: string
  beforeAll(async () => {
    session.companyId = (await prisma.company.create({ data: { name: "Fictional analytics permission probe" } })).id
    foreignCompanyId = (await prisma.company.create({ data: { name: "Fictional foreign analytics company" } })).id
    session.userId = (await prisma.user.create({ data: { email: `analytics-permissions-${randomUUID()}@example.test` } })).id
    membershipId = (await prisma.membership.create({ data: { companyId: session.companyId, userId: session.userId, role: "OWNER", status: "ACTIVE" } })).id
    agencyId = (await prisma.agency.create({ data: { companyId: session.companyId, code: "LOCAL", name: "Fictional permitted agency" } })).id
    const otherAgencyId = (await prisma.agency.create({ data: { companyId: session.companyId, code: "OTHER", name: "Fictional other agency" } })).id
    await prisma.agencyMembership.create({ data: { agencyId, membershipId } })
    const clientId = (await prisma.client.create({ data: { companyId: session.companyId, name: "Fictional analytics client", relationScore: 37 } })).id
    const foreignClientId = (await prisma.client.create({ data: { companyId: foreignCompanyId, name: "Fictional foreign analytics client", relationScore: 99 } })).id
    const surveyId = (await prisma.satisfactionSurvey.create({ data: { companyId: session.companyId, name: "Fictional CSAT", question: "Fictional question" } })).id
    const foreignSurveyId = (await prisma.satisfactionSurvey.create({ data: { companyId: foreignCompanyId, name: "Fictional foreign CSAT", question: "Fictional question" } })).id
    const ticketIds: string[] = []
    for (const [number, scopeAgencyId] of [["LOCAL", agencyId], ["OTHER", otherAgencyId]] as const) {
      const siteId = (await prisma.customerSite.create({ data: { companyId: session.companyId, clientId, agencyId: scopeAgencyId, label: `Fictional ${number} site`, address1: "Fictional address" } })).id
      ticketIds.push((await prisma.serviceTicket.create({ data: { companyId: session.companyId, clientId, siteId, number, title: `Fictional ${number} ticket`, description: "Fictional ticket" } })).id)
    }
    const foreignTicketId = (await prisma.serviceTicket.create({ data: { companyId: foreignCompanyId, clientId: foreignClientId, number: "FOREIGN", title: "Fictional foreign ticket", description: "Fictional ticket" } })).id
    for (const [ticketId, name] of [[ticketIds[0], "Fictional local guide"], [ticketIds[1], "Fictional other agency guide"], [foreignTicketId, "Fictional foreign ticket guide"]]) {
      await prisma.serviceTicketDiagnostic.create({ data: { companyId: session.companyId, ticketId, guideSnapshot: { name }, completedStepIds: [], warrantyStatus: "UNKNOWN", symptom: "Fictional symptom", outcome: "Fictional outcome" } })
    }
    for (const [serviceTicketId, scopeSurveyId, score] of [[ticketIds[0], surveyId, 5], [ticketIds[1], surveyId, 1], [foreignTicketId, surveyId, 1], [ticketIds[0], foreignSurveyId, 1]] as const) {
      await prisma.satisfactionRequest.create({ data: { companyId: session.companyId, clientId, surveyId: scopeSurveyId, serviceTicketId, tokenHash: randomUUID(), expiresAt: new Date(Date.now() + 86_400_000), respondedAt: new Date(), status: "RESPONDED", score } })
    }
  })
  afterEach(async () => {
    vi.unstubAllEnvs()
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "OWNER", status: "ACTIVE" } })
    await prisma.agency.update({ where: { id: agencyId }, data: { active: true } })
    await prisma.agencyMembership.upsert({ where: { agencyId_membershipId: { agencyId, membershipId } }, update: {}, create: { agencyId, membershipId } })
  })
  afterAll(async () => {
    const where = { companyId: { in: [session.companyId, foreignCompanyId] } }
    await prisma.satisfactionRequest.deleteMany({ where })
    await prisma.serviceTicketDiagnostic.deleteMany({ where })
    await prisma.serviceTicket.deleteMany({ where })
    await prisma.customerSite.deleteMany({ where })
    await prisma.client.deleteMany({ where })
    await prisma.auditLog.deleteMany({ where: { userId: session.userId } })
    await prisma.company.deleteMany({ where: { id: where.companyId } })
    await prisma.user.delete({ where: { id: session.userId } })
  })
  it("preserves Owner ticket and company boundaries", async () => {
    expect((await getServiceAnalytics()).summary).toMatchObject({ created: 2, backlog: 2, averageHealthScore: 37 })
  })
  it("excludes a diagnostic linked to a foreign-company ticket for Owner", async () => {
    expect((await getServiceAnalytics()).topDiagnostics.map(item => item.name).sort()).toEqual(["Fictional local guide", "Fictional other agency guide"].sort())
  })
  it("excludes foreign-company ticket and survey responses for Owner", async () => {
    expect((await getServiceAnalytics()).summary).toMatchObject({ satisfactionResponses: 2, satisfactionPercent: 50 })
  })
  it.each(["TECHNICIAN", "SERVICE", "VIEWER"])("does not expose a global health average to %s", async role => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    expect((await getServiceAnalytics()).summary.averageHealthScore).toBeNull()
  })
  it.each(["TECHNICIAN", "SERVICE", "VIEWER"])("does not expose global health cohorts to %s", async role => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    expect((await getServiceAnalytics()).healthDistribution).toEqual([])
  })
  it.each(["TECHNICIAN", "SERVICE", "VIEWER"])("preserves accessible ticket counts for %s", async role => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    expect((await getServiceAnalytics()).summary).toMatchObject({ created: 1, backlog: 1 })
  })
  it.each(["TECHNICIAN", "SERVICE", "VIEWER"])("scopes diagnostic names to the current agencies for %s", async role => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    expect((await getServiceAnalytics()).topDiagnostics.map(item => item.name)).toEqual(["Fictional local guide"])
  })
  it.each(["TECHNICIAN", "SERVICE", "VIEWER"])("scopes satisfaction to authorized tickets and company surveys for %s", async role => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    expect((await getServiceAnalytics()).summary).toMatchObject({ satisfactionResponses: 1, satisfactionPercent: 100 })
  })
  it.each(["TECHNICIAN", "SERVICE", "VIEWER"].flatMap(role => ["resume.csv", "diagnostics.csv", "sante-portefeuille.csv"].map(file => ({ role, file }))))("restricts exported $file independently for $role", async ({ role, file }) => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    const response = await GET(new Request("http://localhost/api/service/analytics/export"))
    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("private, no-store")
    const archive = unzipSync(new Uint8Array(await response.arrayBuffer()))
    const csv = strFromU8(archive[file])
    if (file === "diagnostics.csv") {
      expect(csv).toContain("Fictional local guide")
      expect(csv).not.toContain("Fictional other agency guide")
      expect(csv).not.toContain("Fictional foreign ticket guide")
    } else {
      expect(csv).toContain("Historique global indisponible")
      if (file === "resume.csv") expect(csv.split(/\r?\n/).find(row => row.includes("Santé moyenne"))).not.toContain("37")
      else expect(csv).not.toMatch(/HEALTHY|WATCH|RISK/)
    }
  })
  it.each(["OWNER", "ADMIN"])("preserves authorized global health and exports for %s", async role => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    const analytics = await getServiceAnalytics()
    expect(analytics.access.globalHistory).toBe(true)
    expect(analytics.summary.averageHealthScore).toBe(37)
    expect(analytics.healthDistribution.find(row => row.status === "RISK")?.count).toBe(1)
    const response = await GET(new Request("http://localhost/api/service/analytics/export"))
    const archive = unzipSync(new Uint8Array(await response.arrayBuffer()))
    expect(strFromU8(archive["resume.csv"])).not.toContain("Historique global indisponible")
    expect(strFromU8(archive["sante-portefeuille.csv"])).toContain("RISK")
    expect(strFromU8(archive["diagnostics.csv"])).not.toContain("Fictional foreign ticket guide")
  })
  it.each(["TECHNICIAN", "SERVICE", "VIEWER"])("does not query inaccessible global client scores for %s", async role => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    const health = vi.spyOn(prisma.client, "findMany")
    try { await getServiceAnalytics(); expect(health).not.toHaveBeenCalled() } finally { health.mockRestore() }
  })
  it("keeps satisfaction independent of the priority filter within the accessible scope", async () => {
    const analytics = await getServiceAnalytics({ priority: "URGENT" })
    expect(analytics.summary.created).toBe(0)
    expect(analytics.topDiagnostics).toEqual([])
    expect(analytics.summary.satisfactionResponses).toBe(2)
  })
  it.each(["OWNER", "VIEWER"])("handles a response without a ticket according to the scope of %s", async role => {
    const survey = await prisma.satisfactionSurvey.findFirstOrThrow({ where: { companyId: session.companyId } })
    const client = await prisma.client.findFirstOrThrow({ where: { companyId: session.companyId } })
    const request = await prisma.satisfactionRequest.create({ data: { companyId: session.companyId, clientId: client.id, surveyId: survey.id, tokenHash: randomUUID(), expiresAt: new Date(Date.now() + 86_400_000), respondedAt: new Date(), score: 5 } })
    try {
      await prisma.membership.update({ where: { id: membershipId }, data: { role } })
      const analytics = await getServiceAnalytics()
      expect(analytics.summary.satisfactionResponses).toBe(role === "OWNER" ? 3 : 1)
      expect(analytics.summary.satisfactionPercent).toBe(role === "OWNER" ? 67 : 100)
    } finally { await prisma.satisfactionRequest.delete({ where: { id: request.id } }) }
  })
  it.each(["inactive", "unassigned"])("rereads %s agency access for diagnostics and satisfaction", async condition => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "SERVICE" } })
    if (condition === "inactive") await prisma.agency.update({ where: { id: agencyId }, data: { active: false } })
    else await prisma.agencyMembership.deleteMany({ where: { agencyId, membershipId } })
    const analytics = await getServiceAnalytics()
    expect(analytics.summary.created).toBe(0)
    expect(analytics.topDiagnostics).toEqual([])
    expect(analytics.summary.satisfactionResponses).toBe(0)
  })
  it("refuses suspended membership in the reader", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { status: "SUSPENDED" } })
    await expect(getServiceAnalytics()).rejects.toThrow("plus accès")
  })
  it("refuses suspended membership in the export", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { status: "SUSPENDED" } })
    expect((await GET(new Request("http://localhost/api/service/analytics/export"))).status).toBe(401)
  })
  it("keeps read-only demo ticket consultation while restricting global health", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "SERVICE" } })
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    const analytics = await getServiceAnalytics()
    expect(analytics.summary.created).toBe(1)
    expect(analytics.summary.averageHealthScore).toBeNull()
  })
})
