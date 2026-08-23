"use server"

import prisma from "@/lib/prisma"
import { withAuth } from "@/lib/auth-wrapper"
import { logAction } from "@/lib/audit"
import { revalidatePath } from "next/cache"
import {
  ProjectAcceptanceSchema,
  ProjectMilestoneSchema,
  ProjectSchema,
  ProjectTechnicalProfileSchema,
} from "@/lib/validations"
import { removeLocalFile } from "@/lib/local-files"

export async function getProjects(cursor?: string, limit: number = 20) {
  return await withAuth(async ({ companyId }) => {
    return await prisma.project.findMany({
      where: { companyId },
      take: limit,
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      include: { client: true },
      orderBy: { createdAt: "desc" },
    })
  })
}

export async function getProjectById(id: string) {
  return await withAuth(async ({ companyId }) => {
    return await prisma.project.findFirst({
      where: { id, companyId },
      include: {
        client: true,
        milestones: { orderBy: { dueDate: "asc" } },
        files: true,
        timeEntries: { orderBy: { date: "desc" }, take: 20 },
        quotes: { orderBy: { createdAt: "desc" }, take: 10 },
        invoices: { orderBy: { createdAt: "desc" }, take: 10 },
        expenses: { orderBy: { date: "desc" } },
        technicalProfile: true,
        acceptanceItems: { orderBy: { createdAt: "asc" } },
      },
    })
  })
}

export async function createProject(data: any) {
  return await withAuth(async ({ companyId, userId }) => {
    const validated = ProjectSchema.parse(data)
    const project = await prisma.project.create({
      data: { ...validated, companyId },
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

export async function updateProject(id: string, data: any) {
  return await withAuth(async ({ companyId, userId }) => {
    const validated = ProjectSchema.parse(data)
    const existing = await prisma.project.findFirst({ where: { id, companyId } })
    if (!existing) throw new Error("Projet introuvable")

    const project = await prisma.project.update({
      where: { id },
      data: validated,
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
      throw new Error(
        `Impossible de supprimer ce projet : ${parts.join(", ")} lié(s). Archivez-le plutôt.`
      )
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
    const project = await prisma.project.findFirst({ where: { id: projectId, companyId } })
    if (!project) throw new Error("Projet introuvable")
    const milestone = await prisma.projectMilestone.create({
      data: {
        projectId,
        title: validated.title,
        description: validated.description || null,
        dueDate: validated.dueDate ? new Date(`${validated.dueDate}T12:00:00`) : null,
      },
    })
    revalidatePath(`/dashboard/projets/${projectId}`)
    return milestone
  })
}

export async function updateProjectMilestoneStatus(id: string, status: "PENDING" | "IN_PROGRESS" | "DONE") {
  return withAuth(async ({ companyId }) => {
    const milestone = await prisma.projectMilestone.findFirst({ where: { id, project: { companyId } } })
    if (!milestone) throw new Error("Jalon introuvable")
    const updated = await prisma.projectMilestone.update({ where: { id }, data: { status } })
    revalidatePath(`/dashboard/projets/${milestone.projectId}`)
    return updated
  })
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
  return withAuth(async ({ companyId }) => {
    const validated = ProjectTechnicalProfileSchema.parse(data)
    const project = await prisma.project.findFirst({ where: { id: projectId, companyId } })
    if (!project) throw new Error("Projet introuvable")
    const payload = {
      repositoryUrl: validated.repositoryUrl || null,
      productionUrl: validated.productionUrl || null,
      stagingUrl: validated.stagingUrl || null,
      documentationUrl: validated.documentationUrl || null,
      hostingProvider: validated.hostingProvider || null,
      stack: validated.stack || null,
      domainName: validated.domainName || null,
      domainExpiresAt: validated.domainExpiresAt ? new Date(`${validated.domainExpiresAt}T12:00:00`) : null,
      notes: validated.notes || null,
    }
    const profile = await prisma.projectTechnicalProfile.upsert({
      where: { projectId },
      create: { projectId, ...payload },
      update: payload,
    })
    revalidatePath(`/dashboard/projets/${projectId}`)
    return profile
  })
}
