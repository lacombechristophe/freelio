import { describe, expect, it } from "vitest"
import {
  canAssignRole,
  hasPermission,
  normalizeCompanyRole,
  requiredMutationPermission,
} from "@/lib/permissions"

describe("company permissions", () => {
  it("gives owners every declared permission", () => {
    expect(hasPermission("OWNER", "migration.manage")).toBe(true)
    expect(hasPermission("OWNER", "members.manage")).toBe(true)
  })

  it("keeps field technicians away from finance and migrations", () => {
    expect(hasPermission("TECHNICIAN", "operations.write")).toBe(true)
    expect(hasPermission("TECHNICIAN", "finance.read")).toBe(false)
    expect(hasPermission("TECHNICIAN", "migration.manage")).toBe(false)
  })

  it("prevents administrators from granting owner or administrator access", () => {
    expect(canAssignRole("ADMIN", "SALES")).toBe(true)
    expect(canAssignRole("ADMIN", "ADMIN")).toBe(false)
    expect(canAssignRole("ADMIN", "OWNER")).toBe(false)
  })

  it("normalizes unknown database roles to read-only access", () => {
    expect(normalizeCompanyRole("LEGACY_ROLE")).toBe("VIEWER")
  })

  it("maps sensitive database writes to their domain permission", () => {
    expect(requiredMutationPermission("Membership")).toBe("members.manage")
    expect(requiredMutationPermission("Quote")).toBe("sales.write")
    expect(requiredMutationPermission("InvoicePayment")).toBe("finance.write")
    expect(requiredMutationPermission("Notification")).toBeUndefined()
  })
})
