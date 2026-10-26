"use server"

import { withAuth, type AuthContext } from "@/lib/auth-wrapper"
import { isTransactionConflict } from "@/lib/transaction-conflicts"
import type { StockReservation } from "@/generated/prisma/client"
import { logAction } from "@/lib/audit"
import { calculateStockBalance, calculateStockTransferBalances } from "@/lib/operations/stock"
import { operationsDashboardScope } from "@/lib/operations/dashboard-scope"
import { lockActiveWarehouses } from "@/lib/operations/warehouses"
import prisma, { type TransactionClient } from "@/lib/prisma"
import { coherentCustomerOrder } from "@/lib/operations/customer-deliveries"
import {
  id,
  movementSchema,
  stockTransferSchema,
  interventionMaterialSchema,
  reservationSchema,
} from "./schemas"
import { revalidateOperations } from "./revalidation"
import { assertInventoryClaim } from "./inventory-claim"

async function stockReservationReferences(db: TransactionClient, context: Pick<AuthContext, "companyId" | "agencyIds">, projectId?: string | null, customerOrderId?: string | null) {
  const scope = operationsDashboardScope(context.companyId, context.agencyIds)
  const [project, order] = await Promise.all([
    projectId ? db.project.findFirst({ where: { id: projectId, ...scope.project }, select: { id: true, clientId: true, site: { select: { clientId: true } } } }) : null,
    customerOrderId ? db.customerOrder.findFirst({
      where: { id: customerOrderId, ...scope.customerOrder },
      select: { id: true, clientId: true, projectId: true, project: { select: { clientId: true, site: { select: { clientId: true } } } }, quote: { select: { clientId: true, projectId: true } } },
    }) : null,
  ])
  return { project: project && (!project.site || project.site.clientId === project.clientId) ? project : null, customerOrder: order && coherentCustomerOrder(order) ? order : null }
}

function assertFreshStockReservation(current: StockReservation | null, previous: StockReservation): asserts current is StockReservation {
  const fields = ["warehouseId", "productId", "projectId", "customerOrderId", "quantity", "notes"] as const
  if (!current || current.updatedAt.getTime() !== previous.updatedAt.getTime() || fields.some(field => current[field] !== previous[field])) throw new Error("Réservation active introuvable")
}

function stockTransactionFailure(error: unknown): never {
  if (isTransactionConflict(error)) throw new Error("Le stock a changé. Rechargez la page puis réessayez ; votre saisie est conservée.")
  throw error
}

export async function reserveStock(input: unknown) {
  return withAuth(async context => {
    const { companyId, userId } = context
    const data = reservationSchema.parse(input)
    const scope = operationsDashboardScope(companyId, context.agencyIds)
    const [warehouse, product, { project, customerOrder }] = await Promise.all([
      prisma.warehouse.findFirst({ where: { id: data.warehouseId, companyId, active: true }, select: { id: true } }),
      prisma.product.findFirst({ where: { id: data.productId, ...scope.product, active: true }, select: { id: true } }),
      stockReservationReferences(prisma, context, data.projectId, data.customerOrderId),
    ])
    if (!warehouse || !product) throw new Error("Dépôt ou produit introuvable")
    if (data.projectId && !project) throw new Error("Chantier introuvable")
    if (data.customerOrderId && !customerOrder) throw new Error("Commande client introuvable")
    if (!data.projectId && !data.customerOrderId) throw new Error("Rattachez la réservation à un chantier ou une commande client")

    const reservation = await prisma.$transaction(async (tx) => {
      await lockActiveWarehouses(tx, companyId, [data.warehouseId])
      const [freshProduct, references] = await Promise.all([
        tx.product.findFirst({ where: { id: data.productId, ...scope.product, active: true }, select: { id: true } }),
        stockReservationReferences(tx, context, data.projectId, data.customerOrderId),
      ])
      if (!freshProduct) throw new Error("Dépôt ou produit introuvable")
      if (data.projectId && !references.project) throw new Error("Chantier introuvable")
      if (data.customerOrderId && !references.customerOrder) throw new Error("Commande client introuvable")
      const current = await tx.inventoryItem.findUnique({ where: { warehouseId_productId: { warehouseId: data.warehouseId, productId: data.productId } } })
      if (!current) throw new Error("Aucun stock disponible pour ce produit")
      const next = calculateStockBalance({ quantity: current.quantity, reservedQuantity: current.reservedQuantity, type: "RESERVE", movementQuantity: data.quantity })
      const created = await tx.stockReservation.create({ data: { companyId, ...data } })
      assertInventoryClaim(
        await tx.inventoryItem.updateMany({
          where: { id: current.id, companyId, quantity: current.quantity, reservedQuantity: current.reservedQuantity },
          data: next,
        }),
      )
      await tx.stockMovement.create({
        data: {
          companyId,
          warehouseId: data.warehouseId,
          productId: data.productId,
          projectId: data.projectId,
          reservationId: created.id,
          type: "RESERVE",
          quantity: data.quantity,
          reference: data.customerOrderId ? `Commande ${data.customerOrderId}` : null,
          notes: data.notes,
        },
      })
      await tx.auditLog.create({ data: { userId, action: "CREATE_STOCK_RESERVATION", resource: "STOCK_RESERVATION", resourceId: created.id,
        payload: { quantity: created.quantity, productId: created.productId, warehouseId: created.warehouseId, projectId: created.projectId, customerOrderId: created.customerOrderId } } })
      return created
    }, { isolationLevel: "Serializable" }).catch(stockTransactionFailure)
    revalidateOperations()
    return { success: true as const, id: reservation.id }
  }, "operations.write")
}

export async function releaseStockReservation(reservationId: string) {
  return withAuth(async context => {
    const { companyId, userId } = context
    const parsedId = id.parse(reservationId)
    const reservation = await prisma.stockReservation.findFirst({ where: { id: parsedId, companyId, status: "ACTIVE" } })
    if (!reservation) throw new Error("Réservation active introuvable")
    const references = await stockReservationReferences(prisma, context, reservation.projectId, reservation.customerOrderId)
    if ((reservation.projectId && !references.project) || (reservation.customerOrderId && !references.customerOrder)) throw new Error("Réservation active introuvable")
    await prisma.$transaction(async (tx) => {
      const currentReservation = await tx.stockReservation.findFirst({ where: { id: reservation.id, ...operationsDashboardScope(companyId, context.agencyIds).reservation, status: "ACTIVE" } })
      assertFreshStockReservation(currentReservation, reservation)
      const freshReferences = await stockReservationReferences(tx, context, reservation.projectId, reservation.customerOrderId)
      if ((reservation.projectId && !freshReferences.project) || (reservation.customerOrderId && !freshReferences.customerOrder)) throw new Error("Réservation active introuvable")
      const claimedReservation = await tx.stockReservation.updateMany({
        where: { id: reservation.id, companyId, status: "ACTIVE", updatedAt: reservation.updatedAt },
        data: { status: "RELEASED", releasedAt: new Date() },
      })
      if (claimedReservation.count !== 1) throw new Error("Cette réservation vient déjà d’être traitée")
      const current = await tx.inventoryItem.findUnique({ where: { warehouseId_productId: { warehouseId: reservation.warehouseId, productId: reservation.productId } } })
      if (!current) throw new Error("Stock de la réservation introuvable")
      const next = calculateStockBalance({ quantity: current.quantity, reservedQuantity: current.reservedQuantity, type: "RELEASE", movementQuantity: reservation.quantity })
      assertInventoryClaim(
        await tx.inventoryItem.updateMany({
          where: { id: current.id, companyId, quantity: current.quantity, reservedQuantity: current.reservedQuantity },
          data: next,
        }),
      )
      await tx.stockMovement.create({
        data: {
          companyId,
          warehouseId: reservation.warehouseId,
          productId: reservation.productId,
          projectId: reservation.projectId,
          reservationId: reservation.id,
          type: "RELEASE",
          quantity: reservation.quantity,
          reference: `Libération ${reservation.id}`,
          notes: reservation.notes,
        },
      })
      await tx.auditLog.create({ data: { userId, action: "RELEASE_STOCK_RESERVATION", resource: "STOCK_RESERVATION", resourceId: reservation.id,
        payload: { quantity: reservation.quantity, productId: reservation.productId, warehouseId: reservation.warehouseId } } })
    }, { isolationLevel: "Serializable" }).catch(stockTransactionFailure)
    revalidateOperations()
    return { success: true as const }
  }, "operations.write")
}

export async function consumeStockReservation(reservationId: string) {
  return withAuth(async context => {
    const { companyId, userId } = context
    const parsedId = id.parse(reservationId)
    const reservation = await prisma.stockReservation.findFirst({ where: { id: parsedId, companyId, status: "ACTIVE" } })
    if (!reservation) throw new Error("Réservation active introuvable")
    const references = await stockReservationReferences(prisma, context, reservation.projectId, reservation.customerOrderId)
    if ((reservation.projectId && !references.project) || (reservation.customerOrderId && !references.customerOrder)) throw new Error("Réservation active introuvable")
    await prisma.$transaction(async (tx) => {
      const currentReservation = await tx.stockReservation.findFirst({ where: { id: reservation.id, ...operationsDashboardScope(companyId, context.agencyIds).reservation, status: "ACTIVE" } })
      assertFreshStockReservation(currentReservation, reservation)
      const freshReferences = await stockReservationReferences(tx, context, reservation.projectId, reservation.customerOrderId)
      if ((reservation.projectId && !freshReferences.project) || (reservation.customerOrderId && !freshReferences.customerOrder)) throw new Error("Réservation active introuvable")
      const claimedReservation = await tx.stockReservation.updateMany({
        where: { id: reservation.id, companyId, status: "ACTIVE", updatedAt: reservation.updatedAt },
        data: { status: "CONSUMED", releasedAt: new Date() },
      })
      if (claimedReservation.count !== 1) throw new Error("Cette réservation vient déjà d’être traitée")
      const current = await tx.inventoryItem.findUnique({ where: { warehouseId_productId: { warehouseId: reservation.warehouseId, productId: reservation.productId } } })
      if (!current) throw new Error("Stock de la réservation introuvable")
      const next = calculateStockBalance({ quantity: current.quantity, reservedQuantity: current.reservedQuantity, type: "CONSUME", movementQuantity: reservation.quantity })
      assertInventoryClaim(
        await tx.inventoryItem.updateMany({
          where: { id: current.id, companyId, quantity: current.quantity, reservedQuantity: current.reservedQuantity },
          data: next,
        }),
      )
      await tx.stockMovement.create({
        data: {
          companyId,
          warehouseId: reservation.warehouseId,
          productId: reservation.productId,
          projectId: reservation.projectId,
          reservationId: reservation.id,
          type: "CONSUME",
          quantity: -reservation.quantity,
          reference: reservation.customerOrderId ? `Commande ${reservation.customerOrderId}` : `Réservation ${reservation.id}`,
          notes: reservation.notes,
        },
      })
      if (reservation.customerOrderId) {
        await tx.customerOrder.updateMany({
          where: { id: reservation.customerOrderId, companyId, status: "CONFIRMED" },
          data: { status: "IN_PREPARATION" },
        })
      }
      await tx.auditLog.create({ data: { userId, action: "CONSUME_STOCK_RESERVATION", resource: "STOCK_RESERVATION", resourceId: reservation.id,
        payload: { quantity: reservation.quantity, productId: reservation.productId } } })
    }, { isolationLevel: "Serializable" }).catch(stockTransactionFailure)
    revalidateOperations()
    return { success: true as const }
  }, "operations.write")
}

export async function createStockMovement(input: unknown) {
  return withAuth(async ({ companyId }) => {
    const data = movementSchema.parse(input)
    const [warehouse, product, project] = await Promise.all([
      prisma.warehouse.findFirst({ where: { id: data.warehouseId, companyId, active: true }, select: { id: true } }),
      prisma.product.findFirst({ where: { id: data.productId, companyId, active: true }, select: { id: true } }),
      data.projectId ? prisma.project.findFirst({ where: { id: data.projectId, companyId }, select: { id: true } }) : null,
    ])
    if (!warehouse || !product) throw new Error("Dépôt ou produit introuvable")
    if (data.projectId && !project) throw new Error("Chantier introuvable")

    await prisma.$transaction(async (tx) => {
      await lockActiveWarehouses(tx, companyId, [data.warehouseId])
      const current = await tx.inventoryItem.findUnique({ where: { warehouseId_productId: { warehouseId: data.warehouseId, productId: data.productId } } })
      const magnitude = Math.abs(data.quantity)
      const next = calculateStockBalance({ quantity: current?.quantity ?? 0, reservedQuantity: current?.reservedQuantity ?? 0, type: data.type, movementQuantity: data.quantity })
      if (data.type === "IN" || (data.type === "ADJUST" && data.quantity > 0)) {
        const increment = data.type === "IN" ? magnitude : data.quantity
        await tx.inventoryItem.upsert({
          where: { warehouseId_productId: { warehouseId: data.warehouseId, productId: data.productId } },
          update: { quantity: { increment } },
          create: { companyId, warehouseId: data.warehouseId, productId: data.productId, quantity: increment },
        })
      } else {
        if (!current) throw new Error("Aucun stock disponible pour ce produit")
        assertInventoryClaim(
          await tx.inventoryItem.updateMany({
            where: { id: current.id, companyId, quantity: current.quantity, reservedQuantity: current.reservedQuantity },
            data: next,
          }),
        )
      }
      await tx.stockMovement.create({
        data: { companyId, ...data, quantity: data.type === "OUT" || data.type === "CONSUME" ? -magnitude : data.type === "IN" ? magnitude : data.quantity },
      })
    })
    revalidateOperations()
    return { success: true as const }
  }, "operations.write")
}

export async function createStockTransfer(input: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    const data = stockTransferSchema.parse(input)
    const [fromWarehouse, toWarehouse, product] = await Promise.all([
      prisma.warehouse.findFirst({ where: { id: data.fromWarehouseId, companyId, active: true }, select: { id: true, name: true } }),
      prisma.warehouse.findFirst({ where: { id: data.toWarehouseId, companyId, active: true }, select: { id: true, name: true } }),
      prisma.product.findFirst({ where: { id: data.productId, companyId, active: true, stockTracked: true }, select: { id: true, label: true, purchasePriceCents: true } }),
    ])
    if (!fromWarehouse || !toWarehouse || !product) throw new Error("Dépôt ou produit suivi en stock introuvable")

    const transfer = await prisma.$transaction(
      async (tx) => {
        await lockActiveWarehouses(tx, companyId, [fromWarehouse.id, toWarehouse.id])
        const [sourceInventory, destinationInventory] = await Promise.all([
          tx.inventoryItem.findUnique({ where: { warehouseId_productId: { warehouseId: fromWarehouse.id, productId: product.id } } }),
          tx.inventoryItem.findUnique({ where: { warehouseId_productId: { warehouseId: toWarehouse.id, productId: product.id } } }),
        ])
        if (!sourceInventory) throw new Error("Aucun stock disponible dans le dépôt de départ")

        const balances = calculateStockTransferBalances({
          source: { quantity: sourceInventory.quantity, reservedQuantity: sourceInventory.reservedQuantity },
          destination: { quantity: destinationInventory?.quantity ?? 0, reservedQuantity: destinationInventory?.reservedQuantity ?? 0 },
          transferQuantity: data.quantity,
        })
        await tx.inventoryItem.update({ where: { id: sourceInventory.id }, data: balances.source })
        await tx.inventoryItem.upsert({
          where: { warehouseId_productId: { warehouseId: toWarehouse.id, productId: product.id } },
          update: balances.destination,
          create: { companyId, warehouseId: toWarehouse.id, productId: product.id, ...balances.destination },
        })

        const created = await tx.stockTransfer.create({
          data: {
            companyId,
            fromWarehouseId: fromWarehouse.id,
            toWarehouseId: toWarehouse.id,
            productId: product.id,
            quantity: data.quantity,
            unitCostCents: data.unitCostCents ?? product.purchasePriceCents,
            reference: data.reference,
            notes: data.notes,
          },
          select: { id: true },
        })
        const movementReference = data.reference || `TRF-${created.id.slice(-8).toUpperCase()}`
        await tx.stockMovement.createMany({
          data: [
            {
              companyId,
              warehouseId: fromWarehouse.id,
              productId: product.id,
              stockTransferId: created.id,
              transferLeg: "OUTBOUND",
              type: "OUT",
              quantity: -data.quantity,
              unitCostCents: data.unitCostCents ?? product.purchasePriceCents,
              reference: movementReference,
              notes: data.notes,
            },
            {
              companyId,
              warehouseId: toWarehouse.id,
              productId: product.id,
              stockTransferId: created.id,
              transferLeg: "INBOUND",
              type: "IN",
              quantity: data.quantity,
              unitCostCents: data.unitCostCents ?? product.purchasePriceCents,
              reference: movementReference,
              notes: data.notes,
            },
          ],
        })
        return created
      },
      { isolationLevel: "Serializable" },
    )

    await logAction({
      userId,
      action: "TRANSFER_STOCK",
      resource: "STOCK_TRANSFER",
      resourceId: transfer.id,
      payload: { fromWarehouseId: fromWarehouse.id, toWarehouseId: toWarehouse.id, productId: product.id, quantity: data.quantity },
    })
    revalidateOperations()
    return { success: true as const, id: transfer.id }
  }, "operations.write")
}

export async function consumeInterventionMaterial(input: unknown) {
  return withAuth(async ({ companyId, userId, membershipId, role }) => {
    const data = interventionMaterialSchema.parse(input)
    const technicianScope = role === "TECHNICIAN" ? { assignedMembershipId: membershipId } : {}
    const [intervention, warehouse, product] = await Promise.all([
      prisma.fieldIntervention.findFirst({ where: { id: data.interventionId, companyId, ...technicianScope, status: { not: "CANCELED" } }, select: { id: true, projectId: true } }),
      prisma.warehouse.findFirst({ where: { id: data.warehouseId, companyId, active: true }, select: { id: true } }),
      prisma.product.findFirst({ where: { id: data.productId, companyId, active: true, stockTracked: true }, select: { id: true, purchasePriceCents: true, label: true } }),
    ])
    if (!intervention) throw new Error("Intervention introuvable ou annulée")
    if (!warehouse || !product) throw new Error("Dépôt ou produit suivi en stock introuvable")

    const movement = await prisma.$transaction(async (tx) => {
      await lockActiveWarehouses(tx, companyId, [warehouse.id])
      const current = await tx.inventoryItem.findUnique({ where: { warehouseId_productId: { warehouseId: warehouse.id, productId: product.id } } })
      if (!current) throw new Error("Aucun stock disponible pour ce produit dans ce dépôt")
      const next = calculateStockBalance({ quantity: current.quantity, reservedQuantity: current.reservedQuantity, type: "OUT", movementQuantity: data.quantity })
      assertInventoryClaim(
        await tx.inventoryItem.updateMany({
          where: { id: current.id, companyId, quantity: current.quantity, reservedQuantity: current.reservedQuantity },
          data: next,
        }),
      )
      return tx.stockMovement.create({
        data: {
          companyId,
          warehouseId: warehouse.id,
          productId: product.id,
          projectId: intervention.projectId,
          fieldInterventionId: intervention.id,
          type: "OUT",
          quantity: -data.quantity,
          unitCostCents: product.purchasePriceCents,
          reference: `INT-${intervention.id.slice(-8).toUpperCase()}`,
          notes: "Matériel consommé en intervention",
        },
        select: { id: true },
      })
    })
    await logAction({
      userId,
      action: "CONSUME_INTERVENTION_MATERIAL",
      resource: "FIELD_INTERVENTION",
      resourceId: intervention.id,
      payload: { movementId: movement.id, productId: product.id, warehouseId: warehouse.id, quantity: data.quantity, unitCostCents: product.purchasePriceCents },
    })
    revalidateOperations()
    return { success: true as const, movementId: movement.id }
  }, "operations.write")
}
