import "server-only"
import { z } from "zod"
import prisma from "@/lib/prisma"
import { inventoryReadWhere, type AgencyAccess } from "@/lib/agency-access"

type Transaction = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]
type Scope = { companyId: string; agencyIds: AgencyAccess; supplierId: string }
export const supplierHistoryQuery = z.object({ search: z.string().trim().max(200).default(""), page: z.number().int().min(1).max(1_000_000).default(1) })
type Query = z.infer<typeof supplierHistoryQuery>
const contains = (search: string) => ({ contains: search, ...(process.env.DATABASE_URL?.startsWith("postgres") ? { mode: "insensitive" as const } : {}) })
const pageOf = (requested: number, total: number) => Math.min(requested, Math.max(1, Math.ceil(total / 25)))

function orderScope({ companyId, supplierId, agencyIds }: Scope) {
  return { companyId, supplierId, ...(agencyIds === null ? { OR: [{ projectId: null }, { project: { companyId } }] } : { project: { companyId, agencyId: { in: agencyIds } } }) }
}
function returnScope(scope: Scope) {
  return { companyId: scope.companyId, supplierId: scope.supplierId, product: { companyId: scope.companyId }, warehouse: inventoryReadWhere(scope.companyId, scope.agencyIds).warehouse, purchaseOrder: orderScope(scope) }
}

export async function readSupplierProducts(tx: Transaction, scope: Scope, query: Query) {
  const where = { companyId: scope.companyId, supplierId: scope.supplierId, ...(query.search ? { OR: [{ sku: contains(query.search) }, { label: contains(query.search) }, { family: contains(query.search) }] } : {}) }
  const total = await tx.product.count({ where })
  const page = pageOf(query.page, total)
  const items = await tx.product.findMany({ where, orderBy: [{ label: "asc" }, { id: "asc" }], skip: (page - 1) * 25, take: 25,
    select: { id: true, sku: true, label: true, family: true, purchasePriceCents: true, inventoryItems: { where: inventoryReadWhere(scope.companyId, scope.agencyIds), select: { quantity: true, reservedQuantity: true } } } })
  return { items, total, page }
}

export async function readSupplierOrders(tx: Transaction, scope: Scope, query: Query) {
  const where = { ...orderScope(scope), ...(query.search ? { AND: { OR: [{ number: contains(query.search) }, { supplierReference: contains(query.search) }, { project: { companyId: scope.companyId, name: contains(query.search) } }] } } : {}) }
  const total = await tx.purchaseOrder.count({ where })
  const page = pageOf(query.page, total)
  const items = await tx.purchaseOrder.findMany({ where, orderBy: [{ orderDate: "desc" }, { id: "asc" }], skip: (page - 1) * 25, take: 25,
    select: { id: true, number: true, status: true, orderDate: true, totalHtCents: true, project: { select: { name: true } }, lines: { select: { quantity: true, receivedQuantity: true, creditedQuantity: true } }, issues: { where: { companyId: scope.companyId }, select: { status: true } } } })
  return { items, total, page }
}

export async function readSupplierReturns(tx: Transaction, scope: Scope, query: Query) {
  const where = { ...returnScope(scope), ...(query.search ? { OR: [{ number: contains(query.search) }, { reason: contains(query.search) }, { creditReference: contains(query.search) }, { product: { companyId: scope.companyId, OR: [{ sku: contains(query.search) }, { label: contains(query.search) }] } }] } : {}) }
  const total = await tx.supplierReturn.count({ where })
  const page = pageOf(query.page, total)
  const items = await tx.supplierReturn.findMany({ where, orderBy: [{ shippedAt: "desc" }, { id: "asc" }], skip: (page - 1) * 25, take: 25,
    select: { id: true, number: true, status: true, quantity: true, reason: true, creditReference: true, product: { select: { label: true, sku: true } }, warehouse: { select: { name: true } } } })
  return { items, total, page }
}

export async function readSupplierMetrics(tx: Transaction, scope: Scope) {
  const orders = orderScope(scope)
  const orderCount = await tx.purchaseOrder.count({ where: orders })
  const spend = await tx.purchaseOrder.aggregate({ where: { ...orders, status: { not: "CANCELED" } }, _sum: { totalHtCents: true } })
  const receivedCount = await tx.purchaseOrder.count({ where: { ...orders, receivedAt: { not: null } } })
  // SQL compares columns on the same order; no capped list is loaded to calculate punctuality.
  const onTimeCount = await tx.purchaseOrder.count({ where: { ...orders, receivedAt: { not: null }, AND: { OR: [
    { confirmedExpectedAt: { not: null }, receivedAt: { lte: tx.purchaseOrder.fields.confirmedExpectedAt } },
    { confirmedExpectedAt: null, expectedAt: { not: null }, receivedAt: { lte: tx.purchaseOrder.fields.expectedAt } },
    { confirmedExpectedAt: null, expectedAt: null },
  ] } } })
  const openIssues = await tx.purchaseIssue.count({ where: { companyId: scope.companyId, status: { not: "RESOLVED" }, purchaseOrder: orders } })
  const productCount = await tx.product.count({ where: { companyId: scope.companyId, supplierId: scope.supplierId } })
  return { orderCount, spend: spend._sum.totalHtCents ?? 0, receivedCount, onTimeCount, openIssues, productCount }
}
