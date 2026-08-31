import type { CompanyRole } from "@/lib/permissions"

export type AgencyAccess = string[] | null

export function resolveAgencyAccess(role: CompanyRole, assignedAgencyIds: string[]): AgencyAccess {
  if (role === "OWNER" || role === "ADMIN") return null
  return [...new Set(assignedAgencyIds)]
}

export function canAccessAgency(access: AgencyAccess, agencyId: string | null | undefined) {
  if (access === null) return true
  return Boolean(agencyId && access.includes(agencyId))
}

export function assertAgencyAccess(access: AgencyAccess, agencyId: string | null | undefined) {
  if (!canAccessAgency(access, agencyId)) throw new Error("AGENCY_ACCESS_DENIED")
}

export function accessibleAgencyWhere(access: AgencyAccess) {
  return access === null ? {} : { id: { in: access } }
}
