"use server"

import { z } from "zod"
import { withAuth } from "@/lib/auth-wrapper"
import { activeEquipmentReferenceWhere, activeSiteReferenceWhere } from "@/lib/operations/asset-lifecycle"
import prisma from "@/lib/prisma"

const querySchema = z.object({ search: z.string().trim().max(200).default(""), page: z.number().int().min(1).max(100_000).default(1),
  selectedId: z.string().min(1).max(100).optional(), clientId: z.string().cuid().optional() })
const contains = (search: string) => ({ contains: search, ...(process.env.DATABASE_URL?.startsWith("postgres") ? { mode: "insensitive" as const } : {}) })

export async function getAssetSiteChoices(input: unknown = {}) {
  return withAuth(async ({ companyId, agencyIds }) => {
    const query = querySchema.strict().parse(input)
    const eligible = { AND: [activeSiteReferenceWhere(companyId, agencyIds), ...(query.clientId ? [{ clientId: query.clientId }] : [])] }
    const where = { AND: [eligible, ...(query.search ? [{ OR: [{ label: contains(query.search) }, { address1: contains(query.search) },
      { postalCode: contains(query.search) }, { city: contains(query.search) }, { client: { name: contains(query.search) } }] }] : [])] }
    const select = { id: true, label: true, client: { select: { name: true } } } as const
    return prisma.$transaction(async tx => {
      const total = await tx.customerSite.count({ where }), page = Math.min(query.page, Math.max(1, Math.ceil(total / 25)))
      const [items, selected] = await Promise.all([
        tx.customerSite.findMany({ where, select, skip: (page - 1) * 25, take: 25, orderBy: [{ label: "asc" }, { id: "asc" }] }),
        query.selectedId ? tx.customerSite.findFirst({ where: { AND: [eligible, { id: query.selectedId }] }, select }) : null,
      ])
      const option = (row: NonNullable<typeof selected>) => ({ id: row.id, label: `${row.client.name} · ${row.label}` })
      return { items: items.map(option), selected: selected ? option(selected) : null, total, page }
    }, { isolationLevel: "Serializable" })
  }, "operations.read")
}

export async function getAssetEquipmentChoices(input: unknown = {}) {
  return withAuth(async ({ companyId, agencyIds }) => {
    const query = querySchema.extend({ siteId: z.string().cuid().optional() }).strict().parse(input)
    const eligible = { AND: [activeEquipmentReferenceWhere(companyId, agencyIds), ...(query.clientId ? [{ site: { clientId: query.clientId } }] : []), ...(query.siteId ? [{ siteId: query.siteId }] : [])] }
    const where = { AND: [eligible, ...(query.search ? [{ OR: [{ label: contains(query.search) }, { serialNumber: contains(query.search) }, { site: { label: contains(query.search) } }] }] : [])] }
    const select = { id: true, label: true, serialNumber: true, site: { select: { label: true } } } as const
    return prisma.$transaction(async tx => {
      const total = await tx.equipment.count({ where }), page = Math.min(query.page, Math.max(1, Math.ceil(total / 25)))
      const [items, selected] = await Promise.all([
        tx.equipment.findMany({ where, select, skip: (page - 1) * 25, take: 25, orderBy: [{ label: "asc" }, { id: "asc" }] }),
        query.selectedId ? tx.equipment.findFirst({ where: { AND: [eligible, { id: query.selectedId }] }, select }) : null,
      ])
      const option = (row: NonNullable<typeof selected>) => ({ id: row.id, label: `${row.label}${row.serialNumber ? ` · ${row.serialNumber}` : ""} · ${row.site.label}` })
      return { items: items.map(option), selected: selected ? option(selected) : null, total, page }
    }, { isolationLevel: "Serializable" })
  }, "operations.read")
}
