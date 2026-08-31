import { NextResponse } from "next/server"

import { logAction } from "@/lib/audit"
import { renderDeliveryNoteHtml } from "@/lib/pdf/delivery-render"
import { generatePdfFromHtml } from "@/lib/pdf/generator"
import prisma from "@/lib/prisma"
import { withRouteAuth } from "@/lib/route-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withRouteAuth("operations.read", async (context) => {
    const { id } = await params
    const note = await prisma.deliveryNote.findFirst({
      where: { id, companyId: context.companyId },
      include: {
        company: true,
        customerOrder: { include: { client: true, project: { include: { site: true } } } },
        lines: { orderBy: { id: "asc" } },
      },
    })
    if (!note) return NextResponse.json({ error: "Bon de livraison introuvable" }, { status: 404 })
    const html = renderDeliveryNoteHtml({
      number: note.number,
      status: note.status,
      deliveredAt: note.deliveredAt,
      recipientName: note.recipientName,
      signedAt: note.signedAt,
      signatureSha256: note.signatureSha256,
      notes: note.notes,
      company: note.company,
      client: note.customerOrder.client,
      order: { number: note.customerOrder.number },
      site: note.customerOrder.project?.site,
      lines: note.lines,
    })
    if (new URL(request.url).searchParams.get("screen") === "1")
      return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store" } })
    const pdf = await generatePdfFromHtml(html)
    await logAction({ userId: context.userId, action: "GENERATE_PDF", resource: "DELIVERY_NOTE", resourceId: note.id, payload: { number: note.number } })
    return new NextResponse(new Uint8Array(pdf), {
      headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${note.number}.pdf"`, "cache-control": "private, no-store" },
    })
  })
}
