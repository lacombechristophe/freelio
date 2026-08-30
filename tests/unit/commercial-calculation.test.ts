import { describe, expect, it } from "vitest"

import {
  applyPercentageDiscount,
  calculateCommercialDocument,
} from "@/lib/finance/commercial-calculation"

describe("calculateCommercialDocument", () => {
  it("calculates mixed VAT per line and preserves cent invariants", () => {
    const result = calculateCommercialDocument([
      { quantity: 1, unitPriceCents: 10_001, tvaRate: 20 },
      { quantity: 2.5, unitPriceCents: 4_003, tvaRate: 10 },
      { quantity: 1, unitPriceCents: 1_000, tvaRate: 0 },
    ])

    expect(result).toMatchObject({
      totalHtCents: 21_009,
      totalTvaCents: 3_001,
      totalTtcCents: 24_010,
    })
    expect(result.vatBreakdown).toEqual([
      { tvaRate: 0, baseHtCents: 1_000, tvaCents: 0, totalTtcCents: 1_000 },
      { tvaRate: 10, baseHtCents: 10_008, tvaCents: 1_001, totalTtcCents: 11_009 },
      { tvaRate: 20, baseHtCents: 10_001, tvaCents: 2_000, totalTtcCents: 12_001 },
    ])
  })

  it("allocates a global discount deterministically without losing a cent", () => {
    const result = calculateCommercialDocument([
      { quantity: 1, unitPriceCents: 101, tvaRate: 20 },
      { quantity: 1, unitPriceCents: 101, tvaRate: 10 },
      { quantity: 1, unitPriceCents: 101, tvaRate: 5.5 },
    ], { globalDiscountRate: 10 })

    expect(result.globalDiscountCents).toBe(30)
    expect(result.lines.map((line) => line.globalDiscountShareCents)).toEqual([10, 10, 10])
    expect(result.lines.reduce((sum, line) => sum + line.netHtCents, 0)).toBe(result.totalHtCents)
    expect(result.totalHtCents).toBe(result.grossHtCents - result.globalDiscountCents)
  })

  it("combines line and global discounts without double counting", () => {
    const result = calculateCommercialDocument([
      { quantity: 2.5, unitPriceCents: 1_001, lineDiscountRate: 10, tvaRate: 20 },
      { quantity: 1, unitPriceCents: 2_000, lineDiscountRate: 0, tvaRate: 10 },
    ], { globalDiscountRate: 5 })

    expect(result).toMatchObject({
      grossHtCents: 4_503,
      lineDiscountCents: 250,
      globalDiscountCents: 213,
      totalHtCents: 4_040,
    })
    expect(result.lines[0]).toMatchObject({
      effectiveUnitPriceCents: 901,
      lineDiscountCents: 250,
      netBeforeGlobalDiscountCents: 2_253,
    })
    expect(result.totalHtCents).toBe(result.grossHtCents - result.lineDiscountCents - result.globalDiscountCents)
  })

  it("reports material and labor margins only when costs are known", () => {
    const result = calculateCommercialDocument([
      { quantity: 2, unitPriceCents: 5_000, unitCostCents: 3_000, tvaRate: 20, category: "MATERIAL" },
      { quantity: 3, unitPriceCents: 4_000, unitCostCents: 2_500, tvaRate: 10, category: "LABOR" },
      { quantity: 1, unitPriceCents: 2_000, tvaRate: 20, category: "SERVICE" },
    ])

    expect(result).toMatchObject({ knownCostCents: 13_500, knownMarginCents: 8_500, costedLineCount: 2 })
    expect(result.marginBreakdown).toEqual([
      { category: "MATERIAL", revenueHtCents: 10_000, costCents: 6_000, marginCents: 4_000 },
      { category: "LABOR", revenueHtCents: 12_000, costCents: 7_500, marginCents: 4_500 },
    ])
  })

  it("forces every tax rate to zero for a company exempt from VAT", () => {
    const result = calculateCommercialDocument(
      [{ quantity: 1, unitPriceCents: 10_000, tvaRate: 20 }],
      { taxEnabled: false }
    )

    expect(result).toMatchObject({ totalHtCents: 10_000, totalTvaCents: 0, totalTtcCents: 10_000 })
    expect(result.lines[0].tvaRate).toBe(0)
  })

  it("rejects invalid monetary, tax and discount inputs", () => {
    expect(() => calculateCommercialDocument([{ quantity: 0, unitPriceCents: 100, tvaRate: 20 }])).toThrow("positive")
    expect(() => calculateCommercialDocument([{ quantity: 1, unitPriceCents: 10.5, tvaRate: 20 }])).toThrow("centimes")
    expect(() => calculateCommercialDocument([{ quantity: 1, unitPriceCents: 100, tvaRate: 101 }])).toThrow("TVA")
    expect(() => calculateCommercialDocument([{ quantity: 1, unitPriceCents: 100, tvaRate: 20, lineDiscountRate: 101 }])).toThrow("remise de la ligne")
    expect(() => calculateCommercialDocument([{ quantity: 1, unitPriceCents: 100, tvaRate: 20 }], { globalDiscountRate: -1 })).toThrow("remise globale")
  })
})

describe("applyPercentageDiscount", () => {
  it("rounds the discount once at cent precision", () => {
    expect(applyPercentageDiscount(10_001, 12.5)).toBe(8_751)
    expect(applyPercentageDiscount(10_001, 0)).toBe(10_001)
    expect(applyPercentageDiscount(10_001, 100)).toBe(0)
  })
})
