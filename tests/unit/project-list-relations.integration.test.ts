import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"

const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
import prisma from "@/lib/prisma"
import { getProjects } from "@/actions/projets"
import { requestContext } from "@/lib/context"

describe.sequential("Legacy project list uses coherent company and agency references", () => {
  let membershipId: string, agencyId: string, companyIds: string[], inconsistent: Record<string, string>, coherentIds: string[]
  beforeAll(async () => {
    session.companyId = (await prisma.company.create({ data: { name: "Fictional legacy project list" } })).id
    const foreignId = (await prisma.company.create({ data: { name: "Fictional unrelated project list" } })).id
    companyIds = [session.companyId, foreignId]
    session.userId = (await prisma.user.create({ data: { email: `project-list-${randomUUID()}@example.test` } })).id
    membershipId = (await prisma.membership.create({ data: { companyId: session.companyId, userId: session.userId, role: "OWNER", status: "ACTIVE" } })).id
    const ownClient = await prisma.client.create({ data: { companyId: session.companyId, name: "Fictional list client" } })
    const foreignClient = await prisma.client.create({ data: { companyId: foreignId, name: "Fictional foreign list client" } })
    const ownAgency = await prisma.agency.create({ data: { companyId: session.companyId, name: "Fictional list agency", code: "OWN" } })
    agencyId = ownAgency.id
    const otherAgency = await prisma.agency.create({ data: { companyId: session.companyId, name: "Fictional other agency", code: "OTHER" } })
    const foreignAgency = await prisma.agency.create({ data: { companyId: foreignId, name: "FOREIGN-PROJECT-AGENCY-SECRET", code: "FOREIGN" } })
    await prisma.agencyMembership.create({ data: { membershipId, agencyId: ownAgency.id } })
    const foreignTemplate = await prisma.projectTemplate.create({ data: { companyId: foreignId, name: "FOREIGN-PROJECT-TEMPLATE-SECRET" } })
    const foreignSite = await prisma.customerSite.create({ data: { companyId: foreignId, clientId: foreignClient.id, agencyId: foreignAgency.id, label: "Fictional foreign site", address1: "1 Fictional Street" } })
    const otherSite = await prisma.customerSite.create({ data: { companyId: session.companyId, clientId: ownClient.id, agencyId: otherAgency.id, label: "Fictional other agency site", address1: "2 Fictional Street" } })
    const base = { companyId: session.companyId, clientId: ownClient.id, agencyId: ownAgency.id, name: "Fictional inconsistent project" }
    inconsistent = {}
    for (const [key, patch] of Object.entries({ template: { projectTemplateId: foreignTemplate.id }, agency: { agencyId: foreignAgency.id }, site: { siteId: foreignSite.id }, inaccessibleSite: { siteId: otherSite.id } })) {
      inconsistent[key] = (await prisma.project.create({ data: { ...base, ...patch } })).id
    }
    const ownTemplate = await prisma.projectTemplate.create({ data: { companyId: session.companyId, name: "Fictional own list template" } })
    const ownSite = await prisma.customerSite.create({ data: { companyId: session.companyId, clientId: ownClient.id, agencyId: ownAgency.id, label: "Fictional own site", address1: "3 Fictional Street" } })
    coherentIds = []
    for (const patch of [{}, { projectTemplateId: ownTemplate.id, siteId: ownSite.id }, { agencyId: null }]) {
      coherentIds.push((await prisma.project.create({ data: { ...base, ...patch, name: `Fictional coherent project ${coherentIds.length}`, createdAt: new Date("2030-02-20T12:00:00Z") } })).id)
    }
    inconsistent.foreignClient = (await prisma.project.create({ data: { ...base, clientId: foreignClient.id } })).id
    inconsistent.foreignCompany = (await prisma.project.create({ data: { ...base, companyId: foreignId, clientId: foreignClient.id, agencyId: foreignAgency.id } })).id
  })
  afterEach(async () => { vi.unstubAllEnvs(); await prisma.membership.update({ where: { id: membershipId }, data: { role: "OWNER", status: "ACTIVE" } }) })
  afterAll(async () => {
    await prisma.project.deleteMany({ where: { companyId: { in: companyIds } } })
    await prisma.customerSite.deleteMany({ where: { companyId: { in: companyIds } } })
    await prisma.projectTemplate.deleteMany({ where: { companyId: { in: companyIds } } })
    await prisma.client.deleteMany({ where: { companyId: { in: companyIds } } })
    await prisma.company.deleteMany({ where: { id: { in: companyIds } } })
    await prisma.user.delete({ where: { id: session.userId } })
  })
  it.each(["OWNER", "ADMIN"])("excludes a foreign template and its name for %s", async role => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    const rows = await getProjects(undefined, 100)
    expect(rows.map(row => row.id)).not.toContain(inconsistent.template)
    expect(JSON.stringify(rows)).not.toContain("FOREIGN-PROJECT-TEMPLATE-SECRET")
  })
  it.each(["OWNER", "ADMIN"])("excludes a foreign agency and its name for %s", async role => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    const rows = await getProjects(undefined, 100)
    expect(rows.map(row => row.id)).not.toContain(inconsistent.agency)
    expect(JSON.stringify(rows)).not.toContain("FOREIGN-PROJECT-AGENCY-SECRET")
  })
  it("excludes a project linked to a foreign site even for Owner", async () => {
    expect((await getProjects(undefined, 100)).map(row => row.id)).not.toContain(inconsistent.site)
  })
  it("excludes a project linked to an inaccessible site for Operations", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "OPERATIONS" } })
    expect((await getProjects(undefined, 100)).map(row => row.id)).not.toContain(inconsistent.inaccessibleSite)
  })
  it("preserves all coherent Owner references including agency-free projects", async () => {
    const rows = await getProjects(undefined, 100)
    expect(rows.map(row => row.id).sort()).toEqual([...coherentIds, inconsistent.inaccessibleSite].sort())
    expect(rows.find(row => row.id === coherentIds[1])).toMatchObject({ projectTemplate: { name: "Fictional own list template" }, agency: { name: "Fictional list agency" }, client: { name: "Fictional list client" } })
  })
  it("preserves only agency-accessible coherent Operations references", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "OPERATIONS" } })
    expect((await getProjects(undefined, 100)).map(row => row.id).sort()).toEqual(coherentIds.slice(0, 2).sort())
  })
  it.each(["foreignClient", "foreignCompany"])("retains exclusion of a %s reference", async key => {
    expect((await getProjects(undefined, 100)).map(row => row.id)).not.toContain(inconsistent[key])
  })
  it("paginates equal timestamps deterministically without losing an accessible project", async () => {
    const rows = await getProjects(undefined, 100), seen: string[] = []
    let cursor: string | undefined
    for (let index = 0; index < rows.length + 1; index++) {
      const next = await getProjects(cursor, 1)
      if (!next.length) break
      seen.push(next[0].id); cursor = next[0].id
    }
    expect(seen).toEqual(rows.map(row => row.id))
    expect(new Set(seen).size).toBe(rows.length)
  })
  it("rechecks agency revocation in the same session", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "OPERATIONS" } })
    await prisma.agencyMembership.deleteMany({ where: { membershipId, agencyId } })
    try { expect(await getProjects()).toEqual([]) }
    finally { await prisma.agencyMembership.create({ data: { membershipId, agencyId } }) }
  })
  it("refuses a suspended membership before entering the action", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { status: "SUSPENDED" } })
    const context = vi.spyOn(requestContext, "run")
    try { await expect(getProjects()).rejects.toThrow("plus accès"); expect(context).not.toHaveBeenCalled() }
    finally { context.mockRestore() }
  })
  it("keeps the scoped list available in the public read-only demo", async () => {
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    expect((await getProjects(undefined, 100)).map(row => row.id).sort()).toEqual([...coherentIds, inconsistent.inaccessibleSite].sort())
  })
  it("does not rewrite historical relations or create an audit while reading", async () => {
    const before = await prisma.project.findMany({ where: { companyId: { in: companyIds } }, orderBy: { id: "asc" } })
    await getProjects(undefined, 100)
    expect(await prisma.project.findMany({ where: { companyId: { in: companyIds } }, orderBy: { id: "asc" } })).toEqual(before)
    expect(await prisma.auditLog.count({ where: { userId: session.userId } })).toBe(0)
  })
})
