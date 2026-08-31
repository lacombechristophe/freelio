"use server"

import prisma from "@/lib/prisma"
import { withAuth } from "@/lib/auth-wrapper"
import { revalidatePath } from "next/cache"

// Default hourly rate used to convert tracked time into a consumed budget estimate.
// Matches the common "jour @ 500€" rate — can later be made per-project.
const HOURLY_RATE_CENTS = 6250 // 62.50€/h (i.e. 500€/jour de 8h)

async function recomputeProjectConsumed(projectId: string) {
  const sum = await prisma.timeEntry.aggregate({
    where: { projectId, isBillable: true },
    _sum: { durationSec: true },
  })
  const seconds = sum._sum.durationSec ?? 0
  const consumedCents = Math.round((seconds / 3600) * HOURLY_RATE_CENTS)
  await prisma.project.update({
    where: { id: projectId },
    data: { consumedCents },
  })
}

export async function getTimeEntries() {
  return await withAuth(async ({ companyId }) => {
    return await prisma.timeEntry.findMany({
      where: { project: { companyId } },
      include: { project: { include: { client: true } } },
      orderBy: { date: "desc" },
      take: 500,
    })
  })
}

export async function createTimeEntry(data: { projectId: string; durationSec: number; description?: string; date?: Date; isBillable?: boolean }) {
  return await withAuth(async ({ companyId }) => {
    const project = await prisma.project.findFirst({
      where: { id: data.projectId, companyId },
    })
    if (!project) throw new Error("Projet introuvable")

    const entry = await prisma.timeEntry.create({
      data: {
        projectId: data.projectId,
        durationSec: data.durationSec,
        description: data.description,
        date: data.date || new Date(),
        isBillable: data.isBillable ?? true,
      },
    })
    await recomputeProjectConsumed(data.projectId)
    revalidatePath("/dashboard/temps")
    revalidatePath("/dashboard/projets")
    revalidatePath(`/dashboard/projets/${data.projectId}`)
    return entry
  })
}

export async function updateTimeEntry(id: string, data: { durationSec?: number; description?: string; date?: Date; isBillable?: boolean }) {
  return await withAuth(async ({ companyId }) => {
    const existing = await prisma.timeEntry.findFirst({
      where: { id, project: { companyId } },
    })
    if (!existing) throw new Error("Entrée introuvable")

    const entry = await prisma.timeEntry.update({
      where: { id },
      data: {
        durationSec: data.durationSec,
        description: data.description,
        date: data.date,
        isBillable: data.isBillable,
      },
    })
    await recomputeProjectConsumed(existing.projectId)
    revalidatePath("/dashboard/temps")
    revalidatePath("/dashboard/projets")
    revalidatePath(`/dashboard/projets/${existing.projectId}`)
    return entry
  })
}

export async function deleteTimeEntry(id: string) {
  return await withAuth(async ({ companyId }) => {
    const existing = await prisma.timeEntry.findFirst({
      where: { id, project: { companyId } },
    })
    if (!existing) throw new Error("Entrée introuvable")
    await prisma.timeEntry.delete({ where: { id } })
    await recomputeProjectConsumed(existing.projectId)
    revalidatePath("/dashboard/temps")
    revalidatePath("/dashboard/projets")
    revalidatePath(`/dashboard/projets/${existing.projectId}`)
    return { ok: true }
  })
}
