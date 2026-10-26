import { z } from "zod"
import { revalidatePath } from "next/cache"
import prisma, { type TransactionClient } from "@/lib/prisma"
import { AuthorizationError, withAuth, type AuthContext } from "@/lib/auth-wrapper"
import { DEMO_READ_ONLY_MESSAGE } from "@/lib/demo-policy"
import { isTransactionConflict } from "@/lib/transaction-conflicts"
import { consumedTimeBudgetCents } from "@/lib/time-budget"

export class TimeEntryError extends Error {}

export async function recomputeProjectConsumed(tx: TransactionClient, projectId: string) {
  const sum = await tx.timeEntry.aggregate({ where: { projectId, isBillable: true }, _sum: { durationSec: true } })
  const consumedCents = consumedTimeBudgetCents(sum._sum.durationSec ?? 0)
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
      if (isTransactionConflict(error) && attempt < 3) continue
      if (error instanceof TimeEntryError || error instanceof AuthorizationError) return { ok: false, error: error.message }
      if (error instanceof z.ZodError) return { ok: false, error: "Saisie invalide : vérifiez la durée, la date et la description." }
      if (error instanceof Error && error.message === DEMO_READ_ONLY_MESSAGE) return { ok: false, error: DEMO_READ_ONLY_MESSAGE }
      throw error
    }
  }
}
