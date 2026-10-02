import { expect, it, vi } from "vitest"
import { existsSync } from "node:fs"
import puppeteer from "puppeteer"
import { PDFDocument } from "pdf-lib"
vi.mock("server-only", () => ({}))
import { generatePdfFromHtml } from "@/lib/pdf/generator"
const executable = await puppeteer.executablePath()
it.skipIf(!existsSync(executable))("renders a real PDF with JavaScript and external resources disabled", async () => {
  const bytes = await generatePdfFromHtml('<!doctype html><html><body><h1>Facture fictive</h1><p>Montant : 1 200,00 €</p></body></html>')
  expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1)
}, 30_000)
it.skipIf(!existsSync(executable))("refuses a stylesheet network request made by the real browser", async () => {
  await expect(generatePdfFromHtml('<html><head><link rel="stylesheet" href="http://127.0.0.1:9/private.css"></head><body>Fictif</body></html>')).rejects.toThrow("PDF_REMOTE_RESOURCE_REFUSED")
}, 30_000)
