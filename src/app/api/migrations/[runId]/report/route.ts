import { createHash } from "node:crypto"

import prisma from "@/lib/prisma"
import { getRouteAuth } from "@/lib/route-auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(_request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const access = await getRouteAuth("migration.manage")
  if (!access.ok) return access.response
  const { companyId } = access.context
  const { runId } = await params

  const run = await prisma.migrationRun.findFirst({
    where: { id: runId, companyId },
    include: {
      company: { select: { name: true, siret: true } },
      metrics: { orderBy: { objectType: "asc" } },
      issues: { orderBy: [{ severity: "asc" }, { createdAt: "asc" }] },
      documents: {
        select: { sourceDocumentId: true, sourceObjectType: true, sourceRecordId: true, fileName: true, mimeType: true, size: true, sha256: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      },
      _count: { select: { records: true } },
    },
  })
  if (!run) return Response.json({ error: "Lot de migration introuvable" }, { status: 404 })

  const report = {
    reportVersion: "1.0",
    generatedAt: new Date().toISOString(),
    company: run.company,
    run: {
      id: run.id,
      provider: run.provider,
      kind: run.kind,
      status: run.status,
      createdAt: run.createdAt,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      sourceRecords: run._count.records,
      summary: run.summary,
    },
    reconciliation: run.metrics.map((metric) => ({
      objectType: metric.objectType,
      source: metric.sourceCount,
      extracted: metric.extracted,
      imported: metric.imported,
      rejected: metric.rejected,
      excluded: metric.excluded,
      difference: metric.sourceCount - metric.imported - metric.rejected - metric.excluded,
    })),
    issues: run.issues.map((issue) => ({
      severity: issue.severity,
      status: issue.status,
      code: issue.code,
      objectType: issue.objectType,
      sourceId: issue.sourceId,
      message: issue.message,
      createdAt: issue.createdAt,
      resolvedAt: issue.resolvedAt,
    })),
    documents: run.documents,
  }
  const body = JSON.stringify(report, null, 2)
  const sha256 = createHash("sha256").update(body).digest("hex")
  return new Response(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="migration-${run.provider.toLowerCase()}-${run.id}.json"`,
      "Digest": `sha-256=${sha256}`,
      "Cache-Control": "private, no-store",
    },
  })
}
