"use server"

import { z } from "zod"
import prisma from "@/lib/prisma"
import { withAuth } from "@/lib/auth-wrapper"
import { DIRECTORY_PAGE_SIZE } from "@/lib/directory-query"

const choiceInput = z.object({
  search: z.string().trim().max(200).default(""),
  page: z.number().int().min(1).max(100000).default(1),
  selectedId: z.string().min(1).max(100).optional(),
  stockTrackedOnly: z.boolean().default(false),
}).strict()

export async function getOperationsProductChoices(input: unknown = {}) {
  return withAuth(async ({ companyId }) => {
    const query = choiceInput.parse(input)
    const eligible = { companyId, active: true, ...(query.stockTrackedOnly ? { stockTracked: true } : {}) }
    const contains = { contains: query.search, ...(process.env.DATABASE_URL?.startsWith("postgres") ? { mode: "insensitive" as const } : {}) }
    const where = { ...eligible, ...(query.search ? { OR: [{ sku: contains }, { label: contains }] } : {}) }
    const select = { id: true, sku: true, label: true } as const
    return prisma.$transaction(async tx => {
      const total = await tx.product.count({ where })
      const page = Math.min(query.page, Math.max(1, Math.ceil(total / DIRECTORY_PAGE_SIZE)))
      const [items, selected] = await Promise.all([
        tx.product.findMany({ where, select, take: DIRECTORY_PAGE_SIZE, skip: (page - 1) * DIRECTORY_PAGE_SIZE, orderBy: [{ label: "asc" }, { id: "asc" }] }),
        query.selectedId ? tx.product.findFirst({ where: { ...eligible, id: query.selectedId }, select }) : null,
      ])
      return { items, total, page, selected }
    }, { isolationLevel: "Serializable" })
  }, "operations.read")
}
