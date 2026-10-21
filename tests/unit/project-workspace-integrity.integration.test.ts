import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
import prisma from "@/lib/prisma"
import { requestContext } from "@/lib/context"
import {
  createProject, createProjectAcceptanceItem, createProjectMilestone, deleteProject, deleteProjectAcceptanceItem, deleteProjectMilestone,
  getProjectById, updateProjectAcceptanceStatus, updateProjectMilestonePlanning, updateProjectMilestoneStatus,
  upsertProjectTechnicalProfile,
} from "@/actions/projets"

describe.sequential("Project workspace integrity on isolated SQL", () => {
  let foreignCompanyId: string, foreignUserId: string, foreignMembershipId: string, clientId: string, foreignClientId: string
  let projectId: string, milestoneId: string, acceptanceId: string, membershipId: string, agencyId: string
  let milestoneRevision: string, acceptanceRevision: string
  const planning = () => ({ plannedStartAt: "2030-02-20", dueDate: "2030-02-21", durationDays: 1, dependsOnId: "", assignedMembershipId: "" })
  const operations = [
    { name: "create milestone", call: () => createProjectMilestone(projectId, { title: "Fictitious additional milestone" }) },
    { name: "change milestone status", call: () => updateProjectMilestoneStatus(milestoneId, "DONE", milestoneRevision) },
    { name: "plan milestone", call: () => updateProjectMilestonePlanning(milestoneId, planning(), milestoneRevision) },
    { name: "delete milestone", call: () => deleteProjectMilestone(milestoneId, milestoneRevision) },
    { name: "create acceptance", call: () => createProjectAcceptanceItem(projectId, { title: "Fictitious additional control" }) },
    { name: "change acceptance status", call: () => updateProjectAcceptanceStatus(acceptanceId, "DONE", acceptanceRevision) },
    { name: "delete acceptance", call: () => deleteProjectAcceptanceItem(acceptanceId, acceptanceRevision) },
    { name: "save technical profile", call: () => upsertProjectTechnicalProfile(projectId, { surveyStatus: "SURVEYED", surveyedAt: "2030-02-20" }, null) },
  ]
  beforeAll(async () => {
    session.companyId = (await prisma.company.create({ data: { name: "Fictitious workspace integrity" } })).id
    foreignCompanyId = (await prisma.company.create({ data: { name: "Fictitious foreign workspace" } })).id
    session.userId = (await prisma.user.create({ data: { email: `workspace-${randomUUID()}@example.test` } })).id
    foreignUserId = (await prisma.user.create({ data: { email: `foreign-workspace-${randomUUID()}@example.test`, name: "FOREIGN-MEMBER-SECRET" } })).id
    membershipId = (await prisma.membership.create({ data: { companyId: session.companyId, userId: session.userId, role: "OWNER", status: "ACTIVE" } })).id
    agencyId = (await prisma.agency.create({ data: { companyId: session.companyId, name: "Fictitious workspace agency", code: "WORKSPACE", isDefault: true } })).id
    await prisma.agencyMembership.create({ data: { membershipId, agencyId } })
    foreignMembershipId = (await prisma.membership.create({ data: { companyId: foreignCompanyId, userId: foreignUserId, role: "OWNER", status: "ACTIVE" } })).id
    clientId = (await prisma.client.create({ data: { companyId: session.companyId, name: "Fictitious own client" } })).id
    foreignClientId = (await prisma.client.create({ data: { companyId: foreignCompanyId, name: "Fictitious foreign client" } })).id
  })
  beforeEach(async () => {
    projectId = (await prisma.project.create({ data: { companyId: session.companyId, clientId, agencyId, name: "Fictitious workspace project" } })).id
    const milestone = await prisma.projectMilestone.create({ data: { projectId, title: "Fictitious original milestone" } })
    milestoneId = milestone.id
    milestoneRevision = milestone.updatedAt.toISOString()
    const acceptance = await prisma.projectAcceptanceItem.create({ data: { projectId, title: "Fictitious original control" } })
    acceptanceId = acceptance.id
    acceptanceRevision = acceptance.updatedAt.toISOString()
  })
  async function dropTrigger() {
    if (process.env.DATABASE_URL?.startsWith("file:")) await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS "fictional_workspace_audit_failure"')
    else {
      await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS "fictional_workspace_audit_failure" ON "AuditLog"')
      await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS fictional_workspace_audit_failure()')
    }
  }
  afterEach(async () => {
    vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks(); await dropTrigger()
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "OWNER", status: "ACTIVE" } })
    await prisma.project.deleteMany({ where: { companyId: { in: [session.companyId, foreignCompanyId] } } })
    await prisma.projectTemplate.deleteMany({ where: { companyId: { in: [session.companyId, foreignCompanyId] } } })
    await prisma.auditLog.deleteMany({ where: { userId: session.userId } })
  })
  afterAll(async () => {
    await prisma.client.deleteMany({ where: { companyId: { in: [session.companyId, foreignCompanyId] } } })
    await prisma.company.deleteMany({ where: { id: { in: [session.companyId, foreignCompanyId] } } })
    await prisma.user.deleteMany({ where: { id: { in: [session.userId, foreignUserId] } } })
  })
  async function snapshot() {
    return {
      project: await prisma.project.findUniqueOrThrow({ where: { id: projectId } }),
      milestones: await prisma.projectMilestone.findMany({ where: { projectId }, orderBy: { id: "asc" } }),
      acceptance: await prisma.projectAcceptanceItem.findMany({ where: { projectId }, orderBy: { id: "asc" } }),
      profile: await prisma.projectTechnicalProfile.findUnique({ where: { projectId } }),
    }
  }
  async function failAudit() {
    if (process.env.DATABASE_URL?.startsWith("file:")) await prisma.$executeRawUnsafe(`CREATE TRIGGER "fictional_workspace_audit_failure" BEFORE INSERT ON "AuditLog" WHEN NEW."userId" = '${session.userId}' BEGIN SELECT RAISE(ABORT, 'Fictitious workspace audit failure'); END`)
    else {
      await prisma.$executeRawUnsafe(`CREATE FUNCTION fictional_workspace_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."userId" = '${session.userId}' THEN RAISE EXCEPTION 'Fictitious workspace audit failure'; END IF; RETURN NEW; END; $$`)
      await prisma.$executeRawUnsafe('CREATE TRIGGER "fictional_workspace_audit_failure" BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION fictional_workspace_audit_failure()')
    }
  }
  for (const operation of operations) {
    it(`allows Operations to ${operation.name} with one committed audit`, async () => {
      await prisma.membership.update({ where: { id: membershipId }, data: { role: "OPERATIONS" } })
      await operation.call()
      const after = await snapshot()
      switch (operation.name) {
        case "create milestone": expect(after.milestones).toHaveLength(2); break
        case "change milestone status": expect(after.milestones[0].status).toBe("DONE"); break
        case "plan milestone": expect(after.milestones[0].plannedStartAt?.toISOString().slice(0, 10)).toBe("2030-02-20"); break
        case "delete milestone": expect(after.milestones).toHaveLength(0); break
        case "create acceptance": expect(after.acceptance).toHaveLength(2); break
        case "change acceptance status": expect(after.acceptance[0].status).toBe("DONE"); break
        case "delete acceptance": expect(after.acceptance).toHaveLength(0); break
        case "save technical profile": expect(after.profile?.surveyStatus).toBe("SURVEYED"); break
        default: throw new Error("Missing positive workspace assertion")
      }
      expect(await prisma.auditLog.count({ where: { userId: session.userId } })).toBe(1)
    })
    it(`refuses to ${operation.name} through a project linked to a foreign client`, async () => {
      await prisma.project.update({ where: { id: projectId }, data: { clientId: foreignClientId } })
      const before = await snapshot()
      await expect(operation.call()).rejects.toThrow()
      expect(await snapshot()).toEqual(before)
      expect(await prisma.auditLog.count({ where: { userId: session.userId } })).toBe(0)
    })
    it(`rolls back ${operation.name} if its audit cannot be inserted`, async () => {
      const before = await snapshot()
      await failAudit()
      await expect(operation.call()).rejects.toThrow()
      expect(await snapshot()).toEqual(before)
    })
    it(`refuses to ${operation.name} without Operations write before entering the action`, async () => {
      await prisma.membership.update({ where: { id: membershipId }, data: { role: "SERVICE" } })
      const before = await snapshot(), context = vi.spyOn(requestContext, "run")
      await expect(operation.call()).rejects.toThrow("pas les droits")
      expect(context).not.toHaveBeenCalled()
      expect(await snapshot()).toEqual(before)
      expect(await prisma.auditLog.count({ where: { userId: session.userId } })).toBe(0)
    })
    it(`refuses to ${operation.name} in the public read-only demo`, async () => {
      const before = await snapshot()
      vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
      const context = vi.spyOn(requestContext, "run")
      await expect(operation.call()).rejects.toThrow("lecture seule")
      expect(context).not.toHaveBeenCalled()
      expect(await snapshot()).toEqual(before)
    })
  }
  for (const name of ["change milestone status", "plan milestone", "delete milestone", "change acceptance status", "delete acceptance"] as const) {
    it(`refuses a stale form when asked to ${name}`, async () => {
      if (name.includes("milestone")) await prisma.projectMilestone.update({ where: { id: milestoneId }, data: { title: "Fictitious newer milestone", updatedAt: new Date(new Date(milestoneRevision).getTime() + 1000) } })
      else await prisma.projectAcceptanceItem.update({ where: { id: acceptanceId }, data: { title: "Fictitious newer control", updatedAt: new Date(new Date(acceptanceRevision).getTime() + 1000) } })
      const before = await snapshot()
      await expect(operations.find(operation => operation.name === name)!.call()).rejects.toThrow("Le chantier a changé")
      expect(await snapshot()).toEqual(before)
      expect(await prisma.auditLog.count({ where: { userId: session.userId } })).toBe(0)
    })
  }
  it("does not overwrite a newer profile or treat it as an absent profile", async () => {
    const original = await prisma.projectTechnicalProfile.create({ data: { projectId, surveyStatus: "DRAFT" } })
    const current = await prisma.projectTechnicalProfile.update({ where: { projectId }, data: { poolLengthMm: 9000, updatedAt: new Date(original.updatedAt.getTime() + 1000) } })
    for (const expected of [null, original.updatedAt.toISOString()]) await expect(upsertProjectTechnicalProfile(projectId, { poolLengthMm: 1000 }, expected)).rejects.toThrow("Le chantier a changé")
    expect(await prisma.projectTechnicalProfile.findUnique({ where: { projectId } })).toEqual(current)
    expect(await prisma.auditLog.count({ where: { userId: session.userId } })).toBe(0)
  })
  it("preserves legacy profile fields and advances its revision after a valid edit", async () => {
    const original = await prisma.projectTechnicalProfile.create({ data: { projectId, notes: "Fictitious legacy note", repositoryUrl: "https://example.test/fictitious" } })
    const updated = await upsertProjectTechnicalProfile(projectId, { surveyStatus: "VALIDATED", poolLengthMm: 8000 }, original.updatedAt.toISOString())
    expect(updated).toMatchObject({ surveyStatus: "VALIDATED", poolLengthMm: 8000, notes: original.notes, repositoryUrl: original.repositoryUrl })
    expect(updated.validatedAt).not.toBeNull()
    expect(updated.updatedAt.getTime()).toBeGreaterThan(original.updatedAt.getTime())
    expect(await prisma.auditLog.count({ where: { resourceId: projectId } })).toBe(1)
  })
  it("rejects a historical dependency cycle without unbounded traversal", async () => {
    const first = await prisma.projectMilestone.create({ data: { projectId, title: "Fictitious loop first" } })
    const second = await prisma.projectMilestone.create({ data: { projectId, title: "Fictitious loop second", dependsOnId: first.id } })
    await prisma.projectMilestone.update({ where: { id: first.id }, data: { dependsOnId: second.id } })
    const before = await snapshot()
    await expect(updateProjectMilestonePlanning(milestoneId, { ...planning(), dependsOnId: first.id }, milestoneRevision)).rejects.toThrow("boucle")
    expect(await snapshot()).toEqual(before)
  })
  it("keeps prerequisite gating and permits completion once its own dependency is done", async () => {
    const dependency = await prisma.projectMilestone.create({ data: { projectId, title: "Fictitious prerequisite" } })
    const current = await prisma.projectMilestone.update({ where: { id: milestoneId }, data: { dependsOnId: dependency.id } })
    await expect(updateProjectMilestoneStatus(milestoneId, "DONE", current.updatedAt.toISOString())).resolves.toMatchObject({ success: false })
    expect(await prisma.auditLog.count({ where: { userId: session.userId } })).toBe(0)
    await prisma.projectMilestone.update({ where: { id: dependency.id }, data: { status: "DONE" } })
    await expect(updateProjectMilestoneStatus(milestoneId, "DONE", current.updatedAt.toISOString())).resolves.toMatchObject({ success: true, milestone: { status: "DONE" } })
    expect(await prisma.auditLog.count({ where: { userId: session.userId } })).toBe(1)
  })
  for (const foreign of [false, true]) {
    it(`does not detach an incoming dependency belonging to ${foreign ? "another company" : "another project"}`, async () => {
      const project = await prisma.project.create({ data: { companyId: foreign ? foreignCompanyId : session.companyId, clientId: foreign ? foreignClientId : clientId, name: "Fictitious incoming dependency project" } })
      const dependant = await prisma.projectMilestone.create({ data: { projectId: project.id, title: "Fictitious incoming dependency", dependsOnId: milestoneId } })
      await expect(deleteProjectMilestone(milestoneId, milestoneRevision)).rejects.toThrow("références")
      const revision = (await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).updatedAt.toISOString()
      const outcome = await deleteProject(projectId, revision).then(() => "fulfilled", () => "rejected")
      expect(await prisma.projectMilestone.findUnique({ where: { id: dependant.id } })).toEqual(dependant)
      expect(outcome).toBe("rejected")
      expect(await prisma.projectMilestone.count({ where: { id: milestoneId } })).toBe(1)
      expect(await prisma.auditLog.count({ where: { userId: session.userId } })).toBe(0)
    })
  }
  it("detaches own dependants with a new revision and an audit when deleting a prerequisite", async () => {
    const dependant = await prisma.projectMilestone.create({ data: { projectId, title: "Fictitious dependant", dependsOnId: milestoneId } })
    await deleteProjectMilestone(milestoneId, milestoneRevision)
    const updated = await prisma.projectMilestone.findUniqueOrThrow({ where: { id: dependant.id } })
    expect(updated.dependsOnId).toBeNull()
    expect(updated.updatedAt.getTime()).toBeGreaterThan(dependant.updatedAt.getTime())
    await expect(updateProjectMilestoneStatus(dependant.id, "DONE", dependant.updatedAt.toISOString())).rejects.toThrow("Le chantier a changé")
    expect((await prisma.auditLog.findFirstOrThrow({ where: { resourceId: milestoneId } })).payload).toMatchObject({ detachedMilestoneIds: [dependant.id] })
  })
  it("rolls back dependant detachment and revision when the deletion audit is refused", async () => {
    await prisma.projectMilestone.create({ data: { projectId, title: "Fictitious preserved dependant", dependsOnId: milestoneId } })
    const before = await snapshot()
    await failAudit()
    await expect(deleteProjectMilestone(milestoneId, milestoneRevision)).rejects.toThrow()
    expect(await snapshot()).toEqual(before)
  })
  it("appends after the last position and keeps concurrent milestone positions distinct", async () => {
    await prisma.projectMilestone.create({ data: { projectId, title: "Fictitious retained last position", order: 2 } })
    const results = await Promise.allSettled(["first", "second"].map(name => createProjectMilestone(projectId, { title: `Fictitious concurrent ${name}` })))
    const created = results.flatMap(result => result.status === "fulfilled" ? [result.value] : [])
    expect(created.length).toBeGreaterThan(0)
    expect(created.every(item => item.order > 2)).toBe(true)
    expect(new Set(created.map(item => item.order)).size).toBe(created.length)
    if (process.env.DATABASE_URL?.startsWith("file:")) expect(created).toHaveLength(2)
    else for (const result of results) if (result.status === "rejected") expect(result.reason).toHaveProperty("code", "P2034")
    expect(await prisma.auditLog.count({ where: { userId: session.userId } })).toBe(created.length)
  })
  for (const field of ["startDate", "endDate"] as const) {
    it(`refuses an impossible project ${field} without creating a project or audit`, async () => {
      await expect(createProject({ clientId, agencyId, name: "Fictitious invalid project day", budgetCents: 0, [field]: "2030-02-31" })).rejects.toThrow()
      expect(await prisma.project.count({ where: { companyId: session.companyId } })).toBe(1)
      expect(await prisma.auditLog.count({ where: { userId: session.userId } })).toBe(0)
    })
  }
  for (const zone of ["UTC", "Europe/Paris", "Pacific/Kiritimati"]) {
    it(`stores calendar days and template offsets consistently with server timezone ${zone}`, async () => {
      vi.stubEnv("TZ", zone)
      const template = await prisma.projectTemplate.create({ data: {
        companyId: session.companyId, name: "Fictitious DST template", defaultDurationDays: 2,
        steps: { create: [{ title: "Fictitious first day", order: 0, offsetDays: 0 }, { title: "Fictitious next day", order: 1, offsetDays: 1 }] },
      } })
      const created = await createProject({ clientId, agencyId, projectTemplateId: template.id, name: "Fictitious DST project", budgetCents: 0, startDate: "2030-03-30" })
      expect(created.startDate?.toISOString()).toBe("2030-03-30T12:00:00.000Z")
      expect(created.endDate?.toISOString()).toBe("2030-04-01T12:00:00.000Z")
      const milestones = await prisma.projectMilestone.findMany({ where: { projectId: created.id }, orderBy: { order: "asc" } })
      expect(milestones.map(item => item.plannedStartAt?.toISOString())).toEqual(["2030-03-30T12:00:00.000Z", "2030-03-31T12:00:00.000Z"])
    })
  }
  it("uses the company's current day when a template has no explicit start date", async () => {
    const template = await prisma.projectTemplate.create({ data: { companyId: session.companyId, name: "Fictitious current-day template" } })
    vi.stubEnv("TZ", "UTC")
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2030-12-31T23:30:00.000Z"))
    const created = await createProject({ clientId, agencyId, projectTemplateId: template.id, name: "Fictitious company-day project", budgetCents: 0 })
    expect(created.startDate?.toISOString()).toBe("2031-01-01T12:00:00.000Z")
  })
  it("does not disclose a foreign dependency in the project reader", async () => {
    const foreignProject = await prisma.project.create({ data: { companyId: foreignCompanyId, clientId: foreignClientId, name: "FOREIGN-PROJECT-SECRET" } })
    const dependency = await prisma.projectMilestone.create({ data: { projectId: foreignProject.id, title: "FOREIGN-DEPENDENCY-SECRET" } })
    await prisma.projectMilestone.update({ where: { id: milestoneId }, data: { dependsOnId: dependency.id } })
    const project = await getProjectById(projectId)
    expect(project?.milestones).toEqual([expect.objectContaining({ id: milestoneId, dependencyUnavailable: true, dependsOnId: null, dependsOn: null })])
    const result = JSON.stringify(project)
    expect(result).not.toContain("FOREIGN-DEPENDENCY-SECRET")
    expect(result).not.toContain(dependency.id)
  })
  it("does not disclose a foreign assignee in the project reader", async () => {
    await prisma.projectMilestone.update({ where: { id: milestoneId }, data: { assignedMembershipId: foreignMembershipId } })
    const project = await getProjectById(projectId)
    expect(project?.milestones).toEqual([expect.objectContaining({ id: milestoneId, assigneeUnavailable: true, assignedMembershipId: null, assignedMembership: null })])
    const result = JSON.stringify(project)
    expect(result).not.toContain("FOREIGN-MEMBER-SECRET")
    expect(result).not.toContain(foreignMembershipId)
  })
  it("does not disclose a foreign template on an own project", async () => {
    const template = await prisma.projectTemplate.create({ data: { companyId: foreignCompanyId, name: "FOREIGN-TEMPLATE-SECRET" } })
    await prisma.project.update({ where: { id: projectId }, data: { projectTemplateId: template.id } })
    expect(await getProjectById(projectId)).toBeNull()
  })
  for (const operation of ["read", "update", "dependency"] as const) {
    it(`rejects a foreign template step during milestone ${operation}`, async () => {
      const template = await prisma.projectTemplate.create({ data: { companyId: foreignCompanyId, name: "FOREIGN-STEP-TEMPLATE", steps: { create: { title: "FOREIGN-STEP-SECRET", order: 0 } } }, include: { steps: true } })
      const milestone = await prisma.projectMilestone.update({ where: { id: milestoneId }, data: { templateStepId: template.steps[0].id } })
      if (operation === "read") {
        const project = await getProjectById(projectId)
        expect(JSON.stringify(project)).not.toContain(template.steps[0].id)
        expect(project?.milestones).toEqual([expect.objectContaining({ id: milestoneId, templateUnavailable: true })])
      } else if (operation === "update") {
        await expect(updateProjectMilestoneStatus(milestoneId, "DONE", milestone.updatedAt.toISOString())).rejects.toThrow("références")
        expect(await prisma.projectMilestone.findUnique({ where: { id: milestoneId } })).toEqual(milestone)
      } else {
        const before = await snapshot()
        await expect(createProjectMilestone(projectId, { title: "Fictitious invalid prerequisite", dependsOnId: milestoneId })).rejects.toThrow("Dépendance introuvable")
        expect(await snapshot()).toEqual(before)
      }
    })
  }
  it("validates the milestone status at runtime", async () => {
    const before = await snapshot()
    await expect(updateProjectMilestoneStatus(milestoneId, "UNKNOWN" as "DONE", milestoneRevision)).rejects.toThrow()
    expect(await snapshot()).toEqual(before)
  })
  it("validates the acceptance status at runtime", async () => {
    const before = await snapshot()
    await expect(updateProjectAcceptanceStatus(acceptanceId, "UNKNOWN" as "DONE", acceptanceRevision)).rejects.toThrow()
    expect(await snapshot()).toEqual(before)
  })
  it("rejects an impossible milestone date without normalizing it", async () => {
    const before = await snapshot()
    await expect(createProjectMilestone(projectId, { title: "Fictitious invalid day", dueDate: "2030-02-31" })).rejects.toThrow()
    expect(await snapshot()).toEqual(before)
  })
  it("rejects an impossible acceptance date without normalizing it", async () => {
    const before = await snapshot()
    await expect(createProjectAcceptanceItem(projectId, { title: "Fictitious invalid control", dueDate: "2030-02-31" })).rejects.toThrow()
    expect(await snapshot()).toEqual(before)
  })
  it("rejects an impossible survey date without normalizing it", async () => {
    const before = await snapshot()
    await expect(upsertProjectTechnicalProfile(projectId, { surveyedAt: "2030-02-31" }, null)).rejects.toThrow()
    expect(await snapshot()).toEqual(before)
  })
})
