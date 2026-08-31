"use server"

import prisma from "@/lib/prisma"
import { withAuth } from "@/lib/auth-wrapper"
import { logAction } from "@/lib/audit"
import { revalidatePath } from "next/cache"
import { ProjectAcceptanceSchema, ProjectMilestoneSchema, ProjectSchema, ProjectTemplateSchema, ProjectTechnicalProfileSchema } from "@/lib/validations"
import { removeLocalFile } from "@/lib/local-files"
import { boundedPageSize } from "@/lib/pagination"

function atNoon(value: string | undefined) {
  return value ? new Date(`${value}T12:00:00`) : null
}

function addCalendarDays(value: Date, days: number) {
  const result = new Date(value)
  result.setDate(result.getDate() + days)
  return result
}

export async function getProjects(cursor?: string, limit: number = 20) {
  return await withAuth(async ({ companyId }) => {
    const pageSize = boundedPageSize(limit, 20, 100)
    return await prisma.project.findMany({
      where: { companyId },
      take: pageSize,
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      include: { client: true, agency: { select: { id: true, name: true, code: true } }, projectTemplate: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    })
  })
}

export async function getProjectTemplates() {
  return withAuth(async ({ companyId }) =>
    prisma.projectTemplate.findMany({
      where: { companyId },
      include: { steps: { include: { dependsOnStep: { select: { id: true, title: true } } }, orderBy: { order: "asc" } }, _count: { select: { projects: true } } },
      orderBy: [{ active: "desc" }, { name: "asc" }],
    }),
  )
}

export async function getProjectById(id: string) {
  return await withAuth(async ({ companyId }) => {
    const [project, planningMembers] = await Promise.all([
      prisma.project.findFirst({
        where: { id, companyId },
        include: {
          client: true,
          projectTemplate: { select: { id: true, name: true } },
          milestones: {
            include: { dependsOn: { select: { id: true, title: true, status: true } }, assignedMembership: { include: { user: { select: { name: true, email: true } } } } },
            orderBy: [{ order: "asc" }, { dueDate: "asc" }],
          },
          files: true,
          timeEntries: { orderBy: { date: "desc" }, take: 20 },
          quotes: { orderBy: { createdAt: "desc" }, take: 10 },
          invoices: { orderBy: { createdAt: "desc" }, take: 10 },
          expenses: { orderBy: { date: "desc" } },
          technicalProfile: true,
          acceptanceItems: { orderBy: { createdAt: "asc" } },
        },
      }),
      prisma.membership.findMany({ where: { companyId, status: "ACTIVE" }, include: { user: { select: { name: true, email: true } } }, orderBy: { createdAt: "asc" } }),
    ])
    return project ? { ...project, planningMembers } : null
  })
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
  return await withAuth(async ({ companyId, userId }) => {
    const validated = ProjectSchema.parse(data)
    const [client, agency, template] = await Promise.all([
      prisma.client.findFirst({ where: { id: validated.clientId, companyId }, select: { id: true } }),
      validated.agencyId
        ? prisma.agency.findFirst({ where: { id: validated.agencyId, companyId, active: true }, select: { id: true } })
        : prisma.agency.findFirst({ where: { companyId, isDefault: true, active: true }, select: { id: true } }),
      validated.projectTemplateId
        ? prisma.projectTemplate.findFirst({ where: { id: validated.projectTemplateId, companyId, active: true }, include: { steps: { orderBy: { order: "asc" } } } })
        : null,
    ])
    if (!client) throw new Error("Client introuvable")
    if (validated.agencyId && !agency) throw new Error("Agence introuvable ou inactive")
    if (validated.projectTemplateId && !template) throw new Error("Modèle de chantier introuvable ou inactif")
    const requestedStartDate = atNoon(validated.startDate || undefined)
    const startDate =
      requestedStartDate ||
      (template
        ? (() => {
            const today = new Date()
            today.setHours(12, 0, 0, 0)
            return today
          })()
        : null)
    const endDate = atNoon(validated.endDate || undefined) || (startDate && template?.defaultDurationDays ? addCalendarDays(startDate, template.defaultDurationDays) : null)
    const project = await prisma.$transaction(async (tx) => {
      const created = await tx.project.create({
        data: {
          companyId,
          clientId: validated.clientId,
          agencyId: agency?.id || null,
          projectTemplateId: template?.id || null,
          name: validated.name,
          description: validated.description || null,
          status: validated.status || "ACTIVE",
          worksiteType: validated.worksiteType || template?.worksiteType || null,
          budgetCents: validated.budgetCents,
          startDate,
          endDate,
        },
      })
      if (template?.steps.length) {
        const milestoneIds = new Map<string, string>()
        for (const step of template.steps) {
          const plannedStartAt = addCalendarDays(startDate || new Date(), step.offsetDays)
          const milestone = await tx.projectMilestone.create({
            data: {
              projectId: created.id,
              templateStepId: step.id,
              title: step.title,
              description: step.description,
              kind: step.kind,
              plannedStartAt,
              dueDate: addCalendarDays(plannedStartAt, step.durationDays),
              durationDays: step.durationDays,
              order: step.order,
              dependsOnId: step.dependsOnStepId ? milestoneIds.get(step.dependsOnStepId) || null : null,
            },
          })
          milestoneIds.set(step.id, milestone.id)
        }
      }
      return created
    })
    await logAction({
      userId,
      action: "CREATE_PROJECT",
      resource: "PROJECT",
      resourceId: project.id,
      payload: { name: project.name },
    })
    revalidatePath("/dashboard/projets")
    return project
  })
}

export async function updateProject(id: string, data: unknown) {
  return await withAuth(async ({ companyId, userId }) => {
    const validated = ProjectSchema.parse(data)
    const existing = await prisma.project.findFirst({ where: { id, companyId } })
    if (!existing) throw new Error("Projet introuvable")
    if (!(await prisma.client.findFirst({ where: { id: validated.clientId, companyId }, select: { id: true } }))) throw new Error("Client introuvable")
    if (validated.agencyId && !(await prisma.agency.findFirst({ where: { id: validated.agencyId, companyId, active: true }, select: { id: true } })))
      throw new Error("Agence introuvable ou inactive")
    if (validated.projectTemplateId && !(await prisma.projectTemplate.findFirst({ where: { id: validated.projectTemplateId, companyId }, select: { id: true } })))
      throw new Error("Modèle de chantier introuvable")

    const project = await prisma.project.update({
      where: { id },
      data: {
        clientId: validated.clientId,
        agencyId: validated.agencyId || existing.agencyId,
        projectTemplateId: validated.projectTemplateId || null,
        name: validated.name,
        description: validated.description || null,
        status: validated.status,
        worksiteType: validated.worksiteType || null,
        budgetCents: validated.budgetCents,
        startDate: atNoon(validated.startDate || undefined),
        endDate: atNoon(validated.endDate || undefined),
      },
    })
    await logAction({
      userId,
      action: "UPDATE_PROJECT",
      resource: "PROJECT",
      resourceId: id,
      payload: { name: project.name },
    })
    revalidatePath("/dashboard/projets")
    revalidatePath(`/dashboard/projets/${id}`)
    return project
  })
}

export async function deleteProject(id: string) {
  return await withAuth(async ({ companyId, userId }) => {
    const existing = await prisma.project.findFirst({
      where: { id, companyId },
      include: {
        _count: { select: { invoices: true, quotes: true, timeEntries: true } },
        files: { select: { url: true } },
      },
    })
    if (!existing) throw new Error("Projet introuvable")

    const { _count } = existing
    if (_count.invoices > 0 || _count.quotes > 0) {
      const parts: string[] = []
      if (_count.invoices > 0) parts.push(`${_count.invoices} facture(s)`)
      if (_count.quotes > 0) parts.push(`${_count.quotes} devis`)
      throw new Error(`Impossible de supprimer ce projet : ${parts.join(", ")} lié(s). Archivez-le plutôt.`)
    }

    // TimeEntries don't cascade — delete them first.
    if (_count.timeEntries > 0) {
      await prisma.timeEntry.deleteMany({ where: { projectId: id } })
    }

    await prisma.project.delete({ where: { id } })
    await Promise.all(existing.files.map((file) => removeLocalFile(file.url)))
    await logAction({
      userId,
      action: "DELETE_PROJECT",
      resource: "PROJECT",
      resourceId: id,
      payload: { name: existing.name },
    })
    revalidatePath("/dashboard/projets")
    return { ok: true }
  })
}

export async function archiveProject(id: string) {
  return await withAuth(async ({ companyId }) => {
    const existing = await prisma.project.findFirst({ where: { id, companyId } })
    if (!existing) throw new Error("Projet introuvable")
    await prisma.project.update({ where: { id }, data: { status: "ARCHIVED" } })
    revalidatePath("/dashboard/projets")
    return { ok: true }
  })
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
