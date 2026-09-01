import { describe, expect, it } from "vitest"

import {
  crmPropertyDefinitionSchema,
  crmPropertyKeyFromLabel,
  parseCrmPropertyValue,
} from "@/lib/crm-properties"

describe("CRM properties", () => {
  it("creates stable technical keys from French labels", () => {
    expect(crmPropertyKeyFromLabel("Type de bassin / rénovation")).toBe("type_de_bassin_renovation")
  })

  it("requires configured options for selectable properties", () => {
    expect(() => crmPropertyDefinitionSchema.parse({
      objectType: "CLIENT",
      key: "source",
      label: "Source",
      type: "SELECT",
      groupName: "Qualification",
      options: [],
    })).toThrow("Ajoutez au moins une option")
  })

  it("normalizes typed values and rejects values outside the definition", () => {
    expect(parseCrmPropertyValue({ type: "CURRENCY", required: false }, "12500,50")).toBe(12500.5)
    expect(parseCrmPropertyValue({ type: "BOOLEAN", required: false }, "false")).toBe(false)
    expect(parseCrmPropertyValue({ type: "MULTI_SELECT", required: false, options: [{ value: "a", label: "A" }, { value: "b", label: "B" }] }, ["a", "a", "b"])).toEqual(["a", "b"])
    expect(() => parseCrmPropertyValue({ type: "SELECT", required: false, options: [{ value: "valid", label: "Valide" }] }, "other")).toThrow("Option invalide")
  })

  it("protects required values and validates calendar dates", () => {
    expect(() => parseCrmPropertyValue({ type: "TEXT", required: true }, "")).toThrow("obligatoire")
    expect(() => parseCrmPropertyValue({ type: "DATE", required: false }, "2026-02-30")).toThrow("Date invalide")
  })
})
