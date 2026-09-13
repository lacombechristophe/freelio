import { describe, expect, it } from "vitest"
import { documentPrintCss } from "@/lib/pdf/print-layout"
import { renderDocumentHtml, type PdfDocument } from "@/lib/pdf/render"
import { renderContractHtml } from "@/lib/pdf/contract-render"

describe("print page margins", () => {
  it("reserves repeated margins and numbers pages without a fixed footer", () => {
    const css = documentPrintCss("DEVIS DEV-001", "10mm", "18mm")
    expect(css).toContain("margin: 10mm 0 18mm")
    expect(css).toContain("@bottom-center")
    expect(css).toContain("counter(page)")
    expect(css).toContain("counter(pages)")
    expect(css).toContain("break-inside: avoid")
    expect(css).not.toContain("position: fixed")
  })

  it("escapes references in CSS strings and prevents closing the style element", () => {
    const css = documentPrintCss('DEV "x" \\ </style><script>alert(1)</script>\nFIN', "10mm", "18mm")
    expect(css).not.toContain("</style>")
    expect(css).not.toContain("<script>")
    expect(css).toContain('\\"x\\"')
    expect(css).toContain("\\3c /style>")
    expect(css).toContain(" FIN")
  })

  const document: PdfDocument = {
    kind: "DEVIS", number: "DEV-PRIVATE-001", object: "Entretien", date: "2026-09-13",
    company: { name: "Entreprise", isTvaApplicable: true }, client: { name: "Client" },
    lines: [], totalHtCents: 0, totalTvaCents: 0, totalTtcCents: 0,
  }

  it.each(["MINIMAL", "PROFESSIONAL", "MODERN"] as const)("uses margin boxes in the %s template", (template) => {
    const html = renderDocumentHtml(document, { template })
    expect(html).toContain("@bottom-center")
    expect(html).toContain('content: "DEVIS DEV-PRIVATE-001"')
    expect(html).not.toContain("position: fixed")
  })

  it("omits the reference from repeating margins when disabled", () => {
    const html = renderDocumentHtml(document, { showReference: false })
    expect(html).toContain('content: "" "" "Page "')
    expect(html).not.toContain('content: "DEVIS DEV-PRIVATE-001"')
  })

  it("uses the same pagination for contracts without removing legal details", () => {
    const html = renderContractHtml({
      number: "CONT-001", title: "Entretien", status: "DRAFT", contentHtml: "<p>Conditions</p>",
      createdAt: "2026-09-13", company: document.company, client: document.client,
    })
    expect(html).toContain('content: "CONTRAT CONT-001"')
    expect(html).toContain("footer-note")
    expect(html).not.toContain("position: fixed")
  })
})
