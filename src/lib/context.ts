import { AsyncLocalStorage } from "async_hooks"
import type { CompanyRole, Permission } from "@/lib/permissions"
import type { AgencyAccess } from "@/lib/agency-access"

export type RequestContext = {
  userId: string
  companyId: string
  membershipId: string
  role: CompanyRole
  agencyIds: AgencyAccess
  actionPermission?: Permission
  readOnlyAction?: boolean
  timeInvoiceClaimId?: string
  timeInvoiceReleaseId?: string
  oauthCredentialRefreshChannelId?: string
  quoteOrderCreation?: { quoteId: string; clientId: string }
  maintenanceRenewalSettings?: { contractId: string; expectedUpdatedAt: string }
  operationsProjectReadSql?: string
  campaignAttributionReadSql?: string
  recurringInvoiceReadSql?: string
}

const globalForContext = globalThis as typeof globalThis & {
  freelioRequestContext?: AsyncLocalStorage<RequestContext>
}

// Prisma is cached across modules; its authorization store must be shared too.
export const requestContext = globalForContext.freelioRequestContext ??= new AsyncLocalStorage<RequestContext>()

export function getContext() {
  return requestContext.getStore()
}
