"use server"

import { createHash } from "node:crypto"
import { Prisma } from "@/generated/prisma/client"
import { revalidatePath } from "next/cache"
import { withAuth } from "@/lib/auth-wrapper"
import { readMigrationArtifact } from "@/lib/migrations/storage"
import { migrationDatabase as prisma } from "@/lib/migrations/database"
import { reconcileImportedTarget } from "@/lib/migrations/reconciliation"
import { batches } from "./batching"
import { connectionIdSchema } from "./schemas"

export async function verifyMigrationRun(runId: string) {
  return withAuth(async ({ companyId }) => {
    const parsedId = connectionIdSchema.parse(runId)
    const run = await prisma.migrationRun.findFirst({
      where: { id: parsedId, companyId, status: { in: ["IMPORTED", "PARTIAL", "VERIFIED", "VERIFICATION_FAILED"] } },
      include: {
        metrics: { orderBy: { objectType: "asc" } },
        documents: { orderBy: { createdAt: "asc" } },
        records: { select: { objectType: true, sourceId: true, targetModel: true, targetRecordId: true, importedAt: true, payload: true } },
      },
    })
    if (!run) throw new Error("Import terminé introuvable")
    const accounted = run.metrics.reduce((sum, metric) => sum + metric.imported + metric.rejected + metric.excluded, 0)
    if (!accounted && run.records.length) throw new Error("Importez le lot avant de lancer la vérification")

    const verificationIssues: Array<{ severity: "ERROR" | "WARNING"; code: string; message: string; objectType?: string; details?: Prisma.InputJsonValue }> = []
    const unresolvedSourceErrors = await prisma.migrationIssue.count({
      where: { runId: run.id, status: "OPEN", severity: "ERROR", NOT: { code: { startsWith: "VERIFY_" } } },
    })
    if (unresolvedSourceErrors) {
      verificationIssues.push({
        severity: "ERROR",
        code: "VERIFY_UNRESOLVED_SOURCE_ERRORS",
        message: `${unresolvedSourceErrors} anomalie${unresolvedSourceErrors > 1 ? "s" : ""} source bloquante${unresolvedSourceErrors > 1 ? "s" : ""} reste${unresolvedSourceErrors > 1 ? "nt" : ""} à corriger.`,
        details: { count: unresolvedSourceErrors },
      })
    }
    const rejectedCount = run.metrics.reduce((sum, metric) => sum + metric.rejected, 0)
    if (rejectedCount) {
      verificationIssues.push({
        severity: "ERROR",
        code: "VERIFY_REJECTED_RECORDS",
        message: `${rejectedCount} ligne${rejectedCount > 1 ? "s" : ""} source rejetée${rejectedCount > 1 ? "s" : ""} reste${rejectedCount > 1 ? "nt" : ""} à traiter avant la validation du lot.`,
        details: { count: rejectedCount },
      })
    }

    for (const metric of run.metrics) {
      const difference = metric.sourceCount - metric.imported - metric.rejected - metric.excluded
      if (difference !== 0) {
        verificationIssues.push({
          severity: "ERROR",
          code: "VERIFY_RECONCILIATION_MISMATCH",
          objectType: metric.objectType,
          message: `${metric.objectType} présente un écart de rapprochement de ${difference}.`,
          details: { source: metric.sourceCount, imported: metric.imported, rejected: metric.rejected, excluded: metric.excluded, difference },
        })
      }
    }

    const importedRecords = run.records.filter((record) => record.importedAt && record.targetModel && record.targetRecordId)
    const importedMetricCount = run.metrics.reduce((sum, metric) => sum + metric.imported, 0)
    if (importedRecords.length !== importedMetricCount) {
      verificationIssues.push({
        severity: "ERROR",
        code: "VERIFY_IMPORTED_RECORD_COUNT_MISMATCH",
        message: `Les métriques annoncent ${importedMetricCount} imports mais ${importedRecords.length} lignes brutes portent une cible.`,
      })
    }

    const missingMappings: Array<{ objectType: string; sourceId: string }> = []
    for (const group of batches(importedRecords, 200)) {
      const mappings = await prisma.externalIdMap.findMany({
        where: {
          companyId,
          provider: run.provider,
          OR: group.map((record) => ({ sourceObjectType: record.objectType, sourceRecordId: record.sourceId })),
        },
        select: { sourceObjectType: true, sourceRecordId: true, targetModel: true, targetRecordId: true },
      })
      const keys = new Set(mappings.map((mapping) => `${mapping.sourceObjectType}\u0000${mapping.sourceRecordId}\u0000${mapping.targetModel}\u0000${mapping.targetRecordId}`))
      for (const record of group) {
        if (!keys.has(`${record.objectType}\u0000${record.sourceId}\u0000${record.targetModel}\u0000${record.targetRecordId}`)) missingMappings.push({ objectType: record.objectType, sourceId: record.sourceId })
        verificationIssues.push(...await reconcileImportedTarget(record, companyId, run.provider))
      }
    }
    if (missingMappings.length) {
      verificationIssues.push({
        severity: "ERROR",
        code: "VERIFY_EXTERNAL_ID_MAP_MISSING",
        message: `${missingMappings.length} enregistrement${missingMappings.length > 1 ? "s" : ""} importé${missingMappings.length > 1 ? "s" : ""} n’a pas de correspondance d’identifiant source.`,
        details: { samples: missingMappings.slice(0, 20) },
      })
    }

    let verifiedDocuments = 0
    for (const document of run.documents) {
      try {
        const bytes = await readMigrationArtifact(document.storageKey)
        const sha256 = createHash("sha256").update(bytes).digest("hex")
        if (sha256 !== document.sha256 || bytes.byteLength !== document.size) {
          verificationIssues.push({
            severity: "ERROR",
            code: "VERIFY_DOCUMENT_INTEGRITY_MISMATCH",
            message: `L’archive ${document.fileName} ne correspond plus à son manifeste.`,
            details: { documentId: document.id, expectedSha256: document.sha256, actualSha256: sha256, expectedSize: document.size, actualSize: bytes.byteLength },
          })
        } else verifiedDocuments += 1
      } catch (error) {
        verificationIssues.push({
          severity: "ERROR",
          code: "VERIFY_DOCUMENT_UNREADABLE",
          message: `L’archive ${document.fileName} est illisible : ${error instanceof Error ? error.message : "erreur inconnue"}`,
          details: { documentId: document.id },
        })
      }
    }

    const blocking = verificationIssues.filter((issue) => issue.severity === "ERROR").length
    const verifiedAt = new Date()
    const evidence = {
      runId: run.id,
      provider: run.provider,
      records: run.records.length,
      imported: importedMetricCount,
      rejected: rejectedCount,
      excluded: run.metrics.reduce((sum, metric) => sum + metric.excluded, 0),
      documents: verifiedDocuments,
      documentManifestCount: run.documents.length,
      blocking,
      verifiedAt: verifiedAt.toISOString(),
    }
    const evidenceSha256 = createHash("sha256").update(JSON.stringify(evidence)).digest("hex")
    const previousSummary = run.summary && typeof run.summary === "object" && !Array.isArray(run.summary) ? run.summary : {}
    const status = blocking ? "VERIFICATION_FAILED" : "VERIFIED"
    await prisma.$transaction(async (tx) => {
      const saved = await tx.migrationRun.updateMany({
        where: { id: run.id, companyId, status: run.status, updatedAt: run.updatedAt },
        data: {
          status,
          summary: { ...previousSummary, verification: { ...evidence, evidenceSha256 } } as Prisma.InputJsonValue,
        },
      })
      if (saved.count !== 1) throw new Error("Le lot a changé pendant la vérification. Relancez le contrôle après la fin de l’opération en cours.")
      await tx.migrationIssue.deleteMany({ where: { runId: run.id, code: { startsWith: "VERIFY_" } } })
      if (verificationIssues.length) {
        await tx.migrationIssue.createMany({ data: verificationIssues.map((issue) => ({ runId: run.id, ...issue })) })
      }
    })
    revalidatePath("/dashboard/migrations")
    revalidatePath(`/dashboard/migrations/${run.id}`)
    return { success: blocking === 0, status, ...evidence, evidenceSha256 }
  }, "migration.manage")
}
