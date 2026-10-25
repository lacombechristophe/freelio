"use server"

import { Prisma } from "@/generated/prisma/client"
import { z } from "zod"
import prisma from "@/lib/prisma"
import { withAuth } from "@/lib/auth-wrapper"
import { DIRECTORY_PAGE_SIZE } from "@/lib/directory-query"

const directoryInput = z.object({
  search: z.string().trim().max(200).default(""),
  status: z.enum(["ALL", "ACTIVE", "COMPLETED", "ARCHIVED"]).default("ALL"),
  page: z.number().int().min(1).max(100000).default(1),
}).strict()

const clientChoiceInput = z.object({
  search: z.string().trim().max(200).default(""),
  page: z.number().int().min(1).max(100000).default(1),
  selectedId: z.string().min(1).max(100).optional(),
}).strict()

export async function getProjectClientChoices(input: unknown = {}) {
  return withAuth(async ({ companyId }) => {
    const query = clientChoiceInput.parse(input)
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
  }, "operations.read")
}

export async function getProjectDirectory(input: unknown = {}) {
  return withAuth(async ({ companyId }) => {
    const query = directoryInput.parse(input)
    const scope = { companyId, client: { companyId }, AND: [
      { OR: [{ agencyId: null }, { agency: { companyId } }] },
      { OR: [{ projectTemplateId: null }, { projectTemplate: { companyId } }] },
    ] }
    const contains = { contains: query.search, ...(process.env.DATABASE_URL?.startsWith("postgres") ? { mode: "insensitive" as const } : {}) }
    const where: Prisma.ProjectWhereInput = { AND: [scope,
      ...(query.status === "ALL" ? [] : [{ status: query.status }]),
      ...(query.search ? [{ OR: [{ name: contains }, { client: { name: contains } }, { agency: { name: contains } }, { worksiteType: contains }] }] : []),
    ] }
    return prisma.$transaction(async tx => {
      const portfolioTotal = await tx.project.count({ where: scope })
      const total = query.search || query.status !== "ALL" ? await tx.project.count({ where }) : portfolioTotal
      const page = Math.min(query.page, Math.max(1, Math.ceil(total / DIRECTORY_PAGE_SIZE)))
      const items = await tx.project.findMany({
        where, take: DIRECTORY_PAGE_SIZE, skip: (page - 1) * DIRECTORY_PAGE_SIZE,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: {
          id: true, name: true, description: true, status: true, updatedAt: true, budgetCents: true, consumedCents: true,
          startDate: true, endDate: true, clientId: true, agencyId: true, projectTemplateId: true, worksiteType: true,
          client: { select: { id: true, name: true } }, agency: { select: { id: true, name: true, code: true } },
        },
      })
      return { items, total, portfolioTotal, page }
    }, { isolationLevel: "Serializable" })
  }, "operations.read")
}
