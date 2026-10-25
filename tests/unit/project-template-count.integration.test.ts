import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
import prisma from "@/lib/prisma"
import { getProjectTemplates } from "@/actions/projets"

describe.sequential("Project template counts use coherent company and agency references", () => {
  let foreignCompanyId: string, templateId: string, membershipId: string, agencyId: string
  beforeAll(async () => {
    session.companyId = (await prisma.company.create({ data: { name: "Fictional template count" } })).id
    foreignCompanyId = (await prisma.company.create({ data: { name: "Fictional foreign template count" } })).id
    session.userId = (await prisma.user.create({ data: { email: `template-count-${randomUUID()}@example.test` } })).id
    membershipId = (await prisma.membership.create({ data: { companyId: session.companyId, userId: session.userId, role: "OPERATIONS", status: "ACTIVE" } })).id
    const agency = (companyId: string, code: string) => prisma.agency.create({ data: { companyId, code, name: `Fictional ${code}` } })
    agencyId = (await agency(session.companyId, "OWN")).id
    const otherAgencyId = (await agency(session.companyId, "OTHER")).id, foreignAgencyId = (await agency(foreignCompanyId, "FOREIGN")).id
    await prisma.agencyMembership.create({ data: { membershipId, agencyId } })
    const ownClientId = (await prisma.client.create({ data: { companyId: session.companyId, name: "Fictional own client" } })).id
    const foreignClientId = (await prisma.client.create({ data: { companyId: foreignCompanyId, name: "Fictional foreign client" } })).id
    templateId = (await prisma.projectTemplate.create({ data: { companyId: session.companyId, name: "Fictional counted template", defaultBudgetCents: 12345 } })).id
    await prisma.projectTemplateStep.create({ data: { templateId, title: "Fictional preserved step", order: 0 } })
    const base = { companyId: session.companyId, clientId: ownClientId, projectTemplateId: templateId, name: "Fictional counted project" }
    await prisma.project.createMany({ data: [
      { ...base, agencyId }, { ...base, agencyId: otherAgencyId }, { ...base, agencyId: null },
      { ...base, companyId: foreignCompanyId, clientId: foreignClientId },
      { ...base, clientId: foreignClientId, agencyId }, { ...base, agencyId: foreignAgencyId },
    ] })
    await prisma.projectTemplate.create({ data: { companyId: foreignCompanyId, name: "Fictional foreign template" } })
  })
  afterEach(async () => {
    vi.unstubAllEnvs()
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "OPERATIONS", status: "ACTIVE" } })
    await prisma.agency.update({ where: { id: agencyId }, data: { active: true } })
  })
  afterAll(async () => {
    await prisma.project.deleteMany({ where: { projectTemplateId: templateId } })
    await prisma.projectTemplate.deleteMany({ where: { companyId: { in: [session.companyId, foreignCompanyId] } } })
    await prisma.client.deleteMany({ where: { companyId: { in: [session.companyId, foreignCompanyId] } } })
    await prisma.company.deleteMany({ where: { id: { in: [session.companyId, foreignCompanyId] } } })
    await prisma.user.delete({ where: { id: session.userId } })
  })
  it.each(["OWNER", "ADMIN", "SALES", "OPERATIONS", "TECHNICIAN", "SERVICE", "ACCOUNTING", "VIEWER"])("counts only accessible coherent projects for %s", async role => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    const rows = await getProjectTemplates()
    expect(rows).toHaveLength(1)
    expect(rows[0]._count.projects).toBe(["OWNER", "ADMIN"].includes(role) ? 3 : 1)
    expect(rows[0]).toMatchObject({ id: templateId, defaultBudgetCents: 12345, steps: [{ title: "Fictional preserved step" }] })
  })
  it("does not count projects after their agency becomes inactive", async () => {
    await prisma.agency.update({ where: { id: agencyId }, data: { active: false } })
    expect((await getProjectTemplates())[0]._count.projects).toBe(0)
  })
  it("rechecks membership before loading a template", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { status: "INACTIVE" } })
    await expect(getProjectTemplates()).rejects.toThrow("plus accès")
  })
  it("preserves all six historical references and creates no audit", async () => {
    await getProjectTemplates()
    expect(await prisma.project.count({ where: { projectTemplateId: templateId } })).toBe(6)
    expect(await prisma.auditLog.count({ where: { userId: session.userId } })).toBe(0)
  })
  it("retains the scoped read in public demo mode", async () => {
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    expect((await getProjectTemplates())[0]._count.projects).toBe(1)
  })
})
