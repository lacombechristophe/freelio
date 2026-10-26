import { expect, it } from "vitest"
import { marketingValueLabel, scoringStoredValue, segmentFilterLabel } from "@/lib/marketing/labels"

it("uses French labels while keeping custom and partial rule values intact", () => {
  expect(marketingValueLabel("status", "QUALIFIED")).toBe("Qualifié")
  expect(marketingValueLabel("source", "WEBSITE")).toBe("Site web")
  expect(scoringStoredValue("source", "Site web")).toBe("WEBSITE")
  expect(scoringStoredValue("status", "qualifié")).toBe("QUALIFIED")
  expect(scoringStoredValue("source", "Salon de Nantes")).toBe("Salon de Nantes")
  expect(scoringStoredValue("status", "QUAL")).toBe("QUAL")
})

it("keeps false distinct from an absent consent filter", () => {
  expect(segmentFilterLabel("marketingOptIn", false)).toBe("Consentement marketing : Refusé")
  expect(segmentFilterLabel("minScore", 0)).toBe("Score minimum : 0")
  expect(segmentFilterLabel("source", "custom-source")).toBe("Source : custom-source")
})
