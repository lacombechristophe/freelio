import "server-only"

import { Prisma } from "@prisma/client"
import type { AgencyAccess } from "@/lib/agency-access"
import { assertDemoMutationAllowed } from "@/lib/demo-policy"
import type { TransactionClient } from "@/lib/prisma"
import { operationsDashboardScope } from "./dashboard-scope"
import { AssetLifecycleError } from "./asset-error"

export const closedMaintenanceStatuses = ["EXPIRED", "TERMINATED", "RENEWED", "CANCELED", "CANCELLED"]
export const closedProjectStatuses = ["COMPLETED", "ARCHIVED"]
export const closedTicketStatuses = ["RESOLVED", "CLOSED", "MERGED"]
export const closedInterventionStatuses = ["COMPLETED", "CANCELED"]

export function activeSiteReferenceWhere(companyId: string, agencyIds: AgencyAccess): Prisma.CustomerSiteWhereInput {
  return { AND: [operationsDashboardScope(companyId, agencyIds).site, { archivedAt: null }, { OR: [{ agencyId: null }, { agency: { active: true } }] }] }
}

export function activeEquipmentReferenceWhere(companyId: string, agencyIds: AgencyAccess): Prisma.EquipmentWhereInput {
  return { ...operationsDashboardScope(companyId, agencyIds).equipment, archivedAt: null, site: activeSiteReferenceWhere(companyId, agencyIds) }
}

// Service and Operations may reference sites without crm.write. A tenant-bound
// no-op takes the row lock in both databases while preserving its metadata and
// revision. Callers check access before and after locking this fixed table.
async function lockReferenceRow(tx: TransactionClient, table: "CustomerSite" | "Equipment", companyId: string, id: string) {
  assertDemoMutationAllowed()
  const identifier = table === "CustomerSite" ? Prisma.raw('"CustomerSite"') : Prisma.raw('"Equipment"')
  return tx.$executeRaw(Prisma.sql`UPDATE ${identifier} SET "updatedAt" = "updatedAt" WHERE "id" = ${id} AND "companyId" = ${companyId} AND "archivedAt" IS NULL`)
}

export async function lockActiveSite(tx: TransactionClient, companyId: string, siteId: string, agencyIds: AgencyAccess = null) {
  const where = { AND: [activeSiteReferenceWhere(companyId, agencyIds), { id: siteId }] }
  const select = { id: true, clientId: true, agencyId: true } as const
  const before = await tx.customerSite.findFirst({ where, select })
  if (!before || await lockReferenceRow(tx, "CustomerSite", companyId, siteId) !== 1) throw new AssetLifecycleError("Site client introuvable ou désactivé")
  const site = await tx.customerSite.findFirst({ where, select })
  if (!site) throw new AssetLifecycleError("Site client introuvable ou désactivé")
  return site
}

// Take the site lock first, then equipment locks in identifier order.
export async function lockActiveEquipment(tx: TransactionClient, companyId: string, siteId: string, ids: readonly string[], agencyIds: AgencyAccess = null) {
  for (const id of [...new Set(ids)].sort()) {
    const where = { AND: [activeEquipmentReferenceWhere(companyId, agencyIds), { id, siteId }] }
    const before = await tx.equipment.findFirst({ where, select: { id: true } })
    if (!before || await lockReferenceRow(tx, "Equipment", companyId, id) !== 1 || !await tx.equipment.findFirst({ where, select: { id: true } })) {
      throw new AssetLifecycleError("Équipement introuvable, désactivé ou rattaché à un autre site")
    }
  }
}

export async function lockActiveAssetProduct(tx: TransactionClient, companyId: string, productId: string) {
  const where = { ...operationsDashboardScope(companyId, null).product, id: productId, active: true }
  const product = await tx.product.findFirst({ where, select: { updatedAt: true } })
  if (!product || (await tx.product.updateMany({ where: { ...where, updatedAt: product.updatedAt }, data: { active: true, updatedAt: product.updatedAt } })).count !== 1) {
    throw new AssetLifecycleError("Produit introuvable ou inactif")
  }
}

// Do not hide incoherent legacy children when deciding whether work remains.
// Only a generic refusal leaves this helper; no child identity is returned.
export async function assertSiteCanDeactivate(tx: TransactionClient, companyId: string, siteId: string) {
  const site = await tx.customerSite.findFirst({ where: { id: siteId, companyId }, select: {
    equipments: { where: { archivedAt: null }, select: { id: true }, take: 1 },
    projects: { where: { status: { notIn: closedProjectStatuses } }, select: { id: true }, take: 1 },
    serviceTickets: { where: { status: { notIn: closedTicketStatuses } }, select: { id: true }, take: 1 },
    interventions: { where: { status: { notIn: closedInterventionStatuses } }, select: { id: true }, take: 1 },
    maintenanceContracts: { where: { status: { notIn: closedMaintenanceStatuses } }, select: { id: true }, take: 1 },
  } })
  if (!site) throw new AssetLifecycleError("Site client introuvable")
  if (site.equipments.length || site.projects.length || site.serviceTickets.length || site.interventions.length || site.maintenanceContracts.length) {
    throw new AssetLifecycleError("Ce site possède encore un équipement référencé ou un dossier en cours. Terminez ou désactivez ces éléments avant de désactiver le site.")
  }
}

export async function assertEquipmentCanDeactivate(tx: TransactionClient, companyId: string, equipmentId: string) {
  const equipment = await tx.equipment.findFirst({ where: { id: equipmentId, companyId }, select: {
    tickets: { where: { OR: [{ status: { notIn: closedTicketStatuses } }, { interventions: { some: { status: { notIn: closedInterventionStatuses } } } }] }, select: { id: true }, take: 1 },
    maintenanceContracts: { where: { contract: { OR: [{ status: { notIn: closedMaintenanceStatuses } }, { interventions: { some: { status: { notIn: closedInterventionStatuses } } } }] } }, select: { contractId: true }, take: 1 },
  } })
  if (!equipment) throw new AssetLifecycleError("Équipement introuvable")
  if (equipment.tickets.length || equipment.maintenanceContracts.length) {
    throw new AssetLifecycleError("Cet équipement possède encore un dossier SAV ou un contrat d’entretien en cours. Terminez ces dossiers avant de désactiver son référencement.")
  }
}
