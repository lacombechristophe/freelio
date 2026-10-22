import "server-only"

import { createHash } from "node:crypto"
import type { AuthContext } from "@/lib/auth-wrapper"
import type { TransactionClient } from "@/lib/prisma"
import { operationsDashboardScope } from "./dashboard-scope"
import { AssetLifecycleError } from "./asset-error"

export async function readMaintenanceRenewalSources(tx: TransactionClient, context: Pick<AuthContext, "companyId" | "agencyIds">, contractIds: string[]) {
  const scope = operationsDashboardScope(context.companyId, context.agencyIds)
  const [company, sources] = await Promise.all([
    tx.company.findUnique({ where: { id: context.companyId }, select: { isTvaApplicable: true } }),
    tx.maintenanceContract.findMany({ where: { AND: [scope.contract, { id: { in: contractIds } }] },
      include: { equipments: { select: { equipmentId: true } }, recurringInvoice: true, _count: { select: { renewedContracts: true } } } }),
  ])
  if (!company) throw new AssetLifecycleError("Contrat d’entretien introuvable")
  return new Map(sources.map(source => {
    const { equipments, recurringInvoice, ...contract } = source
    const json = JSON.stringify(["maintenance-renewal-v1", contract, equipments.map(row => row.equipmentId).sort(), recurringInvoice, company.isTvaApplicable], (_key, value: unknown) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return value
      return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0))
    })
    return [source.id, { source, isTvaApplicable: company.isTvaApplicable, revision: createHash("sha256").update(json).digest("hex") }] as const
  }))
}
