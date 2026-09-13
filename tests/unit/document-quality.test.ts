import { describe, expect, it } from "vitest"
import { assessBillingDocumentQuality, assessContractQuality } from "@/lib/document-quality"
import { renderContractHtml } from "@/lib/pdf/contract-render"
import type { PdfDocument } from "@/lib/pdf/render"

const baseInvoice: PdfDocument = {
  kind: "FACTURE",
  number: "FACT-2026-001",
  object: "Developpement CRM",
  date: "2026-07-07T00:00:00.000Z",
  dueDate: "2026-08-07T00:00:00.000Z",
  totalHtCents: 100000,
  totalTvaCents: 20000,
  totalTtcCents: 120000,
  lines: [
    {
      label: "Developpement fullstack",
      description: "Module devis et factures",
      quantity: 1,
      unitPriceCents: 100000,
      tvaRate: 20,
    },
  ],
  client: {
    name: "Client B2B",
    address: "12 rue du Test, Paris",
    siret: "12345678900012",
  },
  company: {
    name: "Freelio",
    address: "160 rue du Languedoc, Toulouse",
    email: "contact@freelio.local",
    siret: "98765432100010",
    tvaNumber: "FR00987654321",
    iban: "FR7612345678901234567890185",
    isTvaApplicable: true,
  },
}

describe("document quality", () => {
  it("marks a complete invoice as ready", () => {
    const report = assessBillingDocumentQuality(baseInvoice)

    expect(report.status).toBe("READY")
    expect(report.score).toBeGreaterThanOrEqual(86)
    expect(report.label).toBe("Aucune anomalie détectée")
    expect(report.summary).toContain("ne constituent pas une validation")
  })

  it("requires review for even one warning despite a high score", () => {
    const report = assessBillingDocumentQuality({ ...baseInvoice, company: { ...baseInvoice.company, siret: null } })
    expect(report.score).toBeGreaterThanOrEqual(86)
    expect(report.status).toBe("TO_REVIEW")
    expect(report.label).toBe("À relire")
  })

  it("keeps advisory information distinct from blocking errors", () => {
    const report = assessBillingDocumentQuality({ ...baseInvoice, company: { ...baseInvoice.company, iban: null } })
    expect(report.status).toBe("READY")
    expect(report.issues).toEqual([expect.objectContaining({ id: "missing-iban", severity: "info" })])
  })

  it("blocks incoherent billing totals", () => {
    const report = assessBillingDocumentQuality({ ...baseInvoice, totalTtcCents: 119000 })

    expect(report.status).toBe("BLOCKED")
    expect(report.issues.some((issue) => issue.id === "invalid-totals")).toBe(true)
  })

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])("reports an invalid quantity (%s) instead of aborting assessment", (quantity) => {
    const report = assessBillingDocumentQuality({ ...baseInvoice, lines: [{ ...baseInvoice.lines[0], quantity }] })
    expect(report.status).toBe("BLOCKED")
    expect(report.issues).toContainEqual(expect.objectContaining({ id: "invalid-quantity", severity: "error" }))
  })

  it("detects missing contract clauses", () => {
    const report = assessContractQuality({
      title: "Contrat court",
      content: "<p>Mission de developpement.</p>",
      client: { name: "Client B2B" },
      company: { name: "Freelio" },
    })

    expect(report.status).not.toBe("READY")
    expect(report.issues.some((issue) => issue.id === "missing-payment")).toBe(true)
  })

  it("renders a contract PDF HTML without unsafe tags", () => {
    const html = renderContractHtml({
      number: "CONT-2026-001",
      title: "Contrat de prestation",
      status: "DRAFT",
      createdAt: "2026-07-07T00:00:00.000Z",
      contentHtml: "<h1>Titre</h1><h2>Objet</h2><p>Texte</p><script>alert(1)</script>",
      client: { name: "Client B2B" },
      company: { name: "Freelio" },
    })

    expect(html).toContain("CONT-2026-001")
    expect(html).not.toContain("<script>")
  })
})
