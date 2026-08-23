import { describe, expect, it } from "vitest"

import { computeInvoiceSlice, remainingOrderAmount } from "@/lib/operations/orders"

describe("customer order billing", () => {
  it("splits a TTC deposit without losing a cent", () => {
    expect(computeInvoiceSlice({ orderHtCents: 10_000, orderTvaCents: 2_000, orderTtcCents: 12_000, amountTtcCents: 3_600 }))
      .toEqual({ totalHtCents: 3_000, totalTvaCents: 600, totalTtcCents: 3_600, tvaRate: 20 })
  })

  it("computes the remaining amount excluding credits and cancelled invoices", () => {
    expect(remainingOrderAmount(12_000, [
      { totalTtcCents: 3_600, status: "SENT", type: "DEPOSIT" },
      { totalTtcCents: -1_000, status: "SENT", type: "CREDIT_NOTE" },
      { totalTtcCents: 2_000, status: "CANCELLED", type: "STANDARD" },
    ])).toBe(8_400)
  })

  it("rejects an invalid slice", () => {
    expect(() => computeInvoiceSlice({ orderHtCents: 100, orderTvaCents: 20, orderTtcCents: 120, amountTtcCents: 121 })).toThrow()
  })
})
