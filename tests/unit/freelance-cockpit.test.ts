import { describe, expect, it } from "vitest"

import {
  computeProjectRisk,
  computeUnbilledValueCents,
  daysUntil,
  isInvoiceActionable,
  isQuoteStale,
} from "@/lib/operations-cockpit"

describe("operations cockpit helpers", () => {
  const today = new Date("2026-06-30T10:00:00.000Z")

  it("estimates unbilled time value from a fixed hourly rate", () => {
    expect(computeUnbilledValueCents(3600, 7500)).toBe(7500)
    expect(computeUnbilledValueCents(5400, 6000)).toBe(9000)
    expect(computeUnbilledValueCents(-3600, 6000)).toBe(0)
  })

  it("classifies project risk from budget consumption and deadline", () => {
    expect(computeProjectRisk({
      budgetCents: 100000,
      consumedCents: 85000,
      endDate: "2026-07-30",
      today,
    })).toMatchObject({
      level: "warning",
      budgetUsagePct: 85,
    })

    expect(computeProjectRisk({
      budgetCents: 100000,
      consumedCents: 101000,
      endDate: "2026-07-30",
      today,
    })).toMatchObject({
      level: "critical",
      budgetUsagePct: 101,
    })

    expect(computeProjectRisk({
      budgetCents: 0,
      consumedCents: 0,
      endDate: "2026-07-03",
      today,
    })).toMatchObject({
      level: "warning",
      daysLeft: 3,
    })
  })

  it("detects actionable invoices and stale quotes", () => {
    expect(daysUntil("2026-07-02", today)).toBe(2)
    expect(isInvoiceActionable("SENT", "2026-06-20", today)).toBe(true)
    expect(isInvoiceActionable("PAID", "2026-06-20", today)).toBe(false)
    expect(isQuoteStale({
      status: "SENT",
      validUntil: "2026-06-29",
      updatedAt: "2026-06-25",
      today,
    })).toBe(true)
    expect(isQuoteStale({
      status: "ACCEPTED",
      validUntil: "2026-06-01",
      updatedAt: "2026-05-01",
      today,
    })).toBe(false)
  })
})
