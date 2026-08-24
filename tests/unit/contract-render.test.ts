import { describe, expect, it } from "vitest"
import { renderContractHtml, type ContractPdfDocument } from "@/lib/pdf/contract-render"

const contract: ContractPdfDocument = {
  number: "CON-2026-031",
  title: "Mission de conception et de développement",
  status: "SIGNED",
  contentHtml: "<h1>Contrat</h1><h2>Objet</h2><p>Une mission structurée.</p>",
  createdAt: "2026-07-14T00:00:00.000Z",
  validFrom: "2026-07-21T00:00:00.000Z",
  validUntil: "2026-11-30T00:00:00.000Z",
  client: {
    name: "Maison Delaunay",
    address: "24 rue du Sentier\n75002 Paris",
    email: "direction@example.fr",
    siret: "98765432100018",
  },
  company: {
    name: "Studio Freelio",
    address: "8 rue des Arts\n69002 Lyon",
    email: "bonjour@freelio.fr",
    siret: "12345678900015",
    brandColor: "#3157d5",
  },
  signatures: [
    {
      signerName: "Camille Delaunay",
      signerEmail: "camille@example.fr",
      signedAt: "2026-07-18T10:30:00.000Z",
      canvasData: "data:image/png;base64,AAAA",
    },
  ],
}

describe("contract PDF", () => {
  it("uses the shared document typography and translates workflow status", () => {
    const html = renderContractHtml(contract)

    expect(html).toContain("CRM Sans")
    expect(html).toContain("CRM Serif")
    expect(html).toContain("source-sans-3-latin.woff2")
    expect(html).toContain("Sign&eacute;")
    expect(html).not.toContain(">SIGNED<")
    expect(html).not.toContain("className=")
  })

  it("renders a safe handwritten signature with its audit identity", () => {
    const html = renderContractHtml(contract)

    expect(html).toContain("signature-image")
    expect(html).toContain("data:image/png;base64,AAAA")
    expect(html).toContain("Camille Delaunay")
    expect(html).toContain("camille@example.fr")
  })

  it("strips active content and unsafe signature sources", () => {
    const html = renderContractHtml({
      ...contract,
      contentHtml: '<script>alert("x")</script><h2>Objet</h2><p>Texte</p>',
      signatures: [{ ...contract.signatures![0], canvasData: "javascript:alert(1)" }],
    })

    expect(html).not.toContain("<script>")
    expect(html).not.toContain("javascript:alert(1)")
    expect(html).not.toContain('<img class="signature-image"')
  })
})
