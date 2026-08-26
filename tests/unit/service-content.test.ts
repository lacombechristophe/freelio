import { describe, expect, it } from "vitest"

import { satisfactionMetrics, serviceArticleSlug } from "@/lib/service-content"

describe("serviceArticleSlug", () => {
  it("normalizes accents, punctuation and whitespace", () => expect(serviceArticleSlug("  Préparer l’intervention SAV ! ")).toBe("preparer-l-intervention-sav"))
  it("returns a stable fallback", () => expect(serviceArticleSlug("---")).toBe("article"))
})

describe("satisfactionMetrics", () => {
  it("computes CSAT and ignores invalid scores", () => {
    expect(satisfactionMetrics([
      { type: "CSAT", scaleMin: 1, scaleMax: 5, score: 5 },
      { type: "CSAT", scaleMin: 1, scaleMax: 5, score: 4 },
      { type: "CSAT", scaleMin: 1, scaleMax: 5, score: 2 },
      { type: "CSAT", scaleMin: 1, scaleMax: 5, score: 8 },
    ])).toMatchObject({ responses: 3, csatPercent: 67, average: 11 / 3 })
  })

  it("computes NPS from promoters and detractors", () => {
    expect(satisfactionMetrics([
      { type: "NPS", scaleMin: 0, scaleMax: 10, score: 10 },
      { type: "NPS", scaleMin: 0, scaleMax: 10, score: 9 },
      { type: "NPS", scaleMin: 0, scaleMax: 10, score: 7 },
      { type: "NPS", scaleMin: 0, scaleMax: 10, score: 4 },
    ]).nps).toBe(25)
  })
})

