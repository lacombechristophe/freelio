import "server-only"

import { createHash } from "node:crypto"
import type { PurchaseOrder, PurchaseOrderLine } from "@prisma/client"

// Include the lines: legacy imports can change them without updating the parent.
export function purchaseDraftRevision(order: PurchaseOrder & { lines: PurchaseOrderLine[] }) {
  return createHash("sha256").update(JSON.stringify({
    id: order.id, number: order.number, status: order.status, updatedAt: order.updatedAt,
    supplierId: order.supplierId, projectId: order.projectId, expectedAt: order.expectedAt,
    notes: order.notes, totalHtCents: order.totalHtCents, sentAt: order.sentAt,
    acknowledgedAt: order.acknowledgedAt, receivedAt: order.receivedAt,
    lines: [...order.lines].sort((a, b) => a.id.localeCompare(b.id)).map(line => ({
      id: line.id, productId: line.productId, label: line.label, quantity: line.quantity,
      unitPriceCents: line.unitPriceCents, order: line.order, sourceKey: line.sourceKey,
      receivedQuantity: line.receivedQuantity, creditedQuantity: line.creditedQuantity,
    })),
  })).digest("hex")
}

export class PurchaseDraftError extends Error {}
