import { NextResponse } from "next/server"
import { logAction } from "@/lib/audit"
import { compileContractVariables } from "@/lib/contracts/html"
import { generatePdfFromHtml } from "@/lib/pdf/generator"
import { renderContractHtml } from "@/lib/pdf/contract-render"
import prisma from "@/lib/prisma"
import { withRouteAuth } from "@/lib/route-auth"
import { readContractArchive, readSignedContractDocument, readContractSnapshot, previewContractSnapshot, contractSnapshotWhere } from "@/lib/contracts/archive"

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

    if (contract.status === "SIGNED") {
      try {
        if (new URL(req.url).searchParams.get("screen") === "1") {
          return new NextResponse(readSignedContractDocument(contract.signedDocument, contract).html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } })
        }
        const archive = await readContractArchive(contract)
        const name = contract.number.replace(/[^A-Za-z0-9._-]/g, "_")
        return new NextResponse(new Uint8Array(archive.pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${name}.pdf"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } })
      } catch {
        return NextResponse.json({ error: contract.signedDocument ? "Archive du contrat en préparation ou indisponible" : "Archive historique indisponible" }, { status: 409, headers: { "Cache-Control": "private, no-store" } })
      }
    }

    if (contract.status === "SENT") {
      try {
        const link = await prisma.contractSigningToken.findFirst({ where: { contractId: contract.id, usedAt: null, expiresAt: { gt: new Date() }, contractRevision: contract.updatedAt }, orderBy: { createdAt: "desc" } })
        const snapshot = readContractSnapshot(link?.documentSnapshot ?? null, link?.documentHash ?? null, contract)
        if (!await prisma.contract.count({ where: { ...contractSnapshotWhere(snapshot), status: "SENT", updatedAt: link!.contractRevision! } })) throw new Error("CONTRACT_CHANGED")
        const html = previewContractSnapshot(snapshot)
        if (new URL(req.url).searchParams.get("screen") === "1") return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" } })
        const pdf = await generatePdfFromHtml(html, { signal: AbortSignal.timeout(45_000) })
        return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${contract.number.replace(/[^A-Za-z0-9._-]/g, "_")}.pdf"`, "Cache-Control": "private, no-store" } })
      } catch {
        return NextResponse.json({ error: "Le lien de signature ou son aperçu doit être renouvelé" }, { status: 409, headers: { "Cache-Control": "private, no-store" } })
      }
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
