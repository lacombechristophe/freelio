import * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { DocumentStudio } from "@/components/shared/document-studio"
import * as pdfRender from "@/lib/pdf/render"

const document: pdfRender.PdfDocument = {
  kind: "FACTURE", number: "DEMO-001", object: "Synthetic draft", date: "2026-09-30",
  totalHtCents: 10000, totalTvaCents: 2000, totalTtcCents: 12000,
  lines: [{ label: "Synthetic work", quantity: 1, unitPriceCents: 10000, tvaRate: 20 }],
  client: { name: "Synthetic client" }, company: { name: "Synthetic company", isTvaApplicable: true },
}

describe("invoice Studio archive", () => {
  it("uses the archived PDF for issued previews and downloads and disables every presentation control", () => {
    const render = vi.spyOn(pdfRender, "renderDocumentHtml")
    try {
      const html = renderToStaticMarkup(React.createElement(DocumentStudio, {
        kind: "facture", documentId: "synthetic-invoice", documentNumber: document.number, document, readOnly: true,
      }))
      expect(render).not.toHaveBeenCalled()
      expect(html).toMatch(/<iframe[^>]*src="\/api\/pdf\/facture\/synthetic-invoice"/)
      expect(html).not.toContain("srcDoc=")
      expect(html).not.toContain("srcdoc=")
      expect(html.match(/href="\/api\/pdf\/facture\/synthetic-invoice"/g)).toHaveLength(2)
      const controls = html.match(/<button\b[^>]*>/g) ?? []
      expect(controls).toHaveLength(3)
      expect(controls.every(control => control.includes("disabled="))).toBe(true)
      const switches = html.match(/<[^>]*data-slot="switch"[^>]*>/g) ?? []
      expect(switches).toHaveLength(2)
      expect(switches.every(control => control.includes("data-disabled="))).toBe(true)
    } finally { render.mockRestore() }
  })

  it("keeps draft previews editable and generated from current presentation settings", () => {
    const html = renderToStaticMarkup(React.createElement(DocumentStudio, {
      kind: "facture", documentId: "synthetic-draft", documentNumber: document.number, document,
    }))
    expect(html).toMatch(/<iframe[^>]*srcDoc=/i)
    expect(html).toContain("?template=PROFESSIONAL")
    expect((html.match(/<button\b[^>]*>/g) ?? []).every(control => !control.includes("disabled="))).toBe(true)
    expect((html.match(/<[^>]*data-slot="switch"[^>]*>/g) ?? []).every(control => !control.includes("data-disabled="))).toBe(true)
  })
})
