"use server"

import { z } from "zod"
import prisma from "@/lib/prisma"
import { withAuth } from "@/lib/auth-wrapper"
import { DIRECTORY_PAGE_SIZE } from "@/lib/directory-query"
import { operationsDashboardScope } from "@/lib/operations/dashboard-scope"

const choiceInput = z.object({
  search: z.string().trim().max(200).default(""),
  page: z.number().int().min(1).max(100000).default(1),
  selectedId: z.string().min(1).max(100).optional(),
  stockTrackedOnly: z.boolean().default(false),
  equipmentId: z.string().cuid().optional(),
}).strict()

export async function getOperationsProductChoices(input: unknown = {}) {
  return withAuth(async ({ companyId, agencyIds }) => {
    const query = choiceInput.parse(input)
    const scope = operationsDashboardScope(companyId, agencyIds)
    const eligible = { ...scope.product, active: true, ...(query.stockTrackedOnly ? { stockTracked: true } : {}) }
    const contains = { contains: query.search, ...(process.env.DATABASE_URL?.startsWith("postgres") ? { mode: "insensitive" as const } : {}) }
    const where = { AND: [eligible, ...(query.search ? [{ OR: [{ sku: contains }, { label: contains }] }] : [])] }
    const select = { id: true, sku: true, label: true, active: true } as const
    return prisma.$transaction(async tx => {
      const total = await tx.product.count({ where })
      const page = Math.min(query.page, Math.max(1, Math.ceil(total / DIRECTORY_PAGE_SIZE)))
      const retained = query.equipmentId ? await tx.equipment.findFirst({ where: { ...scope.equipment, id: query.equipmentId }, select: { productId: true } }) : null
      const [items, selected] = await Promise.all([
        tx.product.findMany({ where, select, take: DIRECTORY_PAGE_SIZE, skip: (page - 1) * DIRECTORY_PAGE_SIZE, orderBy: [{ label: "asc" }, { id: "asc" }] }),
        query.selectedId ? tx.product.findFirst({ where: { AND: [scope.product, { id: query.selectedId, ...(query.stockTrackedOnly ? { stockTracked: true } : {}) }, ...(retained?.productId === query.selectedId ? [] : [eligible])] }, select }) : null,
      ])
      const option = (row: NonNullable<typeof selected>) => ({ id: row.id, sku: row.sku, label: row.active ? row.label : `${row.label} (référence inactive conservée)` })
      return { items: items.map(option), total, page, selected: selected ? option(selected) : null }
    }, { isolationLevel: "Serializable" })
  }, "operations.read")
}
