import { describe, expect, it } from "vitest"

import { calculateLeadScore, leadMatchesSegment, scoringRuleMatches } from "@/lib/marketing/intelligence"

const lead = {
  status: "QUALIFIED",
  source: "WEBSITE",
  city: "Lyon",
  projectType: "Rénovation complète",
  marketingOptIn: true,
  email: "client@example.test",
  phone: "0600000000",
  createdAt: new Date(),
  score: 0,
}

describe("marketing intelligence", () => {
  it("applies explainable built-in and custom scoring rules", () => {
    const result = calculateLeadScore(lead, [{ name: "Projet rénovation", field: "projectType", operator: "CONTAINS", value: "rénovation", points: 25 }])
    expect(result.score).toBe(95)
    expect(result.breakdown).toContainEqual({ label: "Projet rénovation", points: 25 })
  })

  it("supports active segment filters", () => {
    expect(leadMatchesSegment({ ...lead, score: 95 }, { status: "QUALIFIED", minScore: 60, cityContains: "ly" })).toBe(true)
    expect(leadMatchesSegment({ ...lead, score: 20 }, { minScore: 60 })).toBe(false)
  })

  it("evaluates existence and equality without executing arbitrary expressions", () => {
    expect(scoringRuleMatches(lead, { field: "email", operator: "EXISTS", value: "" })).toBe(true)
    expect(scoringRuleMatches(lead, { field: "source", operator: "EQUALS", value: "website" })).toBe(true)
  })
})
