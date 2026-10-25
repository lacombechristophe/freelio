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

function contains(search: string) {
  return { contains: search, ...(process.env.DATABASE_URL?.startsWith("postgres") ? { mode: "insensitive" as const } : {}) }
}

export async function getPurchaseProductChoices(input: unknown = {}) {
  return withAuth(async ({ companyId }) => {
    const query = choiceInput.parse(input)
    const eligible = { companyId, active: true }
    const text = contains(query.search)
    const where = { ...eligible, ...(query.search ? { OR: [{ sku: text }, { label: text }] } : {}) }
    const select = { id: true, sku: true, label: true, purchasePriceCents: true } as const
    return prisma.$transaction(async tx => {
      const total = await tx.product.count({ where })
      const page = Math.min(query.page, Math.max(1, Math.ceil(total / DIRECTORY_PAGE_SIZE)))
      const items = await tx.product.findMany({ where, select, take: DIRECTORY_PAGE_SIZE, skip: (page - 1) * DIRECTORY_PAGE_SIZE, orderBy: [{ label: "asc" }, { id: "asc" }] })
      const selected = query.selectedId ? await tx.product.findFirst({ where: { ...eligible, id: query.selectedId }, select }) : null
      return { items, total, page, selected }
    }, { isolationLevel: "Serializable" })
  }, "operations.read")
}

export async function getPurchaseProjectChoices(input: unknown = {}) {
  return withAuth(async ({ companyId, agencyIds }) => {
    const query = choiceInput.parse(input)
    const eligible = { companyId, status: "ACTIVE", client: { companyId }, ...(agencyIds === null ? {} : { agencyId: { in: agencyIds } }) }
    const where = { ...eligible, ...(query.search ? { name: contains(query.search) } : {}) }
    const select = { id: true, name: true } as const
    return prisma.$transaction(async tx => {
      const total = await tx.project.count({ where })
      const page = Math.min(query.page, Math.max(1, Math.ceil(total / DIRECTORY_PAGE_SIZE)))
      const items = await tx.project.findMany({ where, select, take: DIRECTORY_PAGE_SIZE, skip: (page - 1) * DIRECTORY_PAGE_SIZE, orderBy: [{ name: "asc" }, { id: "asc" }] })
      const selected = query.selectedId ? await tx.project.findFirst({ where: { ...eligible, id: query.selectedId }, select }) : null
      return { items, total, page, selected }
    }, { isolationLevel: "Serializable" })
  }, "operations.read")
}
