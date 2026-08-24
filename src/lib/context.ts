import { AsyncLocalStorage } from "async_hooks"
import type { CompanyRole, Permission } from "@/lib/permissions"

export type RequestContext = {
  userId: string
  companyId: string
  membershipId: string
  role: CompanyRole
  actionPermission?: Permission
}

export const requestContext = new AsyncLocalStorage<RequestContext>()

export function getContext() {
  return requestContext.getStore()
}
