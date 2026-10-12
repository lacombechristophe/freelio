"use server"

import { z } from "zod"
import prisma from "@/lib/prisma"
import { withAuth } from "@/lib/auth-wrapper"
import { mutateTime, recomputeProjectConsumed, TimeEntryError } from "@/lib/time-entry-mutations"
import { clientWithAccessibleMetrics } from "@/lib/client-metrics-access"

const entryId = z.string().trim().min(1).max(100)
const entryFields = z.object({
  durationSec: z.number().int().min(1).max(2147483647),
  description: z.string().max(2000).optional(),
  date: z.date().optional(),
  isBillable: z.boolean().optional(),
}).strict()
const createInput = entryFields.extend({ projectId: entryId })
const updateInput = entryFields.partial()
const BILLED_TIME_MESSAGE = "Ce temps est déjà rattaché à une facture. Il ne peut être modifié ni supprimé."
export async function getTimeEntries() {
  return await withAuth(async ({ companyId, role, agencyIds }) => {
    const entries = await prisma.timeEntry.findMany({
      where: { project: { companyId, client: { companyId } } },
      include: { project: { include: { client: true } } },
      orderBy: { date: "desc" },
      take: 500,
    })
    return entries.map(entry => ({ ...entry, project: { ...entry.project, client: clientWithAccessibleMetrics(entry.project.client, { role, agencyIds }) } }))
  }, "operations.read")
}

export async function createTimeEntry(input: unknown) {
  return mutateTime(async (tx, { companyId }) => {
    const data = createInput.parse(input)
    const project = await tx.project.findFirst({
      where: { id: data.projectId, companyId, client: { companyId } },
      select: { id: true },
    })
    if (!project) throw new TimeEntryError("Projet introuvable")

    const entry = await tx.timeEntry.create({
      data: {
        projectId: data.projectId,
        durationSec: data.durationSec,
        description: data.description,
        date: data.date || new Date(),
        isBillable: data.isBillable ?? true,
      },
    })
    await recomputeProjectConsumed(tx, data.projectId)
    return { value: entry, projectId: data.projectId }
  })
}

export async function updateTimeEntry(id: string, input: unknown) {
  return mutateTime(async (tx, { companyId }) => {
    const data = updateInput.parse(input)
    const where = { id: entryId.parse(id), project: { companyId, client: { companyId } } }
    const existing = await tx.timeEntry.findFirst({
      where,
    })
    if (!existing) throw new TimeEntryError("Entrée introuvable")
    if (existing.invoiceId !== null) throw new TimeEntryError(BILLED_TIME_MESSAGE)

    const changed = await tx.timeEntry.updateMany({
      where: { ...where, invoiceId: null },
      data,
    })
    if (changed.count !== 1) throw new TimeEntryError("Entrée introuvable ou déjà rattachée à une facture")
    const entry = await tx.timeEntry.findFirstOrThrow({ where })
    await recomputeProjectConsumed(tx, existing.projectId)
    return { value: entry, projectId: existing.projectId }
  })
}

export async function deleteTimeEntry(id: string) {
  return mutateTime(async (tx, { companyId }) => {
    const where = { id: entryId.parse(id), project: { companyId, client: { companyId } } }
    const existing = await tx.timeEntry.findFirst({
      where,
    })
    if (!existing) throw new TimeEntryError("Entrée introuvable")
    if (existing.invoiceId !== null) throw new TimeEntryError(BILLED_TIME_MESSAGE)
    const deleted = await tx.timeEntry.deleteMany({ where: { ...where, invoiceId: null } })
    if (deleted.count !== 1) throw new TimeEntryError("Entrée introuvable ou déjà rattachée à une facture")
    await recomputeProjectConsumed(tx, existing.projectId)
    return { value: null, projectId: existing.projectId }
  })
}
