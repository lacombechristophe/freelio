import "server-only"

import { createHash } from "node:crypto"
import { z } from "zod"

import { logAction } from "@/lib/audit"
import prisma from "@/lib/prisma"

export const interventionCompletionSchema = z.object({
  interventionId: z.string().cuid(),
  report: z.string().trim().min(3, "Le compte rendu est requis").max(10_000),
  laborMinutes: z.coerce.number().int().min(0).max(7 * 24 * 60),
  customerName: z.string().trim().min(2, "Le nom du client est requis").max(160),
  customerApproval: z.literal(true, { error: "L’accord du client doit être confirmé" }),
})

export async function completeFieldInterventionForContext(input: unknown, context: { companyId: string; userId: string }) {
  const data = interventionCompletionSchema.parse(input)
  const intervention = await prisma.fieldIntervention.findFirst({
    where: { id: data.interventionId, companyId: context.companyId },
    select: { id: true, status: true, ticketId: true },
  })
  if (!intervention) throw new Error("Intervention introuvable")
  if (intervention.status === "CANCELED") throw new Error("Une intervention annulée ne peut pas être clôturée")
  if (intervention.status === "COMPLETED") return { success: true as const, alreadyCompleted: true }

  const signedAt = new Date()
  const signatureSha256 = createHash("sha256")
    .update(JSON.stringify({ interventionId: intervention.id, customerName: data.customerName, signedAt: signedAt.toISOString(), report: data.report }))
    .digest("hex")

  await prisma.$transaction(async (tx) => {
    const claimed = await tx.fieldIntervention.updateMany({
      where: { id: intervention.id, companyId: context.companyId, status: { notIn: ["CANCELED", "COMPLETED"] } },
      data: {
        status: "COMPLETED",
        startedAt: intervention.status === "PLANNED" ? signedAt : undefined,
        completedAt: signedAt,
        report: data.report,
        laborMinutes: data.laborMinutes,
        customerName: data.customerName,
        signedAt,
        signatureSha256,
      },
    })
    if (claimed.count !== 1) throw new Error("Cette intervention a déjà été clôturée ou annulée")
    if (intervention.ticketId) {
      await tx.serviceTicket.updateMany({
        where: { id: intervention.ticketId, companyId: context.companyId },
        data: { status: "RESOLVED" },
      })
    }
  })

  await logAction({
    userId: context.userId,
    action: "COMPLETE_FIELD_INTERVENTION",
    resource: "FIELD_INTERVENTION",
    resourceId: intervention.id,
    payload: { laborMinutes: data.laborMinutes, customerName: data.customerName, signatureSha256 },
  })
  return { success: true as const, signatureSha256 }
}
