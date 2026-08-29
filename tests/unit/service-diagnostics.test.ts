import { describe, expect, it } from "vitest"

import {
  diagnosticSteps,
  equipmentWarrantyStatus,
  normalizeDiagnosticText,
  scoreDiagnosticGuide,
} from "@/lib/operations/service-diagnostics"

const guide = {
  id: "guide-a",
  name: "Moteur de couverture",
  productCategory: "Couverture",
  manufacturer: "Fabricant QA",
  modelPattern: null,
  symptom: "Le moteur force ou la couverture se bloque",
  keywords: ["moteur", "bloque", "force"],
  steps: [{ id: "step-1", label: "Couper l’alimentation", required: true }],
  priority: 5,
}

describe("service diagnostic guides", () => {
  it("normalizes accents and punctuation", () => {
    expect(normalizeDiagnosticText("  Défaut d’ÉTANCHÉITÉ ! ")).toBe("defaut d etancheite")
  })

  it("suggests a guide that matches equipment and request symptoms", () => {
    const result = scoreDiagnosticGuide(guide, {
      title: "Moteur qui force",
      description: "La couverture se bloque à mi-course.",
      equipment: { category: "Couverture automatique", manufacturer: "Fabricant QA France", model: "M-200" },
    })
    expect(result?.score).toBeGreaterThanOrEqual(70)
    expect(result?.reasons).toContain("gamme compatible")
  })

  it("rejects a guide for another manufacturer", () => {
    expect(scoreDiagnosticGuide(guide, {
      title: "Moteur qui force",
      description: "La couverture se bloque.",
      equipment: { category: "Couverture", manufacturer: "Autre marque", model: "M-200" },
    })).toBeNull()
  })

  it("can suggest a general guide from symptom keywords", () => {
    const result = scoreDiagnosticGuide({ ...guide, productCategory: null, manufacturer: null }, {
      title: "Le moteur force puis ne répond plus",
      description: "La couverture semble bloquée.",
      equipment: null,
    })
    expect(result).not.toBeNull()
  })

  it("sanitizes stored checklist JSON", () => {
    expect(diagnosticSteps([
      { id: "power", label: " Vérifier l’alimentation ", required: true },
      { label: "Contrôle optionnel", required: false },
      { id: "invalid" },
    ])).toEqual([
      { id: "power", label: "Vérifier l’alimentation", required: true },
      { id: "step-2", label: "Contrôle optionnel", required: false },
    ])
  })

  it("distinguishes active, expired and unknown warranty", () => {
    const now = new Date("2026-08-30T10:00:00Z")
    expect(equipmentWarrantyStatus("2026-09-01T00:00:00Z", now)).toBe("COVERED")
    expect(equipmentWarrantyStatus("2026-08-01T00:00:00Z", now)).toBe("EXPIRED")
    expect(equipmentWarrantyStatus(null, now)).toBe("UNKNOWN")
  })
})
