import { afterEach, describe, expect, it, vi } from "vitest"

import { createConsentWithdrawalToken, verifyConsentWithdrawalToken } from "@/lib/leads/consent-token"

const secret = "unit-test-consent-token-secret-with-32-characters"

describe("marketing consent withdrawal tokens", () => {
  afterEach(() => vi.unstubAllEnvs())

  it("round-trips only the opaque company and lead identifiers", async () => {
    const token = await createConsentWithdrawalToken({ companyId: "company_123", leadId: "lead_456" }, secret)
    await expect(verifyConsentWithdrawalToken(token, secret)).resolves.toEqual({
      purpose: "MARKETING_WITHDRAWAL",
      companyId: "company_123",
      leadId: "lead_456",
    })
    expect(token).not.toContain("client@example.com")
  })

  it("rejects altered or differently signed links", async () => {
    const token = await createConsentWithdrawalToken({ companyId: "company_123", leadId: "lead_456" }, secret)
    await expect(verifyConsentWithdrawalToken(`${token}x`, secret)).resolves.toBeNull()
    await expect(verifyConsentWithdrawalToken(token, `${secret}-different`)).resolves.toBeNull()
  })

  it("ignores empty dedicated secrets and falls back to the authentication secret", async () => {
    vi.stubEnv("CONSENT_TOKEN_SECRET", "")
    vi.stubEnv("JWT_SECRET", "   ")
    vi.stubEnv("AUTH_SECRET", secret)

    const token = await createConsentWithdrawalToken({ companyId: "company_123", leadId: "lead_456" })
    await expect(verifyConsentWithdrawalToken(token)).resolves.toMatchObject({
      companyId: "company_123",
      leadId: "lead_456",
    })
  })
})
