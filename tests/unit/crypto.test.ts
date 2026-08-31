import { describe, expect, it } from "vitest"

process.env.ENCRYPTION_KEY = "unit-test-encryption-key-with-32-chars"
const { decrypt, decryptBytes, decryptSensitive, encrypt, encryptBytes, isEncrypted } = await import("@/lib/crypto")

describe("sensitive value encryption", () => {
  it("round-trips authenticated versioned text", () => {
    const encrypted = encrypt("FR761234567890")
    expect(encrypted).not.toContain("FR761234567890")
    expect(isEncrypted(encrypted)).toBe(true)
    expect(decrypt(encrypted)).toBe("FR761234567890")
  })

  it("reads legacy plaintext while new writes migrate on save", () => {
    expect(decryptSensitive("FR761234567890")).toBe("FR761234567890")
    expect(decryptSensitive(null)).toBeNull()
  })

  it("round-trips binary backup payloads", () => {
    const source = new TextEncoder().encode("compressed-backup")
    const encrypted = encryptBytes(source)
    expect(encrypted).not.toEqual(source)
    expect([...decryptBytes(encrypted)]).toEqual([...source])
  })
})
