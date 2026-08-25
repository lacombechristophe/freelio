import { NextResponse } from "next/server"

import prisma from "@/lib/prisma"
import { embedFacturX, generatePdfFromHtml } from "@/lib/pdf/generator"
import { generateFacturX } from "@/lib/pdf/facturx"
import { parsePdfRenderOptions, renderDocumentHtml } from "@/lib/pdf/render"
import { getCurrentPortalAccess } from "@/lib/portal/session"

export const runtime = "nodejs"

function companyIdentity(company: {
  name: string
  fullName: string | null
  address: string | null
  email: string | null
  phone: string | null
  logo: string | null
  siret: string | null
  tvaNumber: string | null
  apeCode: string | null
  rcsNumber: string | null
  iban: string | null
  isTvaApplicable: boolean
  latePenaltyRate: number
  brandColor: string
  pdfTemplate: string
}) {
  return company
}

function clientIdentity(client: { name: string; address: string | null; siret: string | null; tvaNumber: string | null }) {
  return client
}

function pdfResponse(pdf: Uint8Array, number: string) {
  const fileName = number.replace(/[^A-Za-z0-9._-]/g, "_") || "document"
  const body = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer
  return new NextResponse(body, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${fileName}.pdf"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  })
}

export async function GET(request: Request, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const access = await getCurrentPortalAccess()
  if (!access) return Response.json({ error: "Accès expiré ou révoqué" }, { status: 401 })
  const { kind, id } = await params
  const url = new URL(request.url)

  if (kind === "quote") {
    const quote = await prisma.quote.findFirst({
      where: { id, companyId: access.companyId, clientId: access.clientId, status: { not: "DRAFT" } },
      include: {
        client: true,
        company: true,
        versions: { orderBy: { version: "desc" }, take: 1, include: { sections: { include: { lines: { orderBy: { order: "asc" } } } } } },
      },
    })
    const latest = quote?.versions[0]
    if (!quote || !latest) return Response.json({ error: "Document introuvable" }, { status: 404 })
    const html = renderDocumentHtml({
      kind: "DEVIS",
      number: quote.number,
      object: quote.object,
      date: quote.date,
      validUntil: quote.validUntil,
      totalHtCents: latest.totalHtCents,
      totalTvaCents: latest.totalTvaCents,
      totalTtcCents: latest.totalTtcCents,
      lines: latest.sections.flatMap((section) => section.lines).map((line) => ({ label: line.label, description: line.description, quantity: line.quantity, unitPriceCents: line.unitPriceCents, tvaRate: line.tvaRate })),
      client: clientIdentity(quote.client),
      company: companyIdentity(quote.company),
    }, parsePdfRenderOptions(url.searchParams, quote.company.pdfTemplate))
    return pdfResponse(new Uint8Array(await generatePdfFromHtml(html)), quote.number)
  }

  if (kind === "invoice") {
    const invoice = await prisma.invoice.findFirst({
      where: { id, companyId: access.companyId, clientId: access.clientId, status: { notIn: ["DRAFT", "CANCELLED"] } },
      include: { client: true, company: true, lines: { orderBy: { order: "asc" } } },
    })
    if (!invoice) return Response.json({ error: "Document introuvable" }, { status: 404 })
    const html = renderDocumentHtml({
      kind: "FACTURE",
      number: invoice.number,
      object: invoice.object,
      date: invoice.date,
      dueDate: invoice.dueDate,
      totalHtCents: invoice.totalHtCents,
      totalTvaCents: invoice.totalTvaCents,
      totalTtcCents: invoice.totalTtcCents,
      lines: invoice.lines.map((line) => ({ label: line.label, description: line.description, quantity: line.quantity, unitPriceCents: line.unitPriceCents, tvaRate: line.tvaRate })),
      client: clientIdentity(invoice.client),
      company: companyIdentity(invoice.company),
    }, parsePdfRenderOptions(url.searchParams, invoice.company.pdfTemplate))
    let pdf = await generatePdfFromHtml(html)
    const xml = generateFacturX({
      number: invoice.number,
      date: invoice.date.toISOString().split("T")[0],
      seller: { name: invoice.company.name, siret: invoice.company.siret || "", address: invoice.company.address || "", vatNumber: invoice.company.tvaNumber || undefined },
      buyer: { name: invoice.client.name, siret: invoice.client.siret || undefined, address: invoice.client.address || "", vatNumber: invoice.client.tvaNumber || undefined },
      lines: invoice.lines.map((line) => ({ label: line.label, quantity: line.quantity, unitPriceCents: line.unitPriceCents, totalHtCents: line.quantity * line.unitPriceCents, tvaRate: line.tvaRate })),
      totalHtCents: invoice.totalHtCents,
      totalTvaCents: invoice.totalTvaCents,
      totalTtcCents: invoice.totalTtcCents,
    })
    pdf = new Uint8Array(await embedFacturX(Buffer.from(pdf), xml))
    return pdfResponse(pdf, invoice.number)
  }

  return Response.json({ error: "Type de document invalide" }, { status: 400 })
}
