import { describe, expect, it } from "vitest"
import { buildTimeInvoiceLines } from "@/lib/finance/time-invoice-lines"
import { calculateCommercialDocument } from "@/lib/finance/commercial-calculation"

const entry = (durationSec: number, project = "first", date: Date | string = new Date("2030-01-01")) => ({ durationSec, date, description: "Fictional time", project: { id: project, name: project } })
describe("Time invoice line rounding", () => {
  it("rounds each project separately rather than the complete selected duration", () => {
    const lines = buildTimeInvoiceLines([entry(60), entry(60, "second")], 10000, 0, "GROUP_BY_PROJECT")
    expect(calculateCommercialDocument(lines).totalHtCents).toBe(334)
    expect(lines.map(line => line.quantity)).toEqual([1 / 60, 1 / 60])
  })
  it("uses the same quantities for browser strings and server dates without mutating the selection", () => {
    const rows = [entry(17), entry(43)], initial = structuredClone(rows)
    for (const mode of ["DETAIL", "GROUP_BY_PROJECT"] as const) {
      expect(buildTimeInvoiceLines(rows, 10000, 20, mode)).toEqual(buildTimeInvoiceLines(rows.map(row => ({ ...row, date: new Date(row.date).toISOString() })), 10000, 20, mode))
    }
    expect(rows).toEqual(initial)
  })
  it("keeps whole-hour totals and chronological detail labels", () => {
    const lines = buildTimeInvoiceLines([entry(3600, "first", "2030-01-02"), entry(7200, "first", "2030-01-01")], 6250, 20, "DETAIL")
    expect(lines.map(line => [line.quantity, line.order])).toEqual([[2, 0], [1, 1]])
    expect(calculateCommercialDocument(lines)).toMatchObject({ totalHtCents: 18750, totalTvaCents: 3750, totalTtcCents: 22500 })
  })
  it("calculates an empty selection as zero", () => {
    expect(calculateCommercialDocument(buildTimeInvoiceLines([], 10000, 20, "DETAIL")).totalTtcCents).toBe(0)
  })
})
