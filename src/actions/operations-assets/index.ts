"use server"

import { z } from "zod"
import { withAuth, type AuthContext } from "@/lib/auth-wrapper"
import { assertAgencyAccess } from "@/lib/agency-access"
import prisma from "@/lib/prisma"

const querySchema = z.object({
  search: z.string().trim().max(200).default(""),
  page: z.number().int().min(1).max(1_000_000).default(1),
  agencyId: z.string().cuid().optional(),
})
const contains = (search: string) => ({ contains: search, ...(process.env.DATABASE_URL?.startsWith("postgres") ? { mode: "insensitive" as const } : {}) })

async function siteScope({ companyId, agencyIds }: AuthContext, agencyId?: string) {
  if (agencyId) {
    assertAgencyAccess(agencyIds, agencyId)
    if (!await prisma.agency.findFirst({ where: { id: agencyId, companyId, active: true }, select: { id: true } })) throw new Error("Agence introuvable ou inactive")
  }
  return { companyId, client: { companyId }, ...(agencyId ? { agencyId } : agencyIds === null ? {} : { agencyId: { in: agencyIds } }) }
}

export async function getCustomerSiteDirectory(input: unknown = {}) {
  return withAuth(async context => {
    const query = querySchema.parse(input)
    const scope = await siteScope(context, query.agencyId)
    const where = { ...scope, ...(query.search ? { OR: [{ label: contains(query.search) }, { address1: contains(query.search) }, { address2: contains(query.search) }, { postalCode: contains(query.search) }, { city: contains(query.search) }, { client: { companyId: context.companyId, name: contains(query.search) } }] } : {}) }
    return prisma.$transaction(async tx => {
      const total = await tx.customerSite.count({ where })
      const page = Math.min(query.page, Math.max(1, Math.ceil(total / 25)))
      const items = await tx.customerSite.findMany({ where, skip: (page - 1) * 25, take: 25, orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        select: { id: true, label: true, address1: true, postalCode: true, city: true, client: { select: { name: true } },
          _count: { select: { equipments: { where: { companyId: context.companyId } }, serviceTickets: { where: { companyId: context.companyId, client: { companyId: context.companyId } } } } } } })
      return { items, total, page }
    }, { isolationLevel: "Serializable" })
  }, "operations.read")
}

export async function getEquipmentDirectory(input: unknown = {}) {
  return withAuth(async context => {
    const query = querySchema.parse(input)
    const scope = await siteScope(context, query.agencyId)
    const where = { companyId: context.companyId, site: scope,
      ...(query.search ? { OR: [{ label: contains(query.search) }, { serialNumber: contains(query.search) }, { category: contains(query.search) }, { site: { ...scope, OR: [{ label: contains(query.search) }, { client: { companyId: context.companyId, name: contains(query.search) } }] } }] } : {}) }
    return prisma.$transaction(async tx => {
      const total = await tx.equipment.count({ where })
      const page = Math.min(query.page, Math.max(1, Math.ceil(total / 25)))
      const items = await tx.equipment.findMany({ where, skip: (page - 1) * 25, take: 25, orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        select: { id: true, label: true, status: true, serialNumber: true, site: { select: { label: true, client: { select: { name: true } } } } } })
      return { items, total, page }
    }, { isolationLevel: "Serializable" })
  }, "operations.read")
}
