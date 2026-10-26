"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { withAuth } from "@/lib/auth-wrapper"
import { logAction } from "@/lib/audit"
import {
  buildYearlyDocumentPrefix,
  readCompanyDocumentNumbers,
  nextDocumentNumber,
  withDocumentNumberRetry,
} from "@/lib/document-numbering"
import { calculateStockBalance } from "@/lib/operations/stock"
import { lockActiveWarehouses } from "@/lib/operations/warehouses"
import prisma from "@/lib/prisma"
import { lockActiveSupplier } from "@/lib/operations/suppliers"
import { transitionPurchaseOrder } from "@/lib/operations/purchase-transitions"
import {
  readPurchaseStockLine,
  readPurchaseStockIssue,
  readPurchaseStockReturn,
  purchaseStockRevision,
  purchaseStockLineRevision,
  purchaseStockChanged,
  lockPurchaseStockOrder,
  assertPurchaseInspectionCapacity,
} from "@/lib/operations/purchase-stock"
import {
  id,
  purchaseOrderSchema,
  goodsReceiptSchema,
  purchaseAcknowledgementSchema,
  purchaseIssueResolutionSchema,
  supplierReturnSchema,
} from "./schemas"
import { revalidateOperations } from "./revalidation"
import { assertInventoryClaim } from "./inventory-claim"

export async function createPurchaseOrder(input: unknown) {
  return withAuth(async ({ companyId, userId, agencyIds }) => {
    const data = purchaseOrderSchema.parse(input)
    const lines = data.lines?.length ? data.lines : [{ productId: data.productId, label: data.label!, quantity: data.quantity!, unitPriceCents: data.unitPriceCents! }]
    const projectScope = { companyId, status: "ACTIVE", client: { companyId }, ...(agencyIds === null ? {} : { agencyId: { in: agencyIds } }) }
    if (data.projectId && !(await prisma.project.findFirst({ where: { ...projectScope, id: data.projectId }, select: { id: true } }))) throw new Error("Chantier introuvable")
    const productIds = [...new Set(lines.flatMap((line) => (line.productId ? [line.productId] : [])))]
    if (productIds.length && (await prisma.product.count({ where: { id: { in: productIds }, companyId, active: true } })) !== productIds.length)
      throw new Error("Un produit fournisseur est introuvable")
    const prefix = buildYearlyDocumentPrefix("ACH-", "ACH-")
    const totalHtCents = lines.reduce((sum, line) => sum + line.quantity * line.unitPriceCents, 0)
    const order = await withDocumentNumberRetry(
      async () => {
        const last = await readCompanyDocumentNumbers(() => prisma.purchaseOrder.findMany({ where: { companyId, number: { startsWith: prefix } }, select: { number: true } }))
        return prisma.$transaction(async tx => {
          if (data.projectId && !(await tx.project.findFirst({ where: { ...projectScope, id: data.projectId }, select: { id: true } }))) throw new Error("Chantier introuvable")
          if (productIds.length && (await tx.product.count({ where: { id: { in: productIds }, companyId, active: true } })) !== productIds.length)
            throw new Error("Un produit fournisseur est introuvable")
          await lockActiveSupplier(tx, companyId, data.supplierId)
          return tx.purchaseOrder.create({
            data: {
              companyId,
              supplierId: data.supplierId,
              projectId: data.projectId,
              expectedAt: data.expectedAt,
              notes: data.notes,
              number: nextDocumentNumber(last, prefix),
              totalHtCents,
              lines: { create: lines.map((line, order) => ({ ...line, order })) },
            },
          })
        })
      },
      { label: "la commande fournisseur" },
    )
    await logAction({
      userId,
      action: "CREATE_PURCHASE_ORDER",
      resource: "PURCHASE_ORDER",
      resourceId: order.id,
      payload: { number: order.number, supplierId: data.supplierId, lineCount: lines.length, totalHtCents },
    })
    revalidateOperations()
    return { success: true as const, id: order.id, number: order.number }
  }, "operations.write")
}

export async function submitPurchaseOrder(purchaseOrderId: string) {
  return withAuth(async context => {
    const result = await transitionPurchaseOrder(context, { kind: "submit", id: id.parse(purchaseOrderId) })
    revalidateOperations()
    revalidatePath(`/dashboard/operations/achats/${purchaseOrderId}`)
    return result
  }, "operations.write")
}

export async function approvePurchaseOrder(purchaseOrderId: string) {
  return withAuth(async context => {
    const result = await transitionPurchaseOrder(context, { kind: "approve", id: id.parse(purchaseOrderId) })
    revalidateOperations()
    revalidatePath(`/dashboard/operations/achats/${purchaseOrderId}`)
    return result
  }, "purchases.approve")
}

export async function sendPurchaseOrder(purchaseOrderId: string) {
  return withAuth(async context => {
    const result = await transitionPurchaseOrder(context, { kind: "send", id: id.parse(purchaseOrderId) })
    revalidateOperations()
    revalidatePath(`/dashboard/operations/achats/${purchaseOrderId}`)
    return result
  }, "operations.write")
}

export async function acknowledgePurchaseOrder(input: unknown) {
  return withAuth(async context => {
    const data = purchaseAcknowledgementSchema.parse(input)
    const result = await transitionPurchaseOrder(context, { kind: "acknowledge", id: data.purchaseOrderId, supplierReference: data.supplierReference, confirmedExpectedAt: data.confirmedExpectedAt })
    revalidateOperations()
    revalidatePath(`/dashboard/operations/achats/${data.purchaseOrderId}`)
    return result
  }, "operations.write")
}

export async function receivePurchaseOrder(input: unknown) {
  return withAuth(async context => {
    const { companyId, userId } = context
    const data = goodsReceiptSchema.parse(input)
    const [warehouse, line] = await Promise.all([
      prisma.warehouse.findFirst({ where: { id: data.warehouseId, companyId, active: true }, select: { id: true } }),
      readPurchaseStockLine(prisma, context, data, ["SENT", "ACKNOWLEDGED", "PARTIALLY_RECEIVED", "RECEIVED_WITH_ISSUES"]),
    ])
    if (!warehouse) throw new Error("Dépôt introuvable")
    if (!line) throw new Error("Ligne de commande fournisseur introuvable")
    if (!(["SENT", "ACKNOWLEDGED", "PARTIALLY_RECEIVED", "RECEIVED_WITH_ISSUES"] as string[]).includes(line.purchaseOrder.status)) {
      throw new Error("La commande doit être envoyée avant sa réception")
    }
    const productId = line.product?.id ?? null
    if (data.rejectedQuantity > data.quantity) throw new Error("La quantité rejetée dépasse la quantité livrée")
    if (data.rejectedQuantity && !data.issueType) throw new Error("Précisez le type d’anomalie fournisseur")
    const acceptedQuantity = data.quantity - data.rejectedQuantity
    const remaining = line.quantity - line.receivedQuantity - line.creditedQuantity
    if (data.quantity > remaining) throw new Error(`La quantité livrée dépasse le reliquat de ${remaining}`)

    const prefix = buildYearlyDocumentPrefix("REC-", "REC-")
    const receipt = await withDocumentNumberRetry(
      async () =>
        prisma.$transaction(async (tx) => {
          const freshLine = await readPurchaseStockLine(tx, context, data, ["SENT", "ACKNOWLEDGED", "PARTIALLY_RECEIVED", "RECEIVED_WITH_ISSUES"])
          if (!freshLine || purchaseStockLineRevision(freshLine) !== purchaseStockLineRevision(line)) throw new Error(purchaseStockChanged)
          await lockPurchaseStockOrder(tx, context, freshLine.purchaseOrder)
          await lockActiveWarehouses(tx, companyId, [data.warehouseId])
          const last = await readCompanyDocumentNumbers(() => tx.goodsReceipt.findMany({ where: { companyId, number: { startsWith: prefix } }, select: { number: true } }))
          {
            const claimedLine = await tx.purchaseOrderLine.updateMany({
              where: {
                id: line.id, purchaseOrderId: data.purchaseOrderId, productId: line.productId, quantity: line.quantity, unitPriceCents: line.unitPriceCents,
                receivedQuantity: line.receivedQuantity,
                creditedQuantity: line.creditedQuantity,
              },
              data: { receivedQuantity: { increment: acceptedQuantity } },
            })
            if (claimedLine.count !== 1) throw new Error("Le reliquat fournisseur a changé. Rechargez la page puis réessayez.")
          }
          const created = await tx.goodsReceipt.create({
            data: {
              companyId,
              purchaseOrderId: data.purchaseOrderId,
              warehouseId: data.warehouseId,
              number: nextDocumentNumber(last, prefix),
              supplierReference: data.supplierReference,
              notes: data.notes,
              lines: {
                create: {
                  purchaseOrderLineId: line.id,
                  productId,
                  quantity: data.quantity,
                  acceptedQuantity,
                  rejectedQuantity: data.rejectedQuantity,
                  unitCostCents: line.unitPriceCents,
                },
              },
            },
            include: { lines: { select: { id: true } } },
          })
          if (acceptedQuantity) {
            if (productId) {
              await tx.inventoryItem.upsert({
                where: { warehouseId_productId: { warehouseId: data.warehouseId, productId } },
                update: { quantity: { increment: acceptedQuantity } },
                create: { companyId, warehouseId: data.warehouseId, productId, quantity: acceptedQuantity },
              })
              await tx.stockMovement.create({
                data: {
                  companyId,
                  warehouseId: data.warehouseId,
                  productId,
                  projectId: null,
                  type: "IN",
                  quantity: acceptedQuantity,
                  unitCostCents: line.unitPriceCents,
                  reference: created.number,
                  notes: `Réception ${line.purchaseOrder.number}`,
                },
              })
            }
          }
          if (data.rejectedQuantity) {
            await tx.purchaseIssue.create({
              data: {
                companyId,
                purchaseOrderId: data.purchaseOrderId,
                purchaseOrderLineId: line.id,
                goodsReceiptLineId: created.lines[0].id,
                productId,
                type: data.issueType!,
                quantity: data.rejectedQuantity,
                notes: data.issueNotes,
              },
            })
          }
          const orderLines = await tx.purchaseOrderLine.findMany({
            where: { purchaseOrderId: data.purchaseOrderId },
            select: { quantity: true, receivedQuantity: true, creditedQuantity: true },
          })
          const complete = orderLines.every((orderLine) => orderLine.receivedQuantity + orderLine.creditedQuantity >= orderLine.quantity)
          const openIssues = await tx.purchaseIssue.count({ where: { companyId, purchaseOrderId: data.purchaseOrderId, status: { not: "RESOLVED" } } })
          await tx.purchaseOrder.update({
            where: { id: data.purchaseOrderId },
            data: { status: complete ? (openIssues ? "RECEIVED_WITH_ISSUES" : "RECEIVED") : "PARTIALLY_RECEIVED", receivedAt: complete ? new Date() : null },
          })
          await tx.auditLog.create({ data: { userId, action: "RECEIVE_PURCHASE_ORDER", resource: "PURCHASE_ORDER", resourceId: data.purchaseOrderId,
            payload: { receiptId: created.id, acceptedQuantity, rejectedQuantity: data.rejectedQuantity, issueType: data.issueType } } })
          return created
        }, { isolationLevel: "Serializable" }),
      { label: "la réception fournisseur" },
    )
    revalidateOperations()
    return { success: true as const, id: receipt.id, number: receipt.number }
  }, "operations.write")
}

export async function resolvePurchaseIssue(input: unknown) {
  return withAuth(async context => {
    const { companyId, userId } = context
    const data = purchaseIssueResolutionSchema.parse(input)
    const issue = await readPurchaseStockIssue(prisma, context, data.issueId)
    if (!issue) throw new Error("Anomalie fournisseur introuvable ou déjà résolue")
    if (data.resolution === "ACCEPTED" && !issue.goodsReceiptLine) throw new Error("Réception source introuvable")
    if (data.resolution === "ACCEPTED") assertPurchaseInspectionCapacity(issue)
    const remaining = issue.purchaseOrderLine.quantity - issue.purchaseOrderLine.receivedQuantity - issue.purchaseOrderLine.creditedQuantity
    if (["CREDIT", "ACCEPTED"].includes(data.resolution) && issue.quantity > remaining) {
      throw new Error("Le reliquat a déjà été couvert ; clôturez l’anomalie avec une autre résolution")
    }

    await prisma.$transaction(async (tx) => {
      const fresh = await readPurchaseStockIssue(tx, context, data.issueId)
      if (!fresh || purchaseStockRevision(fresh) !== purchaseStockRevision(issue)) throw new Error(purchaseStockChanged)
      await lockPurchaseStockOrder(tx, context, fresh.purchaseOrder)
      if (data.resolution === "ACCEPTED") assertPurchaseInspectionCapacity(fresh)
      if (data.resolution === "ACCEPTED") await lockActiveWarehouses(tx, companyId, [issue.goodsReceiptLine!.goodsReceipt.warehouseId])
      const nextStatus = data.resolution === "REPLACEMENT" ? "WAITING_REPLACEMENT" : "RESOLVED"
      const claimed = await tx.purchaseIssue.updateMany({
        where: { id: issue.id, companyId, status: issue.status, updatedAt: issue.updatedAt },
        data: { status: nextStatus, resolutionKind: data.resolution, resolution: data.notes, resolvedAt: nextStatus === "RESOLVED" ? new Date() : null },
      })
      if (claimed.count !== 1) throw new Error("Anomalie déjà traitée")
      if (data.resolution === "CREDIT") {
        const claimedLine = await tx.purchaseOrderLine.updateMany({
          where: {
            id: issue.purchaseOrderLineId, purchaseOrderId: issue.purchaseOrderId, productId: issue.productId, quantity: issue.purchaseOrderLine.quantity, unitPriceCents: issue.purchaseOrderLine.unitPriceCents,
            receivedQuantity: issue.purchaseOrderLine.receivedQuantity,
            creditedQuantity: issue.purchaseOrderLine.creditedQuantity,
          },
          data: { creditedQuantity: { increment: issue.quantity } },
        })
        if (claimedLine.count !== 1) throw new Error("Le reliquat fournisseur a changé. Rechargez la page puis réessayez.")
      } else if (data.resolution === "ACCEPTED") {
        const warehouseId = issue.goodsReceiptLine!.goodsReceipt.warehouseId
        const claimedLine = await tx.purchaseOrderLine.updateMany({
          where: {
            id: issue.purchaseOrderLineId, purchaseOrderId: issue.purchaseOrderId, productId: issue.productId, quantity: issue.purchaseOrderLine.quantity, unitPriceCents: issue.purchaseOrderLine.unitPriceCents,
            receivedQuantity: issue.purchaseOrderLine.receivedQuantity,
            creditedQuantity: issue.purchaseOrderLine.creditedQuantity,
          },
          data: { receivedQuantity: { increment: issue.quantity } },
        })
        if (claimedLine.count !== 1) throw new Error("Le reliquat fournisseur a changé. Rechargez la page puis réessayez.")
        if (issue.productId) {
          const productId = issue.productId
          await tx.inventoryItem.upsert({
            where: { warehouseId_productId: { warehouseId, productId } },
            update: { quantity: { increment: issue.quantity } },
            create: { companyId, warehouseId, productId, quantity: issue.quantity },
          })
          await tx.stockMovement.create({
            data: {
              companyId,
              warehouseId,
              productId,
              type: "IN",
              quantity: issue.quantity,
              unitCostCents: issue.purchaseOrderLine.unitPriceCents,
              reference: `ISS-${issue.id.slice(-8).toUpperCase()}`,
              notes: `Anomalie acceptée après contrôle · ${issue.goodsReceiptLine!.goodsReceipt.number}`,
            },
          })
        }
      }
      const orderLines = await tx.purchaseOrderLine.findMany({
        where: { purchaseOrderId: issue.purchaseOrderId },
        select: { quantity: true, receivedQuantity: true, creditedQuantity: true },
      })
      const complete = orderLines.every((line) => line.receivedQuantity + line.creditedQuantity >= line.quantity)
      const openIssues = await tx.purchaseIssue.count({ where: { companyId, purchaseOrderId: issue.purchaseOrderId, status: { not: "RESOLVED" } } })
      await tx.purchaseOrder.update({
        where: { id: issue.purchaseOrderId },
        data: { status: complete ? (openIssues ? "RECEIVED_WITH_ISSUES" : "RECEIVED") : "PARTIALLY_RECEIVED", receivedAt: complete ? new Date() : null },
      })
      await tx.auditLog.create({ data: { userId, action: "RESOLVE_PURCHASE_ISSUE", resource: "PURCHASE_ISSUE", resourceId: issue.id,
        payload: { resolution: data.resolution, purchaseOrderId: issue.purchaseOrderId, quantity: issue.quantity } } })
    }, { isolationLevel: "Serializable" })
    revalidateOperations()
    return { success: true as const }
  }, "operations.write")
}

export async function createSupplierReturn(input: unknown) {
  return withAuth(async context => {
    const { companyId, userId } = context
    const data = supplierReturnSchema.parse(input)
    const [line, warehouse] = await Promise.all([
      readPurchaseStockLine(prisma, context, data, ["SENT", "ACKNOWLEDGED", "PARTIALLY_RECEIVED", "RECEIVED_WITH_ISSUES", "RECEIVED"]),
      prisma.warehouse.findFirst({ where: { id: data.warehouseId, companyId, active: true }, select: { id: true } }),
    ])
    if (!line?.product || !warehouse) throw new Error("Ligne produit ou dépôt introuvable")
    const receivedInWarehouse = line.receiptLines.reduce((sum, item) => sum + item.acceptedQuantity + item.inspectedQuantity, 0)
    const alreadyReturned = line.supplierReturns.reduce((sum, item) => sum + item.quantity, 0)
    if (data.quantity > receivedInWarehouse - alreadyReturned) throw new Error("La quantité retournée dépasse la quantité reçue dans ce dépôt")
    const prefix = buildYearlyDocumentPrefix("RET-", "RET-")
    const supplierReturn = await withDocumentNumberRetry(
      async () =>
        prisma.$transaction(async (tx) => {
          await lockPurchaseStockOrder(tx, context, line.purchaseOrder)
          await lockActiveWarehouses(tx, companyId, [data.warehouseId])
          // A no-op update takes a row lock. The following re-read therefore includes
          // returns committed by another concurrent request before validating the cap.
          const lockedLine = await tx.purchaseOrderLine.updateMany({
            where: { id: line.id, purchaseOrderId: data.purchaseOrderId },
            data: { creditedQuantity: { increment: 0 } },
          })
          if (lockedLine.count !== 1) throw new Error("Ligne fournisseur introuvable")
          const freshLine = await readPurchaseStockLine(tx, context, data, ["SENT", "ACKNOWLEDGED", "PARTIALLY_RECEIVED", "RECEIVED_WITH_ISSUES", "RECEIVED"])
          if (!freshLine || purchaseStockLineRevision(freshLine) !== purchaseStockLineRevision(line)) throw new Error(purchaseStockChanged)
          const freshReceived = freshLine.receiptLines.reduce((sum, item) => sum + item.acceptedQuantity + item.inspectedQuantity, 0)
          const freshReturned = freshLine.supplierReturns.reduce((sum, item) => sum + item.quantity, 0)
          if (data.quantity > freshReceived - freshReturned) throw new Error("La quantité retournée dépasse la quantité reçue dans ce dépôt")

          const inventory = await tx.inventoryItem.findUnique({ where: { warehouseId_productId: { warehouseId: warehouse.id, productId: line.product!.id } } })
          if (!inventory) throw new Error("Stock du produit introuvable dans ce dépôt")
          const next = calculateStockBalance({ quantity: inventory.quantity, reservedQuantity: inventory.reservedQuantity, type: "OUT", movementQuantity: data.quantity })
    const last = await readCompanyDocumentNumbers(() => tx.supplierReturn.findMany({ where: { companyId, number: { startsWith: prefix } }, select: { number: true } }))
          const number = nextDocumentNumber(last, prefix)
          assertInventoryClaim(
            await tx.inventoryItem.updateMany({
              where: { id: inventory.id, companyId, quantity: inventory.quantity, reservedQuantity: inventory.reservedQuantity },
              data: next,
            }),
          )
          const movement = await tx.stockMovement.create({
            data: {
              companyId,
              warehouseId: warehouse.id,
              productId: line.product!.id,
              type: "OUT",
              quantity: -data.quantity,
              unitCostCents: line.unitPriceCents,
              reference: number,
              notes: `Retour fournisseur · ${data.reason}`,
            },
          })
          const created = await tx.supplierReturn.create({
            data: {
              companyId,
              purchaseOrderId: data.purchaseOrderId,
              purchaseOrderLineId: line.id,
              supplierId: line.purchaseOrder.supplierId,
              warehouseId: warehouse.id,
              productId: line.product!.id,
              stockMovementId: movement.id,
              number,
              quantity: data.quantity,
              unitCostCents: line.unitPriceCents,
              reason: data.reason,
              notes: data.notes,
            },
          })
          await tx.auditLog.create({ data: { userId, action: "CREATE_SUPPLIER_RETURN", resource: "SUPPLIER_RETURN", resourceId: created.id,
            payload: { number: created.number, purchaseOrderId: data.purchaseOrderId, quantity: data.quantity } } })
          return created
        }, { isolationLevel: "Serializable" }),
      { label: "le retour fournisseur" },
    )
    revalidateOperations()
    return { success: true as const, id: supplierReturn.id, number: supplierReturn.number }
  }, "operations.write")
}

export async function creditSupplierReturn(supplierReturnId: string, creditReference: string) {
  return withAuth(async context => {
    const { companyId, userId } = context
    const data = z.object({ supplierReturnId: id, creditReference: z.string().trim().min(1).max(120) }).parse({ supplierReturnId, creditReference })
    const supplierReturn = await readPurchaseStockReturn(prisma, context, data.supplierReturnId)
    if (!supplierReturn) throw new Error("Retour fournisseur expédié introuvable")
    await prisma.$transaction(async tx => {
      const fresh = await readPurchaseStockReturn(tx, context, data.supplierReturnId)
      if (!fresh || purchaseStockRevision(fresh) !== purchaseStockRevision(supplierReturn)) throw new Error(purchaseStockChanged)
      await lockPurchaseStockOrder(tx, context, fresh.purchaseOrder)
      const claimed = await tx.supplierReturn.updateMany({ where: { id: supplierReturn.id, companyId, status: "SHIPPED", updatedAt: supplierReturn.updatedAt }, data: { status: "CREDITED", creditedAt: new Date(), creditReference: data.creditReference } })
      if (claimed.count !== 1) throw new Error(purchaseStockChanged)
      await tx.auditLog.create({ data: { userId, action: "CREDIT_SUPPLIER_RETURN", resource: "SUPPLIER_RETURN", resourceId: supplierReturn.id,
        payload: { number: supplierReturn.number, creditReference: data.creditReference } } })
    }, { isolationLevel: "Serializable" })
    revalidateOperations()
    return { success: true as const }
  }, "operations.write")
}
