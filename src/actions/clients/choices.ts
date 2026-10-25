"use server"

import { z } from "zod"
import prisma from "@/lib/prisma"
import { withAuth } from "@/lib/auth-wrapper"
import { DIRECTORY_PAGE_SIZE } from "@/lib/directory-query"

const choiceInput = z.object({
  search: z.string().trim().max(200).default(""),
  page: z.number().int().min(1).max(100000).default(1),
  selectedId: z.string().min(1).max(100).optional(),
}).strict()

export async function getClientChoices(input: unknown = {}) {
  return withAuth(async ({ companyId }) => {
    const query = choiceInput.parse(input)
    const contains = { contains: query.search, ...(process.env.DATABASE_URL?.startsWith("postgres") ? { mode: "insensitive" as const } : {}) }
    const where = { companyId, ...(query.search ? { name: contains } : {}) }
    const select = { id: true, name: true } as const
    return prisma.$transaction(async tx => {
      const total = await tx.client.count({ where })
      const page = Math.min(query.page, Math.max(1, Math.ceil(total / DIRECTORY_PAGE_SIZE)))
      const [items, selected] = await Promise.all([
        tx.client.findMany({ where, select, take: DIRECTORY_PAGE_SIZE, skip: (page - 1) * DIRECTORY_PAGE_SIZE, orderBy: [{ name: "asc" }, { id: "asc" }] }),
        query.selectedId ? tx.client.findFirst({ where: { companyId, id: query.selectedId }, select }) : null,
      ])
      return { items, total, page, selected }
    }, { isolationLevel: "Serializable" })
  }, "crm.read")
}
