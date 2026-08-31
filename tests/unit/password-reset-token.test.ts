import { describe, expect, it } from "vitest"

import { createPasswordResetToken, hashPasswordResetToken, passwordResetExpiresAt } from "@/lib/auth/reset-token"

describe("password reset tokens", () => {
  it("creates high-entropy bearer values but stores deterministic hashes", () => {
    const first = createPasswordResetToken()
    const second = createPasswordResetToken()
    expect(first).not.toBe(second)
    expect(first.length).toBeGreaterThanOrEqual(40)
    expect(hashPasswordResetToken(first)).toMatch(/^[a-f0-9]{64}$/)
    expect(hashPasswordResetToken(first)).toBe(hashPasswordResetToken(first))
    expect(hashPasswordResetToken(first)).not.toBe(hashPasswordResetToken(second))
  })

  it("expires in thirty minutes", () => {
    const now = new Date("2026-08-31T10:00:00.000Z")
    expect(passwordResetExpiresAt(now.getTime()).toISOString()).toBe("2026-08-31T10:30:00.000Z")
  })
})
