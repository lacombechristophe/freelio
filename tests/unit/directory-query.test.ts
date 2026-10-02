import { describe, expect, it } from "vitest"
import { compareDirectoryValues, matchesDirectoryFilter, parseDirectoryQuery } from "@/lib/directory-query"

describe("directory query contract", () => {
  it("rejects malformed or unbounded URL state", () => {
    for (const value of ["{", "null", JSON.stringify({ page: -1 }), JSON.stringify({ search: "x".repeat(201) })]) {
      expect(parseDirectoryQuery(value)).toMatchObject({ search: "", page: 1, filters: [] })
    }
  })
  it("preserves a valid shareable query", () => {
    expect(parseDirectoryQuery(JSON.stringify({ search: "Camille", page: 3, status: "SENT" }))).toMatchObject({ search: "Camille", page: 3, status: "SENT" })
  })
  it("handles French decimals, arrays, missing properties and ISO dates", () => {
    const filter = { id: "test", field: "custom", operator: "greater_than" as const, value: "12,5" }
    expect(matchesDirectoryFilter(13, filter)).toBe(true)
    expect(matchesDirectoryFilter(null, filter)).toBe(false)
    expect(matchesDirectoryFilter([], { ...filter, operator: "is_empty" })).toBe(true)
    expect(matchesDirectoryFilter(["WEB", "SALON"], { ...filter, operator: "equals", value: "web" })).toBe(true)
    expect(matchesDirectoryFilter("2026-10-01", { ...filter, value: "2026-09-28" })).toBe(true)
    expect(compareDirectoryValues("Client 9", "Client 10")).toBeLessThan(0)
  })
})
