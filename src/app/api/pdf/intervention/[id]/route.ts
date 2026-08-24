import { NextResponse } from "next/server"

import { logAction } from "@/lib/audit"
import { generatePdfFromHtml } from "@/lib/pdf/generator"
import { renderInterventionReportHtml } from "@/lib/pdf/intervention-render"
import prisma from "@/lib/prisma"
import { getRouteAuth } from "@/lib/route-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await getRouteAuth("operations.read")
  if (!access.ok) return access.response
  const { id } = await params
  const intervention = await prisma.fieldIntervention.findFirst({
    where: { id, companyId: access.context.companyId },
    include: {
      company: true,
      site: { include: { client: { select: { name: true } } } },
      ticket: { select: { number: true } },
      assignedMembership: { include: { user: { select: { name: true, email: true } } } },
      files: { orderBy: { createdAt: "asc" } },
    },
  })
  if (!intervention) return NextResponse.json({ error: "Intervention introuvable" }, { status: 404 })
  if (intervention.status !== "COMPLETED") return NextResponse.json({ error: "Le rapport doit être clôturé avant génération" }, { status: 409 })

  const html = renderInterventionReportHtml({
    id: intervention.id,
    title: intervention.title,
    type: intervention.type,
    status: intervention.status,
    scheduledStart: intervention.scheduledStart,
    scheduledEnd: intervention.scheduledEnd,
    startedAt: intervention.startedAt,
    completedAt: intervention.completedAt,
    report: intervention.report,
    laborMinutes: intervention.laborMinutes,
    customerName: intervention.customerName,
    signedAt: intervention.signedAt,
    signatureSha256: intervention.signatureSha256,
    ticketNumber: intervention.ticket?.number,
    technician: intervention.assignedMembership?.user.name || intervention.assignedMembership?.user.email,
    company: intervention.company,
    client: intervention.site.client,
    site: intervention.site,
    files: intervention.files,
  })

  if (new URL(request.url).searchParams.get("screen") === "1") {
    return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store" } })
  }

  const pdf = await generatePdfFromHtml(html)
  await logAction({ userId: access.context.userId, action: "GENERATE_PDF", resource: "FIELD_INTERVENTION", resourceId: intervention.id, payload: { ticketNumber: intervention.ticket?.number } })
  const reference = intervention.ticket?.number || `INT-${intervention.id.slice(-8).toUpperCase()}`
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="rapport-${reference}.pdf"`,
      "cache-control": "private, no-store",
    },
  })
}
