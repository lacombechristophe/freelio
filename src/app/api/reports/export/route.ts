import { rowsToCsv } from "@/lib/accounting/export"
import { logAction } from "@/lib/audit"
import prisma from "@/lib/prisma"
import { executiveReportRows, normalizeReportPeriod } from "@/lib/reporting"
import { loadExecutiveReport } from "@/lib/reporting-data"
import { withRouteAuth } from "@/lib/route-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function filenameSlug(value: string) {
  return (
    value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "entreprise"
  )
}

export async function GET(request: Request) {
  return withRouteAuth(undefined, async (context) => {
    const period = normalizeReportPeriod(new URL(request.url).searchParams.get("period"))
    const [report, company] = await Promise.all([loadExecutiveReport(context, period), prisma.company.findUnique({ where: { id: context.companyId }, select: { name: true } })])
    if (!company) return Response.json({ error: "Entreprise introuvable" }, { status: 404 })

    const csv = rowsToCsv(["Domaine", "Indicateur", "Valeur", "Unite"], executiveReportRows(report))
    const stamp = new Date().toISOString().slice(0, 10)
    const bytes = Buffer.from(`\uFEFF${csv}`, "utf8")
    await logAction({
      userId: context.userId,
      action: "EXPORT_EXECUTIVE_REPORT",
      resource: "EXECUTIVE_REPORT",
      payload: { period, rows: executiveReportRows(report).length, bytes: bytes.byteLength },
    })

    return new Response(bytes, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${filenameSlug(company.name)}-rapport-direction-${period}j-${stamp}.csv"`,
        "content-length": String(bytes.byteLength),
        "cache-control": "private, no-store",
      },
    })
  })
}
