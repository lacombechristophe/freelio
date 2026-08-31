import { describe, expect, it } from "vitest"

import { boundedPageSize } from "@/lib/pagination"

describe("boundedPageSize", () => {
  it("keeps valid page sizes and clamps oversized requests", () => {
    expect(boundedPageSize(25, 20, 100)).toBe(25)
    expect(boundedPageSize(10_000, 20, 100)).toBe(100)
  })

  it("rejects invalid, fractional and non-positive values", () => {
    expect(boundedPageSize(-5, 20, 100)).toBe(20)
    expect(boundedPageSize(1.5, 20, 100)).toBe(20)
    expect(boundedPageSize(Number.NaN, 20, 100)).toBe(20)
    expect(boundedPageSize("50", 20, 100)).toBe(20)
  })
})
