import { describe, expect, it } from "vitest"
import { nextDocumentNumber, withDocumentNumberRetry } from "@/lib/document-numbering"

describe("Numeric document suffix allocation", () => {
  it("crosses the 999/1000 boundary independent of lexical order", () => {
    const prefix = "FACT-2026-"
    expect(nextDocumentNumber([{ number: prefix + "999" }, { number: prefix + "1000" }], prefix)).toBe(prefix + "1001")
    expect(nextDocumentNumber([{ number: prefix + "1000" }, { number: prefix + "999" }], prefix)).toBe(prefix + "1001")
  })
  it("keeps historic padding, ignores other series and handles imported suffixes exactly", () => {
    expect(nextDocumentNumber(null, "DEV-2026-")).toBe("DEV-2026-001")
    expect(nextDocumentNumber([{ number: "DEV-2025-9999" }, { number: "DEV-2026-000009" }, { number: "DEV-2026-import-77" }], "DEV-2026-")).toBe("DEV-2026-010")
    expect(nextDocumentNumber("DEV-2026-9007199254740993", "DEV-2026-")).toBe("DEV-2026-9007199254740994")
  })
  it("supports concurrent allocations while the storage unique constraint prevents duplicates", async () => {
    const prefix = "FACT-2026-"
    const stored = new Set(["FACT-2026-998", "FACT-2026-999", "FACT-2026-1000"])
    const allocated = await Promise.all(Array.from({ length: 20 }, () => withDocumentNumberRetry(async () => {
      const number = nextDocumentNumber([...stored].map(number => ({ number })), prefix)
      await Promise.resolve()
      if (stored.has(number)) throw { code: "P2002", meta: { target: ["companyId", "number"] } }
      stored.add(number)
      return number
    })))
    expect(new Set(allocated).size).toBe(20)
    expect(stored.size).toBe(23)
    expect(allocated).toContain("FACT-2026-1020")
  })
  it("does not retry a business idempotency conflict", async () => {
    let attempts = 0
    await expect(withDocumentNumberRetry(async () => {
      attempts += 1
      throw { code: "P2002", meta: { target: ["quoteId"] } }
    })).rejects.toMatchObject({ code: "P2002" })
    expect(attempts).toBe(1)
  })
})
