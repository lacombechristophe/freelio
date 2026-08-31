import { describe, expect, it } from "vitest"
import {
  PDF_TEMPLATES,
  parsePdfRenderOptions,
  renderDocumentHtml,
  type PdfDocument,
  type PdfTemplate,
} from "@/lib/pdf/render"

const baseDocument: Omit<PdfDocument, "kind"> = {
  number: "DOC-2026-042",
  object: "Refonte de l'identité et du site de conversion",
  date: "2026-07-14T00:00:00.000Z",
  validUntil: "2026-08-14T00:00:00.000Z",
  dueDate: "2026-08-14T00:00:00.000Z",
  totalHtCents: 480000,
  totalTvaCents: 96000,
  totalTtcCents: 576000,
  lines: [
    {
      label: "Direction artistique",
      description: "Système visuel, composants et déclinaisons responsives.",
      quantity: 1,
      unitPriceCents: 290000,
      tvaRate: 20,
    },
    {
      label: "Intégration frontend",
      description: "Développement, animations et contrôle qualité.",
      quantity: 1,
      unitPriceCents: 190000,
      tvaRate: 20,
    },
  ],
  client: {
    name: "Atelier Horizon",
    address: "24 rue du Sentier\n75002 Paris",
    siret: "98765432100018",
    tvaNumber: "FR12987654321",
  },
  company: {
    name: "Studio Freelio",
    address: "8 rue des Arts\n69002 Lyon",
    email: "bonjour@freelio.fr",
    siret: "12345678900015",
    tvaNumber: "FR40123456789",
    iban: "FR76 3000 4000 5000 6000 7000 189",
    isTvaApplicable: true,
    brandColor: "#1f4ed8",
    pdfTemplate: "MINIMAL",
  },
}

function documentFixture(kind: PdfDocument["kind"]): PdfDocument {
  return { ...baseDocument, kind }
}

describe("billing PDF templates", () => {
  it.each([
    ["MINIMAL", "data-template=\"minimal\"", "minimal-lead"],
    ["PROFESSIONAL", "data-template=\"professional\"", "professional-overview"],
    ["MODERN", "data-template=\"modern\"", "modern-composition"],
  ] as const)("renders a distinct %s composition", (template, dataMarker, layoutMarker) => {
    const html = renderDocumentHtml(documentFixture("DEVIS"), { template })

    expect(html).toContain(dataMarker)
    expect(html).toContain(layoutMarker)
    expect(html).toContain("Bon pour accord")
    expect(html).toContain("CRM Sans")
    expect(html).toContain("CRM Serif")
    expect(html).toContain("source-sans-3-latin.woff2")
    expect(html).toContain("source-serif-4-latin.woff2")
    expect(html).not.toContain("font-weight: 950")
  })

  it.each(PDF_TEMPLATES)("keeps invoice payment semantics in %s", (template: PdfTemplate) => {
    const html = renderDocumentHtml(documentFixture("FACTURE"), {
      template,
      showPayment: true,
      showReference: true,
    })

    expect(html).toContain("payment-panel")
    expect(html).toContain("Virement bancaire")
    expect(html).toContain("FR76 3000 4000 5000 6000 7000 189")
    expect(html).toContain("DOC-2026-042")
    expect(html).toContain("Aucun escompte pour paiement anticip&eacute;")
  })

  it("honors the payment and repeated-reference controls", () => {
    const html = renderDocumentHtml(documentFixture("FACTURE"), {
      template: "MODERN",
      showPayment: false,
      showReference: false,
    })

    expect(html).not.toContain("payment-panel")
    expect(html).not.toContain("reference-panel")
    expect(html).not.toContain('<span class="footer-reference')
  })

  it("escapes document and line content before rendering", () => {
    const html = renderDocumentHtml({
      ...documentFixture("DEVIS"),
      object: '<script>alert("objet")</script>',
      lines: [{ ...baseDocument.lines[0], label: "Audit <urgent>" }],
    })

    expect(html).toContain("&lt;script&gt;alert(&quot;objet&quot;)&lt;/script&gt;")
    expect(html).toContain("Audit &lt;urgent&gt;")
    expect(html).not.toContain("<script>")
  })

  it("rejects unsafe logo sources", () => {
    const html = renderDocumentHtml({
      ...documentFixture("DEVIS"),
      company: { ...baseDocument.company, logo: "javascript:alert(1)" },
    })

    expect(html).not.toContain("javascript:alert(1)")
    expect(html).not.toContain('<img class="brand-logo"')
  })

  it("does not repeat an identical trade name and legal name in the footer", () => {
    const html = renderDocumentHtml({
      ...documentFixture("DEVIS"),
      company: { ...baseDocument.company, fullName: baseDocument.company.name },
    })

    expect(html).not.toContain("Studio Freelio &middot; Studio Freelio")
  })

  it("normalizes URL controls without accepting arbitrary colors", () => {
    const options = parsePdfRenderOptions(
      new URLSearchParams("template=modern&density=spacious&accent=javascript:alert(1)&payment=0&reference=0")
    )

    expect(options).toEqual({
      template: "MODERN",
      accentColor: null,
      density: "SPACIOUS",
      showPayment: false,
      showReference: false,
    })
  })
})
