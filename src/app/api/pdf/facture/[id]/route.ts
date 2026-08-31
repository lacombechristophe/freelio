import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getRouteAuth } from "@/lib/route-auth"
import { generatePdfFromHtml, embedFacturX } from "@/lib/pdf/generator"
import { generateFacturX } from "@/lib/pdf/facturx"
import { parsePdfRenderOptions, renderDocumentHtml } from "@/lib/pdf/render"
import { logAction } from "@/lib/audit"
import { decryptSensitive } from "@/lib/crypto"

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const access = await getRouteAuth("finance.read")
  if (!access.ok) return access.response
  const { userId, companyId } = access.context

  const { id } = await params

  const invoice = await prisma.invoice.findFirst({
    where: { id, companyId },
    include: {
      client: true,
      company: true,
      lines: { orderBy: { order: "asc" } },
    },
  })
  if (!invoice) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const url = new URL(req.url)
  const renderOptions = parsePdfRenderOptions(url.searchParams, invoice.company.pdfTemplate)

  const html = renderDocumentHtml({
    kind: "FACTURE",
    number: invoice.number,
    object: invoice.object,
    date: invoice.date,
    dueDate: invoice.dueDate,
    totalHtCents: invoice.totalHtCents,
    totalTvaCents: invoice.totalTvaCents,
    totalTtcCents: invoice.totalTtcCents,
    lines: invoice.lines.map((l) => ({
      label: l.label,
      description: l.description,
      quantity: l.quantity,
      unitPriceCents: l.unitPriceCents,
      tvaRate: l.tvaRate,
    })),
    client: {
      name: invoice.client.name,
      address: invoice.client.address,
      siret: invoice.client.siret,
      tvaNumber: invoice.client.tvaNumber,
    },
    company: {
      name: invoice.company.name,
      fullName: invoice.company.fullName,
      address: invoice.company.address,
      email: invoice.company.email,
      phone: invoice.company.phone,
      logo: invoice.company.logo,
      siret: invoice.company.siret,
      tvaNumber: invoice.company.tvaNumber,
      apeCode: invoice.company.apeCode,
      rcsNumber: invoice.company.rcsNumber,
      iban: decryptSensitive(invoice.company.iban),
      isTvaApplicable: invoice.company.isTvaApplicable,
      latePenaltyRate: invoice.company.latePenaltyRate,
      brandColor: invoice.company.brandColor,
      pdfTemplate: invoice.company.pdfTemplate,
    },
  }, renderOptions)

  if (url.searchParams.get("screen") === "1") {
    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "private, max-age=0, must-revalidate",
      },
    })
  }

  let pdf = await generatePdfFromHtml(html)

  // Generate and embed Factur-X XML metadata
  try {
    const xml = generateFacturX({
      number: invoice.number,
      date: invoice.date.toISOString().split("T")[0],
      seller: {
        name: invoice.company.name,
        siret: invoice.company.siret || "",
        address: invoice.company.address || "",
        vatNumber: invoice.company.tvaNumber || undefined,
      },
      buyer: {
        name: invoice.client.name,
        siret: invoice.client.siret || undefined,
        address: invoice.client.address || "",
        vatNumber: invoice.client.tvaNumber || undefined,
      },
      lines: invoice.lines.map(line => ({
        label: line.label,
        quantity: line.quantity,
        unitPriceCents: line.unitPriceCents,
        totalHtCents: line.quantity * line.unitPriceCents,
        tvaRate: line.tvaRate,
      })),
      totalHtCents: invoice.totalHtCents,
      totalTvaCents: invoice.totalTvaCents,
      totalTtcCents: invoice.totalTtcCents,
    })
    const buffer = await embedFacturX(Buffer.from(pdf), xml)
    pdf = new Uint8Array(buffer)
  } catch (err) {
    console.error("Failed to generate/embed Factur-X XML:", err)
  }

  await logAction({
    userId,
    action: "GENERATE_PDF",
    resource: "INVOICE",
    resourceId: invoice.id,
    payload: { number: invoice.number, options: renderOptions },
  })

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${invoice.number}.pdf"`,
      "Cache-Control": "private, max-age=0, must-revalidate",
    },
  })
}
