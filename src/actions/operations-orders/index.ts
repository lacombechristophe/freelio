"use server"

import { z } from "zod"
import { withAuth, type AuthContext } from "@/lib/auth-wrapper"
import { assertAgencyAccess, inventoryReadWhere } from "@/lib/agency-access"
import { hasPermission } from "@/lib/permissions"
import { isPublicReadOnlyDemo } from "@/lib/demo-policy"
import prisma from "@/lib/prisma"

const querySchema = z.object({ search: z.string().trim().max(200).default(""), page: z.number().int().min(1).max(1_000_000).default(1), agencyId: z.string().cuid().optional() })
const contains = (search: string) => ({ contains: search, ...(process.env.DATABASE_URL?.startsWith("postgres") ? { mode: "insensitive" as const } : {}) })

async function agencyScope(context: AuthContext, agencyId?: string) {
  if (!agencyId) return context.agencyIds
  assertAgencyAccess(context.agencyIds, agencyId)
  if (!await prisma.agency.findFirst({ where: { id: agencyId, companyId: context.companyId, active: true }, select: { id: true } })) throw new Error("Agence introuvable ou inactive")
  return [agencyId]
}

export async function getCustomerOrderDirectory(input: unknown = {}) {
  return withAuth(async context => {
    const query = querySchema.parse(input)
    const agencyIds = await agencyScope(context, query.agencyId)
    const { companyId, role } = context
    const canReadFinance = hasPermission(role, "finance.read")
    const project = { companyId, client: { companyId }, ...(agencyIds === null ? {} : { agencyId: { in: agencyIds } }) }
    const where = { companyId, client: { companyId }, AND: [agencyIds === null ? { OR: [{ projectId: null }, { project }] } : { project }],
      ...(query.search ? { OR: [{ number: contains(query.search) }, { client: { companyId, name: contains(query.search) } }, { project: { ...project, name: contains(query.search) } }] } : {}) }
    return prisma.$transaction(async tx => {
      const total = await tx.customerOrder.count({ where })
      const page = Math.min(query.page, Math.max(1, Math.ceil(total / 25)))
      const orders = await tx.customerOrder.findMany({ where, skip: (page - 1) * 25, take: 25, orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        select: { id: true, number: true, status: true, billingStatus: canReadFinance, totalTtcCents: true, depositCents: true,
          client: { select: { name: true } }, project: { select: { name: true } },
          invoices: canReadFinance ? { where: { companyId, client: { companyId } }, select: { id: true, type: true, status: true } } : false,
          _count: { select: { lines: true, stockReservations: { where: inventoryReadWhere(companyId, agencyIds) } } } } })
      return { items: orders.map(order => ({ ...order, billingStatus: canReadFinance ? order.billingStatus : null, invoices: canReadFinance ? order.invoices : [] })), total, page,
        canBillOrders: hasPermission(role, "finance.write") && !isPublicReadOnlyDemo() }
    }, { isolationLevel: "Serializable" })
  }, "operations.read")
}

export async function getActiveReservationDirectory(input: unknown = {}) {
  return withAuth(async context => {
    const query = querySchema.parse(input)
    const agencyIds = await agencyScope(context, query.agencyId)
    const { companyId, role } = context
    const project = { companyId, client: { companyId }, ...(agencyIds === null ? {} : { agencyId: { in: agencyIds } }) }
    const order = { companyId, client: { companyId }, AND: [agencyIds === null ? { OR: [{ projectId: null }, { project }] } : { project }] }
    const where = { ...inventoryReadWhere(companyId, agencyIds), product: { companyId }, status: "ACTIVE", AND: [
      { OR: [{ projectId: null }, { project }] }, { OR: [{ customerOrderId: null }, { customerOrder: order }] }],
      ...(query.search ? { OR: [{ product: { companyId, OR: [{ label: contains(query.search) }, { sku: contains(query.search) }] } },
        { warehouse: { companyId, name: contains(query.search) } }, { project: { ...project, name: contains(query.search) } }, { customerOrder: { ...order, number: contains(query.search) } }] } : {}) }
    return prisma.$transaction(async tx => {
      const total = await tx.stockReservation.count({ where })
      const page = Math.min(query.page, Math.max(1, Math.ceil(total / 25)))
      const items = await tx.stockReservation.findMany({ where, skip: (page - 1) * 25, take: 25, orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        select: { id: true, quantity: true, product: { select: { label: true } }, warehouse: { select: { name: true } }, project: { select: { name: true } }, customerOrder: { select: { number: true } } } })
      return { items, total, page, canOperateStocks: hasPermission(role, "operations.write") && !isPublicReadOnlyDemo() }
    }, { isolationLevel: "Serializable" })
  }, "operations.read")
}
