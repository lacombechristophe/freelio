"use server"

import { Prisma } from "@/generated/prisma/client"
import { z } from "zod"
import { withAuth } from "@/lib/auth-wrapper"
import prisma from "@/lib/prisma"
import { DIRECTORY_PAGE_SIZE } from "@/lib/directory-query"
import { deliverableOrderWhere, readCustomerDeliveryOrder } from "@/lib/operations/customer-deliveries"

const querySchema = z.object({ search: z.string().trim().max(200).default(""), page: z.number().int().min(1).max(100_000).default(1), selectedId: z.string().cuid().optional() }).strict()
const contains = (value: string) => ({ contains: value, ...(process.env.DATABASE_URL?.startsWith("postgres") ? { mode: "insensitive" as const } : {}) })
// Prisma accepts a Decimal Float bound but types this input as number. Its v7
// number conversion rounds MAX_VALUE above PostgreSQL's finite double range.
const maximumFiniteQuantity = new Prisma.Decimal(Number.MAX_VALUE.toString()) as unknown as number
const remaining = () => ({ quantity: { gt: 0, lte: maximumFiniteQuantity }, deliveredQuantity: { gte: 0, lte: maximumFiniteQuantity, lt: prisma.customerOrderLine.fields.quantity } })

export async function getDeliveryOrderChoices(input: unknown = {}) {
  return withAuth(async context => {
    const query = querySchema.parse(input)
    const base = deliverableOrderWhere(context)
    const eligible = { ...base, AND: [...base.AND, { lines: { some: remaining() } }] }
    const where = { ...eligible, ...(query.search ? { OR: [{ number: contains(query.search) }, { client: { name: contains(query.search) } }, { project: { name: contains(query.search) } }] } : {}) }
    const select = { id: true, number: true, client: { select: { name: true } } } as const
    return prisma.$transaction(async tx => {
      const total = await tx.customerOrder.count({ where }), page = Math.min(query.page, Math.max(1, Math.ceil(total / DIRECTORY_PAGE_SIZE)))
      const items = await tx.customerOrder.findMany({ where, select, take: DIRECTORY_PAGE_SIZE, skip: (page - 1) * DIRECTORY_PAGE_SIZE, orderBy: [{ createdAt: "desc" }, { id: "asc" }] })
      const selected = query.selectedId ? await tx.customerOrder.findFirst({ where: { ...eligible, id: query.selectedId }, select }) : null
      const verified = selected ? await readCustomerDeliveryOrder(tx, context, selected.id) : null
      const option = (order: NonNullable<typeof selected>) => ({ id: order.id, label: `${order.number} · ${order.client.name}`, remainingQuantity: null })
      return { items: items.map(option), selected: selected && verified ? option(selected) : null, total, page }
    }, { isolationLevel: "Serializable" })
  }, "operations.read")
}

export async function getDeliveryLineChoices(input: unknown) {
  return withAuth(async context => {
    const query = querySchema.extend({ customerOrderId: z.string().cuid() }).parse(input)
    return prisma.$transaction(async tx => {
      if (!await readCustomerDeliveryOrder(tx, context, query.customerOrderId)) return { items: [], selected: null, total: 0, page: 1 }
      const eligible = { customerOrderId: query.customerOrderId, ...remaining() }
      const where = { ...eligible, ...(query.search ? { label: contains(query.search) } : {}) }
      const select = { id: true, label: true, quantity: true, deliveredQuantity: true } as const
      const total = await tx.customerOrderLine.count({ where }), page = Math.min(query.page, Math.max(1, Math.ceil(total / DIRECTORY_PAGE_SIZE)))
      const [items, selected] = await Promise.all([
        tx.customerOrderLine.findMany({ where, select, take: DIRECTORY_PAGE_SIZE, skip: (page - 1) * DIRECTORY_PAGE_SIZE, orderBy: [{ order: "asc" }, { id: "asc" }] }),
        query.selectedId ? tx.customerOrderLine.findFirst({ where: { ...eligible, id: query.selectedId }, select }) : null,
      ])
      const option = (line: NonNullable<typeof selected>) => {
        const remainingQuantity = new Prisma.Decimal(line.quantity).minus(line.deliveredQuantity).toNumber()
        return { id: line.id, label: `${line.label} · reste ${remainingQuantity.toLocaleString("fr-FR", { maximumSignificantDigits: 17 })}`, remainingQuantity }
      }
      return { items: items.map(option), selected: selected ? option(selected) : null, total, page }
    }, { isolationLevel: "Serializable" })
  }, "operations.read")
}
