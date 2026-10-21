import "server-only"

import { createHash } from "node:crypto"
import type { PurchaseOrder } from "@prisma/client"
import type { TransactionClient } from "@/lib/prisma"
import type { AuthContext } from "@/lib/auth-wrapper"
import { operationsDashboardScope } from "./dashboard-scope"

type Context = Pick<AuthContext, "companyId" | "agencyIds">
type LineInput = { purchaseOrderId: string; purchaseOrderLineId: string; warehouseId: string }
export const purchaseStockChanged = "La réception ou le retour fournisseur a changé. Rechargez la page puis réessayez ; votre saisie est conservée."

export function purchaseStockRevision(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex")
}

export async function readPurchaseStockLine(db: TransactionClient, context: Context, input: LineInput, statuses: string[]) {
  const scope = operationsDashboardScope(context.companyId, context.agencyIds)
  const line = await db.purchaseOrderLine.findFirst({
    where: { id: input.purchaseOrderLineId, purchaseOrderId: input.purchaseOrderId, purchaseOrder: { ...scope.purchaseOrder, status: { in: statuses } } },
    include: {
      purchaseOrder: true, product: { select: { id: true } },
      receiptLines: { where: { goodsReceipt: { ...scope.goodsReceipt, purchaseOrderId: input.purchaseOrderId, warehouseId: input.warehouseId } }, orderBy: { id: "asc" }, select: { id: true, productId: true, quantity: true, acceptedQuantity: true, rejectedQuantity: true } },
      supplierReturns: { where: { ...scope.supplierReturn, purchaseOrderId: input.purchaseOrderId, warehouseId: input.warehouseId }, orderBy: { id: "asc" }, select: { id: true, productId: true, quantity: true } },
    },
  })
  if (!line) return null
  return { ...line,
    receiptLines: line.receiptLines.filter(item => item.productId === line.productId),
    supplierReturns: line.supplierReturns.filter(item => item.productId === line.productId),
  }
}

export function purchaseStockLineRevision(line: NonNullable<Awaited<ReturnType<typeof readPurchaseStockLine>>>) {
  // Returns can be committed independently while the cap is re-read under the
  // line lock. They do not make an otherwise unchanged prepared line stale.
  return purchaseStockRevision({ id: line.id, purchaseOrderId: line.purchaseOrderId, productId: line.productId,
    label: line.label, quantity: line.quantity, receivedQuantity: line.receivedQuantity, creditedQuantity: line.creditedQuantity,
    unitPriceCents: line.unitPriceCents, order: line.order, sourceKey: line.sourceKey, purchaseOrder: line.purchaseOrder })
}

export async function readPurchaseStockIssue(db: TransactionClient, context: Context, id: string) {
  const scope = operationsDashboardScope(context.companyId, context.agencyIds)
  const issue = await db.purchaseIssue.findFirst({
    where: { id, ...scope.purchaseIssue, purchaseOrder: scope.purchaseOrder, status: { in: ["OPEN", "WAITING_REPLACEMENT"] } },
    include: { purchaseOrder: true, purchaseOrderLine: true, goodsReceiptLine: { include: { goodsReceipt: true } } },
  })
  if (!issue || issue.quantity <= 0 || issue.purchaseOrderLine.purchaseOrderId !== issue.purchaseOrderId || issue.productId !== issue.purchaseOrderLine.productId) return null
  const source = issue.goodsReceiptLine
  if (source && (source.goodsReceipt.purchaseOrderId !== issue.purchaseOrderId || source.purchaseOrderLineId !== issue.purchaseOrderLineId || source.productId !== issue.productId)) return null
  return issue
}

export async function readPurchaseStockReturn(db: TransactionClient, context: Context, id: string) {
  const scope = operationsDashboardScope(context.companyId, context.agencyIds)
  const returned = await db.supplierReturn.findFirst({
    where: { id, ...scope.supplierReturn, purchaseOrder: scope.purchaseOrder, status: "SHIPPED" },
    include: { purchaseOrder: true, purchaseOrderLine: true, stockMovement: true },
  })
  if (!returned || returned.purchaseOrderLine.purchaseOrderId !== returned.purchaseOrderId || returned.supplierId !== returned.purchaseOrder.supplierId || returned.productId !== returned.purchaseOrderLine.productId) return null
  if (returned.stockMovement.productId !== returned.productId || returned.stockMovement.warehouseId !== returned.warehouseId || returned.stockMovement.type !== "OUT") return null
  return returned
}

export async function lockPurchaseStockOrder(tx: TransactionClient, context: Context, order: PurchaseOrder) {
  const claimed = await tx.purchaseOrder.updateMany({
    where: { id: order.id, ...operationsDashboardScope(context.companyId, context.agencyIds).purchaseOrder, status: order.status, updatedAt: order.updatedAt },
    data: { updatedAt: order.updatedAt },
  })
  if (claimed.count !== 1) throw new Error(purchaseStockChanged)
}
