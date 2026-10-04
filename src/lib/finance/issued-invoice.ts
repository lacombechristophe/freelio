import "server-only"

import { createHash } from "node:crypto"
import type { Prisma } from "@prisma/client"
import { z } from "zod"
import { encrypt, decrypt, decryptSensitive } from "@/lib/crypto"
import { storeFileBytes, readLocalFile, removeLocalFile } from "@/lib/local-files"
import { generatePdfFromHtml, embedFacturX } from "@/lib/pdf/generator"
import { generateFacturX } from "@/lib/pdf/facturx"
import { parsePdfRenderOptions, renderDocumentHtml } from "@/lib/pdf/render"
import { inlineSafePdfImages } from "@/lib/pdf/images"

type InvoiceForDocument = Prisma.InvoiceGetPayload<{ include: { company: true; client: true; lines: true } }>
type ArchivedInvoice = Pick<InvoiceForDocument, "id" | "companyId" | "status" | "lockedAt" | "issuedDocument" | "pdfUrl" | "pdfHash">
const snapshotSchema = z.object({ version: z.literal(1), html: z.string(), xml: z.string() })

export function isIssuedInvoice(invoice: { status: string; lockedAt?: Date | null }) {
  return Boolean(invoice.lockedAt || ["SENT", "OVERDUE", "PAID"].includes(invoice.status))
}

export async function prepareIssuedInvoice(invoice: InvoiceForDocument) {
  const company = invoice.company
  const html = await inlineSafePdfImages(renderDocumentHtml({
    kind: "FACTURE", number: invoice.number, object: invoice.object,
    date: invoice.date, dueDate: invoice.dueDate,
    totalHtCents: invoice.totalHtCents, totalTvaCents: invoice.totalTvaCents, totalTtcCents: invoice.totalTtcCents,
    lines: invoice.lines.map(line => ({ label: line.label, description: line.description, quantity: line.quantity, unitPriceCents: line.unitPriceCents, tvaRate: line.tvaRate })),
    client: { name: invoice.client.name, address: invoice.client.address, siret: invoice.client.siret, tvaNumber: invoice.client.tvaNumber },
    company: {
      name: company.name, fullName: company.fullName, address: company.address,
      email: company.email, phone: company.phone, logo: company.logo,
      siret: company.siret, tvaNumber: company.tvaNumber, apeCode: company.apeCode, rcsNumber: company.rcsNumber,
      iban: decryptSensitive(company.iban), isTvaApplicable: company.isTvaApplicable,
      latePenaltyRate: company.latePenaltyRate, brandColor: company.brandColor, pdfTemplate: company.pdfTemplate,
    },
  }, parsePdfRenderOptions(new URLSearchParams(), company.pdfTemplate)))
  const xml = generateFacturX({
    type: invoice.type === "CREDIT_NOTE" ? "CREDIT_NOTE" : "STANDARD",
    number: invoice.number, date: invoice.date.toISOString().slice(0, 10),
    seller: { name: company.name, siret: company.siret || "", address: company.address || "", vatNumber: company.tvaNumber || undefined },
    buyer: { name: invoice.client.name, siret: invoice.client.siret || undefined, address: invoice.client.address || "", vatNumber: invoice.client.tvaNumber || undefined },
    lines: invoice.lines.map(line => ({ label: line.label, quantity: line.quantity, unitPriceCents: line.unitPriceCents, totalHtCents: Math.round(line.quantity * line.unitPriceCents), tvaRate: line.tvaRate })),
    totalHtCents: invoice.totalHtCents, totalTvaCents: invoice.totalTvaCents, totalTtcCents: invoice.totalTtcCents,
  })
  // Encrypt the identity snapshot before creating an external artifact.
  const issuedDocument = encrypt(JSON.stringify({ version: 1, html, xml }))
  const pdf = await embedFacturX(Buffer.from(await generatePdfFromHtml(html)), xml)
  const stored = await storeFileBytes({ companyId: invoice.companyId, kind: "generated", resourceId: invoice.id, originalName: invoice.number + ".pdf", type: "application/pdf", bytes: pdf })
  return { issuedDocument, pdfUrl: stored.relativePath, pdfHash: stored.sha256 }
}

export async function discardIssuedInvoice(artifact: { pdfUrl: string }) {
  await removeLocalFile(artifact.pdfUrl)
}

export async function readIssuedInvoice(invoice: ArchivedInvoice, maxBytes = Infinity) {
  if (!invoice.issuedDocument || !invoice.pdfUrl || !invoice.pdfHash) {
    throw new Error("ISSUED_INVOICE_ARCHIVE_MISSING")
  }
  // A reference can only point to the current company's current invoice.
  const key = invoice.pdfUrl.replace(/^(local:|r2:)/, "")
  if (!key.startsWith(invoice.companyId + "/generated/" + invoice.id + "/")) throw new Error("ISSUED_INVOICE_ARCHIVE_SCOPE")
  const snapshot = snapshotSchema.parse(JSON.parse(decrypt(invoice.issuedDocument)))
  const pdf = await readLocalFile(invoice.pdfUrl, maxBytes)
  if (createHash("sha256").update(pdf).digest("hex") !== invoice.pdfHash) throw new Error("ISSUED_INVOICE_ARCHIVE_INTEGRITY")
  return { ...snapshot, pdf }
}
