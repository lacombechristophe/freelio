import "server-only"

import { createHash } from "node:crypto"

import { logAction } from "@/lib/audit"
import { interventionCompletionSchema } from "@/lib/field/completion-schema"
import { calculateStockBalance } from "@/lib/operations/stock"
import prisma from "@/lib/prisma"

export { interventionCompletionSchema } from "@/lib/field/completion-schema"

export async function completeFieldInterventionForContext(input: unknown, context: { companyId: string; userId: string; membershipId?: string; role?: string }) {
  const data = interventionCompletionSchema.parse(input)
  const technicianScope = context.role === "TECHNICIAN" ? { assignedMembershipId: context.membershipId } : {}
  const intervention = await prisma.fieldIntervention.findFirst({
    where: { id: data.interventionId, companyId: context.companyId, ...technicianScope },
    select: { id: true, status: true, ticketId: true, projectId: true, site: { select: { clientId: true } } },
  })
  if (!intervention) throw new Error("Intervention introuvable")
  if (intervention.status === "CANCELED") throw new Error("Une intervention annulée ne peut pas être clôturée")
  if (intervention.status === "COMPLETED") {
    const expenses = await prisma.expense.findMany({ where: { companyId: context.companyId, interventionId: intervention.id, sourceId: { not: null } }, select: { id: true, sourceId: true } })
    return { success: true as const, alreadyCompleted: true, expenses: expenses.flatMap((item) => item.sourceId ? [{ id: item.id, sourceId: item.sourceId }] : []) }
  }

  const signedAt = new Date()
  const signatureImageHash = createHash("sha256").update(data.customerSignatureData).digest("hex")
  const signatureSha256 = createHash("sha256")
    .update(JSON.stringify({ interventionId: intervention.id, customerName: data.customerName, signedAt: signedAt.toISOString(), report: data.report, signatureImageHash }))
    .digest("hex")

  const result = await prisma.$transaction(async (tx) => {
    const claimed = await tx.fieldIntervention.updateMany({
      where: { id: intervention.id, companyId: context.companyId, ...technicianScope, status: { notIn: ["CANCELED", "COMPLETED"] } },
      data: {
        status: "COMPLETED",
        startedAt: intervention.status === "PLANNED" ? signedAt : undefined,
        completedAt: signedAt,
        report: data.report,
        laborMinutes: data.laborMinutes,
        customerName: data.customerName,
        signedAt,
        signatureSha256,
        customerSignatureData: data.customerSignatureData,
      },
    })
    if (claimed.count !== 1) throw new Error("Cette intervention a déjà été clôturée ou annulée")

    const movementIds: string[] = []
    for (const material of data.materials) {
      const inventory = await tx.inventoryItem.findFirst({
        where: { companyId: context.companyId, warehouseId: material.warehouseId, productId: material.productId, warehouse: { active: true }, product: { active: true, stockTracked: true } },
        include: { product: { select: { label: true, purchasePriceCents: true } } },
      })
      if (!inventory) throw new Error("Un produit n’est pas disponible dans le dépôt sélectionné")
      const next = calculateStockBalance({ quantity: inventory.quantity, reservedQuantity: inventory.reservedQuantity, type: "OUT", movementQuantity: material.quantity })
      await tx.inventoryItem.update({ where: { id: inventory.id }, data: next })
      const movement = await tx.stockMovement.create({
        data: {
          companyId: context.companyId,
          warehouseId: material.warehouseId,
          productId: material.productId,
          projectId: intervention.projectId,
          fieldInterventionId: intervention.id,
          type: "OUT",
          quantity: -material.quantity,
          unitCostCents: inventory.product.purchasePriceCents,
          reference: `INT-${intervention.id.slice(-8).toUpperCase()}`,
          notes: "Matériel consommé depuis la clôture terrain",
        },
        select: { id: true },
      })
      movementIds.push(movement.id)
    }

    const expenseMappings: Array<{ id: string; sourceId: string }> = []
    for (const expense of data.expenses) {
      const created = await tx.expense.create({
        data: {
          companyId: context.companyId,
          clientId: intervention.site.clientId,
          projectId: intervention.projectId,
          interventionId: intervention.id,
          sourceId: expense.sourceId,
          label: expense.label,
          amountCents: expense.amountCents,
          tvaCents: expense.tvaCents,
          date: signedAt,
          category: expense.category,
          notes: expense.notes,
          status: "TO_JUSTIFY",
        },
        select: { id: true, sourceId: true },
      })
      expenseMappings.push({ id: created.id, sourceId: created.sourceId! })
    }

    const reservationIds: string[] = []
    for (const reservation of data.reservations) {
      const created = await tx.interventionReservation.create({
        data: { companyId: context.companyId, interventionId: intervention.id, sourceId: reservation.sourceId, title: reservation.title, details: reservation.details, severity: reservation.severity },
        select: { id: true },
      })
      reservationIds.push(created.id)
    }
    if (intervention.ticketId) {
      await tx.serviceTicket.updateMany({
        where: { id: intervention.ticketId, companyId: context.companyId },
        data: { status: "RESOLVED" },
      })
    }
    return { movementIds, expenseMappings, reservationIds }
  })

  await logAction({
    userId: context.userId,
    action: "COMPLETE_FIELD_INTERVENTION",
    resource: "FIELD_INTERVENTION",
    resourceId: intervention.id,
    payload: { laborMinutes: data.laborMinutes, customerName: data.customerName, signatureSha256, signatureImageHash, materialMovementIds: result.movementIds, expenseIds: result.expenseMappings.map((item) => item.id), reservationIds: result.reservationIds },
  })
  return { success: true as const, signatureSha256, expenses: result.expenseMappings }
}
