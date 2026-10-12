import { Prisma } from "@prisma/client"
import { z } from "zod"
import { revalidatePath } from "next/cache"
import prisma, { type TransactionClient } from "@/lib/prisma"
import { AuthorizationError, withAuth, type AuthContext } from "@/lib/auth-wrapper"
import { DEMO_READ_ONLY_MESSAGE } from "@/lib/demo-policy"

export class TimeEntryError extends Error {}

// Consumed budgets use the existing estimate of 500 € for an eight-hour day.
export async function recomputeProjectConsumed(tx: TransactionClient, projectId: string) {
  const sum = await tx.timeEntry.aggregate({ where: { projectId, isBillable: true }, _sum: { durationSec: true } })
  const consumedCents = Math.round(((sum._sum.durationSec ?? 0) / 3600) * 6250)
  await tx.project.update({ where: { id: projectId }, data: { consumedCents } })
}

export async function mutateTime<T>(action: (tx: TransactionClient, context: AuthContext) => Promise<{ value: T; projectId: string }>): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  for (let attempt = 1; ; attempt++) {
    try {
      const result = await withAuth(context => prisma.$transaction(tx => action(tx, context), { isolationLevel: "Serializable" }), "operations.write")
      if (!result) return { ok: false, error: "Espace de travail introuvable" }
      revalidatePath("/dashboard/temps")
      revalidatePath("/dashboard/projets")
      revalidatePath(`/dashboard/projets/${result.projectId}`)
      return { ok: true, value: result.value }
    } catch (error) {
      // Retry only rolled-back serialization failures; refresh authorization
      // and stored relationships before each attempt.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034" && attempt < 3) continue
      if (error instanceof TimeEntryError || error instanceof AuthorizationError) return { ok: false, error: error.message }
      if (error instanceof z.ZodError) return { ok: false, error: "Saisie invalide : vérifiez la durée, la date et la description." }
      if (error instanceof Error && error.message === DEMO_READ_ONLY_MESSAGE) return { ok: false, error: DEMO_READ_ONLY_MESSAGE }
      throw error
    }
  }
}
