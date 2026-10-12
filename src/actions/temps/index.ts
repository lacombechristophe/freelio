"use server"

import { Prisma } from "@prisma/client"
import { z } from "zod"
import prisma, { type TransactionClient } from "@/lib/prisma"
import { AuthorizationError, withAuth, type AuthContext } from "@/lib/auth-wrapper"
import { DEMO_READ_ONLY_MESSAGE } from "@/lib/demo-policy"
import { revalidatePath } from "next/cache"
import { clientWithAccessibleMetrics } from "@/lib/client-metrics-access"

// Default hourly rate used to convert tracked time into a consumed budget estimate.
// Matches the common "jour @ 500€" rate — can later be made per-project.
const HOURLY_RATE_CENTS = 6250 // 62.50€/h (i.e. 500€/jour de 8h)

async function recomputeProjectConsumed(tx: TransactionClient, projectId: string) {
  const sum = await tx.timeEntry.aggregate({
    where: { projectId, isBillable: true },
    _sum: { durationSec: true },
  })
  const seconds = sum._sum.durationSec ?? 0
  const consumedCents = Math.round((seconds / 3600) * HOURLY_RATE_CENTS)
  await tx.project.update({
    where: { id: projectId },
    data: { consumedCents },
  })
}

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
class TimeEntryError extends Error {}

async function mutateTime<T>(action: (tx: TransactionClient, context: AuthContext) => Promise<{ value: T; projectId: string }>): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  for (let attempt = 1; ; attempt++) {
    try {
      const result = await withAuth(context => prisma.$transaction(tx => action(tx, context), { isolationLevel: "Serializable" }), "operations.write")
      if (!result) return { ok: false, error: "Espace de travail introuvable" }
      revalidatePath("/dashboard/temps")
      revalidatePath("/dashboard/projets")
      revalidatePath(`/dashboard/projets/${result.projectId}`)
      return { ok: true, value: result.value }
    } catch (error) {
      // Only a rolled-back serialization failure can be replayed. Recheck
      // membership and stored relationships on each attempt.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034" && attempt < 3) continue
      if (error instanceof TimeEntryError || error instanceof AuthorizationError) return { ok: false, error: error.message }
      if (error instanceof z.ZodError) return { ok: false, error: "Saisie invalide : vérifiez la durée, la date et la description." }
      if (error instanceof Error && error.message === DEMO_READ_ONLY_MESSAGE) return { ok: false, error: DEMO_READ_ONLY_MESSAGE }
      throw error
    }
  }
}

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
