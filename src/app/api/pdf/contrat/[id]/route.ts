import { NextResponse } from "next/server"
import { logAction } from "@/lib/audit"
import { compileContractVariables } from "@/lib/contracts/html"
import { generatePdfFromHtml } from "@/lib/pdf/generator"
import { renderContractHtml } from "@/lib/pdf/contract-render"
import prisma from "@/lib/prisma"
import { withRouteAuth } from "@/lib/route-auth"

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withRouteAuth("sales.read", async ({ userId, companyId }) => {
    const { id } = await params
    const contract = await prisma.contract.findFirst({
      where: { id, companyId },
      include: {
        client: { include: { contacts: { orderBy: { isPrimary: "desc" } } } },
        company: true,
        signatures: { orderBy: { signedAt: "asc" } },
      },
    })

    if (!contract) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    const primaryContact = contract.client.contacts[0]
    const compiledContent = compileContractVariables({
      content: contract.content,
      client: {
        name: contract.client.name,
        email: primaryContact?.email,
      },
      company: {
        name: contract.company.name,
        siret: contract.company.siret,
      },
      contract: {
        title: contract.title,
        validFrom: contract.validFrom,
        validUntil: contract.validUntil,
      },
    })

    const html = renderContractHtml({
      number: contract.number,
      title: contract.title,
      status: contract.status,
      createdAt: contract.createdAt,
      validFrom: contract.validFrom,
      validUntil: contract.validUntil,
      contentHtml: compiledContent,
      client: {
        name: contract.client.name,
        address: contract.client.address,
        siret: contract.client.siret,
        email: primaryContact?.email,
      },
      company: {
        name: contract.company.name,
        fullName: contract.company.fullName,
        address: contract.company.address,
        email: contract.company.email,
        phone: contract.company.phone,
        logo: contract.company.logo,
        siret: contract.company.siret,
        tvaNumber: contract.company.tvaNumber,
        apeCode: contract.company.apeCode,
        rcsNumber: contract.company.rcsNumber,
        brandColor: contract.company.brandColor,
      },
      signatures: contract.signatures.map((signature) => ({
        signerName: signature.signerName,
        signerEmail: signature.signerEmail,
        signedAt: signature.signedAt,
        canvasData: signature.canvasData,
      })),
    })

    const url = new URL(req.url)
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
      resource: "CONTRACT",
      resourceId: contract.id,
      payload: { number: contract.number },
    })

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${contract.number}.pdf"`,
        "Cache-Control": "private, max-age=0, must-revalidate",
      },
    })
  })
}
