import { describe, expect, it } from "vitest"

import {
  DEFAULT_PIPELINE_STAGES,
  parsePipelineStages,
  resolveOpportunityStage,
  validatePipelineStages,
} from "@/lib/pipeline-rules"

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

describe("pipeline stage configuration", () => {
  it("accepts a stable, ordered configuration containing the won outcome", () => {
    const stages = [
      { id: "NEW", title: "Nouveau" },
      { id: "VISIT", title: "Visite technique" },
      { id: "WON", title: "Gagné" },
    ]
    expect(validatePipelineStages(stages)).toEqual(stages)
  })

  it("rejects duplicate identifiers and duplicate labels", () => {
    expect(() => validatePipelineStages([
      { id: "NEW", title: "Nouveau" },
      { id: "NEW", title: "Autre" },
      { id: "WON", title: "Gagné" },
    ])).toThrow("identifiant unique")
    expect(() => validatePipelineStages([
      { id: "NEW", title: "Nouveau" },
      { id: "VISIT", title: "nouveau" },
      { id: "WON", title: "Gagné" },
    ])).toThrow("nom unique")
  })

  it("protects the won outcome and safely falls back for legacy data", () => {
    expect(() => validatePipelineStages([
      { id: "NEW", title: "Nouveau" },
      { id: "VISIT", title: "Visite" },
    ])).toThrow("Gagné")
    expect(parsePipelineStages({ malformed: true })).toEqual(DEFAULT_PIPELINE_STAGES)
  })
})
