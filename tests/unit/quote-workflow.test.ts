import { describe, expect, it } from "vitest"

import { assertQuoteStatusTransition, quoteStatusDates } from "@/lib/quotes/workflow"

describe("quote workflow", () => {
  it("allows the auditable commercial path", () => {
    expect(assertQuoteStatusTransition("DRAFT", "SENT").changed).toBe(true)
    expect(assertQuoteStatusTransition("SENT", "ACCEPTED").changed).toBe(true)
    expect(assertQuoteStatusTransition("SENT", "REJECTED").changed).toBe(true)
    expect(assertQuoteStatusTransition("SENT", "EXPIRED").changed).toBe(true)
  })

  it("is idempotent for a repeated delivery", () => {
    expect(assertQuoteStatusTransition("ACCEPTED", "ACCEPTED").changed).toBe(false)
  })

  it("prevents reopening or silently accepting a draft", () => {
    expect(() => assertQuoteStatusTransition("DRAFT", "ACCEPTED")).toThrow("Transition de statut non autorisée")
    expect(() => assertQuoteStatusTransition("ACCEPTED", "SENT")).toThrow("Transition de statut non autorisée")
    expect(() => assertQuoteStatusTransition("REJECTED", "DRAFT")).toThrow("Transition de statut non autorisée")
  })

  it("rejects values forged outside the TypeScript client", () => {
    expect(() => assertQuoteStatusTransition("SENT", "WON")).toThrow()
  })

  it("records the timestamp matching the terminal event", () => {
    const now = new Date("2026-09-01T10:00:00.000Z")
    expect(quoteStatusDates("ACCEPTED", now)).toEqual({ acceptedAt: now })
    expect(quoteStatusDates("REJECTED", now)).toEqual({ rejectedAt: now })
  })
})
