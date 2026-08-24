import { describe, expect, it } from "vitest"

import { calculateConfiguredProductPrice, resolveProductOptionSelection } from "@/lib/product-pricing"

describe("calculateConfiguredProductPrice", () => {
  it("adds option deltas then applies the commercial discount", () => {
    expect(calculateConfiguredProductPrice({ baseSalePriceCents: 1_000_000, baseCostCents: 600_000, optionSaleDeltasCents: [50_000, 25_000], optionCostDeltasCents: [20_000, 10_000], discountRate: 10 })).toEqual({ listUnitPriceCents: 1_075_000, unitPriceCents: 967_500, unitCostCents: 630_000, discountRate: 10, marginCents: 337_500 })
  })

  it("clamps discounts and never creates a negative net price", () => {
    expect(calculateConfiguredProductPrice({ baseSalePriceCents: 100, baseCostCents: 80, optionSaleDeltasCents: [-200], optionCostDeltasCents: [], discountRate: 150 })).toMatchObject({ unitPriceCents: 0, discountRate: 100 })
  })
})

describe("resolveProductOptionSelection", () => {
  const groups = [{ id: "color", name: "Coloris", minSelect: 1, maxSelect: 1, values: [{ id: "anth", label: "Anthracite" }, { id: "sand", label: "Sable" }] }]

  it("returns a canonical selection grouped for document rendering", () => {
    expect(resolveProductOptionSelection(groups, ["anth"])).toMatchObject({ uniqueIds: ["anth"], selections: [{ groupName: "Coloris", labels: ["Anthracite"] }] })
  })

  it("rejects missing, duplicate, excessive and foreign option values", () => {
    expect(() => resolveProductOptionSelection(groups, [])).toThrow("Coloris")
    expect(() => resolveProductOptionSelection(groups, ["anth", "anth"])).toThrow("dupliquées")
    expect(() => resolveProductOptionSelection(groups, ["anth", "sand"])).toThrow("Coloris")
    expect(() => resolveProductOptionSelection(groups, ["other"])).toThrow("ne correspond pas")
  })
})
