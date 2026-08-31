import { createHash } from "node:crypto"
import { strToU8, zipSync } from "fflate"
import { z } from "zod"

import { getServiceAnalytics } from "@/actions/service-analytics"
import { rowsToCsv } from "@/lib/accounting/export"
import { logAction } from "@/lib/audit"
import prisma from "@/lib/prisma"
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

function filterValue(url: URL, name: string) {
  const value = url.searchParams.get(name)?.trim()
  return value || undefined
}

const exportFiltersSchema = z.object({
  days: z.coerce
    .number()
    .int()
    .refine((value) => [30, 90, 180, 365].includes(value)),
  assignedMembershipId: z.string().cuid().optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
})

export async function GET(request: Request) {
  return withRouteAuth("service.read", async (context) => {
    const url = new URL(request.url)
    const parsedFilters = exportFiltersSchema.safeParse({
      days: Number(filterValue(url, "days") || 90),
      assignedMembershipId: filterValue(url, "assignedMembershipId"),
      priority: filterValue(url, "priority"),
    })
    if (!parsedFilters.success) return Response.json({ error: "Filtres d’export invalides" }, { status: 400 })
    const filters = parsedFilters.data
    const [analytics, company] = await Promise.all([getServiceAnalytics(filters), prisma.company.findUnique({ where: { id: context.companyId }, select: { name: true } })])
    if (!company) return Response.json({ error: "Entreprise introuvable" }, { status: 404 })

    const summaryRows = [
      { Indicateur: "Tickets créés", Valeur: analytics.summary.created, Denominateur: "" },
      { Indicateur: "Tickets clos", Valeur: analytics.summary.closed, Denominateur: "" },
      { Indicateur: "Backlog actif", Valeur: analytics.summary.backlog, Denominateur: "" },
      { Indicateur: "SLA première réponse (%)", Valeur: analytics.summary.firstResponsePercent ?? "", Denominateur: analytics.summary.firstResponseEligible },
      { Indicateur: "SLA résolution (%)", Valeur: analytics.summary.resolutionPercent ?? "", Denominateur: analytics.summary.resolutionEligible },
      { Indicateur: "Première réponse moyenne (minutes ouvrées)", Valeur: analytics.summary.averageFirstResponseMinutes ?? "", Denominateur: "" },
      { Indicateur: "Résolution moyenne (minutes ouvrées)", Valeur: analytics.summary.averageResolutionMinutes ?? "", Denominateur: "" },
      { Indicateur: "Couverture diagnostic (%)", Valeur: analytics.summary.diagnosticCoveragePercent ?? "", Denominateur: analytics.summary.created },
      { Indicateur: "Satisfaction globale (%)", Valeur: analytics.summary.satisfactionPercent ?? "", Denominateur: analytics.summary.satisfactionResponses },
      { Indicateur: "Santé moyenne (/100)", Valeur: analytics.summary.averageHealthScore ?? "", Denominateur: "" },
    ]
    const teamRows = analytics.byAssignee.map((item) => ({
      Responsable: item.name,
      Crees: item.created,
      Clos: item.closed,
      Backlog: item.backlog,
      SLAPremiereReponse: item.firstResponsePercent ?? "",
      SLAResolution: item.resolutionPercent ?? "",
      ResolutionMoyenneMinutes: item.averageResolutionMinutes ?? "",
    }))
    const priorityRows = analytics.byPriority.map((item) => ({
      Priorite: item.key,
      Crees: item.created,
      Clos: item.closed,
      Backlog: item.backlog,
      SLAPremiereReponse: item.firstResponsePercent ?? "",
      SLAResolution: item.resolutionPercent ?? "",
    }))
    const trendRows = analytics.trend.map((item) => ({
      Debut: new Date(item.startAt).toISOString().slice(0, 10),
      Fin: new Date(item.endAt).toISOString().slice(0, 10),
      Crees: item.created,
      Clos: item.closed,
    }))
    const diagnosticRows = analytics.topDiagnostics.map((item) => ({ Guide: item.name, Utilisations: item.count }))
    const healthRows = analytics.healthDistribution.map((item) => ({ Niveau: item.status, Clients: item.count }))
    const csvFiles = {
      "resume.csv": rowsToCsv(["Indicateur", "Valeur", "Denominateur"], summaryRows),
      "equipe.csv": rowsToCsv(["Responsable", "Crees", "Clos", "Backlog", "SLAPremiereReponse", "SLAResolution", "ResolutionMoyenneMinutes"], teamRows),
      "priorites.csv": rowsToCsv(["Priorite", "Crees", "Clos", "Backlog", "SLAPremiereReponse", "SLAResolution"], priorityRows),
      "tendance-hebdomadaire.csv": rowsToCsv(["Debut", "Fin", "Crees", "Clos"], trendRows),
      "diagnostics.csv": rowsToCsv(["Guide", "Utilisations"], diagnosticRows),
      "sante-portefeuille.csv": rowsToCsv(["Niveau", "Clients"], healthRows),
    }
    const fileManifest = Object.fromEntries(
      Object.entries(csvFiles).map(([name, content]) => [name, { bytes: Buffer.byteLength(content, "utf8"), sha256: createHash("sha256").update(content).digest("hex") }]),
    )
    const manifest = {
      schema: "crm.service-analytics-export.v1",
      generatedAt: new Date().toISOString(),
      period: { startAt: analytics.startAt.toISOString(), endAt: analytics.endAt.toISOString(), days: analytics.filters.days },
      filters: { assignedMembershipId: analytics.filters.assignedMembershipId || null, priority: analytics.filters.priority || null },
      files: fileManifest,
      notes: [
        "Les SLA incluent les objectifs échus sans réponse ou clôture.",
        "La satisfaction et la santé sont globales pour la période et ne sont pas filtrées par responsable.",
      ],
    }
    const zip = zipSync(
      {
        ...Object.fromEntries(Object.entries(csvFiles).map(([name, content]) => [name, strToU8(`\uFEFF${content}`)])),
        "manifest.json": strToU8(JSON.stringify(manifest, null, 2)),
      },
      { level: 6 },
    )
    await logAction({
      userId: context.userId,
      action: "EXPORT_SERVICE_ANALYTICS",
      resource: "SERVICE_ANALYTICS",
      payload: {
        days: analytics.filters.days,
        assignedMembershipId: analytics.filters.assignedMembershipId || null,
        priority: analytics.filters.priority || null,
        bytes: zip.byteLength,
      },
    })
    const stamp = new Date().toISOString().slice(0, 10)
    return new Response(Buffer.from(zip), {
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="${filenameSlug(company.name)}-analyses-service-${stamp}.zip"`,
        "content-length": String(zip.byteLength),
        "cache-control": "private, no-store",
      },
    })
  })
}
