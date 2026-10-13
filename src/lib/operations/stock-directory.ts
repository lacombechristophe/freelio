import "server-only"

import { z } from "zod"
import prisma from "@/lib/prisma"
import { inventoryReadWhere, type AgencyAccess } from "@/lib/agency-access"
import { DIRECTORY_PAGE_SIZE } from "@/lib/directory-query"

export const stockDirectoryQuery = z.object({
  search: z.string().trim().max(200).default(""),
  page: z.number().int().min(1).max(100000).default(1),
  agencyId: z.string().min(1).max(100).optional(),
}).strict()

type CriticalProduct = { id: string; sku: string; label: string; available: number | null; threshold: number | null }
type StockScope = { lowStockCount: number; criticalProducts: CriticalProduct[]; available: number | null; stockValueCents: number | null }
type Accumulator = { lowStockCount: number; criticalProducts: CriticalProduct[]; quantity: bigint; reserved: bigint; value: bigint }

function exactNumber(value: bigint) {
  return value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : null
}

function accumulator(): Accumulator {
  return { lowStockCount: 0, criticalProducts: [], quantity: BigInt(0), reserved: BigInt(0), value: BigInt(0) }
}

function totals(items: { quantity: number; reservedQuantity: number; reorderPoint: number }[]) {
  return items.reduce((sum, item) => ({
    quantity: sum.quantity + BigInt(item.quantity),
    reserved: sum.reserved + BigInt(item.reservedQuantity),
    threshold: sum.threshold + BigInt(item.reorderPoint),
  }), { quantity: BigInt(0), reserved: BigInt(0), threshold: BigInt(0) })
}

function addProduct(scope: Accumulator, product: { id: string; sku: string; label: string; stockTracked: boolean; purchasePriceCents: number }, items: Parameters<typeof totals>[0], includeEmpty: boolean) {
  const sum = totals(items)
  scope.quantity += sum.quantity
  scope.reserved += sum.reserved
  scope.value += sum.quantity * BigInt(product.purchasePriceCents)
  if (product.stockTracked && (includeEmpty || items.length > 0) && sum.quantity - sum.reserved <= sum.threshold) {
    scope.lowStockCount += 1
    if (scope.criticalProducts.length < 5) scope.criticalProducts.push({
      id: product.id, sku: product.sku, label: product.label,
      available: exactNumber(sum.quantity - sum.reserved), threshold: exactNumber(sum.threshold),
    })
  }
}

function finish(scope: Accumulator): StockScope {
  return { lowStockCount: scope.lowStockCount, criticalProducts: scope.criticalProducts,
    available: exactNumber(scope.quantity - scope.reserved), stockValueCents: exactNumber(scope.value) }
}

export async function readStockDirectory(companyId: string, agencyIds: AgencyAccess, query: z.infer<typeof stockDirectoryQuery>) {
  return prisma.$transaction(async tx => {
    const agencies = await tx.agency.findMany({ where: { companyId, active: true, ...(agencyIds === null ? {} : { id: { in: agencyIds } }) }, select: { id: true } })
    if (query.agencyId && !agencies.some(agency => agency.id === query.agencyId)) throw new Error("AGENCY_ACCESS_DENIED")
    const all = accumulator()
    const byAgency = new Map(agencies.map(agency => [agency.id, accumulator()]))
    const inventoryWhere = inventoryReadWhere(companyId, agencyIds)
    const select = {
      id: true, sku: true, label: true, stockTracked: true, purchasePriceCents: true,
      supplier: { select: { name: true, companyId: true } },
      inventoryItems: { where: inventoryWhere, select: { quantity: true, reservedQuantity: true, reorderPoint: true, warehouse: { select: { agencyId: true, active: true } } } },
    } as const
    const orderBy = [{ label: "asc" as const }, { id: "asc" as const }]
    // Scan bounded batches in one snapshot; only totals and five previews leave the server.
    let cursor: string | undefined
    for (;;) {
      const products = await tx.product.findMany({ where: { companyId, active: true }, select, orderBy,
        take: 250, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) })
      for (const product of products) {
        addProduct(all, product, product.inventoryItems, true)
        const groups = new Map<string, typeof product.inventoryItems>()
        for (const item of product.inventoryItems) {
          const agencyId = item.warehouse.agencyId
          if (item.warehouse.active && agencyId && byAgency.has(agencyId)) {
            const group = groups.get(agencyId) ?? []
            group.push(item); groups.set(agencyId, group)
          }
        }
        for (const [agencyId, items] of groups) addProduct(byAgency.get(agencyId)!, product, items, false)
      }
      if (products.length < 250) break
      cursor = products[products.length - 1].id
    }
    const contains = { contains: query.search, ...(process.env.DATABASE_URL?.startsWith("postgres") ? { mode: "insensitive" as const } : {}) }
    const where = { companyId, active: true, ...(query.search ? { OR: [{ sku: contains }, { label: contains }] } : {}) }
    const total = await tx.product.count({ where })
    const page = Math.min(query.page, Math.max(1, Math.ceil(total / DIRECTORY_PAGE_SIZE)))
    const products = await tx.product.findMany({ where, select, orderBy, take: DIRECTORY_PAGE_SIZE, skip: (page - 1) * DIRECTORY_PAGE_SIZE })
    const items = products.map(product => {
      const inventory = query.agencyId ? product.inventoryItems.filter(item => item.warehouse.active && item.warehouse.agencyId === query.agencyId) : product.inventoryItems
      const sum = totals(inventory)
      return { id: product.id, sku: product.sku, label: product.label,
        supplier: product.supplier?.companyId === companyId ? { name: product.supplier.name } : null,
        available: exactNumber(sum.quantity - sum.reserved), reserved: exactNumber(sum.reserved) }
    })
    return { items, total, page, summary: { all: finish(all), byAgency: Object.fromEntries([...byAgency].map(([id, scope]) => [id, finish(scope)])) } }
  }, { isolationLevel: "Serializable", timeout: 30000 })
}
