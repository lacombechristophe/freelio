"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { withAuth } from "@/lib/auth-wrapper"
import prisma from "@/lib/prisma"
import { operationsDashboardScope } from "@/lib/operations/dashboard-scope"
import { AssetLifecycleError } from "@/lib/operations/asset-error"

const id = z.string().cuid()
const transferSchema = z.object({ siteId: id, agencyId: id, expectedUpdatedAt: z.string().datetime(),
  reason: z.string().trim().min(5).max(2_000), confirmed: z.literal(true) }).strict()

export async function getSiteTransferChoices(input: unknown) {
  return withAuth(async ({ companyId }) => {
    const query = z.object({ siteId: id, selectedId: id.optional(), search: z.string().trim().max(200).default(""),
      page: z.number().int().min(1).max(100_000).default(1) }).strict().parse(input)
    return prisma.$transaction(async tx => {
      const site = await tx.customerSite.findFirst({ where: { ...operationsDashboardScope(companyId, null).site, id: query.siteId }, select: { agencyId: true } })
      if (!site) throw new AssetLifecycleError("Site client introuvable")
      const eligible = { companyId, active: true, ...(site.agencyId ? { id: { not: site.agencyId } } : {}) }
      const contains = { contains: query.search, ...(process.env.DATABASE_URL?.startsWith("postgres") ? { mode: "insensitive" as const } : {}) }
      const where = { AND: [eligible, ...(query.search ? [{ OR: [{ name: contains }, { code: contains }] }] : [])] }
      const total = await tx.agency.count({ where }), page = Math.min(query.page, Math.max(1, Math.ceil(total / 25)))
      const select = { id: true, code: true, name: true } as const
      const [items, selected] = await Promise.all([
        tx.agency.findMany({ where, select, take: 25, skip: (page - 1) * 25, orderBy: [{ name: "asc" }, { id: "asc" }] }),
        query.selectedId ? tx.agency.findFirst({ where: { AND: [eligible, { id: query.selectedId }] }, select }) : null,
      ])
      const option = (row: NonNullable<typeof selected>) => ({ id: row.id, label: `${row.code} · ${row.name}` })
      return { items: items.map(option), selected: selected ? option(selected) : null, page, total }
    }, { isolationLevel: "Serializable" })
  }, "company.manage")
}

export async function transferCustomerSite(input: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    const data = transferSchema.parse(input), scope = operationsDashboardScope(companyId, null)
    await prisma.$transaction(async tx => {
      const site = await tx.customerSite.findFirst({ where: { ...scope.site, id: data.siteId }, select: { clientId: true, agencyId: true, updatedAt: true } })
      if (!site) throw new AssetLifecycleError("Site client introuvable")
      if (site.agencyId === data.agencyId) throw new AssetLifecycleError("Ce site appartient déjà à cette agence.")
      // Lock the site before inspecting its children; new references use the
      // same lock. The CAS also rejects a form opened before another transfer.
      const changedAt = new Date(Math.max(Date.now(), site.updatedAt.getTime() + 1))
      const changed = await tx.customerSite.updateMany({ where: { ...scope.site, id: data.siteId, updatedAt: new Date(data.expectedUpdatedAt) },
        data: { updatedAt: changedAt } })
      if (changed.count !== 1) throw new AssetLifecycleError("Ce site a changé. Rechargez la liste avant de le transférer.")
      const agency = await tx.agency.findFirst({ where: { id: data.agencyId, companyId, active: true }, select: { updatedAt: true } })
      if (!agency || (await tx.agency.updateMany({ where: { id: data.agencyId, companyId, active: true, updatedAt: agency.updatedAt }, data: { updatedAt: agency.updatedAt } })).count !== 1) {
        throw new AssetLifecycleError("Agence destinataire introuvable ou inactive")
      }
      // A transfer must never repair or move a foreign/shared historical record
      // implicitly. The generic refusal discloses none of those record identities.
      const inconsistent = await tx.customerSite.findFirst({ where: { id: data.siteId, OR: [
        { equipments: { some: { OR: [{ NOT: scope.equipment },
          { tickets: { some: { OR: [{ siteId: null }, { siteId: { not: data.siteId } }] } } },
          { maintenanceContracts: { some: { contract: { siteId: { not: data.siteId } } } } }] } } },
        { projects: { some: { OR: [{ NOT: scope.project }, { clientId: { not: site.clientId } },
          { interventions: { some: { siteId: { not: data.siteId } } } }] } } },
        { serviceTickets: { some: { OR: [{ NOT: scope.ticket }, { clientId: { not: site.clientId } },
          { equipment: { siteId: { not: data.siteId } } }, { interventions: { some: { siteId: { not: data.siteId } } } }] } } },
        { interventions: { some: { OR: [{ NOT: scope.intervention },
          { project: { OR: [{ siteId: null }, { siteId: { not: data.siteId } }] } },
          { ticket: { OR: [{ siteId: null }, { siteId: { not: data.siteId } }] } },
          { maintenanceContract: { siteId: { not: data.siteId } } }] } } },
        { maintenanceContracts: { some: { OR: [{ NOT: scope.contract }, { clientId: { not: site.clientId } },
          { equipments: { some: { equipment: { OR: [{ NOT: scope.equipment }, { siteId: { not: data.siteId } }] } } } },
          { interventions: { some: { siteId: { not: data.siteId } } } }] } } },
      ] }, select: { id: true } })
      if (inconsistent) throw new AssetLifecycleError("Le dossier contient une référence incohérente ou partagée avec un autre site. Faites vérifier ses rattachements avant le transfert.")
      await tx.customerSite.update({ where: { id: data.siteId, companyId }, data: { agencyId: data.agencyId, updatedAt: changedAt } })
      const projects = await tx.project.updateMany({ where: { companyId, clientId: site.clientId, siteId: data.siteId }, data: { agencyId: data.agencyId } })
      await tx.auditLog.create({ data: { userId, action: "TRANSFER_CUSTOMER_SITE", resource: "CUSTOMER_SITE", resourceId: data.siteId,
        payload: { fromAgencyId: site.agencyId, toAgencyId: data.agencyId, reason: data.reason, projectCount: projects.count, policy: "ENTIRE_SITE_HISTORY" } } })
    }, { isolationLevel: "Serializable" })
    for (const route of ["/dashboard/operations", "/dashboard/settings/agencies", "/dashboard/projets", "/dashboard/service", "/dashboard/factures", "/dashboard/devis"]) revalidatePath(route)
    revalidatePath("/dashboard/service/equipements/[id]", "page")
    revalidatePath("/dashboard/service/interventions/[id]", "page")
    revalidatePath("/dashboard/service/tickets/[id]", "page")
    revalidatePath("/dashboard/projets/[id]", "page")
    return { success: true as const }
  }, "company.manage")
}
