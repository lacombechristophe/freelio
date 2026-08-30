import { describe, expect, it } from "vitest"

import { indexedMaintenancePrice, maintenanceRenewalWindow, nextMaintenanceTerm } from "@/lib/operations/maintenance-renewal"

describe("maintenance renewals", () => {
  it("applies a bounded monetary indexation with cent rounding", () => {
    expect(indexedMaintenancePrice(24_000, 5)).toBe(25_200)
    expect(indexedMaintenancePrice(999, 2.5)).toBe(1_024)
  })

  it("preserves the inclusive duration of the previous term", () => {
    const term = nextMaintenanceTerm("2026-08-20T00:00:00Z", "2027-08-19T00:00:00Z")
    expect(term.startDate.toISOString().slice(0, 10)).toBe("2027-08-20")
    expect(term.endDate.toISOString().slice(0, 10)).toBe("2028-08-18")
    expect(term.durationDays).toBe(365)
  })

  it("opens the renewal window according to notice and detects overdue terms", () => {
    const now = new Date("2026-08-30T00:00:00Z")
    expect(maintenanceRenewalWindow("2026-09-20T00:00:00Z", 30, now)).toMatchObject({ status: "OPEN", daysRemaining: 21 })
    expect(maintenanceRenewalWindow("2026-12-31T00:00:00Z", 30, now).status).toBe("FUTURE")
    expect(maintenanceRenewalWindow("2026-08-20T00:00:00Z", 30, now).status).toBe("OVERDUE")
    expect(maintenanceRenewalWindow(null, 30, now).status).toBe("NO_END")
  })
})
