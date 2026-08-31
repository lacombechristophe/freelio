import { describe, expect, it } from "vitest"

import { generateRecoveryCodes, generateTotp, hashRecoveryCode, normalizeRecoveryCode, verifyTotp } from "@/lib/auth/mfa-core"

describe("MFA TOTP and recovery codes", () => {
  it("matches the RFC 6238 SHA-1 vector truncated to six digits", () => {
    const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"
    expect(generateTotp(secret, 59_000)).toBe("287082")
    expect(verifyTotp(secret, "287 082", 59_000, 0)).toBe(true)
    expect(verifyTotp(secret, "287083", 59_000, 0)).toBe(false)
  })

  it("accepts only the configured clock window", () => {
    const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"
    const previous = generateTotp(secret, 30_000)
    expect(verifyTotp(secret, previous, 60_000, 1)).toBe(true)
    expect(verifyTotp(secret, previous, 90_000, 1)).toBe(false)
  })

  it("generates distinct printable codes and hashes their normalized value", () => {
    const codes = generateRecoveryCodes()
    expect(codes).toHaveLength(10)
    expect(new Set(codes).size).toBe(10)
    expect(codes.every((code) => /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(code))).toBe(true)
    expect(normalizeRecoveryCode("abcd-2345 efgh")).toBe("ABCD2345EFGH")
    expect(hashRecoveryCode("u1", "ABCD-2345-EFGH", "pepper")).toBe(hashRecoveryCode("u1", "abcd2345efgh", "pepper"))
  })
})
