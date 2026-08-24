import { describe, expect, it } from "vitest"

import { resolveOpportunityStage } from "@/lib/pipeline-rules"

const now = new Date("2026-08-24T10:00:00.000Z")

describe("resolveOpportunityStage", () => {
  it("forces a won opportunity to 100% and seals its closing time", () => {
    expect(resolveOpportunityStage({ status: "WON", probability: 70, lostReason: "ancien", now })).toEqual({ probability: 100, lostReason: null, closedAt: now })
  })

  it("requires and stores a loss reason at 0%", () => {
    expect(() => resolveOpportunityStage({ status: "LOST", probability: 30, lostReason: " " })).toThrow("Le motif de perte est requis")
    expect(resolveOpportunityStage({ status: "LOST", probability: 30, lostReason: "Budget reporté", now })).toEqual({ probability: 0, lostReason: "Budget reporté", closedAt: now })
  })

  it("reopens a closed opportunity without retaining the old outcome", () => {
    expect(resolveOpportunityStage({ status: "QUALIFIED", probability: 45, lostReason: "Budget", closedAt: now })).toEqual({ probability: 45, lostReason: null, closedAt: null })
  })
})
