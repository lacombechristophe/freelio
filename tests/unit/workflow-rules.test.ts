import { describe, expect, it } from "vitest"
import {
  advanceTaskRecurrence,
  bankTransactionFingerprint,
  computeCreditBreakdown,
  getEInvoiceReadiness,
  getNextRecurringDate,
} from "../../src/lib/workflow-rules"

describe("workflow rules", () => {
  it("requires the identifiers needed before marking a B2B invoice ready", () => {
    expect(getEInvoiceReadiness({ companySiret: null, clientSiret: "123", clientType: "ENTERPRISE" }).status).toBe("NOT_READY")
    expect(getEInvoiceReadiness({ companySiret: "123", clientSiret: null, clientType: "ENTERPRISE" }).status).toBe("NOT_READY")
    expect(getEInvoiceReadiness({ companySiret: "123", clientSiret: "456", clientType: "ENTERPRISE" })).toEqual({ status: "READY", error: null })
    expect(getEInvoiceReadiness({ companySiret: "123", clientSiret: null, clientType: "INDIVIDUAL" }).status).toBe("READY")
  })

  it("advances invoice and task recurrences deterministically", () => {
    expect(getNextRecurringDate(new Date("2026-01-15T12:00:00Z"), "QUARTERLY").toISOString()).toContain("2026-04-15")
    expect(advanceTaskRecurrence(new Date("2026-07-06T12:00:00Z"), "WEEKLY", 2)?.toISOString()).toContain("2026-07-20")
  })

  it("keeps a partial credit note balanced", () => {
    const result = computeCreditBreakdown(12000, 10000, 6000)
    expect(result).toEqual({ htCents: 5000, tvaCents: 1000, tvaRate: 20 })
    expect(result.htCents + result.tvaCents).toBe(6000)
  })

  it("normalizes bank labels while keeping distinct amounts", () => {
    const base = { date: new Date("2026-07-06T12:00:00Z"), label: "  Virement Client  ", amountCents: 12000 }
    expect(bankTransactionFingerprint(base)).toBe(bankTransactionFingerprint({ ...base, label: "virement client" }))
    expect(bankTransactionFingerprint(base)).not.toBe(bankTransactionFingerprint({ ...base, amountCents: 12001 }))
  })
})
