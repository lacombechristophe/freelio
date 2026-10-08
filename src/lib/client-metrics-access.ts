import type { Client } from "@prisma/client"
import { hasPermission, type CompanyRole } from "@/lib/permissions"

type ClientMetrics = Pick<Client, "totalRevenueCents" | "totalUnpaidCents" | "renewalAmountCents" | "relationScore">
type AccessibleClient<T extends ClientMetrics> = Omit<T, keyof ClientMetrics> & { [Key in keyof ClientMetrics]: number | null }

export function clientWithAccessibleMetrics<T extends ClientMetrics>(
  client: T,
  context: { role: CompanyRole; agencyIds: string[] | null },
): AccessibleClient<T> {
  const canReadFinance = hasPermission(context.role, "finance.read")
  const canReadGlobalFinance = canReadFinance && context.agencyIds === null
  return {
    ...client,
    totalRevenueCents: canReadGlobalFinance ? client.totalRevenueCents : null,
    totalUnpaidCents: canReadGlobalFinance ? client.totalUnpaidCents : null,
    renewalAmountCents: canReadFinance ? client.renewalAmountCents : null,
    relationScore: canReadGlobalFinance ? client.relationScore : null,
  }
}
