import { AsyncLocalStorage } from "async_hooks"
import type { CompanyRole } from "@/lib/permissions"

export type RequestContext = {
  userId: string
  companyId: string
  membershipId: string
  role: CompanyRole
}

export const requestContext = new AsyncLocalStorage<RequestContext>()

export function getContext() {
  return requestContext.getStore()
}
