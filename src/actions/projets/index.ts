"use server"

import prisma from "@/lib/prisma"
import { withAuth } from "@/lib/auth-wrapper"
import { logAction } from "@/lib/audit"
import { revalidatePath } from "next/cache"
import { ProjectAcceptanceSchema, ProjectMilestoneSchema, ProjectSchema, ProjectTemplateSchema, ProjectTechnicalProfileSchema } from "@/lib/validations"
import { removeLocalFile } from "@/lib/local-files"
import { boundedPageSize } from "@/lib/pagination"
import { hasPermission } from "@/lib/permissions"
import { clientWithAccessibleMetrics } from "@/lib/client-metrics-access"
import type { TransactionClient } from "@/lib/prisma"
import type { AuthContext } from "@/lib/auth-wrapper"
import { operationsDashboardScope } from "@/lib/operations/dashboard-scope"
import { z } from "zod"
import { calendarDayKey } from "@/lib/calendar-days"
import { Prisma } from "@/generated/prisma/client"

const PROJECT_CHANGED_MESSAGE = "Le chantier a changé. Rechargez la page puis réessayez ; votre saisie est conservée."
const TEMPLATE_CHANGED_MESSAGE = "Le modèle de chantier a changé. Rechargez la page puis réessayez ; votre saisie est conservée."

async function lockWorkspaceProject(tx: TransactionClient, context: AuthContext, id: string) {
  const project = await tx.project.findFirst({ where: { id, ...operationsDashboardScope(context.companyId, context.agencyIds).project },
    include: { site: { select: { clientId: true } }, projectTemplate: { select: { companyId: true } } } })
  if (!project || project.site && project.site.clientId !== project.clientId || project.projectTemplate && project.projectTemplate.companyId !== context.companyId) throw new Error("Projet introuvable")
  // Serialize changes to a project's dependency graph through its parent row.
  const claimed = await tx.project.updateMany({ where: { id, companyId: context.companyId, updatedAt: project.updatedAt }, data: { updatedAt: project.updatedAt } })
  if (claimed.count !== 1) throw new Error(PROJECT_CHANGED_MESSAGE)
  return project
}

function assertWorkspaceRevision(current: Date | null, expected: string | null, message = PROJECT_CHANGED_MESSAGE) {
  if (current === null && expected === null) return
  const parsed = typeof expected === "string" ? new Date(expected) : new Date(NaN)
  if (!current || !Number.isFinite(parsed.getTime()) || current.getTime() !== parsed.getTime()) throw new Error(message)
}

async function mutationProject(tx: TransactionClient, context: AuthContext, id: string, expectedUpdatedAt: string) {
  const project = await lockWorkspaceProject(tx, context, id)
  assertWorkspaceRevision(project.updatedAt, expectedUpdatedAt)
  return project
}

const nextProjectRevision = (previous: Date) => new Date(Math.max(Date.now(), previous.getTime() + 1))

function ownsProjectFile(url: string, companyId: string, projectId: string) {
  if (![companyId, projectId].every(id => /^[a-zA-Z0-9_-]+$/.test(id))) return false
  const prefix = `${companyId}/project/${projectId}/`
  const key = url.startsWith("local:") ? url.slice(6) : url.startsWith("r2:") ? url.slice(3) : ""
  if (!key.startsWith(prefix)) return false
  const name = key.slice(prefix.length)
  return Boolean(name && name !== "." && name !== ".." && !/[\\/\u0000:]/.test(name))
}

async function assertProjectMilestoneDependants(tx: TransactionClient, projectId: string, milestoneId?: string) {
  // Only inspect an aggregate: a cascading SET NULL must not alter another tenant.
  const [external] = await tx.$queryRaw<Array<{ total: number | bigint }>>(Prisma.sql`
    SELECT COUNT(*) AS total FROM "ProjectMilestone" AS dependant
    JOIN "ProjectMilestone" AS prerequisite ON dependant."dependsOnId" = prerequisite.id
    WHERE prerequisite."projectId" = ${projectId} AND dependant."projectId" <> ${projectId}
    ${milestoneId ? Prisma.sql`AND prerequisite.id = ${milestoneId}` : Prisma.empty}
  `)
  if (Number(external.total) > 0) throw new Error("Les références de ce chantier nécessitent une vérification.")
}

function atNoon(value: string | undefined) {
  return value ? new Date(`${value}T12:00:00.000Z`) : null
}

function addCalendarDays(value: Date, days: number) {
  const result = new Date(value)
  result.setUTCDate(result.getUTCDate() + days)
  return result
}

export async function getProjects(cursor?: string, limit: number = 20) {
  return await withAuth(async ({ companyId, role, agencyIds }) => {
    const pageSize = boundedPageSize(limit, 20, 100)
    const projects = await prisma.project.findMany({
      where: { ...operationsDashboardScope(companyId, agencyIds).project,
        OR: [{ projectTemplateId: null }, { projectTemplate: { companyId } }] },
      take: pageSize,
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      include: { client: true, agency: { select: { id: true, name: true, code: true } }, projectTemplate: { select: { id: true, name: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    })
    return projects.map(project => ({ ...project, client: clientWithAccessibleMetrics(project.client, { role, agencyIds }) }))
  }, "operations.read")
}

export async function getProjectTemplates() {
  return withAuth(async ({ companyId, agencyIds }) => {
    const templates = await prisma.projectTemplate.findMany({
      where: { companyId },
      include: {
        steps: { orderBy: [{ order: "asc" }, { id: "asc" }] },
        _count: { select: { projects: { where: {
          companyId, client: { companyId },
          ...(agencyIds === null ? {} : { agencyId: { in: agencyIds } }),
          OR: [{ agencyId: null }, { agency: { companyId } }],
        } } } },
      },
      orderBy: [{ active: "desc" }, { name: "asc" }],
    })
    return templates.map(template => {
      const steps = new Map(template.steps.map(step => [step.id, step]))
      return { ...template, steps: template.steps.map(step => {
        const dependency = step.dependsOnStepId ? steps.get(step.dependsOnStepId) : undefined
        return { ...step, dependsOnStepId: dependency?.id ?? null,
          dependsOnStep: dependency ? { id: dependency.id, title: dependency.title } : null,
          dependencyUnavailable: Boolean(step.dependsOnStepId && !dependency) }
      }) }
    })
  }, "operations.read")
}

export async function getProjectById(id: string) {
  return await withAuth(async ({ companyId, role, agencyIds }) => {
    const canReadSales = hasPermission(role, "sales.read")
    const canReadFinance = hasPermission(role, "finance.read")
    const documentScope = { companyId, client: { companyId } }
    const [project, planningMembers] = await Promise.all([
      prisma.project.findFirst({
        where: {
          id, ...operationsDashboardScope(companyId, agencyIds).project,
          OR: [{ projectTemplateId: null }, { projectTemplate: { companyId } }],
        },
        include: {
          client: true,
          site: { select: { clientId: true } },
          projectTemplate: { select: { id: true, name: true } },
          milestones: {
            include: {
              dependsOn: { where: { projectId: id }, select: { id: true, title: true, status: true } },
              assignedMembership: { where: { companyId }, select: { id: true, user: { select: { name: true, email: true } } } },
              templateStep: { where: { template: { companyId } }, select: { id: true } },
            },
            orderBy: [{ order: "asc" }, { dueDate: "asc" }],
          },
          files: true,
          timeEntries: { orderBy: { date: "desc" }, take: 20 },
          quotes: { where: { ...documentScope, ...(canReadSales ? {} : { id: { in: [] } }) }, orderBy: { createdAt: "desc" }, take: 10 },
          invoices: { where: { ...documentScope, ...(canReadFinance ? {} : { id: { in: [] } }) }, orderBy: { createdAt: "desc" }, take: 10 },
          expenses: { where: { companyId, ...(canReadFinance ? {} : { id: { in: [] } }) }, orderBy: { date: "desc" } },
          technicalProfile: true,
          acceptanceItems: { orderBy: { createdAt: "asc" } },
        },
      }),
      prisma.membership.findMany({ where: { companyId, status: "ACTIVE" }, include: { user: { select: { name: true, email: true } } }, orderBy: { createdAt: "asc" } }),
    ])
    if (!project) return null
    const { site, ...visible } = project
    if (site && site.clientId !== project.clientId) return null
    const milestones = project.milestones.map(item => {
      const { templateStepId, templateStep, ...milestone } = item
      return {
        ...milestone,
        dependencyUnavailable: Boolean(item.dependsOnId && !item.dependsOn),
        assigneeUnavailable: Boolean(item.assignedMembershipId && !item.assignedMembership),
        templateUnavailable: Boolean(templateStepId && !templateStep),
        dependsOnId: item.dependsOn?.id ?? null,
        assignedMembershipId: item.assignedMembership?.id ?? null,
      }
    })
    return { ...visible, milestones, client: clientWithAccessibleMetrics(project.client, { role, agencyIds }), planningMembers, access: { sales: canReadSales, finance: canReadFinance, operationsWrite: hasPermission(role, "operations.write") } }
  }, "operations.read")
}

export async function createProjectTemplate(input: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    const data = ProjectTemplateSchema.parse(input)
    data.steps.forEach((step, index) => {
      if (step.dependsOnIndex >= index) throw new Error("Une étape ne peut dépendre que d’une étape précédente")
    })
    const template = await prisma.$transaction(async (tx) => {
      const created = await tx.projectTemplate.create({
        data: {
          companyId,
          name: data.name,
          description: data.description || null,
          worksiteType: data.worksiteType || null,
          defaultBudgetCents: data.defaultBudgetCents,
          defaultDurationDays: data.defaultDurationDays,
        },
      })
      const stepIds: string[] = []
      for (const [order, step] of data.steps.entries()) {
        const createdStep = await tx.projectTemplateStep.create({
          data: {
            templateId: created.id,
            title: step.title,
            description: step.description || null,
            kind: step.kind,
            offsetDays: step.offsetDays,
            durationDays: step.durationDays,
            order,
            dependsOnStepId: step.dependsOnIndex >= 0 ? stepIds[step.dependsOnIndex] : null,
          },
        })
        stepIds.push(createdStep.id)
      }
      await tx.auditLog.create({ data: { userId, action: "CREATE_PROJECT_TEMPLATE", resource: "PROJECT_TEMPLATE",
        resourceId: created.id, payload: { name: created.name, stepCount: data.steps.length } } })
      return created
    }, { isolationLevel: "Serializable" })
    revalidatePath("/dashboard/projets")
    return { success: true as const, id: template.id }
  }, "operations.write")
}

export async function setProjectTemplateActive(templateId: string, active: boolean, expectedUpdatedAt: string) {
  return withAuth(async ({ companyId, userId }) => {
    const target = z.boolean().parse(active)
    await prisma.$transaction(async tx => {
      const template = await tx.projectTemplate.findFirst({ where: { id: templateId, companyId }, select: { id: true, active: true, updatedAt: true } })
      if (!template) throw new Error("Modèle de chantier introuvable")
      assertWorkspaceRevision(template.updatedAt, expectedUpdatedAt, TEMPLATE_CHANGED_MESSAGE)
      if (template.active === target) return
      const changed = await tx.projectTemplate.updateMany({ where: { id: template.id, companyId, updatedAt: template.updatedAt, active: template.active },
        data: { active: target, updatedAt: nextProjectRevision(template.updatedAt) } })
      if (changed.count !== 1) throw new Error(TEMPLATE_CHANGED_MESSAGE)
      await tx.auditLog.create({ data: { userId, action: "UPDATE_PROJECT_TEMPLATE_STATUS", resource: "PROJECT_TEMPLATE", resourceId: template.id,
        payload: { active: target, previousActive: template.active, previousUpdatedAt: template.updatedAt.toISOString() } } })
    }, { isolationLevel: "Serializable" })
    revalidatePath("/dashboard/projets")
    return { success: true as const }
  }, "operations.write")
}

export async function createProject(data: unknown) {
  return withAuth(async context => {
    const { companyId, userId } = context
    const validated = ProjectSchema.parse(data)
    const project = await prisma.$transaction(async tx => {
      const [client, agency, template] = await Promise.all([
        tx.client.findFirst({ where: { id: validated.clientId, companyId }, select: { id: true } }),
        validated.agencyId
          ? tx.agency.findFirst({ where: { id: validated.agencyId, companyId, active: true }, select: { id: true } })
          : tx.agency.findFirst({ where: { companyId, isDefault: true, active: true }, select: { id: true } }),
        validated.projectTemplateId
          ? tx.projectTemplate.findFirst({ where: { id: validated.projectTemplateId, companyId, active: true }, include: { steps: { orderBy: [{ order: "asc" }, { id: "asc" }] } } })
          : null,
      ])
      if (!client) throw new Error("Client introuvable")
      if (validated.agencyId && !agency) throw new Error("Agence introuvable ou inactive")
      if (validated.projectTemplateId && !template) throw new Error("Modèle de chantier introuvable ou inactif")
      if (template) {
        const previousSteps = new Map<string, number>()
        for (const step of template.steps) {
          if (step.dependsOnStepId && (!previousSteps.has(step.dependsOnStepId) || previousSteps.get(step.dependsOnStepId)! >= step.order)) {
            throw new Error("Les étapes de ce modèle de chantier nécessitent une vérification.")
          }
          previousSteps.set(step.id, step.order)
        }
      }
      const requestedStartDate = atNoon(validated.startDate || undefined)
      const company = template && !requestedStartDate ? await tx.company.findUniqueOrThrow({ where: { id: companyId }, select: { serviceTimezone: true } }) : null
      const startDate = requestedStartDate || (company ? atNoon(calendarDayKey(new Date(), company.serviceTimezone)) : null)
      const endDate = atNoon(validated.endDate || undefined) || (startDate && template?.defaultDurationDays ? addCalendarDays(startDate, template.defaultDurationDays) : null)
      const created = await tx.project.create({ data: {
        companyId, clientId: validated.clientId, agencyId: agency?.id || null, projectTemplateId: template?.id || null,
        name: validated.name, description: validated.description || null, status: validated.status || "ACTIVE",
        worksiteType: validated.worksiteType || template?.worksiteType || null, budgetCents: validated.budgetCents, startDate, endDate,
      } })
      if (template?.steps.length) {
        const milestoneIds = new Map<string, string>()
        for (const step of template.steps) {
          const plannedStartAt = addCalendarDays(startDate || new Date(), step.offsetDays)
          const milestone = await tx.projectMilestone.create({ data: { projectId: created.id, templateStepId: step.id, title: step.title,
            description: step.description, kind: step.kind, plannedStartAt, dueDate: addCalendarDays(plannedStartAt, step.durationDays),
            durationDays: step.durationDays, order: step.order, dependsOnId: step.dependsOnStepId ? milestoneIds.get(step.dependsOnStepId) || null : null } })
          milestoneIds.set(step.id, milestone.id)
        }
      }
      await tx.auditLog.create({ data: { userId, action: "CREATE_PROJECT", resource: "PROJECT", resourceId: created.id, payload: { name: created.name } } })
      return created
    }, { isolationLevel: "Serializable" })
    revalidatePath("/dashboard/projets")
    return project
  }, "operations.write")
}

export async function updateProject(id: string, data: unknown, expectedUpdatedAt: string) {
  return withAuth(async context => {
    const { companyId, userId } = context
    const validated = ProjectSchema.parse(data)
    const project = await prisma.$transaction(async tx => {
      const existing = await mutationProject(tx, context, id, expectedUpdatedAt)
      if (!await tx.client.findFirst({ where: { id: validated.clientId, companyId }, select: { id: true } })) throw new Error("Client introuvable")
      if (existing.site && existing.site.clientId !== validated.clientId) throw new Error("Le site du chantier appartient à un autre client. Conservez son client actuel.")
      if (validated.agencyId && !await tx.agency.findFirst({ where: { id: validated.agencyId, companyId, active: true }, select: { id: true } })) throw new Error("Agence introuvable ou inactive")
      if (validated.projectTemplateId && !await tx.projectTemplate.findFirst({ where: { id: validated.projectTemplateId, companyId }, select: { id: true } })) throw new Error("Modèle de chantier introuvable")
      if (validated.clientId !== existing.clientId) {
        const linked = await tx.project.findUniqueOrThrow({ where: { id }, select: { _count: { select: { quotes: true, invoices: true, customerOrders: true, recurringInvoices: true, interventions: true, expenses: true } } } })
        if (Object.values(linked._count).some(count => count > 0) || await tx.timeEntry.count({ where: { projectId: id, invoiceId: { not: null } } })) throw new Error("Ce chantier possède des documents ou opérations liés. Conservez son client actuel.")
      }
      const updated = await tx.project.update({ where: { id }, data: {
        clientId: validated.clientId, agencyId: validated.agencyId || existing.agencyId, projectTemplateId: validated.projectTemplateId || null,
        name: validated.name, description: validated.description || null, status: validated.status, worksiteType: validated.worksiteType || null,
        budgetCents: validated.budgetCents, startDate: atNoon(validated.startDate || undefined), endDate: atNoon(validated.endDate || undefined), updatedAt: nextProjectRevision(existing.updatedAt),
      } })
      await tx.auditLog.create({ data: { userId, action: "UPDATE_PROJECT", resource: "PROJECT", resourceId: id, payload: { name: updated.name } } })
      return updated
    }, { isolationLevel: "Serializable" })
    revalidatePath("/dashboard/projets"); revalidatePath("/dashboard/projets/" + id)
    return project
  }, "operations.write")
}

export async function deleteProject(id: string, expectedUpdatedAt: string) {
  return withAuth(async context => {
    const { companyId, userId } = context
    const files = await prisma.$transaction(async tx => {
      const existing = await mutationProject(tx, context, id, expectedUpdatedAt)
      const relations = await tx.project.findUniqueOrThrow({ where: { id }, select: {
        _count: { select: { invoices: true, quotes: true, customerOrders: true, purchaseOrders: true, stockReservations: true, stockMovements: true,
          deliveryNotes: true, recurringInvoices: true, interventions: true, expenses: true, organisationTasks: true } },
        files: { select: { id: true, name: true, url: true, size: true, type: true, sha256: true } },
      } })
      if (Object.values(relations._count).some(count => count > 0) || await tx.timeEntry.count({ where: { projectId: id, invoiceId: { not: null } } })) throw new Error("Ce chantier possède des documents ou opérations liés. Archivez-le plutôt.")
      await assertProjectMilestoneDependants(tx, id)
      if (relations.files.some(file => !ownsProjectFile(file.url, companyId, id))) throw new Error("La référence d’un fichier du chantier est incohérente. Sa suppression nécessite une vérification.")
      await tx.projectFile.deleteMany({ where: { projectId: id } })
      await tx.timeEntry.deleteMany({ where: { projectId: id, invoiceId: null } })
      await tx.project.delete({ where: { id } })
      await tx.auditLog.create({ data: { userId, action: "DELETE_PROJECT", resource: "PROJECT", resourceId: id, payload: { companyId, name: existing.name, files: relations.files } } })
      return relations.files
    }, { isolationLevel: "Serializable" })
    const cleanup = await Promise.allSettled(files.map(file => removeLocalFile(file.url)))
    const pendingFiles = files.filter((_, index) => cleanup[index].status === "rejected")
    if (pendingFiles.length) await logAction({ userId, action: "DELETE_PROJECT_FILE_CLEANUP_FAILED", resource: "PROJECT", resourceId: id, payload: { companyId, files: pendingFiles } })
    revalidatePath("/dashboard/projets")
    return { ok: true, pendingFileCount: pendingFiles.length }
  }, "operations.write")
}

export async function archiveProject(id: string, expectedUpdatedAt: string) {
  return withAuth(async context => {
    await prisma.$transaction(async tx => {
      const existing = await mutationProject(tx, context, id, expectedUpdatedAt)
      if (existing.status === "ARCHIVED") return
      await tx.project.update({ where: { id }, data: { status: "ARCHIVED", updatedAt: nextProjectRevision(existing.updatedAt) } })
      await tx.auditLog.create({ data: { userId: context.userId, action: "ARCHIVE_PROJECT", resource: "PROJECT", resourceId: id, payload: { name: existing.name, previousStatus: existing.status } } })
    }, { isolationLevel: "Serializable" })
    revalidatePath("/dashboard/projets"); revalidatePath("/dashboard/projets/" + id)
    return { ok: true }
  }, "operations.write")
}


async function workspaceMilestone(tx: TransactionClient, context: AuthContext, id: string, expectedUpdatedAt: string) {
  const milestone = await tx.projectMilestone.findFirst({
    where: { id, project: operationsDashboardScope(context.companyId, context.agencyIds).project },
  })
  if (!milestone) throw new Error("Jalon introuvable")
  assertWorkspaceRevision(milestone.updatedAt, expectedUpdatedAt)
  await lockWorkspaceProject(tx, context, milestone.projectId)
  await validateMilestonePlanning(tx, context, milestone.projectId, { dependsOnId: milestone.dependsOnId || undefined }, id)
  const [assignee, templateStep] = await Promise.all([
    milestone.assignedMembershipId ? tx.membership.findFirst({ where: { id: milestone.assignedMembershipId, companyId: context.companyId }, select: { id: true } }) : null,
    milestone.templateStepId ? tx.projectTemplateStep.findFirst({ where: { id: milestone.templateStepId, template: { companyId: context.companyId } }, select: { id: true } }) : null,
  ])
  if (milestone.assignedMembershipId && !assignee || milestone.templateStepId && !templateStep) throw new Error("Les références de ce jalon nécessitent une vérification.")
  return milestone
}

async function validateMilestonePlanning(tx: TransactionClient, context: AuthContext, projectId: string, data: { dependsOnId?: string; assignedMembershipId?: string }, milestoneId?: string) {
  if (data.assignedMembershipId && !await tx.membership.findFirst({ where: { id: data.assignedMembershipId, companyId: context.companyId, status: "ACTIVE" }, select: { id: true } })) throw new Error("Responsable introuvable")
  const visited = new Set(milestoneId ? [milestoneId] : [])
  let cursor = data.dependsOnId || null
  while (cursor) {
    if (visited.has(cursor)) throw new Error("Cette dépendance créerait une boucle")
    visited.add(cursor)
    const dependency = await tx.projectMilestone.findFirst({
      where: { id: cursor, projectId, AND: [
        { OR: [{ assignedMembershipId: null }, { assignedMembership: { companyId: context.companyId } }] },
        { OR: [{ templateStepId: null }, { templateStep: { template: { companyId: context.companyId } } }] },
      ] },
      select: { dependsOnId: true },
    })
    if (!dependency) throw new Error("Dépendance introuvable dans ce chantier")
    cursor = dependency.dependsOnId
  }
}

async function workspaceAcceptance(tx: TransactionClient, context: AuthContext, id: string, expectedUpdatedAt: string) {
  const item = await tx.projectAcceptanceItem.findFirst({
    where: { id, project: operationsDashboardScope(context.companyId, context.agencyIds).project },
  })
  if (!item) throw new Error("Élément de recette introuvable")
  assertWorkspaceRevision(item.updatedAt, expectedUpdatedAt)
  await lockWorkspaceProject(tx, context, item.projectId)
  return item
}

export async function createProjectMilestone(projectId: string, input: unknown) {
  return withAuth(async context => {
    const data = ProjectMilestoneSchema.parse(input)
    const milestone = await prisma.$transaction(async tx => {
      await lockWorkspaceProject(tx, context, projectId)
      await validateMilestonePlanning(tx, context, projectId, data)
      const position = await tx.projectMilestone.aggregate({ where: { projectId }, _max: { order: true } })
      const created = await tx.projectMilestone.create({ data: {
        projectId, title: data.title, description: data.description || null, kind: data.kind,
        plannedStartAt: atNoon(data.plannedStartAt), dueDate: atNoon(data.dueDate), durationDays: data.durationDays,
        dependsOnId: data.dependsOnId || null, assignedMembershipId: data.assignedMembershipId || null,
        order: (position._max.order ?? -1) + 1,
      } })
      await tx.auditLog.create({ data: {
        userId: context.userId, action: "CREATE_PROJECT_MILESTONE", resource: "PROJECT_MILESTONE", resourceId: created.id,
        payload: { projectId, title: created.title, dependsOnId: created.dependsOnId, assignedMembershipId: created.assignedMembershipId },
      } })
      return created
    }, { isolationLevel: "Serializable" })
    revalidatePath(`/dashboard/projets/${projectId}`)
    return milestone
  }, "operations.write")
}

export async function updateProjectMilestoneStatus(id: string, status: "PENDING" | "IN_PROGRESS" | "DONE", expectedUpdatedAt: string) {
  return withAuth(async context => {
    const nextStatus = z.enum(["PENDING", "IN_PROGRESS", "DONE"]).parse(status)
    const result = await prisma.$transaction(async tx => {
      const milestone = await workspaceMilestone(tx, context, id, expectedUpdatedAt)
      if (nextStatus !== "PENDING" && milestone.dependsOnId) {
        const dependency = await tx.projectMilestone.findFirstOrThrow({ where: { id: milestone.dependsOnId, projectId: milestone.projectId }, select: { status: true, title: true } })
        if (dependency.status !== "DONE") return { success: false as const, error: `Terminez d’abord « ${dependency.title} »`, projectId: milestone.projectId }
      }
      if (milestone.status === nextStatus) return { success: true as const, milestone, projectId: milestone.projectId }
      const updated = await tx.projectMilestone.update({
        where: { id, projectId: milestone.projectId, updatedAt: milestone.updatedAt },
        data: { status: nextStatus, updatedAt: nextProjectRevision(milestone.updatedAt) },
      })
      await tx.auditLog.create({ data: {
        userId: context.userId, action: "UPDATE_PROJECT_MILESTONE_STATUS", resource: "PROJECT_MILESTONE", resourceId: id,
        payload: { projectId: milestone.projectId, previousStatus: milestone.status, status: nextStatus },
      } })
      return { success: true as const, milestone: updated, projectId: milestone.projectId }
    }, { isolationLevel: "Serializable" })
    revalidatePath(`/dashboard/projets/${result.projectId}`)
    return result
  }, "operations.write")
}

export async function updateProjectMilestonePlanning(id: string, input: unknown, expectedUpdatedAt: string) {
  return withAuth(async context => {
    const data = ProjectMilestoneSchema.pick({ plannedStartAt: true, dueDate: true, durationDays: true, dependsOnId: true, assignedMembershipId: true }).parse(input)
    const projectId = await prisma.$transaction(async tx => {
      const milestone = await workspaceMilestone(tx, context, id, expectedUpdatedAt)
      await validateMilestonePlanning(tx, context, milestone.projectId, data, id)
      await tx.projectMilestone.update({
        where: { id, projectId: milestone.projectId, updatedAt: milestone.updatedAt },
        data: {
          plannedStartAt: atNoon(data.plannedStartAt), dueDate: atNoon(data.dueDate), durationDays: data.durationDays,
          dependsOnId: data.dependsOnId || null, assignedMembershipId: data.assignedMembershipId || null,
          updatedAt: nextProjectRevision(milestone.updatedAt),
        },
      })
      await tx.auditLog.create({ data: {
        userId: context.userId, action: "UPDATE_PROJECT_MILESTONE_PLAN", resource: "PROJECT_MILESTONE", resourceId: id,
        payload: { projectId: milestone.projectId, ...data },
      } })
      return milestone.projectId
    }, { isolationLevel: "Serializable" })
    revalidatePath(`/dashboard/projets/${projectId}`)
    return { success: true as const }
  }, "operations.write")
}

export async function deleteProjectMilestone(id: string, expectedUpdatedAt: string) {
  return withAuth(async context => {
    const projectId = await prisma.$transaction(async tx => {
      const milestone = await workspaceMilestone(tx, context, id, expectedUpdatedAt)
      await assertProjectMilestoneDependants(tx, milestone.projectId, id)
      const dependants = await tx.projectMilestone.findMany({ where: { dependsOnId: id, projectId: milestone.projectId }, select: { id: true, updatedAt: true } })
      for (const dependant of dependants) {
        const detached = await tx.projectMilestone.updateMany({
          where: { id: dependant.id, projectId: milestone.projectId, dependsOnId: id, updatedAt: dependant.updatedAt },
          data: { dependsOnId: null, updatedAt: nextProjectRevision(dependant.updatedAt) },
        })
        if (detached.count !== 1) throw new Error(PROJECT_CHANGED_MESSAGE)
      }
      await tx.projectMilestone.delete({ where: { id, projectId: milestone.projectId, updatedAt: milestone.updatedAt } })
      await tx.auditLog.create({ data: {
        userId: context.userId, action: "DELETE_PROJECT_MILESTONE", resource: "PROJECT_MILESTONE", resourceId: id,
        payload: { projectId: milestone.projectId, title: milestone.title, status: milestone.status, detachedMilestoneIds: dependants.map(item => item.id) },
      } })
      return milestone.projectId
    }, { isolationLevel: "Serializable" })
    revalidatePath(`/dashboard/projets/${projectId}`)
    return { ok: true }
  }, "operations.write")
}

export async function createProjectAcceptanceItem(projectId: string, input: unknown) {
  return withAuth(async context => {
    const data = ProjectAcceptanceSchema.parse(input)
    const item = await prisma.$transaction(async tx => {
      await lockWorkspaceProject(tx, context, projectId)
      const created = await tx.projectAcceptanceItem.create({ data: { projectId, title: data.title, dueDate: atNoon(data.dueDate) } })
      await tx.auditLog.create({ data: {
        userId: context.userId, action: "CREATE_PROJECT_ACCEPTANCE", resource: "PROJECT_ACCEPTANCE", resourceId: created.id,
        payload: { projectId, title: created.title },
      } })
      return created
    }, { isolationLevel: "Serializable" })
    revalidatePath(`/dashboard/projets/${projectId}`)
    return item
  }, "operations.write")
}

export async function updateProjectAcceptanceStatus(id: string, status: "TODO" | "DONE" | "REJECTED", expectedUpdatedAt: string) {
  return withAuth(async context => {
    const nextStatus = z.enum(["TODO", "DONE", "REJECTED"]).parse(status)
    const item = await prisma.$transaction(async tx => {
      const existing = await workspaceAcceptance(tx, context, id, expectedUpdatedAt)
      if (existing.status === nextStatus) return existing
      const updated = await tx.projectAcceptanceItem.update({
        where: { id, projectId: existing.projectId, updatedAt: existing.updatedAt },
        data: { status: nextStatus, updatedAt: nextProjectRevision(existing.updatedAt) },
      })
      await tx.auditLog.create({ data: {
        userId: context.userId, action: "UPDATE_PROJECT_ACCEPTANCE_STATUS", resource: "PROJECT_ACCEPTANCE", resourceId: id,
        payload: { projectId: existing.projectId, previousStatus: existing.status, status: nextStatus },
      } })
      return updated
    }, { isolationLevel: "Serializable" })
    revalidatePath(`/dashboard/projets/${item.projectId}`)
    return item
  }, "operations.write")
}

export async function deleteProjectAcceptanceItem(id: string, expectedUpdatedAt: string) {
  return withAuth(async context => {
    const projectId = await prisma.$transaction(async tx => {
      const item = await workspaceAcceptance(tx, context, id, expectedUpdatedAt)
      await tx.projectAcceptanceItem.delete({ where: { id, projectId: item.projectId, updatedAt: item.updatedAt } })
      await tx.auditLog.create({ data: {
        userId: context.userId, action: "DELETE_PROJECT_ACCEPTANCE", resource: "PROJECT_ACCEPTANCE", resourceId: id,
        payload: { projectId: item.projectId, title: item.title, status: item.status },
      } })
      return item.projectId
    }, { isolationLevel: "Serializable" })
    revalidatePath(`/dashboard/projets/${projectId}`)
    return { ok: true }
  }, "operations.write")
}

export async function upsertProjectTechnicalProfile(projectId: string, input: unknown, expectedUpdatedAt: string | null) {
  return withAuth(async context => {
    const data = ProjectTechnicalProfileSchema.parse(input)
    const measuredNumber = (value: number | "" | undefined) => value === "" || value === undefined ? null : value
    const payload = {
      surveyStatus: data.surveyStatus, surveyedAt: atNoon(data.surveyedAt), surveyedBy: data.surveyedBy || null,
      poolShape: data.poolShape || null, poolLengthMm: measuredNumber(data.poolLengthMm), poolWidthMm: measuredNumber(data.poolWidthMm),
      poolDepthMm: measuredNumber(data.poolDepthMm), diagonal1Mm: measuredNumber(data.diagonal1Mm), diagonal2Mm: measuredNumber(data.diagonal2Mm),
      copingType: data.copingType || null, deckMaterial: data.deckMaterial || null, accessWidthMm: measuredNumber(data.accessWidthMm),
      powerSupply: data.powerSupply || null, obstacles: data.obstacles || null, installationConstraints: data.installationConstraints || null,
      recommendedProduct: data.recommendedProduct || null, coverModel: data.coverModel || null, coverColor: data.coverColor || null,
      measurementNotes: data.measurementNotes || null, validationNotes: data.validationNotes || null,
      validatedAt: data.surveyStatus === "VALIDATED" ? new Date() : null,
    }
    const profile = await prisma.$transaction(async tx => {
      await lockWorkspaceProject(tx, context, projectId)
      const existing = await tx.projectTechnicalProfile.findUnique({ where: { projectId } })
      assertWorkspaceRevision(existing?.updatedAt ?? null, expectedUpdatedAt)
      const saved = existing
        ? await tx.projectTechnicalProfile.update({ where: { projectId, updatedAt: existing.updatedAt }, data: { ...payload, updatedAt: nextProjectRevision(existing.updatedAt) } })
        : await tx.projectTechnicalProfile.create({ data: { projectId, ...payload } })
      await tx.auditLog.create({ data: {
        userId: context.userId, action: "UPDATE_PROJECT_TECHNICAL_PROFILE", resource: "PROJECT", resourceId: projectId,
        payload: { surveyStatus: saved.surveyStatus, surveyedAt: saved.surveyedAt?.toISOString() ?? null },
      } })
      return saved
    }, { isolationLevel: "Serializable" })
    revalidatePath(`/dashboard/projets/${projectId}`)
    return profile
  }, "operations.write")
}
