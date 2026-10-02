import { describe, expect, it } from "vitest"
import { assertDemoMutationAllowed, publicDemoRequestAllowed } from "@/lib/demo-policy"
import { publicDemoConfigurationIssues } from "@/lib/demo-configuration"

describe("public demonstration boundary", () => {
  it.each(["/api/public/leads", "/api/integrations/email/oauth/start", "/api/automations/process", "/api/billing/stripe", "/api/backup/export", "/api/unknown", "/sign/contracts/fake", "/consent/withdraw/fake", "/auth/register", "/dashboard/devis/new"])("refuses hidden and future entry points: %s", path => {
    expect(publicDemoRequestAllowed(path, "GET")).toBe(false)
    expect(publicDemoRequestAllowed(path, "POST")).toBe(false)
  })
  it("keeps navigation, bounded document reads, login and read actions available", () => {
    expect(publicDemoRequestAllowed("/dashboard/clients", "GET")).toBe(true)
    expect(publicDemoRequestAllowed("/dashboard/clients", "POST")).toBe(true)
    expect(publicDemoRequestAllowed("/api/pdf/facture/fake", "GET")).toBe(true)
    expect(publicDemoRequestAllowed("/api/pdf/facture/fake", "POST")).toBe(false)
    expect(publicDemoRequestAllowed("/auth/login", "POST")).toBe(true)
    expect(publicDemoRequestAllowed("/api/auth/callback/resend", "GET")).toBe(false)
  })
  it("requires matching public build flags and refuses business provider keys without reflecting values", () => {
    const env = { DEMO_ACCESS_MODE: "readonly", NEXT_PUBLIC_DEMO_MODE: "true", NEXT_PUBLIC_DEMO_READ_ONLY: "true" }
    expect(publicDemoConfigurationIssues(env)).toEqual([])
    expect(publicDemoConfigurationIssues({ ...env, NEXT_PUBLIC_DEMO_READ_ONLY: "false", RESEND_API_KEY: "synthetic-secret" })).toEqual(["NEXT_PUBLIC_DEMO_READ_ONLY", "RESEND_API_KEY"])
    expect(() => assertDemoMutationAllowed(env)).toThrow("lecture seule")
    expect(() => assertDemoMutationAllowed({ DEMO_ACCESS_MODE: "local" })).not.toThrow()
  })
})
