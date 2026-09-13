import { mkdir, writeFile } from "node:fs/promises"
import assert from "node:assert/strict"
import { PDFDocument } from "pdf-lib"
import { generatePdfFromHtml } from "../src/lib/pdf/generator"
import { renderDocumentHtml, type PdfDocument } from "../src/lib/pdf/render"
import { renderContractHtml } from "../src/lib/pdf/contract-render"
import { calculateCommercialDocument } from "../src/lib/finance/commercial-calculation"

// Real Chromium generation; inspect the resulting PDFs as well as these checks.
// No database access, credentials or customer data.
async function savePdf(file: string, html: string, multipage: boolean) {
  const bytes = await generatePdfFromHtml(html)
  const pdf = await PDFDocument.load(bytes)
  assert(multipage ? pdf.getPageCount() > 1 : pdf.getPageCount() === 1, `${file}: unexpected pagination`)
  for (const page of pdf.getPages()) {
    assert(Math.abs(page.getWidth() - 595.28) < 1, `${file}: not A4 width`)
    assert(Math.abs(page.getHeight() - 841.89) < 1, `${file}: not A4 height`)
  }
  await writeFile(file, bytes)
  console.log(`${file}: ${pdf.getPageCount()} page(s) A4`)
}

async function main() {
  const directory = "tmp/document-pagination"
  await mkdir(directory, { recursive: true })
  const lines = Array.from({ length: 64 }, (_, index) => ({
    label: `Prestation ${String(index + 1).padStart(2, "0")} — Fourniture et installation de filtration`,
    description: "Diagnostic du local technique, contrôle des raccordements et mise en service. Référence fabricant longue pour vérifier les retours à la ligne sans perte d’information.",
    quantity: index % 2 ? 2.5 : 1,
    unitPriceCents: 10001 + index,
    tvaRate: [20, 10, 5.5, 0][index % 4],
  }))
  const totals = calculateCommercialDocument(lines)
  const document: PdfDocument = {
    kind: "DEVIS", number: "DEV-RECETTE-2026-064", object: "Rénovation complète du système de filtration et sécurisation du bassin extérieur — résidence de démonstration",
    date: "2026-09-13", validUntil: "2026-10-13", dueDate: "2026-10-13", lines,
    totalHtCents: totals.totalHtCents, totalTvaCents: totals.totalTvaCents, totalTtcCents: totals.totalTtcCents,
    company: { name: "Entreprise de recette — aucune donnée client", address: "1 rue de la Démonstration, 44000 Nantes", siret: "99999999900024", tvaNumber: "FR00999999999", isTvaApplicable: true },
    client: { name: "Résidence de démonstration — nom volontairement long", address: "Bâtiment des essais, entrée secondaire du local technique\n2 avenue des Bassins, 44000 Nantes" },
  }
  for (const kind of ["DEVIS", "FACTURE"] as const) {
    const name = kind.toLowerCase()
    const html = renderDocumentHtml({ ...document, kind, number: `${kind}-RECETTE-064` }, { template: "PROFESSIONAL", density: "BALANCED", accentColor: "#202630" })
    await savePdf(`${directory}/${name}.pdf`, html, true)
    console.log(`${name}: ${lines.length} lignes, total TTC ${totals.totalTtcCents} centimes`)
  }
  for (const template of ["MINIMAL", "PROFESSIONAL", "MODERN"] as const) {
    for (const density of ["COMPACT", "BALANCED", "SPACIOUS"] as const) {
      const shortLines = lines.slice(0, 1)
      const shortTotals = calculateCommercialDocument(shortLines)
      const shortDocument: PdfDocument = {
        ...document, lines: shortLines,
        totalHtCents: shortTotals.totalHtCents,
        totalTvaCents: shortTotals.totalTvaCents,
        totalTtcCents: shortTotals.totalTtcCents,
      }
      await savePdf(`${directory}/court-${template}-${density}.pdf`, renderDocumentHtml(shortDocument, { template, density }), false)
    }
  }
  const contentHtml = Array.from({ length: 28 }, (_, index) => `<h2>Article ${index + 1} — Conditions de recette</h2><p>${"Ce texte synthétique sert uniquement à vérifier la pagination, la lisibilité des paragraphes et la conservation des informations à l’impression. ".repeat(6)}</p>`).join("")
  await savePdf(`${directory}/contrat.pdf`, renderContractHtml({
    number: "CONT-RECETTE-028", title: "Contrat de démonstration — document non contractuel", status: "DRAFT", createdAt: "2026-09-13",
    contentHtml, client: document.client, company: document.company,
  }), true)
  console.log("contrat: 28 articles synthétiques")
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
