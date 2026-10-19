import "server-only"

import type { TransactionClient } from "@/lib/prisma"

// All stock writers lock warehouse rows in the same order. Management can then
// change their activity/agency without racing a prepared movement or receipt.
export async function lockActiveWarehouses(tx: TransactionClient, companyId: string, ids: readonly string[]) {
  for (const id of [...new Set(ids)].sort()) {
    const where = { id, companyId, active: true, OR: [{ agencyId: null }, { agency: { companyId } }] }
    const warehouse = await tx.warehouse.findFirst({ where, select: { updatedAt: true } })
    if (!warehouse) throw new Error("Dépôt introuvable ou inactif")
    const locked = await tx.warehouse.updateMany({ where: { ...where, updatedAt: warehouse.updatedAt },
      data: { active: true, updatedAt: warehouse.updatedAt } })
    if (locked.count !== 1) throw new Error("Dépôt introuvable ou inactif")
  }
}

// Called after taking the warehouse row lock. Do not let inconsistent legacy
// child ownership hide stock that would otherwise be stranded by deactivation.
export async function assertWarehouseEmpty(tx: TransactionClient, companyId: string, id: string) {
  const warehouse = await tx.warehouse.findFirst({ where: { id, companyId }, select: {
    inventoryItems: { where: { OR: [{ quantity: { not: 0 } }, { reservedQuantity: { not: 0 } }] }, select: { id: true }, take: 1 },
    reservations: { where: { status: "ACTIVE" }, select: { id: true }, take: 1 },
  } })
  if (!warehouse) throw new Error("Dépôt introuvable")
  if (warehouse.inventoryItems.length || warehouse.reservations.length) throw new Error("Ce dépôt contient du stock ou des réservations actives. Videz-le avant de le désactiver.")
}
