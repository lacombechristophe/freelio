import { describe, expect, it } from "vitest"

import { createConsentWithdrawalToken, verifyConsentWithdrawalToken } from "@/lib/leads/consent-token"

const secret = "unit-test-consent-token-secret-with-32-characters"

describe("marketing consent withdrawal tokens", () => {
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
})
