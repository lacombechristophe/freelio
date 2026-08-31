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
}

export const requestContext = new AsyncLocalStorage<RequestContext>()

export function getContext() {
  return requestContext.getStore()
}
