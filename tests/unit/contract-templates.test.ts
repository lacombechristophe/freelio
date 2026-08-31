import { describe, expect, it } from "vitest"

import { CONTRACT_CLAUSE_LIBRARY, CONTRACT_TEMPLATE_PRESETS } from "@/lib/contracts/templates"

describe("pool contractor contract presets", () => {
  it("only exposes trade-focused templates", () => {
    expect(CONTRACT_TEMPLATE_PRESETS).toHaveLength(7)
    expect(CONTRACT_TEMPLATE_PRESETS.every((template) => template.id.startsWith("vertical-"))).toBe(true)
    expect(CONTRACT_TEMPLATE_PRESETS.map((template) => template.name)).toEqual(expect.arrayContaining([
      "Fourniture et pose",
      "Rénovation de bassin",
      "Forfait saisonnier",
      "Intervention SAV",
      "Sous-traitance de pose",
      "Avenant chantier",
    ]))
    expect(JSON.stringify(CONTRACT_TEMPLATE_PRESETS)).not.toMatch(/web|application|UX\/UI|SaaS/i)
  })

  it("offers clauses that cover actual site and pool risks", () => {
    const ids = CONTRACT_CLAUSE_LIBRARY.map((clause) => clause.id)
    expect(ids).toEqual(expect.arrayContaining([
      "acces-chantier",
      "aleas-caches",
      "securite-bassin",
      "garanties-equipements",
      "reception-reserves",
      "preuves-chantier",
    ]))
  })
})
