import { describe, expect, it } from "vitest"

import { ProjectTechnicalProfileSchema } from "@/lib/validations"

describe("ProjectTechnicalProfileSchema", () => {
  it("normalise les mesures saisies dans le relevé Diskoov", () => {
    const result = ProjectTechnicalProfileSchema.parse({
      surveyStatus: "SURVEYED",
      surveyedAt: "2026-08-23",
      surveyedBy: "Technicien Diskoov",
      poolShape: "Rectangle",
      poolLengthMm: "8000",
      poolWidthMm: "4000",
      accessWidthMm: "950",
      measurementNotes: "Mesures contrôlées sur site.",
    })

    expect(result.poolLengthMm).toBe(8000)
    expect(result.poolWidthMm).toBe(4000)
    expect(result.accessWidthMm).toBe(950)
  })

  it("refuse une mesure hors plage", () => {
    expect(() => ProjectTechnicalProfileSchema.parse({
      surveyStatus: "DRAFT",
      poolLengthMm: 100_001,
    })).toThrow()
  })
})
