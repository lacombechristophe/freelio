"use server"

import { z } from "zod"
import { withAuth, type AuthContext } from "@/lib/auth-wrapper"
import { assertAgencyAccess } from "@/lib/agency-access"
import { operationsDashboardScope } from "@/lib/operations/dashboard-scope"
import { hasPermission } from "@/lib/permissions"
import prisma from "@/lib/prisma"

const querySchema = z.object({
  search: z.string().trim().max(200).default(""),
  page: z.number().int().min(1).max(1_000_000).default(1),
  agencyId: z.string().cuid().optional(),
  status: z.enum(["ALL", "ACTIVE", "INACTIVE"]).default("ALL"),
}).strict()
const contains = (search: string) => ({ contains: search, ...(process.env.DATABASE_URL?.startsWith("postgres") ? { mode: "insensitive" as const } : {}) })

async function siteScope({ companyId, agencyIds }: AuthContext, agencyId?: string) {
  if (agencyId) {
    assertAgencyAccess(agencyIds, agencyId)
    if (!await prisma.agency.findFirst({ where: { id: agencyId, companyId, active: true }, select: { id: true } })) throw new Error("Agence introuvable ou inactive")
  }
  return { ...operationsDashboardScope(companyId, agencyIds).site, ...(agencyId ? { agencyId } : {}) }
}

export async function getCustomerSiteDirectory(input: unknown = {}) {
  return withAuth(async context => {
    const query = querySchema.parse(input)
    const scope = await siteScope(context, query.agencyId)
    const relations = operationsDashboardScope(context.companyId, context.agencyIds)
    const where = { AND: [scope, ...(query.status === "ALL" ? [] : [{ archivedAt: query.status === "ACTIVE" ? null : { not: null } }]),
      ...(query.search ? [{ OR: [{ label: contains(query.search) }, { address1: contains(query.search) }, { address2: contains(query.search) }, { postalCode: contains(query.search) }, { city: contains(query.search) }, { client: { companyId: context.companyId, name: contains(query.search) } }] }] : [])] }
    return prisma.$transaction(async tx => {
      const total = await tx.customerSite.count({ where })
      const page = Math.min(query.page, Math.max(1, Math.ceil(total / 25)))
      const items = await tx.customerSite.findMany({ where, skip: (page - 1) * 25, take: 25, orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        select: { id: true, label: true, kind: true, address1: true, address2: true, postalCode: true, city: true, country: true,
          accessNotes: true, latitude: true, longitude: true, archivedAt: true, updatedAt: true, client: { select: { name: true } }, agency: { select: { name: true } },
          _count: { select: { equipments: { where: relations.equipment }, serviceTickets: { where: relations.ticket } } } } })
      return { items: items.map(item => ({ ...item, archivedAt: item.archivedAt?.toISOString() ?? null, updatedAt: item.updatedAt.toISOString() })), total, page,
        canManage: hasPermission(context.role, "crm.write"), canTransfer: hasPermission(context.role, "company.manage") }
    }, { isolationLevel: "Serializable" })
  }, "operations.read")
}

export async function getEquipmentDirectory(input: unknown = {}) {
  return withAuth(async context => {
    const query = querySchema.parse(input)
    const scope = await siteScope(context, query.agencyId)
    const eligible = { ...operationsDashboardScope(context.companyId, context.agencyIds).equipment, site: scope }
    const where = { AND: [eligible, ...(query.status === "ALL" ? [] : [{ archivedAt: query.status === "ACTIVE" ? null : { not: null } }]),
      ...(query.search ? [{ OR: [{ label: contains(query.search) }, { serialNumber: contains(query.search) }, { category: contains(query.search) }, { site: { AND: [scope, { OR: [{ label: contains(query.search) }, { client: { companyId: context.companyId, name: contains(query.search) } }] }] } }] }] : [])] }
    return prisma.$transaction(async tx => {
      const total = await tx.equipment.count({ where })
      const page = Math.min(query.page, Math.max(1, Math.ceil(total / 25)))
      const items = await tx.equipment.findMany({ where, skip: (page - 1) * 25, take: 25, orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        select: { id: true, label: true, status: true, category: true, manufacturer: true, model: true, serialNumber: true, productId: true,
          installedAt: true, warrantyUntil: true, notes: true, archivedAt: true, updatedAt: true, site: { select: { label: true, client: { select: { name: true } } } } } })
      return { items: items.map(item => ({ ...item, installedAt: item.installedAt?.toISOString() ?? null, warrantyUntil: item.warrantyUntil?.toISOString() ?? null,
        archivedAt: item.archivedAt?.toISOString() ?? null, updatedAt: item.updatedAt.toISOString() })), total, page, canManage: hasPermission(context.role, "operations.write") }
    }, { isolationLevel: "Serializable" })
  }, "operations.read")
}
