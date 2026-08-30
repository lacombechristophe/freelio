import { describe, expect, it } from "vitest"

import { buildContractAmendmentContent, buildMaintenanceRenewalContent } from "@/lib/contracts/structured-documents"

describe("structured contract documents", () => {
  it("renders amendment changes and escapes user-controlled values", () => {
    const html = buildContractAmendmentContent({
      sourceNumber: "CONT-2026-001",
      reason: "Ajout <script>alert(1)</script>",
      effectiveAt: new Date("2026-09-01T12:00:00.000Z"),
      changes: [{ category: "Prix", label: "Forfait", previousValue: "240 €", nextValue: "252 €", financialImpactCents: 1_200 }],
    })

    expect(html).toContain("CONT-2026-001")
    expect(html).toContain("252 €")
    expect(html).toContain("12,00 €")
    expect(html).not.toContain("<script>")
    expect(html).toContain("&lt;script&gt;")
  })

  it("renders a maintenance renewal with the indexed price and term", () => {
    const html = buildMaintenanceRenewalContent({
      sourceNumber: "ENT-2026-001",
      label: "Entretien annuel",
      siteLabel: "Résidence principale",
      nextStartDate: new Date("2027-08-20T12:00:00.000Z"),
      nextEndDate: new Date("2028-08-19T12:00:00.000Z"),
      currentPriceCents: 24_000,
      nextPriceCents: 25_200,
      indexationRate: 5,
      frequency: "ANNUAL",
      noticeDays: 90,
    })

    expect(html).toContain("ENT-2026-001")
    expect(html).toContain("252,00 €")
    expect(html).toContain("90 jours")
    expect(html).toContain("signature électronique")
  })
})
