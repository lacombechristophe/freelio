import { describe, expect, it } from "vitest"
import { PDFDocument } from "pdf-lib"
import { extractFacturX } from "@attestwire/en16931"

import { embedFacturX } from "@/lib/pdf/generator"
import { generateFacturX, validateFacturXXml } from "@/lib/pdf/facturx"

const invoice = {
  number: "F-2026-0042",
  date: "2026-09-02",
  seller: {
    name: "Atelier du Bassin",
    siret: "12345678900010",
    address: "12 rue des Pins\n44000 Nantes",
    vatNumber: "FR12123456789",
  },
  buyer: {
    name: "SCI Bellevue",
    siret: "98765432100018",
    address: "4 avenue du Lac, 31000 Toulouse",
    vatNumber: "FR98987654321",
  },
  lines: [
    { label: "Rénovation filtration", quantity: 1, unitPriceCents: 125_050, totalHtCents: 125_050, tvaRate: 10 },
    { label: "Pompe et mise en service", quantity: 2, unitPriceCents: 50_000, totalHtCents: 100_000, tvaRate: 20 },
  ],
  totalHtCents: 225_050,
  totalTvaCents: 32_505,
  totalTtcCents: 257_555,
}

describe("Factur-X CII", () => {
  it("generates a valid EN 16931 CII payload for mixed VAT lines", () => {
    const xml = generateFacturX(invoice)
    const validation = validateFacturXXml(xml)

    expect(xml).toContain("urn:cen.eu:en16931:2017")
    expect(xml).toContain("<ram:CategoryCode>S</ram:CategoryCode>")
    expect(validation).toMatchObject({ valid: true, errors: [], warnings: [] })
  })

  it("uses an explicit exemption category for zero-rated lines", () => {
    const xml = generateFacturX({
      ...invoice,
      lines: [{ label: "Entretien exonéré", quantity: 1, unitPriceCents: 10_000, totalHtCents: 10_000, tvaRate: 0 }],
      totalHtCents: 10_000,
      totalTvaCents: 0,
      totalTtcCents: 10_000,
    })

    expect(xml).toContain("<ram:CategoryCode>E</ram:CategoryCode>")
    expect(xml).toContain("article 293 B du CGI")
    expect(validateFacturXXml(xml).valid).toBe(true)
  })

  it("rejects malformed XML instead of reporting a false green", () => {
    const result = validateFacturXXml("<rsm:CrossIndustryInvoice>")
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toMatchObject({ rule: "XML-SYNTAX", severity: "fatal" })
  })

  it("refuses totals that disagree with the source invoice", () => {
    expect(() => generateFacturX({ ...invoice, totalTtcCents: invoice.totalTtcCents + 1 })).toThrow("Factur-X non conforme")
  })

  it("embeds the XML as an associated Alternative file", async () => {
    const document = await (await PDFDocument.create()).save()
    const embedded = await embedFacturX(Buffer.from(document), generateFacturX(invoice))
    const extracted = extractFacturX(embedded)

    expect(extracted.attachmentName).toBe("factur-x.xml")
    expect(extracted.xml).toContain("CrossIndustryInvoice")
    expect(extracted.warnings).not.toContain(expect.stringContaining("AFRelationship"))
  })
})
