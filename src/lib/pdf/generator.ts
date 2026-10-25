import puppeteer from "puppeteer"
import { AFRelationship, PDFDocument } from "pdf-lib"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { PDF_FONT_FILES } from "@/lib/pdf/typography"
import { inlineSafePdfImages } from "@/lib/pdf/images"

let embeddedFontSources: Promise<Map<string, string>> | null = null

export async function inlinePdfFonts(html: string, required = false) {
  embeddedFontSources ??= Promise.all(
    PDF_FONT_FILES.map(async (fileName) => {
      const font = await readFile(path.join(process.cwd(), "public", "fonts", fileName))
      return [`/fonts/${fileName}`, `data:font/woff2;base64,${font.toString("base64")}`] as const
    })
  ).then((entries) => new Map(entries))

  try {
    const sources = await embeddedFontSources
    let printableHtml = html

    for (const [fontUrl, dataUri] of sources) {
      printableHtml = printableHtml.replaceAll(fontUrl, dataUri)
    }

    return printableHtml
  } catch (error) {
    console.error("PDF font embedding failed:", error)
    embeddedFontSources = null
    if (required) throw new Error("PDF_FONT_CAPTURE_FAILED", { cause: error })
    return html
  }
}

export async function generatePdfFromHtml(html: string, options: { signal?: AbortSignal } = {}) {
  options.signal?.throwIfAborted()
  const printableHtml = await inlineSafePdfImages(await inlinePdfFonts(html), options.signal)
  options.signal?.throwIfAborted()
  const chromium = process.env.VERCEL === "1" && !process.env.PUPPETEER_EXECUTABLE_PATH
    ? (await import("@sparticuz/chromium")).default
    : null
  const browser = await puppeteer.launch({
    ...(options.signal ? { signal: options.signal } : {}),
    headless: chromium ? "shell" : true,
    pipe: true,
    ...(chromium ? { executablePath: await chromium.executablePath() } : {}),
    args: [...(chromium?.args ?? ["--no-sandbox", "--disable-setuid-sandbox"]), "--disable-background-networking"],
  })

  try {
    const page = await browser.newPage()
    await page.setJavaScriptEnabled(false)
    await page.setRequestInterception(true)
    let refusedResource = false
    page.on("request", request => {
      if (request.url().startsWith("data:") || request.url() === "about:blank") {
        void request.continue()
      } else {
        refusedResource = true
        void request.abort("blockedbyclient")
      }
    })
    await page.setContent(printableHtml, { waitUntil: "load" })
    await page.waitForNetworkIdle({ idleTime: 500 })
    await page.evaluate(() => document.fonts.ready)
    if (refusedResource) throw new Error("PDF_REMOTE_RESOURCE_REFUSED")

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: {
        top: "0",
        bottom: "0",
        left: "0",
        right: "0",
      },
    })

    return pdf
  } finally {
    await browser.close()
  }
}

/**
 * Attach the generated Factur-X XML payload to the visual PDF.
 * This step alone does not certify PDF/A-3 or full Factur-X conformance.
 */
export async function embedFacturX(pdfBuffer: Buffer, xmlContent: string) {
  try {
    const pdfDoc = await PDFDocument.load(pdfBuffer)
    
    // Keep the structured invoice payload alongside the human-readable document.
    // pdf-lib interprets a string attachment as base64. Pass UTF-8 bytes so
    // the CII document is embedded verbatim (including accented French text).
    await pdfDoc.attach(Buffer.from(xmlContent, "utf8"), "factur-x.xml", {
      mimeType: "application/xml",
      description: "Factur-X / ZUGFeRD XML Invoice Metadata (EN 16931)",
      creationDate: new Date(),
      modificationDate: new Date(),
      afRelationship: AFRelationship.Alternative,
    })
    
    const pdfBytes = await pdfDoc.save()
    return Buffer.from(pdfBytes)
  } catch (error) {
    throw new Error("Impossible d’intégrer le XML Factur-X au PDF. Aucun document structuré n’a été produit.", { cause: error })
  }
}
