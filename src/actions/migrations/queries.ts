"use server"

import { withReadAuth } from "@/lib/auth-wrapper"
import { classifySourceObject } from "@/lib/migrations/normalize"
import { migrationDatabase as prisma } from "@/lib/migrations/database"
import { connectionIdSchema } from "./schemas"

export async function getMigrationDashboard() {
  return withReadAuth(async ({ companyId }) => {
    const [connections, runs] = await Promise.all([
      prisma.dataSourceConnection.findMany({
        where: { companyId },
        select: { id: true, provider: true, name: true, status: true, lastTestAt: true, lastError: true, updatedAt: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.migrationRun.findMany({
        where: { companyId },
        take: 20,
        orderBy: { createdAt: "desc" },
        include: {
          metrics: true,
          issues: { where: { status: "OPEN" }, select: { severity: true } },
          _count: { select: { documents: true, records: true } },
        },
      }),
    ])

    return {
      connections: connections.map((connection) => ({
        ...connection,
        lastTestAt: connection.lastTestAt?.toISOString() ?? null,
        updatedAt: connection.updatedAt.toISOString(),
      })),
      runs: runs.map((run) => ({
        id: run.id,
        provider: run.provider,
        kind: run.kind,
        status: run.status,
        startedAt: run.startedAt?.toISOString() ?? null,
        completedAt: run.completedAt?.toISOString() ?? null,
        createdAt: run.createdAt.toISOString(),
        metrics: run.metrics,
        openIssues: run.issues.length,
        documents: run._count.documents,
        records: run._count.records,
      })),
    }
  }, "migration.manage")
}

export async function getMigrationRunDetails(runId: string) {
  return withReadAuth(async ({ companyId }) => {
    const parsedId = connectionIdSchema.parse(runId)
    const run = await prisma.migrationRun.findFirst({
      where: { id: parsedId, companyId },
      include: {
        metrics: { orderBy: { objectType: "asc" } },
        issues: { orderBy: [{ severity: "asc" }, { createdAt: "desc" }], take: 200 },
        documents: {
          select: { id: true, fileName: true, mimeType: true, size: true, sha256: true, sourceObjectType: true, createdAt: true },
          orderBy: { createdAt: "asc" },
        },
        _count: { select: { records: true } },
      },
    })
    if (!run) return null

    const objectTypes = await prisma.sourceRecord.groupBy({
      by: ["objectType"],
      where: { runId: run.id },
      _count: { _all: true },
      orderBy: { objectType: "asc" },
      take: 50,
    })
    const samples = await Promise.all(objectTypes.map(async (group) => ({
      objectType: group.objectType,
      count: group._count._all,
      targetKind: classifySourceObject(group.objectType),
      records: await prisma.sourceRecord.findMany({
        where: { runId: run.id, objectType: group.objectType },
        take: 3,
        orderBy: { createdAt: "asc" },
        select: { id: true, sourceId: true, payload: true, targetModel: true, targetRecordId: true, importedAt: true },
      }),
    })))

    return {
      id: run.id,
      provider: run.provider,
      kind: run.kind,
      status: run.status,
      checkpoint: run.checkpoint,
      summary: run.summary,
      startedAt: run.startedAt?.toISOString() ?? null,
      completedAt: run.completedAt?.toISOString() ?? null,
      createdAt: run.createdAt.toISOString(),
      recordCount: run._count.records,
      metrics: run.metrics,
      issues: run.issues.map((issue) => ({ ...issue, createdAt: issue.createdAt.toISOString(), resolvedAt: issue.resolvedAt?.toISOString() ?? null })),
      documents: run.documents.map((document) => ({ ...document, createdAt: document.createdAt.toISOString() })),
      samples: samples.map((sample) => ({
        ...sample,
        records: sample.records.map((record) => ({ ...record, importedAt: record.importedAt?.toISOString() ?? null })),
      })),
    }
  }, "migration.manage")
}
