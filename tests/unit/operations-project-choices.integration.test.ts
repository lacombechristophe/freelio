import { randomUUID } from "node:crypto"
import { Prisma } from "@/generated/prisma/client"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"

const session = vi.hoisted(() => ({ userId: "", companyId: "", authenticated: true }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => session.authenticated ? { user: { id: session.userId }, companyId: session.companyId } : null }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
import prisma from "@/lib/prisma"
import { getOperationsProjectChoices as choices } from "@/actions/operations"
import { getContext, requestContext } from "@/lib/context"
import { withAuth } from "@/lib/auth-wrapper"

describe.sequential("Operations project choices exceed the initial dashboard cache", () => {
  let clientId: string, firstProjectId: string, lastProjectId: string
  let membershipId: string, agencyId: string, otherAgencyId: string, otherClientId: string, siteId: string, otherSiteId: string
  let foreignCompanyId: string, foreignClientId: string, foreignSiteId: string, foreignTemplateId: string, foreignProjectId: string
  const extraProjects: string[] = []
  async function addProject(data: { name: string; clientId?: string; siteId?: string; agencyId?: string; projectTemplateId?: string }) {
    const project = await prisma.project.create({ data: { companyId: session.companyId, clientId, agencyId, ...data } })
    extraProjects.push(project.id)
    return project
  }
  beforeAll(async () => {
    session.companyId = (await prisma.company.create({ data: { name: "Fictional operations project choices" } })).id
    session.userId = (await prisma.user.create({ data: { email: `operations-project-choice-${randomUUID()}@example.test` } })).id
    const membership = await prisma.membership.create({ data: { companyId: session.companyId, userId: session.userId, role: "OWNER", status: "ACTIVE" } })
    const agency = await prisma.agency.create({ data: { companyId: session.companyId, code: "CHOICE", name: "Fictional project choice agency" } })
    membershipId = membership.id; agencyId = agency.id
    otherAgencyId = (await prisma.agency.create({ data: { companyId: session.companyId, code: "OTHER", name: "Other fictional project choice agency" } })).id
    await prisma.agencyMembership.create({ data: { agencyId: agency.id, membershipId: membership.id } })
    clientId = (await prisma.client.create({ data: { companyId: session.companyId, name: "Fictional project choice client" } })).id
    await prisma.project.createMany({ data: Array.from({ length: 301 }, (_, index) => ({ companyId: session.companyId, clientId, agencyId: agency.id, name: `Project ${String(index).padStart(3, "0")}` })) })
    firstProjectId = (await prisma.project.findFirstOrThrow({ where: { companyId: session.companyId, name: "Project 000" } })).id
    lastProjectId = (await prisma.project.findFirstOrThrow({ where: { companyId: session.companyId, name: "Project 300" } })).id
    otherClientId = (await prisma.client.create({ data: { companyId: session.companyId, name: "Other fictional choice client" } })).id
    siteId = (await prisma.customerSite.create({ data: { companyId: session.companyId, clientId, agencyId, label: "Fictional site", address1: "Fictional address" } })).id
    otherSiteId = (await prisma.customerSite.create({ data: { companyId: session.companyId, clientId, agencyId, label: "Other fictional site", address1: "Other fictional address" } })).id
    foreignCompanyId = (await prisma.company.create({ data: { name: "Foreign fictional project choices" } })).id
    foreignClientId = (await prisma.client.create({ data: { companyId: foreignCompanyId, name: "Foreign fictional client" } })).id
    foreignSiteId = (await prisma.customerSite.create({ data: { companyId: foreignCompanyId, clientId: foreignClientId, label: "Foreign fictional site", address1: "Foreign fictional address" } })).id
    foreignTemplateId = (await prisma.projectTemplate.create({ data: { companyId: foreignCompanyId, name: "Foreign fictional template" } })).id
    foreignProjectId = (await prisma.project.create({ data: { companyId: foreignCompanyId, clientId: foreignClientId, name: "Foreign fictional project" } })).id
  })
  afterEach(async () => {
    vi.restoreAllMocks(); vi.unstubAllEnvs(); session.authenticated = true
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "OWNER", status: "ACTIVE" } })
    if (!await prisma.agencyMembership.findFirst({ where: { membershipId, agencyId } })) await prisma.agencyMembership.create({ data: { membershipId, agencyId } })
    await prisma.project.deleteMany({ where: { id: { in: extraProjects.splice(0) } } })
    await prisma.project.update({ where: { id: lastProjectId }, data: { name: "Project 300", status: "ACTIVE", agencyId, clientId, siteId: null, projectTemplateId: null } })
    await prisma.customerSite.update({ where: { id: siteId }, data: { archivedAt: null } })
  })
  afterAll(async () => {
    for (const companyId of [session.companyId, foreignCompanyId]) {
      await prisma.project.deleteMany({ where: { companyId } })
      await prisma.customerSite.deleteMany({ where: { companyId } })
      await prisma.projectTemplate.deleteMany({ where: { companyId } })
      await prisma.client.deleteMany({ where: { companyId } })
      await prisma.company.delete({ where: { id: companyId } })
    }
    await prisma.user.delete({ where: { id: session.userId } })
  })
  it("makes all 301 eligible projects reachable instead of the first 300", async () => {
    const ids: string[] = []
    for (let page = 1; page <= 13; page++) {
      const result = await choices({ page })
      expect(result).toMatchObject({ total: 301, page })
      expect(result.items).toHaveLength(page === 13 ? 1 : 25)
      ids.push(...result.items.map(item => item.id))
    }
    expect(new Set(ids).size).toBe(301)
    expect(ids).toContain(lastProjectId)
  })
  it("finds a project beyond the initial dashboard cache by name", async () => {
    expect(await choices({ search: "Project 300" })).toMatchObject({ total: 1, items: [{ id: lastProjectId }] })
  })
  it("keeps the selected project outside the visible page and search", async () => {
    const result = await choices({ search: "Project 000", selectedId: lastProjectId })
    expect(result.items).toEqual([{ id: firstProjectId, label: "Project 000" }])
    expect(result.selected).toEqual({ id: lastProjectId, label: "Project 300" })
  })
  it("keeps an initially visible coherent project selectable", async () => {
    expect((await choices()).items[0]).toEqual({ id: firstProjectId, label: "Project 000" })
  })
  it("filters a customer order's projects by its selected client", async () => {
    const other = await addProject({ name: "Other client project", clientId: otherClientId })
    expect(await choices({ clientId: otherClientId })).toMatchObject({ total: 1, items: [{ id: other.id }] })
    expect(await choices({ clientId, selectedId: other.id })).toMatchObject({ total: 301, selected: null })
  })
  it("offers unbound projects and only the selected intervention site's bound projects", async () => {
    const bound = await addProject({ name: "Bound project", siteId })
    const incompatible = await addProject({ name: "Other site project", siteId: otherSiteId })
    const result = await choices({ siteId, search: "project", selectedId: incompatible.id })
    expect(result.total).toBe(302)
    expect(result.items.map(item => item.id)).toContain(bound.id)
    expect(result.selected).toBeNull()
  })
  it("does not silently override contradictory client and site filters", async () => {
    expect(await choices({ clientId: otherClientId, siteId })).toMatchObject({ total: 0, items: [], selected: null })
  })
  it.each(["foreign", "archived"])("refuses a %s site dependency without revealing its projects", async kind => {
    if (kind === "archived") await prisma.customerSite.update({ where: { id: siteId }, data: { archivedAt: new Date() } })
    await expect(choices({ siteId: kind === "foreign" ? foreignSiteId : siteId })).rejects.toThrow("Site introuvable")
  })
  it.each(["COMPLETED", "ARCHIVED"])("does not retain a %s selected project as eligible", async status => {
    await prisma.project.update({ where: { id: lastProjectId }, data: { status } })
    expect(await choices({ selectedId: lastProjectId })).toMatchObject({ total: 300, selected: null })
  })
  it("excludes incoherent references before counting and paging and never exposes another company", async () => {
    const wrongSite = await addProject({ name: "Wrong site client", clientId: otherClientId, siteId })
    const wrongTemplate = await addProject({ name: "Wrong template", projectTemplateId: foreignTemplateId })
    const wrongClient = await addProject({ name: "Wrong client", clientId: foreignClientId })
    for (const selectedId of [foreignProjectId, wrongSite.id, wrongTemplate.id, wrongClient.id]) {
      expect(await choices({ selectedId })).toMatchObject({ total: 301, selected: null })
    }
  })
  it.each(["SALES", "OPERATIONS", "TECHNICIAN", "SERVICE", "ACCOUNTING", "VIEWER"])("keeps the existing Operations read permission for %s", async role => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    expect(await choices({ selectedId: lastProjectId })).toMatchObject({ total: 301, selected: { id: lastProjectId } })
  })
  it("rechecks the role's current agency scope instead of retaining Owner access", async () => {
    expect((await choices({ selectedId: lastProjectId })).selected?.id).toBe(lastProjectId)
    await prisma.project.update({ where: { id: lastProjectId }, data: { agencyId: otherAgencyId } })
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "OPERATIONS" } })
    expect(await choices({ selectedId: lastProjectId })).toMatchObject({ total: 300, selected: null })
  })
  it("rechecks revoked agency membership before returning another page", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "OPERATIONS" } })
    expect((await choices()).total).toBe(301)
    await prisma.agencyMembership.deleteMany({ where: { membershipId, agencyId } })
    expect(await choices({ selectedId: lastProjectId })).toMatchObject({ total: 0, items: [], selected: null })
  })
  it("refuses a suspended membership before entering the reader", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { status: "SUSPENDED" } })
    const context = vi.spyOn(requestContext, "run")
    await expect(choices()).rejects.toThrow("plus accès")
    expect(context).not.toHaveBeenCalled()
  })
  it("requires authentication before entering the reader", async () => {
    session.authenticated = false
    const context = vi.spyOn(requestContext, "run")
    await expect(choices()).rejects.toThrow("Authentification")
    expect(context).not.toHaveBeenCalled()
  })
  it("keeps the choice readable in the public demo without mutation or extra fields", async () => {
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    const result = await choices({ selectedId: lastProjectId })
    expect(result.total).toBe(301)
    expect(Object.keys(result.items[0]).sort()).toEqual(["id", "label"])
    expect(Object.keys(result.selected!).sort()).toEqual(["id", "label"])
    expect(await prisma.auditLog.count({ where: { userId: session.userId } })).toBe(0)
    expect(await prisma.project.count({ where: { companyId: session.companyId } })).toBe(301)
  })
  it("does not leave raw SQL or model mutations authorized after a public-demo choice read", async () => {
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    await withAuth(async () => {
      await choices({ selectedId: lastProjectId })
      expect(getContext()?.operationsProjectReadSql).toBeUndefined()
      await expect(prisma.$transaction(async tx => tx.$queryRaw(Prisma.sql`UPDATE "Project" SET "name" = 'Fictional forbidden mutation' WHERE "id" = ${lastProjectId} RETURNING "id"`))).rejects.toThrow("lecture seule")
      await expect(prisma.$transaction(async tx => tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Project" WHERE "id" = ${lastProjectId}`))).rejects.toThrow("lecture seule")
      await expect(prisma.project.update({ where: { id: lastProjectId }, data: { name: "Fictional forbidden mutation" } })).rejects.toThrow("lecture seule")
    }, "operations.read")
    expect((await prisma.project.findUniqueOrThrow({ where: { id: lastProjectId } })).name).toBe("Project 300")
  })
  it("clamps an obsolete page after a search changes its total", async () => {
    expect(await choices({ page: 999, search: "Project 300" })).toMatchObject({ total: 1, page: 1, items: [{ id: lastProjectId }] })
  })
  it("treats wildcard characters as literal search text", async () => {
    const literal = await addProject({ name: "Literal %_ project" })
    await addProject({ name: "Literal wildcard project" })
    expect(await choices({ search: "%_" })).toMatchObject({ total: 1, items: [{ id: literal.id }] })
  })
  it("binds SQL-looking search text without changing the accessible data", async () => {
    expect(await choices({ search: "x' OR 1=1 --" })).toMatchObject({ total: 0, items: [] })
    expect(await choices()).toMatchObject({ total: 301 })
  })
  it("uses the identifier to stabilize pagination when project names are identical", async () => {
    const tied = await Promise.all(Array.from({ length: 26 }, () => addProject({ name: "Identical project" })))
    const ids = tied.map(project => project.id).sort()
    expect((await choices({ search: "Identical", page: 1 })).items.map(item => item.id)).toEqual(ids.slice(0, 25))
    expect((await choices({ search: "Identical", page: 2 })).items.map(item => item.id)).toEqual(ids.slice(25))
  })
  it.each([{ page: 0 }, { search: "x".repeat(201) }, { selectedId: "invalid" }, { unexpected: true }])("rejects invalid query %j", async input => {
    await expect(choices(input)).rejects.toThrow()
    expect(await prisma.auditLog.count({ where: { userId: session.userId } })).toBe(0)
  })
})
