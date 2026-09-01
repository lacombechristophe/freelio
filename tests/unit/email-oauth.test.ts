import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

describe("email OAuth state", () => {
  beforeEach(() => {
    process.env.AUTH_SECRET = "test-secret-with-sufficient-entropy"
    process.env.ENCRYPTION_KEY = "test-encryption-key"
  })

  it("round-trips a signed, tenant-bound state", async () => {
    const { createEmailOAuthState, verifyEmailOAuthState } = await import("@/lib/integrations/email-oauth")
    const input = {
      provider: "GOOGLE" as const,
      companyId: "cm12345678901234567890123",
      userId: "cm22345678901234567890123",
      channelId: "cm32345678901234567890123",
      nonce: "a".repeat(43),
      expiresAt: Date.now() + 60_000,
    }
    expect(verifyEmailOAuthState(createEmailOAuthState(input))).toEqual(input)
  })

  it("rejects tampering and expired states", async () => {
    const { createEmailOAuthState, verifyEmailOAuthState } = await import("@/lib/integrations/email-oauth")
    const base = {
      provider: "MICROSOFT" as const,
      companyId: "cm12345678901234567890123",
      userId: "cm22345678901234567890123",
      channelId: "cm32345678901234567890123",
      nonce: "b".repeat(43),
    }
    const valid = createEmailOAuthState(base)
    expect(() => verifyEmailOAuthState(`${valid.slice(0, -1)}x`)).toThrow("État OAuth invalide")
    expect(() => verifyEmailOAuthState(createEmailOAuthState({ ...base, expiresAt: Date.now() - 1 }))).toThrow("expirée")
  })

  it("derives an RFC 7636 S256 code challenge", async () => {
    const { createEmailOAuthCodeChallenge } = await import("@/lib/integrations/email-oauth")
    expect(createEmailOAuthCodeChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM")
  })

  it("requests mail and calendar scopes for both providers", async () => {
    process.env.GOOGLE_CLIENT_ID = "google-client"
    process.env.GOOGLE_CLIENT_SECRET = "google-secret"
    process.env.MICROSOFT_CLIENT_ID = "microsoft-client"
    process.env.MICROSOFT_CLIENT_SECRET = "microsoft-secret"
    const { buildEmailAuthorizationUrl } = await import("@/lib/integrations/email-oauth")
    const google = buildEmailAuthorizationUrl("GOOGLE", "https://crm.example.test/callback", "state", "challenge")
    const microsoft = buildEmailAuthorizationUrl("MICROSOFT", "https://crm.example.test/callback", "state", "challenge")
    expect(google.searchParams.get("scope")).toContain("calendar.events")
    expect(microsoft.searchParams.get("scope")).toContain("Calendars.ReadWrite")
  })
})
