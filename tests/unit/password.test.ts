import { describe, expect, it } from "vitest"

import { hashPassword, passwordIsStrong, verifyPassword } from "@/lib/auth/password-core"

describe("password authentication", () => {
  it("enforces the documented policy", () => {
    expect(passwordIsStrong("short")).toBe(false)
    expect(passwordIsStrong("longbutnouppercase1")).toBe(false)
    expect(passwordIsStrong("LongAndSecure1")).toBe(true)
  })

  it("stores a salted scrypt derivation and verifies in constant-time form", async () => {
    const first = await hashPassword("LongAndSecure1")
    const second = await hashPassword("LongAndSecure1")
    expect(first).not.toBe(second)
    expect(first).not.toContain("LongAndSecure1")
    await expect(verifyPassword("LongAndSecure1", first)).resolves.toBe(true)
    await expect(verifyPassword("WrongPassword1", first)).resolves.toBe(false)
    await expect(verifyPassword("LongAndSecure1", "invalid")).resolves.toBe(false)
  })
})
