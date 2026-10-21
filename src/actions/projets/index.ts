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

async function mutationProject(tx: TransactionClient, context: AuthContext, id: string) {
  const project = await tx.project.findFirst({ where: { id, ...operationsDashboardScope(context.companyId, context.agencyIds).project },
    include: { site: { select: { clientId: true } }, projectTemplate: { select: { companyId: true } } } })
  if (!project || project.site && project.site.clientId !== project.clientId || project.projectTemplate && project.projectTemplate.companyId !== context.companyId) throw new Error("Projet introuvable")
  const claimed = await tx.project.updateMany({ where: { id, companyId: context.companyId, updatedAt: project.updatedAt }, data: { updatedAt: project.updatedAt } })
  if (claimed.count !== 1) throw new Error("Le chantier a changé. Rechargez la page puis réessayez ; votre saisie est conservée.")
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

function atNoon(value: string | undefined) {
  return value ? new Date(`${value}T12:00:00`) : null
}

function addCalendarDays(value: Date, days: number) {
  const result = new Date(value)
  result.setDate(result.getDate() + days)
  return result
}

export async function getProjects(cursor?: string, limit: number = 20) {
  return await withAuth(async ({ companyId, role, agencyIds }) => {
    const pageSize = boundedPageSize(limit, 20, 100)
    const projects = await prisma.project.findMany({
      where: { companyId, client: { companyId } },
      take: pageSize,
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      include: { client: true, agency: { select: { id: true, name: true, code: true } }, projectTemplate: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    })
    return projects.map(project => ({ ...project, client: clientWithAccessibleMetrics(project.client, { role, agencyIds }) }))
  }, "operations.read")
}

export async function getProjectTemplates() {
  return withAuth(async ({ companyId, agencyIds }) =>
    prisma.projectTemplate.findMany({
      where: { companyId },
      include: {
        steps: { include: { dependsOnStep: { select: { id: true, title: true } } }, orderBy: { order: "asc" } },
        _count: { select: { projects: { where: {
          companyId, client: { companyId },
          ...(agencyIds === null ? {} : { agencyId: { in: agencyIds } }),
          OR: [{ agencyId: null }, { agency: { companyId } }],
        } } } },
      },
      orderBy: [{ active: "desc" }, { name: "asc" }],
    }),
    "operations.read",
  )
}

export async function getProjectById(id: string) {
  return await withAuth(async ({ companyId, role, agencyIds }) => {
    const canReadSales = hasPermission(role, "sales.read")
    const canReadFinance = hasPermission(role, "finance.read")
    const documentScope = { companyId, client: { companyId } }
    const [project, planningMembers] = await Promise.all([
      prisma.project.findFirst({
        where: { id, companyId, client: { companyId } },
        include: {
          client: true,
          projectTemplate: { select: { id: true, name: true } },
          milestones: {
            include: { dependsOn: { select: { id: true, title: true, status: true } }, assignedMembership: { include: { user: { select: { name: true, email: true } } } } },
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
    return project ? { ...project, client: clientWithAccessibleMetrics(project.client, { role, agencyIds }), planningMembers, access: { sales: canReadSales, finance: canReadFinance } } : null
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
      return created
    })
    await logAction({
      userId,
      action: "CREATE_PROJECT_TEMPLATE",
      resource: "PROJECT_TEMPLATE",
      resourceId: template.id,
      payload: { name: template.name, stepCount: data.steps.length },
    })
    revalidatePath("/dashboard/projets")
    return { success: true as const, id: template.id }
  }, "operations.write")
}

export async function setProjectTemplateActive(templateId: string, active: boolean) {
  return withAuth(async ({ companyId }) => {
    const template = await prisma.projectTemplate.findFirst({ where: { id: templateId, companyId }, select: { id: true } })
    if (!template) throw new Error("Modèle de chantier introuvable")
    await prisma.projectTemplate.update({ where: { id: template.id }, data: { active } })
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
          ? tx.projectTemplate.findFirst({ where: { id: validated.projectTemplateId, companyId, active: true }, include: { steps: { orderBy: { order: "asc" } } } })
          : null,
      ])
      if (!client) throw new Error("Client introuvable")
      if (validated.agencyId && !agency) throw new Error("Agence introuvable ou inactive")
      if (validated.projectTemplateId && !template) throw new Error("Modèle de chantier introuvable ou inactif")
      const requestedStartDate = atNoon(validated.startDate || undefined)
      const startDate = requestedStartDate || (template ? (() => { const today = new Date(); today.setHours(12, 0, 0, 0); return today })() : null)
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

export async function updateProject(id: string, data: unknown) {
  return withAuth(async context => {
    const { companyId, userId } = context
    const validated = ProjectSchema.parse(data)
    const project = await prisma.$transaction(async tx => {
      const existing = await mutationProject(tx, context, id)
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

export async function deleteProject(id: string) {
  return withAuth(async context => {
    const { companyId, userId } = context
    const files = await prisma.$transaction(async tx => {
      const existing = await mutationProject(tx, context, id)
      const relations = await tx.project.findUniqueOrThrow({ where: { id }, select: {
        _count: { select: { invoices: true, quotes: true, customerOrders: true, purchaseOrders: true, stockReservations: true, stockMovements: true,
          deliveryNotes: true, recurringInvoices: true, interventions: true, expenses: true, organisationTasks: true } },
        files: { select: { id: true, name: true, url: true, size: true, type: true, sha256: true } },
      } })
      if (Object.values(relations._count).some(count => count > 0) || await tx.timeEntry.count({ where: { projectId: id, invoiceId: { not: null } } })) throw new Error("Ce chantier possède des documents ou opérations liés. Archivez-le plutôt.")
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

export async function archiveProject(id: string) {
  return withAuth(async context => {
    await prisma.$transaction(async tx => {
      const existing = await mutationProject(tx, context, id)
      if (existing.status === "ARCHIVED") return
      await tx.project.update({ where: { id }, data: { status: "ARCHIVED", updatedAt: nextProjectRevision(existing.updatedAt) } })
      await tx.auditLog.create({ data: { userId: context.userId, action: "ARCHIVE_PROJECT", resource: "PROJECT", resourceId: id, payload: { name: existing.name, previousStatus: existing.status } } })
    }, { isolationLevel: "Serializable" })
    revalidatePath("/dashboard/projets"); revalidatePath("/dashboard/projets/" + id)
    return { ok: true }
  }, "operations.write")
}


export async function createProjectMilestone(projectId: string, data: unknown) {
  return withAuth(async ({ companyId }) => {
    const validated = ProjectMilestoneSchema.parse(data)
    const [project, dependency, assignee] = await Promise.all([
      prisma.project.findFirst({ where: { id: projectId, companyId }, select: { id: true, _count: { select: { milestones: true } } } }),
      validated.dependsOnId ? prisma.projectMilestone.findFirst({ where: { id: validated.dependsOnId, projectId, project: { companyId } }, select: { id: true } }) : null,
      validated.assignedMembershipId ? prisma.membership.findFirst({ where: { id: validated.assignedMembershipId, companyId, status: "ACTIVE" }, select: { id: true } }) : null,
    ])
    if (!project) throw new Error("Projet introuvable")
    if (validated.dependsOnId && !dependency) throw new Error("Dépendance de jalon introuvable")
    if (validated.assignedMembershipId && !assignee) throw new Error("Responsable introuvable")
    const milestone = await prisma.projectMilestone.create({
      data: {
        projectId,
        title: validated.title,
        description: validated.description || null,
        kind: validated.kind,
        plannedStartAt: atNoon(validated.plannedStartAt || undefined),
        dueDate: atNoon(validated.dueDate || undefined),
        durationDays: validated.durationDays,
        dependsOnId: validated.dependsOnId || null,
        assignedMembershipId: validated.assignedMembershipId || null,
        order: project._count.milestones,
      },
    })
    revalidatePath(`/dashboard/projets/${projectId}`)
    return milestone
  })
}

export async function updateProjectMilestoneStatus(id: string, status: "PENDING" | "IN_PROGRESS" | "DONE") {
  return withAuth(async ({ companyId }) => {
    const milestone = await prisma.projectMilestone.findFirst({ where: { id, project: { companyId } }, include: { dependsOn: { select: { status: true, title: true } } } })
    if (!milestone) throw new Error("Jalon introuvable")
    if (status !== "PENDING" && milestone.dependsOn && milestone.dependsOn.status !== "DONE")
      return { success: false as const, error: `Terminez d’abord « ${milestone.dependsOn.title} »` }
    const updated = await prisma.projectMilestone.update({ where: { id }, data: { status } })
    revalidatePath(`/dashboard/projets/${milestone.projectId}`)
    return { success: true as const, milestone: updated }
  })
}

export async function updateProjectMilestonePlanning(id: string, input: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    const data = ProjectMilestoneSchema.pick({ plannedStartAt: true, dueDate: true, durationDays: true, dependsOnId: true, assignedMembershipId: true }).parse(input)
    const milestone = await prisma.projectMilestone.findFirst({ where: { id, project: { companyId } }, select: { id: true, projectId: true } })
    if (!milestone) throw new Error("Jalon introuvable")
    if (data.assignedMembershipId && !(await prisma.membership.findFirst({ where: { id: data.assignedMembershipId, companyId, status: "ACTIVE" }, select: { id: true } })))
      throw new Error("Responsable introuvable")
    if (data.dependsOnId) {
      if (data.dependsOnId === milestone.id) throw new Error("Un jalon ne peut pas dépendre de lui-même")
      let cursor = await prisma.projectMilestone.findFirst({ where: { id: data.dependsOnId, projectId: milestone.projectId }, select: { id: true, dependsOnId: true } })
      if (!cursor) throw new Error("Dépendance introuvable dans ce chantier")
      while (cursor?.dependsOnId) {
        if (cursor.dependsOnId === milestone.id) throw new Error("Cette dépendance créerait une boucle")
        cursor = await prisma.projectMilestone.findFirst({ where: { id: cursor.dependsOnId, projectId: milestone.projectId }, select: { id: true, dependsOnId: true } })
      }
    }
    await prisma.projectMilestone.update({
      where: { id: milestone.id },
      data: {
        plannedStartAt: atNoon(data.plannedStartAt || undefined),
        dueDate: atNoon(data.dueDate || undefined),
        durationDays: data.durationDays,
        dependsOnId: data.dependsOnId || null,
        assignedMembershipId: data.assignedMembershipId || null,
      },
    })
    await logAction({ userId, action: "UPDATE_PROJECT_MILESTONE_PLAN", resource: "PROJECT_MILESTONE", resourceId: milestone.id, payload: data })
    revalidatePath(`/dashboard/projets/${milestone.projectId}`)
    return { success: true as const }
  }, "operations.write")
}

export async function deleteProjectMilestone(id: string) {
  return withAuth(async ({ companyId }) => {
    const milestone = await prisma.projectMilestone.findFirst({ where: { id, project: { companyId } } })
    if (!milestone) throw new Error("Jalon introuvable")
    await prisma.projectMilestone.delete({ where: { id } })
    revalidatePath(`/dashboard/projets/${milestone.projectId}`)
    return { ok: true }
  })
}

export async function createProjectAcceptanceItem(projectId: string, data: unknown) {
  return withAuth(async ({ companyId }) => {
    const validated = ProjectAcceptanceSchema.parse(data)
    const project = await prisma.project.findFirst({ where: { id: projectId, companyId } })
    if (!project) throw new Error("Projet introuvable")
    const item = await prisma.projectAcceptanceItem.create({
      data: {
        projectId,
        title: validated.title,
        dueDate: validated.dueDate ? new Date(`${validated.dueDate}T12:00:00`) : null,
      },
    })
    revalidatePath(`/dashboard/projets/${projectId}`)
    return item
  })
}

export async function updateProjectAcceptanceStatus(id: string, status: "TODO" | "DONE" | "REJECTED") {
  return withAuth(async ({ companyId }) => {
    const item = await prisma.projectAcceptanceItem.findFirst({ where: { id, project: { companyId } } })
    if (!item) throw new Error("Élément de recette introuvable")
    const updated = await prisma.projectAcceptanceItem.update({ where: { id }, data: { status } })
    revalidatePath(`/dashboard/projets/${item.projectId}`)
    return updated
  })
}

export async function deleteProjectAcceptanceItem(id: string) {
  return withAuth(async ({ companyId }) => {
    const item = await prisma.projectAcceptanceItem.findFirst({ where: { id, project: { companyId } } })
    if (!item) throw new Error("Élément de recette introuvable")
    await prisma.projectAcceptanceItem.delete({ where: { id } })
    revalidatePath(`/dashboard/projets/${item.projectId}`)
    return { ok: true }
  })
}

export async function upsertProjectTechnicalProfile(projectId: string, data: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    const validated = ProjectTechnicalProfileSchema.parse(data)
    const project = await prisma.project.findFirst({ where: { id: projectId, companyId } })
    if (!project) throw new Error("Projet introuvable")
    const measuredNumber = (value: number | "" | undefined) => (value === "" || value === undefined ? null : value)
    const isValidated = validated.surveyStatus === "VALIDATED"
    const payload = {
      surveyStatus: validated.surveyStatus,
      surveyedAt: validated.surveyedAt ? new Date(`${validated.surveyedAt}T12:00:00`) : null,
      surveyedBy: validated.surveyedBy || null,
      poolShape: validated.poolShape || null,
      poolLengthMm: measuredNumber(validated.poolLengthMm),
      poolWidthMm: measuredNumber(validated.poolWidthMm),
      poolDepthMm: measuredNumber(validated.poolDepthMm),
      diagonal1Mm: measuredNumber(validated.diagonal1Mm),
      diagonal2Mm: measuredNumber(validated.diagonal2Mm),
      copingType: validated.copingType || null,
      deckMaterial: validated.deckMaterial || null,
      accessWidthMm: measuredNumber(validated.accessWidthMm),
      powerSupply: validated.powerSupply || null,
      obstacles: validated.obstacles || null,
      installationConstraints: validated.installationConstraints || null,
      recommendedProduct: validated.recommendedProduct || null,
      coverModel: validated.coverModel || null,
      coverColor: validated.coverColor || null,
      measurementNotes: validated.measurementNotes || null,
      validationNotes: validated.validationNotes || null,
      validatedAt: isValidated ? new Date() : null,
    }
    const profile = await prisma.projectTechnicalProfile.upsert({
      where: { projectId },
      create: { projectId, ...payload },
      update: payload,
    })
    await logAction({
      userId,
      action: "UPDATE_PROJECT_TECHNICAL_PROFILE",
      resource: "PROJECT",
      resourceId: projectId,
      payload: { surveyStatus: profile.surveyStatus, surveyedAt: profile.surveyedAt },
    })
    revalidatePath(`/dashboard/projets/${projectId}`)
    return profile
  })
}
