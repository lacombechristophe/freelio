import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
import prisma from "@/lib/prisma"
import { requestContext } from "@/lib/context"
import { createProject, createProjectTemplate, getProjectTemplates, setProjectTemplateActive } from "@/actions/projets"

describe.sequential("Project templates preserve their own graph, revision and audit", () => {
  let foreignCompanyId: string, membershipId: string, clientId: string, agencyId: string, templateId: string, firstId: string, secondId: string, foreignStepId: string, otherStepId: string, revision: string
  const draft = () => ({ name: "Fictional authored template", defaultBudgetCents: 12000, defaultDurationDays: 3,
    steps: [{ title: "Fictional preparation", offsetDays: 0, durationDays: 1 }, { title: "Fictional control", offsetDays: 1, durationDays: 1, dependsOnIndex: 0 }] })
  const project = () => createProject({ name: "Fictional templated project", clientId, agencyId, projectTemplateId: templateId, budgetCents: 12000, startDate: "2030-02-20" })
  beforeAll(async () => {
    session.companyId = (await prisma.company.create({ data: { name: "Fictional template integrity" } })).id
    foreignCompanyId = (await prisma.company.create({ data: { name: "Fictional unrelated templates" } })).id
    session.userId = (await prisma.user.create({ data: { email: `template-integrity-${randomUUID()}@example.test` } })).id
    membershipId = (await prisma.membership.create({ data: { companyId: session.companyId, userId: session.userId, role: "OWNER", status: "ACTIVE" } })).id
    clientId = (await prisma.client.create({ data: { companyId: session.companyId, name: "Fictional template client" } })).id
    agencyId = (await prisma.agency.create({ data: { companyId: session.companyId, name: "Fictional template agency", code: "TPL", active: true } })).id
  })
  beforeEach(async () => {
    const template = await prisma.projectTemplate.create({ data: { companyId: session.companyId, name: "Fictional source template" } })
    templateId = template.id; revision = template.updatedAt.toISOString()
    firstId = (await prisma.projectTemplateStep.create({ data: { templateId, title: "Fictional first stage", order: 0 } })).id
    secondId = (await prisma.projectTemplateStep.create({ data: { templateId, title: "Fictional second stage", order: 1, dependsOnStepId: firstId } })).id
    const foreign = await prisma.projectTemplate.create({ data: { companyId: foreignCompanyId, name: "Fictional foreign template" } })
    foreignStepId = (await prisma.projectTemplateStep.create({ data: { templateId: foreign.id, title: "Fictional foreign confidential stage", order: 0 } })).id
    const other = await prisma.projectTemplate.create({ data: { companyId: session.companyId, name: "Fictional other template" } })
    otherStepId = (await prisma.projectTemplateStep.create({ data: { templateId: other.id, title: "Fictional other graph stage", order: 0 } })).id
  })
  async function dropTrigger() {
    if (process.env.DATABASE_URL?.startsWith("file:")) await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS "fictional_template_audit_failure"')
    else {
      await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS "fictional_template_audit_failure" ON "AuditLog"')
      await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS fictional_template_audit_failure()')
    }
  }
  async function failAudit() {
    if (process.env.DATABASE_URL?.startsWith("file:")) await prisma.$executeRawUnsafe(`CREATE TRIGGER "fictional_template_audit_failure" BEFORE INSERT ON "AuditLog" WHEN NEW."userId" = '${session.userId}' BEGIN SELECT RAISE(ABORT, 'Fictional template audit failure'); END`)
    else {
      await prisma.$executeRawUnsafe(`CREATE FUNCTION fictional_template_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."userId" = '${session.userId}' THEN RAISE EXCEPTION 'Fictional template audit failure'; END IF; RETURN NEW; END; $$`)
      await prisma.$executeRawUnsafe('CREATE TRIGGER "fictional_template_audit_failure" BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION fictional_template_audit_failure()')
    }
  }
  afterEach(async () => {
    vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks(); await dropTrigger()
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "OWNER", status: "ACTIVE" } })
    await prisma.project.deleteMany({ where: { companyId: session.companyId } })
    await prisma.projectTemplate.deleteMany({ where: { companyId: { in: [session.companyId, foreignCompanyId] } } })
    await prisma.auditLog.deleteMany({ where: { userId: session.userId } })
  })
  afterAll(async () => {
    await prisma.client.deleteMany({ where: { companyId: { in: [session.companyId, foreignCompanyId] } } })
    await prisma.company.deleteMany({ where: { id: { in: [session.companyId, foreignCompanyId] } } })
    await prisma.user.delete({ where: { id: session.userId } })
  })
  it("does not return the identity or title of a prerequisite from another company", async () => {
    await prisma.projectTemplateStep.update({ where: { id: secondId }, data: { dependsOnStepId: foreignStepId } })
    const template = (await getProjectTemplates()).find(item => item.id === templateId)!
    expect(template.steps.find(item => item.id === secondId)).toMatchObject({ dependsOnStepId: null, dependsOnStep: null, dependencyUnavailable: true })
    expect(JSON.stringify(template)).not.toContain(foreignStepId)
    expect(JSON.stringify(template)).not.toContain("Fictional foreign confidential stage")
    expect((await prisma.projectTemplateStep.findUniqueOrThrow({ where: { id: secondId } })).dependsOnStepId).toBe(foreignStepId)
  })
  it("does not treat a prerequisite from another owned template as part of this graph", async () => {
    await prisma.projectTemplateStep.update({ where: { id: secondId }, data: { dependsOnStepId: otherStepId } })
    const template = (await getProjectTemplates()).find(item => item.id === templateId)!
    expect(template.steps.find(item => item.id === secondId)).toMatchObject({ dependsOnStepId: null, dependsOnStep: null })
  })
  it("rolls back template and steps when its audit insertion is refused", async () => {
    await failAudit()
    const result = await createProjectTemplate(draft()).then(() => "accepted", () => "refused")
    const stored = await prisma.projectTemplate.findMany({ where: { companyId: session.companyId, name: draft().name }, include: { steps: true } })
    expect(stored).toHaveLength(0)
    expect(result).toBe("refused")
  })
  it("keeps the activity transition and its audit together", async () => {
    await setProjectTemplateActive(templateId, false, revision)
    expect(await prisma.projectTemplate.findUniqueOrThrow({ where: { id: templateId } })).toMatchObject({ active: false })
    expect(await prisma.auditLog.count({ where: { userId: session.userId, resourceId: templateId } })).toBe(1)
  })
  it("preserves activity and revision when its audit insertion is refused", async () => {
    const before = await prisma.projectTemplate.findUniqueOrThrow({ where: { id: templateId } })
    await failAudit()
    const result = await setProjectTemplateActive(templateId, false, revision).then(() => "accepted", () => "refused")
    expect(await prisma.projectTemplate.findUniqueOrThrow({ where: { id: templateId } })).toEqual(before)
    expect(result).toBe("refused")
  })
  it("refuses an activity transition from an obsolete displayed revision", async () => {
    const current = await prisma.projectTemplate.update({ where: { id: templateId }, data: { name: "Fictional newer template", updatedAt: new Date(new Date(revision).getTime() + 1000) } })
    const result = await setProjectTemplateActive(templateId, false, revision).then(() => "accepted", () => "refused")
    expect(await prisma.projectTemplate.findUniqueOrThrow({ where: { id: templateId } })).toEqual(current)
    expect(result).toBe("refused")
  })
  it.each(["foreign", "cycle", "later"] as const)("refuses to instantiate a template with a %s prerequisite without silently clearing it", async kind => {
    if (kind === "foreign") await prisma.projectTemplateStep.update({ where: { id: secondId }, data: { dependsOnStepId: foreignStepId } })
    else {
      await prisma.projectTemplateStep.update({ where: { id: firstId }, data: { dependsOnStepId: secondId } })
      if (kind === "later") await prisma.projectTemplateStep.update({ where: { id: secondId }, data: { dependsOnStepId: null } })
    }
    const result = await project().then(() => "accepted", () => "refused")
    expect(await prisma.project.count({ where: { companyId: session.companyId } })).toBe(0)
    expect(result).toBe("refused")
    expect(await prisma.auditLog.count({ where: { userId: session.userId } })).toBe(0)
  })
  it("keeps a coherent prerequisite and excludes foreign templates without creating an audit", async () => {
    const rows = await getProjectTemplates()
    expect(rows).toHaveLength(2)
    const template = rows.find(item => item.id === templateId)!
    expect(template.updatedAt.toISOString()).toBe(revision)
    expect(template.steps.find(item => item.id === secondId)).toMatchObject({ dependsOnStepId: firstId, dependsOnStep: { id: firstId, title: "Fictional first stage" }, dependencyUnavailable: false })
    expect(JSON.stringify(rows)).not.toContain(foreignStepId)
    expect(await prisma.auditLog.count({ where: { userId: session.userId } })).toBe(0)
  })
  it("creates the full template graph and its audit for Operations", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "OPERATIONS" } })
    const result = await createProjectTemplate(draft())
    const stored = await prisma.projectTemplate.findUniqueOrThrow({ where: { id: result.id }, include: { steps: { orderBy: { order: "asc" } } } })
    expect(stored).toMatchObject({ companyId: session.companyId, name: draft().name, defaultBudgetCents: 12000, active: true })
    expect(stored.steps).toHaveLength(2)
    expect(stored.steps[1].dependsOnStepId).toBe(stored.steps[0].id)
    const audit = await prisma.auditLog.findMany({ where: { userId: session.userId, resourceId: stored.id } })
    expect(audit).toHaveLength(1)
    expect(audit[0]).toMatchObject({ action: "CREATE_PROJECT_TEMPLATE", resource: "PROJECT_TEMPLATE", payload: { name: draft().name, stepCount: 2 } })
  })
  it("does not leave the first stage behind when a later stage violates its unique title", async () => {
    const input = draft(); input.steps[1].title = input.steps[0].title
    await expect(createProjectTemplate(input)).rejects.toThrow()
    expect(await prisma.projectTemplate.count({ where: { companyId: session.companyId, name: input.name } })).toBe(0)
    expect(await prisma.auditLog.count({ where: { userId: session.userId } })).toBe(0)
  })
  it("instantiates a valid graph and preserves existing projects when its template is deactivated", async () => {
    const created = await project()
    const milestones = await prisma.projectMilestone.findMany({ where: { projectId: created.id }, orderBy: { order: "asc" } })
    expect(milestones).toHaveLength(2)
    expect(milestones[1].dependsOnId).toBe(milestones[0].id)
    expect(milestones[0].plannedStartAt?.toISOString()).toBe("2030-02-20T12:00:00.000Z")
    await setProjectTemplateActive(templateId, false, revision)
    expect(await prisma.project.findUniqueOrThrow({ where: { id: created.id } })).toEqual(created)
    expect(await prisma.projectMilestone.findMany({ where: { projectId: created.id }, orderBy: { order: "asc" } })).toEqual(milestones)
    await expect(project()).rejects.toThrow("Modèle de chantier introuvable ou inactif")
    expect(await prisma.project.count({ where: { companyId: session.companyId } })).toBe(1)
  })
  it("reactivates with the current revision, records both transitions and advances a frozen clock", async () => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(revision))
    await setProjectTemplateActive(templateId, false, revision)
    const inactive = await prisma.projectTemplate.findUniqueOrThrow({ where: { id: templateId } })
    expect(inactive.updatedAt.getTime()).toBeGreaterThan(new Date(revision).getTime())
    await setProjectTemplateActive(templateId, true, inactive.updatedAt.toISOString())
    const active = await prisma.projectTemplate.findUniqueOrThrow({ where: { id: templateId } })
    expect(active.active).toBe(true)
    expect(active.updatedAt.getTime()).toBeGreaterThan(inactive.updatedAt.getTime())
    expect(await prisma.auditLog.count({ where: { userId: session.userId, resourceId: templateId, action: "UPDATE_PROJECT_TEMPLATE_STATUS" } })).toBe(2)
  })
  it("does not invent a transition or revision for an already current state", async () => {
    const before = await prisma.projectTemplate.findUniqueOrThrow({ where: { id: templateId } })
    await setProjectTemplateActive(templateId, true, revision)
    expect(await prisma.projectTemplate.findUniqueOrThrow({ where: { id: templateId } })).toEqual(before)
    expect(await prisma.auditLog.count({ where: { userId: session.userId } })).toBe(0)
  })
  it.each([undefined, "not-a-revision"])("refuses an activity transition with invalid revision %s", async value => {
    const before = await prisma.projectTemplate.findUniqueOrThrow({ where: { id: templateId } })
    await expect(setProjectTemplateActive(templateId, false, value as string)).rejects.toThrow("Le modèle de chantier a changé")
    expect(await prisma.projectTemplate.findUniqueOrThrow({ where: { id: templateId } })).toEqual(before)
    expect(await prisma.auditLog.count({ where: { userId: session.userId } })).toBe(0)
  })
  it("does not coerce an untrusted activity value", async () => {
    const before = await prisma.projectTemplate.findUniqueOrThrow({ where: { id: templateId } })
    await expect(setProjectTemplateActive(templateId, "false" as unknown as boolean, revision)).rejects.toThrow()
    expect(await prisma.projectTemplate.findUniqueOrThrow({ where: { id: templateId } })).toEqual(before)
    expect(await prisma.auditLog.count({ where: { userId: session.userId } })).toBe(0)
  })
  it("does not change another company's template even with its actual revision", async () => {
    const foreign = await prisma.projectTemplate.findFirstOrThrow({ where: { companyId: foreignCompanyId } })
    await expect(setProjectTemplateActive(foreign.id, false, foreign.updatedAt.toISOString())).rejects.toThrow("Modèle de chantier introuvable")
    expect(await prisma.projectTemplate.findUniqueOrThrow({ where: { id: foreign.id } })).toEqual(foreign)
    expect(await prisma.auditLog.count({ where: { userId: session.userId } })).toBe(0)
  })
  for (const operation of ["create", "toggle"] as const) {
    const mutate = () => operation === "create" ? createProjectTemplate(draft()) : setProjectTemplateActive(templateId, false, revision)
    it(`refuses to ${operation} without Operations write before entering the action`, async () => {
      await prisma.membership.update({ where: { id: membershipId }, data: { role: "SERVICE" } })
      const before = await prisma.projectTemplate.findMany({ where: { companyId: session.companyId }, orderBy: { id: "asc" } })
      const context = vi.spyOn(requestContext, "run")
      await expect(mutate()).rejects.toThrow("pas les droits")
      expect(context).not.toHaveBeenCalled()
      expect(await prisma.projectTemplate.findMany({ where: { companyId: session.companyId }, orderBy: { id: "asc" } })).toEqual(before)
      expect(await prisma.auditLog.count({ where: { userId: session.userId } })).toBe(0)
    })
    it(`refuses to ${operation} in the public read-only demo`, async () => {
      vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
      const context = vi.spyOn(requestContext, "run")
      await expect(mutate()).rejects.toThrow("lecture seule")
      expect(context).not.toHaveBeenCalled()
      expect(await prisma.projectTemplate.count({ where: { companyId: session.companyId } })).toBe(2)
      expect((await prisma.projectTemplate.findUniqueOrThrow({ where: { id: templateId } })).active).toBe(true)
      expect(await prisma.auditLog.count({ where: { userId: session.userId } })).toBe(0)
    })
  }
  it("commits only one of two activity transitions using the same displayed revision", async () => {
    const results = await Promise.allSettled([setProjectTemplateActive(templateId, false, revision), setProjectTemplateActive(templateId, false, revision)])
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1)
    expect(results.filter(result => result.status === "rejected")).toHaveLength(1)
    expect((await prisma.projectTemplate.findUniqueOrThrow({ where: { id: templateId } })).active).toBe(false)
    expect(await prisma.auditLog.count({ where: { userId: session.userId, resourceId: templateId } })).toBe(1)
  })
})
