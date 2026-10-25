"use server"

import { createPurchaseOrder } from "@/actions/operations"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import prisma from "@/lib/prisma"
import { withAuth } from "@/lib/auth-wrapper"
import { hasPermission } from "@/lib/permissions"
import { operationsDashboardScope } from "@/lib/operations/dashboard-scope"
import { lockActiveSupplier } from "@/lib/operations/suppliers"
import { PurchaseDraftError, purchaseDraftRevision } from "@/lib/operations/purchase-drafts"

const reference = z.string().cuid()
const revision = z.string().regex(/^[a-f0-9]{64}$/)
const optionalReference = reference.or(z.literal("")).optional().transform(value => value || null)
const expectedDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}).or(z.literal("")).optional().transform(value => value ? new Date(`${value}T00:00:00Z`) : null)
const editInput = z.object({
  id: reference, revision, supplierId: reference, projectId: optionalReference, expectedAt: expectedDate,
  notes: z.string().trim().max(2000).optional().transform(value => value || null),
  lines: z.array(z.object({
    id: reference.optional(), productId: optionalReference, label: z.string().trim().min(2).max(200),
    quantity: z.number().int().min(1).max(1_000_000), unitPriceCents: z.number().int().min(0).max(2_000_000_000),
  }).strict()).min(1).max(200),
}).strict().refine(data => {
  const ids = data.lines.flatMap(line => line.id ? [line.id] : [])
  return new Set(ids).size === ids.length
}, "Une ligne est présente plusieurs fois").refine(data => {
  const total = data.lines.reduce((sum, line) => sum + line.quantity * line.unitPriceCents, 0)
  return Number.isSafeInteger(total) && total <= 2_147_483_647
}, "Le montant de la commande dépasse la capacité de calcul")
const cancelInput = z.object({ id: reference, revision, reason: z.string().trim().min(3).max(2000), confirmed: z.literal(true) }).strict()
const changed = "La commande fournisseur a changé. Rechargez la page avant de réessayer ; votre saisie est conservée."
const untouched = {
  sentAt: null, acknowledgedAt: null, receivedAt: null,
  goodsReceipts: { none: {} }, issues: { none: {} }, supplierReturns: { none: {} },
  lines: { every: { receivedQuantity: 0, creditedQuantity: 0, receiptLines: { none: {} }, issues: { none: {} }, supplierReturns: { none: {} } } },
} as const

function expectedFailure(error: unknown) {
  if (error instanceof PurchaseDraftError) return { success: false as const, error: error.message }
  if (error && typeof error === "object" && "code" in error && error.code === "P2034") return { success: false as const, error: changed }
  throw error
}

function refresh(id: string) {
  revalidatePath("/dashboard/operations")
  revalidatePath(`/dashboard/operations/achats/${id}`)
}

export async function createPurchaseDraft(input: unknown) {
  try {
    return await createPurchaseOrder(input)
  } catch (error) {
    // Expected refusals cross the Action boundary as data. Unexpected errors
    // retain Next.js production redaction instead of exposing database details.
    if (error instanceof Error && ["Chantier introuvable", "Un produit fournisseur est introuvable"].includes(error.message)) {
      return { success: false as const, error: error.message }
    }
    throw error
  }
}

export async function updatePurchaseDraft(input: unknown) {
  return withAuth(async ({ companyId, userId, agencyIds }) => {
    const parsed = editInput.safeParse(input)
    if (!parsed.success) return { success: false as const, error: "Vérifiez les lignes, les montants et la date de livraison de la commande." }
    const data = parsed.data, scope = operationsDashboardScope(companyId, agencyIds)
    if (agencyIds !== null && !data.projectId) return { success: false as const, error: "Un chantier accessible est requis pour cette commande." }
    try {
      const result = await prisma.$transaction(async tx => {
        const order = await tx.purchaseOrder.findFirst({ where: { id: data.id, ...scope.purchaseOrder, status: "DRAFT", ...untouched }, include: { lines: true } })
        if (!order) throw new PurchaseDraftError("Commande brouillon introuvable ou non modifiable")
        if (purchaseDraftRevision(order) !== data.revision) throw new PurchaseDraftError(changed)
        if (data.lines.some(line => line.id && !order.lines.some(existing => existing.id === line.id))) throw new PurchaseDraftError("Une ligne de la commande est introuvable")
        if (data.projectId && !(await tx.project.findFirst({ where: { id: data.projectId, ...scope.project, status: "ACTIVE" }, select: { id: true } }))) throw new PurchaseDraftError("Chantier introuvable")
        const productIds = [...new Set(data.lines.flatMap(line => line.productId ? [line.productId] : []))]
        if (productIds.length && await tx.product.count({ where: { ...scope.product, active: true, id: { in: productIds } } }) !== productIds.length) throw new PurchaseDraftError("Un produit fournisseur est introuvable")
        try { await lockActiveSupplier(tx, companyId, data.supplierId) } catch (error) {
          if (error instanceof Error && ["Fournisseur introuvable ou inactif", "Le fournisseur a changé. Rechargez la sélection."].includes(error.message)) throw new PurchaseDraftError(error.message)
          throw error
        }
        const totalHtCents = data.lines.reduce((sum, line) => sum + line.quantity * line.unitPriceCents, 0)
        const claimed = await tx.purchaseOrder.updateMany({
          where: { id: order.id, ...scope.purchaseOrder, status: "DRAFT", updatedAt: order.updatedAt, ...untouched },
          data: { supplierId: data.supplierId, projectId: data.projectId, expectedAt: data.expectedAt, notes: data.notes, totalHtCents, updatedAt: new Date(Math.max(Date.now(), order.updatedAt.getTime() + 1)) },
        })
        if (claimed.count !== 1) throw new PurchaseDraftError(changed)
        const retainedIds = data.lines.flatMap(line => line.id ? [line.id] : [])
        await tx.purchaseOrderLine.deleteMany({ where: { purchaseOrderId: order.id, id: { notIn: retainedIds } } })
        for (const [position, line] of data.lines.entries()) {
          const { id, ...values } = line
          if (id) await tx.purchaseOrderLine.update({ where: { id }, data: { ...values, order: position } })
          else await tx.purchaseOrderLine.create({ data: { ...values, purchaseOrderId: order.id, order: position } })
        }
        await tx.auditLog.create({ data: { userId, action: "UPDATE_PURCHASE_ORDER", resource: "PURCHASE_ORDER", resourceId: order.id, payload: { number: order.number, previousRevision: data.revision, previousTotalHtCents: order.totalHtCents, totalHtCents, lineCount: data.lines.length } } })
        return { success: true as const, id: order.id, number: order.number }
      }, { isolationLevel: "Serializable" })
      refresh(result.id)
      return result
    } catch (error) { return expectedFailure(error) }
  }, "operations.write")
}

export async function cancelPurchaseDraft(input: unknown) {
  return withAuth(async ({ companyId, userId, role, agencyIds }) => {
    const parsed = cancelInput.safeParse(input)
    if (!parsed.success) return { success: false as const, error: "Précisez un motif et confirmez l’annulation de la commande." }
    const data = parsed.data, scope = operationsDashboardScope(companyId, agencyIds)
    try {
      await prisma.$transaction(async tx => {
        const order = await tx.purchaseOrder.findFirst({ where: { id: data.id, ...scope.purchaseOrder, status: { in: ["DRAFT", "PENDING_APPROVAL", "APPROVED"] }, ...untouched }, include: { lines: true } })
        if (!order) throw new PurchaseDraftError("Commande fournisseur introuvable ou déjà transmise")
        if (order.status === "APPROVED" && !hasPermission(role, "purchases.approve")) throw new PurchaseDraftError("Le droit d’approbation des achats est requis pour annuler une commande approuvée")
        if (purchaseDraftRevision(order) !== data.revision) throw new PurchaseDraftError(changed)
        const claimed = await tx.purchaseOrder.updateMany({ where: { id: order.id, ...scope.purchaseOrder, status: order.status, updatedAt: order.updatedAt, ...untouched }, data: { status: "CANCELED", updatedAt: new Date(Math.max(Date.now(), order.updatedAt.getTime() + 1)) } })
        if (claimed.count !== 1) throw new PurchaseDraftError(changed)
        await tx.auditLog.create({ data: { userId, action: "CANCEL_PURCHASE_ORDER", resource: "PURCHASE_ORDER", resourceId: order.id, payload: { number: order.number, previousStatus: order.status, reason: data.reason, totalHtCents: order.totalHtCents } } })
      }, { isolationLevel: "Serializable" })
      refresh(data.id)
      return { success: true as const }
    } catch (error) { return expectedFailure(error) }
  }, "operations.write")
}
