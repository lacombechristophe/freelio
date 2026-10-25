import "server-only"

import prisma from "@/lib/prisma"
import type { AuthContext } from "@/lib/auth-wrapper"
import { operationsDashboardScope } from "./dashboard-scope"
import { purchaseDraftRevision } from "./purchase-drafts"

type Transition = { kind: "submit" | "approve" | "send"; id: string }
  | { kind: "acknowledge"; id: string; supplierReference: string; confirmedExpectedAt: string }
const definitions = {
  submit: { from: ["DRAFT"], to: "PENDING_APPROVAL", action: "SUBMIT_PURCHASE_ORDER", missing: "Commande brouillon introuvable" },
  approve: { from: ["PENDING_APPROVAL"], to: "APPROVED", action: "APPROVE_PURCHASE_ORDER", missing: "Commande en attente d’approbation introuvable" },
  send: { from: ["APPROVED"], to: "SENT", action: "SEND_PURCHASE_ORDER", missing: "La commande doit être approuvée avant envoi" },
  acknowledge: { from: ["SENT", "ACKNOWLEDGED"], to: "ACKNOWLEDGED", action: "ACKNOWLEDGE_PURCHASE_ORDER", missing: "Commande envoyée introuvable" },
}
const changed = "La commande fournisseur a changé. Rechargez la page avant de réessayer ; votre saisie est conservée."

export async function transitionPurchaseOrder(context: AuthContext, command: Transition) {
  const definition = definitions[command.kind]
  const scope = operationsDashboardScope(context.companyId, context.agencyIds)
  const where = { AND: [scope.purchaseOrder, {
    id: command.id, status: { in: definition.from }, receivedAt: null,
    goodsReceipts: { none: {} }, issues: { none: {} }, supplierReturns: { none: {} },
    lines: { every: { receivedQuantity: 0, creditedQuantity: 0, receiptLines: { none: {} }, issues: { none: {} }, supplierReturns: { none: {} } } },
    ...(command.kind === "acknowledge" ? {} : { sentAt: null, acknowledgedAt: null }),
  }] }
  const prepared = await prisma.purchaseOrder.findFirst({ where, include: { lines: true } })
  if (!prepared) throw new Error(definition.missing)
  if (command.kind === "submit" && !prepared.lines.length) throw new Error("La commande ne contient aucune ligne")
  // Recheck the prepared version and its references inside the committing
  // transaction. A reception or edit completed in between keeps its result.
  try {
    await prisma.$transaction(async tx => {
      const order = await tx.purchaseOrder.findFirst({ where, include: { lines: true } })
      if (!order || purchaseDraftRevision(order) !== purchaseDraftRevision(prepared)) throw new Error(changed)
      const now = new Date()
      const data = {
        status: definition.to, updatedAt: new Date(Math.max(now.getTime(), order.updatedAt.getTime() + 1)),
        ...(command.kind === "submit" ? { submittedAt: now } : {}),
        ...(command.kind === "approve" ? { approvedAt: now, approvedByMembershipId: context.membershipId } : {}),
        ...(command.kind === "send" ? { sentAt: now } : {}),
        ...(command.kind === "acknowledge" ? { acknowledgedAt: now, supplierReference: command.supplierReference, confirmedExpectedAt: new Date(`${command.confirmedExpectedAt}T00:00:00Z`) } : {}),
      }
      const claimed = await tx.purchaseOrder.updateMany({ where: { AND: [where, { updatedAt: order.updatedAt, status: order.status }] }, data })
      if (claimed.count !== 1) throw new Error(changed)
      await tx.auditLog.create({ data: {
        userId: context.userId, action: definition.action, resource: "PURCHASE_ORDER", resourceId: order.id,
        payload: { number: order.number,
          ...(command.kind === "approve" ? { totalHtCents: order.totalHtCents } : {}),
          ...(command.kind === "acknowledge" ? { supplierReference: command.supplierReference, confirmedExpectedAt: command.confirmedExpectedAt } : {}),
        },
      } })
    }, { isolationLevel: "Serializable" })
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2034") throw new Error(changed)
    throw error
  }
  return { success: true as const }
}
