import "server-only"

import { sqlTimestamp } from "@/lib/sql-timestamp"
import { Prisma, type Contract } from "@/generated/prisma/client"
import type { AuthContext } from "@/lib/auth-wrapper"
import type { TransactionClient } from "@/lib/prisma"
import { AssetLifecycleError } from "@/lib/operations/asset-error"
import { activeEquipmentReferenceWhere, activeSiteReferenceWhere, lockActiveEquipment, lockActiveSite } from "@/lib/operations/asset-lifecycle"
import { readMaintenanceRenewalSources } from "@/lib/operations/maintenance-renewal-source"
import { readSignedContractDocument } from "./archive"
import { assertCurrentMaintenanceTerms, assertMaintenanceProposalTerms, MAINTENANCE_TERMS_CHANGED, MAINTENANCE_TERMS_MISSING } from "./maintenance-renewal-terms"

type Prepared = Awaited<ReturnType<typeof readMaintenanceRenewalSources>> extends Map<string, infer Source> ? Source : never
type Scope = Pick<AuthContext, "companyId" | "agencyIds">

export async function checkMaintenanceProposal(tx: TransactionClient, scope: Scope, proposal: Contract, options: { lock: boolean; signing?: boolean }) {
  if (proposal.kind !== "MAINTENANCE_RENEWAL" || !proposal.maintenanceContractId) throw new AssetLifecycleError("Proposition d’entretien introuvable")
  const prepared = (await readMaintenanceRenewalSources(tx, scope, [proposal.maintenanceContractId])).get(proposal.maintenanceContractId)
  if (!prepared || prepared.source.clientId !== proposal.clientId || proposal.companyId !== scope.companyId) throw new AssetLifecycleError("Proposition d’entretien introuvable")
  const source = prepared.source
  if (!source.currentRenewalProposalId) throw new AssetLifecycleError(MAINTENANCE_TERMS_MISSING)
  if (source.currentRenewalProposalId !== proposal.id || source.status === "RENEWED" || source.renewalStatus === "RENEWED" || source._count.renewedContracts > 0 || source.renewalStatus === "DECLINED") throw new AssetLifecycleError(MAINTENANCE_TERMS_CHANGED)
  if (options.signing && !["PROPOSED", "ACCEPTED"].includes(source.renewalStatus)) throw new AssetLifecycleError(MAINTENANCE_TERMS_CHANGED)
  assertCurrentMaintenanceTerms(assertMaintenanceProposalTerms(proposal), source, prepared.isTvaApplicable)
  const equipmentIds = source.equipments.map(row => row.equipmentId)
  if (options.lock) {
    const site = await lockActiveSite(tx, scope.companyId, source.siteId, scope.agencyIds)
    if (site.clientId !== source.clientId) throw new AssetLifecycleError("Site du contrat incompatible avec le client")
    await lockActiveEquipment(tx, scope.companyId, source.siteId, equipmentIds, scope.agencyIds)
    const claimed = await tx.$executeRaw(Prisma.sql`UPDATE "MaintenanceContract" SET "updatedAt" = "updatedAt" WHERE "id" = ${source.id} AND "companyId" = ${scope.companyId} AND "updatedAt" = ${sqlTimestamp(source.updatedAt)}`)
    if (claimed !== 1) throw new AssetLifecycleError(MAINTENANCE_TERMS_CHANGED)
  } else {
    const site = await tx.customerSite.findFirst({ where: { AND: [activeSiteReferenceWhere(scope.companyId, scope.agencyIds), { id: source.siteId, clientId: source.clientId }] }, select: { id: true } })
    const count = await tx.equipment.count({ where: { AND: [activeEquipmentReferenceWhere(scope.companyId, scope.agencyIds), { id: { in: equipmentIds }, siteId: source.siteId }] } })
    if (!site || count !== equipmentIds.length) throw new AssetLifecycleError(MAINTENANCE_TERMS_CHANGED)
  }
  return prepared
}

export async function markMaintenanceProposal(tx: TransactionClient, prepared: Prepared, proposalId: string, decision: "PROPOSED" | "ACCEPTED") {
  const source = prepared.source, updatedAt = new Date(Math.max(Date.now(), source.updatedAt.getTime() + 1))
  // Only the linked proposal may move this decision; no operational fields or
  // general Sales mutation capability are exposed by this fixed statement.
  const count = await tx.$executeRaw(Prisma.sql`UPDATE "MaintenanceContract" SET "renewalStatus" = ${decision}, "acceptedRenewalProposalId" = CASE WHEN ${decision} = 'ACCEPTED' THEN ${proposalId} ELSE "acceptedRenewalProposalId" END, "updatedAt" = ${sqlTimestamp(updatedAt)} WHERE "id" = ${source.id} AND "companyId" = ${source.companyId} AND "clientId" = ${source.clientId} AND "currentRenewalProposalId" = ${proposalId} AND "updatedAt" = ${sqlTimestamp(source.updatedAt)}`)
  if (count !== 1) throw new AssetLifecycleError(MAINTENANCE_TERMS_CHANGED)
}

export async function assertAcceptedMaintenanceAgreement(tx: TransactionClient, prepared: Prepared) {
  const source = prepared.source
  if (!source.acceptedRenewalProposalId) {
    if (await tx.contract.count({ where: { companyId: source.companyId, maintenanceContractId: source.id, status: "SIGNED" } })) throw new AssetLifecycleError(MAINTENANCE_TERMS_MISSING)
    return // A manual decision without a signed proposal keeps its existing path.
  }
  const proposal = await tx.contract.findFirst({ where: { id: source.acceptedRenewalProposalId, companyId: source.companyId, clientId: source.clientId, maintenanceContractId: source.id, kind: "MAINTENANCE_RENEWAL", status: "SIGNED" } })
  if (!proposal) throw new AssetLifecycleError(MAINTENANCE_TERMS_CHANGED)
  const terms = assertMaintenanceProposalTerms(proposal)
  let signed: ReturnType<typeof readSignedContractDocument>
  try { signed = readSignedContractDocument(proposal.signedDocument, proposal) } catch { throw new AssetLifecycleError(MAINTENANCE_TERMS_MISSING) }
  if (!signed.maintenanceRenewalTerms) throw new AssetLifecycleError(MAINTENANCE_TERMS_MISSING)
  if (signed.maintenanceRenewalTerms !== proposal.maintenanceRenewalTerms) throw new AssetLifecycleError(MAINTENANCE_TERMS_CHANGED)
  assertCurrentMaintenanceTerms(terms, source, prepared.isTvaApplicable)
}
