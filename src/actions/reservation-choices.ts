"use server"

import { z } from "zod"
import { withAuth } from "@/lib/auth-wrapper"
import { DIRECTORY_PAGE_SIZE } from "@/lib/directory-query"
import prisma from "@/lib/prisma"
import { coherentCustomerOrder } from "@/lib/operations/customer-deliveries"
import { operationsDashboardScope } from "@/lib/operations/dashboard-scope"

const querySchema = z.object({ search: z.string().trim().max(200).default(""), page: z.number().int().min(1).max(100_000).default(1), selectedId: z.string().cuid().optional() }).strict()
const contains = (value: string) => ({ contains: value, ...(process.env.DATABASE_URL?.startsWith("postgres") ? { mode: "insensitive" as const } : {}) })

export async function getReservationOrderChoices(input: unknown = {}) {
  return withAuth(async context => {
    const query = querySchema.parse(input)
    // Keep the composer's existing state filter; allocation transitions are separate.
    const eligible = { ...operationsDashboardScope(context.companyId, context.agencyIds).customerOrder, status: { notIn: ["DELIVERED", "COMPLETED", "CANCELLED"] } }
    const where = { ...eligible, ...(query.search ? { OR: [{ number: contains(query.search) }, { client: { name: contains(query.search) } }, { project: { name: contains(query.search) } }] } : {}) }
    return prisma.$transaction(async tx => {
      const total = await tx.customerOrder.count({ where }), page = Math.min(query.page, Math.max(1, Math.ceil(total / DIRECTORY_PAGE_SIZE)))
      const items = await tx.customerOrder.findMany({ where, select: { id: true, number: true, client: { select: { name: true } } }, take: DIRECTORY_PAGE_SIZE, skip: (page - 1) * DIRECTORY_PAGE_SIZE, orderBy: [{ createdAt: "desc" }, { id: "asc" }] })
      const selected = query.selectedId ? await tx.customerOrder.findFirst({ where: { ...eligible, id: query.selectedId }, select: {
        id: true, number: true, clientId: true, projectId: true, client: { select: { name: true } }, project: { select: { clientId: true, site: { select: { clientId: true } } } }, quote: { select: { clientId: true, projectId: true } },
      } }) : null
      const option = (order: typeof items[number]) => ({ id: order.id, label: `${order.number} · ${order.client.name}` })
      return { items: items.map(option), total, page, selected: selected && coherentCustomerOrder(selected) ? option(selected) : null }
    }, { isolationLevel: "Serializable" })
  }, "operations.read")
}

export async function getReservationProjectChoices(input: unknown = {}) {
  return withAuth(async context => {
    const query = querySchema.parse(input)
    const eligible = { ...operationsDashboardScope(context.companyId, context.agencyIds).project, status: "ACTIVE" }
    const where = { ...eligible, ...(query.search ? { name: contains(query.search) } : {}) }
    return prisma.$transaction(async tx => {
      const total = await tx.project.count({ where }), page = Math.min(query.page, Math.max(1, Math.ceil(total / DIRECTORY_PAGE_SIZE)))
      const items = await tx.project.findMany({ where, select: { id: true, name: true }, take: DIRECTORY_PAGE_SIZE, skip: (page - 1) * DIRECTORY_PAGE_SIZE, orderBy: [{ name: "asc" }, { id: "asc" }] })
      const selected = query.selectedId ? await tx.project.findFirst({ where: { ...eligible, id: query.selectedId }, select: { id: true, name: true, clientId: true, site: { select: { clientId: true } } } }) : null
      const option = (project: typeof items[number]) => ({ id: project.id, label: project.name })
      return { items: items.map(option), total, page, selected: selected && (!selected.site || selected.site.clientId === selected.clientId) ? option(selected) : null }
    }, { isolationLevel: "Serializable" })
  }, "operations.read")
}
