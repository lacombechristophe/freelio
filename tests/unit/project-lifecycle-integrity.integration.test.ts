import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/local-files", () => ({ removeLocalFile: vi.fn(async () => {}) }))
import prisma from "@/lib/prisma"
import { createProject, updateProject, archiveProject, deleteProject } from "@/actions/projets"
import { removeLocalFile } from "@/lib/local-files"

describe.sequential("Project lifecycle integrity on real SQL", () => {
  let clientId: string, foreignClientId: string, foreignCompanyId: string, agencyId: string, membershipId: string, projectId: string
  let revision: string
  const payload = () => ({ clientId, agencyId, name: "Fictitious lifecycle project", budgetCents: 12000, description: "Fictitious preserved description" })
  beforeAll(async () => {
    session.companyId = (await prisma.company.create({ data: { name: "Fictitious project lifecycle" } })).id
    foreignCompanyId = (await prisma.company.create({ data: { name: "Foreign fictitious lifecycle" } })).id
    session.userId = (await prisma.user.create({ data: { email: `project-lifecycle-${randomUUID()}@example.test` } })).id
    membershipId = (await prisma.membership.create({ data: { companyId: session.companyId, userId: session.userId, role: "OWNER", status: "ACTIVE" } })).id
    agencyId = (await prisma.agency.create({ data: { companyId: session.companyId, name: "Fictitious lifecycle agency", code: "LIFECYCLE", isDefault: true } })).id
    await prisma.agencyMembership.create({ data: { membershipId, agencyId } })
    clientId = (await prisma.client.create({ data: { companyId: session.companyId, name: "Fictitious lifecycle client" } })).id
    foreignClientId = (await prisma.client.create({ data: { companyId: foreignCompanyId, name: "Foreign fictitious lifecycle client" } })).id
  })
  beforeEach(async () => {
    const project = await prisma.project.create({ data: { companyId: session.companyId, ...payload() } })
    projectId = project.id
    revision = project.updatedAt.toISOString()
  })
  async function dropTriggers() {
    if (process.env.DATABASE_URL?.startsWith("file:")) {
      await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS "fictional_project_audit_failure"')
      await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS "fictional_project_delete_failure"')
    } else {
      await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS "fictional_project_audit_failure" ON "AuditLog"')
      await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS "fictional_project_delete_failure" ON "Project"')
      await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS fictional_project_audit_failure()')
      await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS fictional_project_delete_failure()')
    }
  }
  afterEach(async () => {
    vi.unstubAllEnvs()
    await dropTriggers(); vi.restoreAllMocks(); vi.clearAllMocks()
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "OWNER", status: "ACTIVE" } })
    await prisma.projectFile.deleteMany({ where: { project: { companyId: session.companyId } } })
    await prisma.stockReservation.deleteMany({ where: { companyId: session.companyId } })
    await prisma.inventoryItem.deleteMany({ where: { companyId: session.companyId } })
    await prisma.warehouse.deleteMany({ where: { companyId: session.companyId } })
    await prisma.product.deleteMany({ where: { companyId: session.companyId } })
    await prisma.invoice.deleteMany({ where: { companyId: session.companyId } })
    await prisma.project.deleteMany({ where: { companyId: session.companyId } })
    await prisma.projectTemplate.deleteMany({ where: { companyId: { in: [session.companyId, foreignCompanyId] } } })
    await prisma.auditLog.deleteMany({ where: { userId: session.userId } })
  })
  afterAll(async () => {
    await prisma.client.deleteMany({ where: { companyId: { in: [session.companyId, foreignCompanyId] } } })
    await prisma.company.deleteMany({ where: { id: { in: [session.companyId, foreignCompanyId] } } })
    await prisma.user.delete({ where: { id: session.userId } })
  })
  async function failAudit() {
    if (process.env.DATABASE_URL?.startsWith("file:")) {
      await prisma.$executeRawUnsafe(`CREATE TRIGGER "fictional_project_audit_failure" BEFORE INSERT ON "AuditLog" WHEN NEW."userId" = '${session.userId}' BEGIN SELECT RAISE(ABORT, 'Fictitious project audit failure'); END`)
    } else {
      await prisma.$executeRawUnsafe(`CREATE FUNCTION fictional_project_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."userId" = '${session.userId}' THEN RAISE EXCEPTION 'Fictitious project audit failure'; END IF; RETURN NEW; END; $$`)
      await prisma.$executeRawUnsafe('CREATE TRIGGER "fictional_project_audit_failure" BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION fictional_project_audit_failure()')
    }
  }
  it("deletes a coherent project with its file metadata and unbilled time, then cleans files", async () => {
    const url = `local:${session.companyId}/project/${projectId}/fictitious-project.pdf`
    await prisma.projectFile.create({ data: { projectId, name: "Fictitious PDF", url } })
    await prisma.timeEntry.create({ data: { projectId, durationSec: 60 } })
    await expect(deleteProject(projectId, revision)).resolves.toMatchObject({ ok: true })
    expect(await prisma.project.count({ where: { id: projectId } })).toBe(0)
    expect(await prisma.timeEntry.count({ where: { projectId } })).toBe(0)
    expect(await prisma.projectFile.count({ where: { projectId } })).toBe(0)
    expect(removeLocalFile).toHaveBeenCalledWith(url)
    expect(await prisma.auditLog.count({ where: { resourceId: projectId, action: "DELETE_PROJECT" } })).toBe(1)
  })
  it("reports committed deletion and pending cleanup when one file cannot be purged", async () => {
    const urls = ["first.pdf", "second.pdf"].map(name => `local:${session.companyId}/project/${projectId}/${name}`)
    await prisma.projectFile.createMany({ data: urls.map(url => ({ projectId, name: "Fictitious PDF", url })) })
    vi.mocked(removeLocalFile).mockRejectedValueOnce(new Error("Fictitious storage unavailable"))
    await expect(deleteProject(projectId, revision)).resolves.toMatchObject({ ok: true, pendingFileCount: 1 })
    expect(await prisma.project.count({ where: { id: projectId } })).toBe(0)
    expect(removeLocalFile).toHaveBeenCalledTimes(2)
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { resourceId: projectId, action: "DELETE_PROJECT_FILE_CLEANUP_FAILED" } })
    expect(audit.payload).toMatchObject({ companyId: session.companyId, files: [{ url: urls[0] }] })
  })
  for (const path of ["foreign-company", "foreign-project", "parent-path", "backslash", "unqualified"] as const) {
    it(`preserves the project and file when its storage reference is ${path}`, async () => {
      const key = `${session.companyId}/project/${projectId}/`
      const url = path === "foreign-company" ? `r2:${foreignCompanyId}/project/${projectId}/file.pdf`
        : path === "foreign-project" ? `local:${session.companyId}/project/another-project/file.pdf`
        : path === "parent-path" ? `local:${key}../file.pdf`
        : path === "backslash" ? `local:${key}..\\file.pdf` : `${key}file.pdf`
      const file = await prisma.projectFile.create({ data: { projectId, name: "Fictitious PDF", url } })
      const time = await prisma.timeEntry.create({ data: { projectId, durationSec: 60 } })
      await expect(deleteProject(projectId, revision)).rejects.toThrow("référence d’un fichier")
      expect(await prisma.projectFile.findUnique({ where: { id: file.id } })).not.toBeNull()
      expect(await prisma.timeEntry.findUnique({ where: { id: time.id } })).not.toBeNull()
      expect(await prisma.project.findUnique({ where: { id: projectId } })).not.toBeNull()
      expect(removeLocalFile).not.toHaveBeenCalled()
      expect(await prisma.auditLog.count({ where: { resourceId: projectId } })).toBe(0)
    })
  }
  it("preserves time when SQL refuses the project deletion", async () => {
    const time = await prisma.timeEntry.create({ data: { projectId, durationSec: 120 } })
    if (process.env.DATABASE_URL?.startsWith("file:")) {
      await prisma.$executeRawUnsafe(`CREATE TRIGGER "fictional_project_delete_failure" BEFORE DELETE ON "Project" WHEN OLD."id" = '${projectId}' BEGIN SELECT RAISE(ABORT, 'Fictitious project delete failure'); END`)
    } else {
      await prisma.$executeRawUnsafe(`CREATE FUNCTION fictional_project_delete_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD."id" = '${projectId}' THEN RAISE EXCEPTION 'Fictitious project delete failure'; END IF; RETURN OLD; END; $$`)
      await prisma.$executeRawUnsafe('CREATE TRIGGER "fictional_project_delete_failure" BEFORE DELETE ON "Project" FOR EACH ROW EXECUTE FUNCTION fictional_project_delete_failure()')
    }
    await expect(deleteProject(projectId, revision)).rejects.toThrow()
    expect(await prisma.timeEntry.findUnique({ where: { id: time.id } })).not.toBeNull()
    expect(await prisma.project.findUnique({ where: { id: projectId } })).not.toBeNull()
    expect(removeLocalFile).not.toHaveBeenCalled()
  })
  for (const operation of ["create", "update", "archive", "delete"] as const) {
    it(`rolls back ${operation} when its audit insertion is refused`, async () => {
      await failAudit()
      const before = await prisma.project.findMany({ where: { companyId: session.companyId } })
      const call = operation === "create" ? createProject(payload()) : operation === "update" ? updateProject(projectId, { ...payload(), name: "Changed fictitious name" }, revision) : operation === "archive" ? archiveProject(projectId, revision) : deleteProject(projectId, revision)
      await expect(call).rejects.toThrow()
      expect(await prisma.project.findMany({ where: { companyId: session.companyId } })).toEqual(before)
      expect(removeLocalFile).not.toHaveBeenCalled()
    })
  }
  for (const operation of ["update", "archive", "delete"] as const) {
    it(`refuses ${operation} on a project linked to a foreign client`, async () => {
      await prisma.project.update({ where: { id: projectId }, data: { clientId: foreignClientId } })
      const before = await prisma.project.findUniqueOrThrow({ where: { id: projectId } })
      await expect(operation === "update" ? updateProject(projectId, payload(), revision) : operation === "archive" ? archiveProject(projectId, revision) : deleteProject(projectId, revision)).rejects.toThrow("Projet introuvable")
      expect(await prisma.project.findUnique({ where: { id: projectId } })).toEqual(before)
      expect(await prisma.auditLog.count({ where: { userId: session.userId } })).toBe(0)
    })
  }
  for (const operation of ["create", "update", "archive", "delete"] as const) {
    it(`refuses ${operation} in the public read-only demo before business reads`, async () => {
      vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
      const projects = vi.spyOn(prisma.project, "findFirst"), clients = vi.spyOn(prisma.client, "findFirst")
      await expect(operation === "create" ? createProject(payload()) : operation === "update" ? updateProject(projectId, payload(), revision) : operation === "archive" ? archiveProject(projectId, revision) : deleteProject(projectId, revision)).rejects.toThrow("lecture seule")
      expect(projects).not.toHaveBeenCalled(); expect(clients).not.toHaveBeenCalled()
      expect(await prisma.auditLog.count({ where: { resourceId: projectId } })).toBe(0)
    })
    it(`denies ${operation} without Operations write before reading project data`, async () => {
      await prisma.membership.update({ where: { id: membershipId }, data: { role: "SERVICE" } })
      const projects = vi.spyOn(prisma.project, "findFirst"), clients = vi.spyOn(prisma.client, "findFirst")
      await expect(operation === "create" ? createProject(payload()) : operation === "update" ? updateProject(projectId, payload(), revision) : operation === "archive" ? archiveProject(projectId, revision) : deleteProject(projectId, revision)).rejects.toThrow()
      expect(projects).not.toHaveBeenCalled(); expect(clients).not.toHaveBeenCalled()
      expect(await prisma.project.count({ where: { id: projectId } })).toBe(1)
    })
  }
  it("preserves file metadata and time when the deletion audit fails", async () => {
    const file = await prisma.projectFile.create({ data: { projectId, name: "Fictitious PDF", url: `local:${session.companyId}/project/${projectId}/file.pdf` } })
    const time = await prisma.timeEntry.create({ data: { projectId, durationSec: 60 } })
    await failAudit()
    await expect(deleteProject(projectId, revision)).rejects.toThrow()
    expect(await prisma.projectFile.findUnique({ where: { id: file.id } })).not.toBeNull()
    expect(await prisma.timeEntry.findUnique({ where: { id: time.id } })).not.toBeNull()
    expect(removeLocalFile).not.toHaveBeenCalled()
  })
  it("keeps the original client when an invoice is already attached", async () => {
    await prisma.invoice.create({ data: { projectId, companyId: session.companyId, clientId, number: "FICTITIOUS-PROJECT", object: "Fictitious linked invoice", dueDate: new Date(), totalHtCents: 100, totalTvaCents: 20, totalTtcCents: 120 } })
    const otherClient = await prisma.client.create({ data: { companyId: session.companyId, name: "Fictitious replacement" } })
    await expect(updateProject(projectId, { ...payload(), clientId: otherClient.id }, revision)).rejects.toThrow("Conservez son client actuel")
    expect(await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).toMatchObject({ clientId })
    expect(await prisma.auditLog.count({ where: { resourceId: projectId } })).toBe(0)
  })
  it("rejects a foreign project template without repairing the historical relation", async () => {
    const template = await prisma.projectTemplate.create({ data: { companyId: foreignCompanyId, name: "Fictitious foreign template" } })
    await prisma.project.update({ where: { id: projectId }, data: { projectTemplateId: template.id } })
    await expect(updateProject(projectId, payload(), revision)).rejects.toThrow("Projet introuvable")
    expect(await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).toMatchObject({ projectTemplateId: template.id })
  })
  it("rolls back generated template milestones with the project when its audit fails", async () => {
    const template = await prisma.projectTemplate.create({ data: { companyId: session.companyId, name: "Fictitious two-step template", steps: { create: [{ title: "Fictitious first step", order: 0 }, { title: "Fictitious second step", order: 1 }] } } })
    await failAudit()
    await expect(createProject({ ...payload(), projectTemplateId: template.id })).rejects.toThrow()
    expect(await prisma.project.count({ where: { projectTemplateId: template.id } })).toBe(0)
    expect(await prisma.projectMilestone.count({ where: { templateStep: { templateId: template.id } } })).toBe(0)
  })
  it("cannot delete time already linked to an invoice outside the project's invoice relation", async () => {
    const invoice = await prisma.invoice.create({ data: { companyId: session.companyId, clientId, number: "FICTITIOUS-TIME", object: "Fictitious billed time", dueDate: new Date(), totalHtCents: 100, totalTvaCents: 20, totalTtcCents: 120 } })
    const time = await prisma.timeEntry.create({ data: { projectId, durationSec: 60, invoiceId: invoice.id } })
    await expect(deleteProject(projectId, revision)).rejects.toThrow()
    expect(await prisma.timeEntry.findUnique({ where: { id: time.id } })).not.toBeNull()
    expect(await prisma.invoice.findUnique({ where: { id: invoice.id } })).not.toBeNull()
  })
  it("cannot erase the only project reference of a stock reservation", async () => {
    const warehouse = await prisma.warehouse.create({ data: { companyId: session.companyId, name: "Fictitious lifecycle stock", code: "LIFE" } })
    const product = await prisma.product.create({ data: { companyId: session.companyId, sku: "LIFE", label: "Fictitious lifecycle material" } })
    const held = await prisma.stockReservation.create({ data: { companyId: session.companyId, projectId, warehouseId: warehouse.id, productId: product.id, quantity: 1 } })
    await expect(deleteProject(projectId, revision)).rejects.toThrow()
    expect(await prisma.stockReservation.findUniqueOrThrow({ where: { id: held.id } })).toMatchObject({ projectId, status: "ACTIVE" })
  })
  it("archives a coherent project with an audit without deleting its time", async () => {
    const time = await prisma.timeEntry.create({ data: { projectId, durationSec: 60 } })
    await archiveProject(projectId, revision)
    expect(await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).toMatchObject({ status: "ARCHIVED" })
    expect(await prisma.timeEntry.findUnique({ where: { id: time.id } })).not.toBeNull()
    expect(await prisma.auditLog.count({ where: { resourceId: projectId, action: "ARCHIVE_PROJECT" } })).toBe(1)
    revision = (await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).updatedAt.toISOString()
    await archiveProject(projectId, revision)
    expect(await prisma.auditLog.count({ where: { resourceId: projectId, action: "ARCHIVE_PROJECT" } })).toBe(1)
  })
  it("advances the revision after a valid update and rejects reusing its old form", async () => {
    const updated = await updateProject(projectId, { ...payload(), name: "Fictitious valid edit" }, revision)
    expect(updated.updatedAt.getTime()).toBeGreaterThan(new Date(revision).getTime())
    await expect(updateProject(projectId, { ...payload(), name: "Fictitious overwritten edit" }, revision)).rejects.toThrow("Le chantier a changé")
    expect(await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).toMatchObject({ name: updated.name })
    expect(await prisma.auditLog.count({ where: { resourceId: projectId, action: "UPDATE_PROJECT" } })).toBe(1)
  })
  for (const operation of ["update", "archive", "delete"] as const) {
    it(`refuses ${operation} from an outdated project revision`, async () => {
      const original = await prisma.project.findUniqueOrThrow({ where: { id: projectId } })
      const current = await prisma.project.update({ where: { id: projectId }, data: { name: "Fictitious concurrent edit", updatedAt: new Date(original.updatedAt.getTime() + 1000) } })
      const version = original.updatedAt.toISOString()
      await expect(operation === "update" ? updateProject(projectId, payload(), version) : operation === "archive" ? archiveProject(projectId, version) : deleteProject(projectId, version)).rejects.toThrow("Le chantier a changé")
      expect(await prisma.project.findUnique({ where: { id: projectId } })).toEqual(current)
      expect(await prisma.auditLog.count({ where: { resourceId: projectId } })).toBe(0)
    })
    it(`rejects ${operation} without a valid displayed revision`, async () => {
      await expect(operation === "update" ? updateProject(projectId, payload(), "") : operation === "archive" ? archiveProject(projectId, "") : deleteProject(projectId, "")).rejects.toThrow("Le chantier a changé")
      expect(await prisma.project.count({ where: { id: projectId } })).toBe(1)
      expect(await prisma.auditLog.count({ where: { resourceId: projectId } })).toBe(0)
    })
  }
})
