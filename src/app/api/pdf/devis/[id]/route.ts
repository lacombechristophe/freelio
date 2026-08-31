import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { withRouteAuth } from "@/lib/route-auth"
import { generatePdfFromHtml } from "@/lib/pdf/generator"
import { parsePdfRenderOptions, renderDocumentHtml } from "@/lib/pdf/render"
import { logAction } from "@/lib/audit"
import { decryptSensitive } from "@/lib/crypto"

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withRouteAuth("sales.read", async ({ userId, companyId }) => {
    const { id } = await params

    const quote = await prisma.quote.findFirst({
      where: { id, companyId },
      include: {
        client: true,
        company: true,
        versions: {
          orderBy: { version: "desc" },
          take: 1,
          include: { sections: { include: { lines: { orderBy: { order: "asc" } } } } },
        },
      },
    })
    if (!quote) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    const latest = quote.versions[0]
    if (!latest) {
      return NextResponse.json({ error: "No version" }, { status: 404 })
    }
    const allLines = latest.sections.flatMap((s) => s.lines)
    const url = new URL(req.url)
    const renderOptions = parsePdfRenderOptions(url.searchParams, quote.company.pdfTemplate)

    const html = renderDocumentHtml(
      {
        kind: "DEVIS",
        number: quote.number,
        object: quote.object,
        date: quote.date,
        validUntil: quote.validUntil,
        totalHtCents: latest.totalHtCents,
        totalTvaCents: latest.totalTvaCents,
        totalTtcCents: latest.totalTtcCents,
        lines: allLines.map((l) => ({
          label: l.label,
          description: l.description,
          quantity: l.quantity,
          unitPriceCents: l.unitPriceCents,
          tvaRate: l.tvaRate,
        })),
        client: {
          name: quote.client.name,
          address: quote.client.address,
          siret: quote.client.siret,
          tvaNumber: quote.client.tvaNumber,
        },
        company: {
          name: quote.company.name,
          fullName: quote.company.fullName,
          address: quote.company.address,
          email: quote.company.email,
          phone: quote.company.phone,
          logo: quote.company.logo,
          siret: quote.company.siret,
          tvaNumber: quote.company.tvaNumber,
          apeCode: quote.company.apeCode,
          rcsNumber: quote.company.rcsNumber,
          iban: decryptSensitive(quote.company.iban),
          isTvaApplicable: quote.company.isTvaApplicable,
          latePenaltyRate: quote.company.latePenaltyRate,
          brandColor: quote.company.brandColor,
          pdfTemplate: quote.company.pdfTemplate,
        },
      },
      renderOptions,
    )

    if (url.searchParams.get("screen") === "1") {
      return new NextResponse(html, {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "private, max-age=0, must-revalidate",
        },
      })
    }

    const pdf = await generatePdfFromHtml(html)

    await logAction({
      userId,
      action: "GENERATE_PDF",
      resource: "QUOTE",
      resourceId: quote.id,
      payload: { number: quote.number, options: renderOptions },
    })

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${quote.number}.pdf"`,
        "Cache-Control": "private, max-age=0, must-revalidate",
      },
    })
  })
}
