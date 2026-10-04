import "server-only"
import { createHash } from "node:crypto"
import type { Prisma } from "@prisma/client"
import prisma, { type TransactionClient } from "@/lib/prisma"
import { decryptSensitive } from "@/lib/crypto"
import { parsePdfRenderOptions, renderDocumentHtml } from "@/lib/pdf/render"
import { inlineSafePdfImages } from "@/lib/pdf/images"
import { EmailCrmDocumentError } from "./crm-document-error"

const quoteSelect = {
  id: true, number: true, object: true, date: true, validUntil: true, updatedAt: true,
  versions: { orderBy: [{ version: "desc" }, { id: "desc" }], take: 2, select: { id: true, version: true, totalHtCents: true, totalTvaCents: true, totalTtcCents: true } },
  client: { select: { name: true, address: true, siret: true, tvaNumber: true } },
  company: { select: { name: true, fullName: true, address: true, email: true, phone: true, logo: true, siret: true, tvaNumber: true, apeCode: true, rcsNumber: true, iban: true, isTvaApplicable: true, latePenaltyRate: true, brandColor: true, pdfTemplate: true } },
} as const satisfies Prisma.QuoteSelect

export async function readCurrentQuoteCopy(companyId: string, clientId: string, id: string, db: TransactionClient = prisma) {
  const quote = await db.quote.findFirst({ where: { id, companyId, clientId }, select: quoteSelect })
  if (!quote || !quote.versions.length) throw new EmailCrmDocumentError("Devis ou version indisponible ; actualisez la sélection")
  const version = quote.versions[0]
  if (quote.versions[1]?.version === version.version) throw new EmailCrmDocumentError("Plusieurs révisions portent le même numéro de version ; vérifiez ce devis")
  // A flat, bounded read prevents a sections × lines fan-out or silent truncation.
  const lines = await db.quoteLine.findMany({ where: { section: { versionId: version.id } }, take: 501,
    orderBy: [{ section: { order: "asc" } }, { sectionId: "asc" }, { order: "asc" }, { id: "asc" }],
    select: { id: true, sectionId: true, order: true, label: true, description: true, quantity: true, unitPriceCents: true, tvaRate: true } })
  if (lines.length > 500) throw new EmailCrmDocumentError("Ce devis dépasse 500 lignes ; aucune copie tronquée n’est générée")
  const document = { kind: "DEVIS" as const, number: quote.number, object: quote.object, date: quote.date, validUntil: quote.validUntil,
    totalHtCents: version.totalHtCents, totalTvaCents: version.totalTvaCents, totalTtcCents: version.totalTtcCents,
    lines, client: quote.client, company: { ...quote.company, iban: decryptSensitive(quote.company.iban) } }
  const options = parsePdfRenderOptions(new URLSearchParams(), quote.company.pdfTemplate)
  const revision = JSON.stringify({ quoteId: quote.id, versionId: version.id, version: version.version, updatedAt: quote.updatedAt, document, options })
  if (Buffer.byteLength(revision) > 1024 * 1024) throw new EmailCrmDocumentError("Les données de ce devis dépassent 1 Mo ; aucune copie tronquée n’est générée")
  return { id: quote.id, number: quote.number, quoteVersion: version.version, date: quote.updatedAt.toISOString(), revision, html: renderDocumentHtml(document, options) }
}

export async function captureQuoteCopy(source: Awaited<ReturnType<typeof readCurrentQuoteCopy>>, signal: AbortSignal, images = new Map<string, string>()) {
  signal.throwIfAborted()
  const html = await inlineSafePdfImages(source.html, signal, images)
  if (Buffer.byteLength(html) > 4 * 1024 * 1024) throw new EmailCrmDocumentError("Le rendu de ce devis dépasse 4 Mo ; aucune copie tronquée n’est générée")
  // Inline image bytes are part of the selection, even if their URL stays equal.
  const fingerprint = createHash("sha256").update(source.revision).update("\0").update(html).digest("hex")
  return { ...source, html, fingerprint }
}
