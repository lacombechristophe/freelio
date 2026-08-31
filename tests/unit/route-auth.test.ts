import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

const authMocks = vi.hoisted(() => ({
  resolveAuthContext: vi.fn(),
}))

vi.mock("@/lib/auth-wrapper", () => ({
  AuthorizationError: class AuthorizationError extends Error {},
  resolveAuthContext: authMocks.resolveAuthContext,
}))

import { getContext } from "@/lib/context"
import { withRouteAuth } from "@/lib/route-auth"

const context = {
  userId: "route-auth-user",
  companyId: "route-auth-company",
  membershipId: "route-auth-membership",
  role: "TECHNICIAN" as const,
  agencyIds: ["route-auth-agency"],
}

describe("Route Handler authorization boundary", () => {
  beforeEach(() => {
    authMocks.resolveAuthContext.mockReset()
    authMocks.resolveAuthContext.mockResolvedValue(context)
  })

  it("keeps the tenant, agency and permission context active for the whole handler", async () => {
    const response = await withRouteAuth("operations.read", async (authenticated) => {
      expect(authenticated).toEqual(context)
      expect(getContext()).toEqual({ ...context, actionPermission: "operations.read" })
      return Response.json({ ok: true })
    })

    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("private, no-store")
    expect(response.headers.get("x-content-type-options")).toBe("nosniff")
    expect(getContext()).toBeUndefined()
  })

  it("denies a missing role permission before the handler can execute", async () => {
    const handler = vi.fn(async () => Response.json({ ok: true }))
    const response = await withRouteAuth("finance.write", handler)

    expect(response.status).toBe(403)
    expect(response.headers.get("cache-control")).toBe("private, no-store")
    expect(handler).not.toHaveBeenCalled()
  })
})
