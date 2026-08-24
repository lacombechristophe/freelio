import { NextResponse } from "next/server"

import { logAction } from "@/lib/audit"
import { generatePdfFromHtml } from "@/lib/pdf/generator"
import { renderPurchaseOrderHtml } from "@/lib/pdf/purchase-order-render"
import prisma from "@/lib/prisma"
import { getRouteAuth } from "@/lib/route-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await getRouteAuth("operations.read")
  if (!access.ok) return access.response
  const { id } = await params
  const order = await prisma.purchaseOrder.findFirst({ where: { id, companyId: access.context.companyId }, include: { company: true, supplier: true, project: { select: { name: true } }, approvedByMembership: { include: { user: { select: { name: true, email: true } } } }, lines: { orderBy: { order: "asc" } } } })
  if (!order) return NextResponse.json({ error: "Commande fournisseur introuvable" }, { status: 404 })
  const html = renderPurchaseOrderHtml({ ...order, approver: order.approvedByMembership?.user.name || order.approvedByMembership?.user.email })
  if (new URL(request.url).searchParams.get("screen") === "1") return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store" } })
  const pdf = await generatePdfFromHtml(html)
  await logAction({ userId: access.context.userId, action: "GENERATE_PDF", resource: "PURCHASE_ORDER", resourceId: order.id, payload: { number: order.number } })
  return new NextResponse(new Uint8Array(pdf), { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${order.number}.pdf"`, "cache-control": "private, no-store" } })
}
