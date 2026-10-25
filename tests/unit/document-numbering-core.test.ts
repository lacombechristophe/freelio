import { describe, expect, it } from "vitest"
import { nextDocumentNumber, withDocumentNumberRetry } from "@/lib/document-numbering"
import { isTransactionConflict } from "@/lib/transaction-conflicts"

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
  it.each([
    { code: "P2034" },
    { code: "P2010", meta: { code: "40001" } },
    { code: "P2010", meta: { code: "40P01" } },
    { code: "P2010", meta: { driverAdapterError: { cause: { kind: "TransactionWriteConflict", originalCode: "40001" } } } },
    { code: "P2010", meta: { driverAdapterError: { cause: { kind: "TransactionWriteConflict", originalCode: "40P01" } } } },
  ])("restarts an explicitly aborted transaction when the caller opts in: %j", async conflict => {
    let attempts = 0
    const result = await withDocumentNumberRetry(async () => {
      if (++attempts === 1) throw conflict
      return "fresh source and committed document"
    }, { retryTransactionConflicts: true })
    expect(result).toBe("fresh source and committed document")
    expect(attempts).toBe(2)
  })
  it("does not replay transaction conflicts for other numbering callers", async () => {
    let attempts = 0
    const conflict = { code: "P2034" }
    await expect(withDocumentNumberRetry(async () => { attempts++; throw conflict })).rejects.toBe(conflict)
    expect(attempts).toBe(1)
  })
  it("bounds retries and preserves the final database error", async () => {
    let attempts = 0
    const conflict = { code: "P2010", meta: { code: "40001" } }
    await expect(withDocumentNumberRetry(async () => { attempts++; throw conflict }, { maxRetries: 3, retryTransactionConflicts: true })).rejects.toBe(conflict)
    expect(attempts).toBe(3)
  })
  it.each([null, new Error("40001"), { code: "40001" }, { code: "P2002", meta: { target: ["quoteId"] } }, { code: "P2028" },
    { code: "P2010" }, { code: "P2010", meta: { code: "23505" } }, { code: "P2010", meta: { code: "08006" } },
    { code: "P2010", meta: { driverAdapterError: { cause: { kind: "TransactionWriteConflict", originalCode: "08006" } } } },
    { code: "P2010", meta: { driverAdapterError: { cause: { kind: "GenericJs", originalCode: "40001" } } } }])(
    "does not classify business, connection or unknown transaction errors as safe to retry: %j", async error => {
      expect(isTransactionConflict(error)).toBe(false)
      let attempts = 0
      await expect(withDocumentNumberRetry(async () => { attempts++; throw error }, { retryTransactionConflicts: true })).rejects.toBe(error)
      expect(attempts).toBe(1)
    },
  )
})
