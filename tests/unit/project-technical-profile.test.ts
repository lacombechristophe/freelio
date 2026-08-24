import { describe, expect, it } from "vitest"

import { ProjectTechnicalProfileSchema } from "@/lib/validations"

describe("ProjectTechnicalProfileSchema", () => {
  it("normalise les mesures saisies dans le relevé", () => {
    const result = ProjectTechnicalProfileSchema.parse({
      surveyStatus: "SURVEYED",
      surveyedAt: "2026-08-23",
      surveyedBy: "Technicien terrain",
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

  it("accepte les champs nuls relus depuis Prisma sans les convertir en zéro", () => {
    const result = ProjectTechnicalProfileSchema.parse({
      surveyStatus: "SURVEYED",
      surveyedAt: "2026-08-23",
      poolLengthMm: "8000",
      poolWidthMm: "4000",
      poolDepthMm: null,
      accessWidthMm: "",
      copingType: null,
      deckMaterial: null,
      measurementNotes: null,
    })

    expect(result.poolLengthMm).toBe(8000)
    expect(result.poolDepthMm).toBe("")
    expect(result.accessWidthMm).toBe("")
    expect(result.copingType).toBe("")
    expect(result.measurementNotes).toBe("")
  })
})
