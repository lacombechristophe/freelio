"use server"

import { createHash } from "node:crypto"
import { Prisma } from "@/generated/prisma/client"
import { revalidatePath } from "next/cache"
import { withAuth } from "@/lib/auth-wrapper"
import { parseMigrationArtifact, type MigrationParseIssue, type ParsedMigrationRecord } from "@/lib/migrations/ingest"
import { associationIds, classifySourceObject, type SourcePayload } from "@/lib/migrations/normalize"
import { readMigrationArtifact, storeMigrationArtifact } from "@/lib/migrations/storage"
import { migrationDatabase as prisma } from "@/lib/migrations/database"
import { batches } from "./batching"
import { connectionIdSchema } from "./schemas"

function pickDuplicateRecord(current: ParsedMigrationRecord, candidate: ParsedMigrationRecord) {
  if (current.checksum === candidate.checksum) return current
  const currentTime = current.sourceUpdatedAt?.valueOf() ?? 0
  const candidateTime = candidate.sourceUpdatedAt?.valueOf() ?? 0
  return candidateTime > currentTime ? candidate : current
}

export async function analyzeMigrationRun(runId: string) {
  return withAuth(async ({ companyId }) => {
    const parsedId = connectionIdSchema.parse(runId)
    const run = await prisma.migrationRun.findFirst({
      where: { id: parsedId, companyId },
      include: { documents: { orderBy: { createdAt: "asc" } }, metrics: { select: { imported: true, rejected: true, excluded: true } } },
    })
    if (!run) throw new Error("Lot de migration introuvable")
    if (!["READY", "COMPLETE", "PARTIAL", "ANALYZED"].includes(run.status) || run.metrics.some((metric) => metric.imported + metric.rejected + metric.excluded > 0)) {
      throw new Error("Ce lot est déjà importé ou finalisé")
    }
    if (!run.documents.length) throw new Error("Ce lot ne contient aucune archive")

    const claim = await prisma.migrationRun.updateMany({
      where: { id: run.id, companyId, status: run.status, updatedAt: run.updatedAt },
      data: { status: "ANALYZING", startedAt: run.startedAt ?? new Date(), completedAt: null },
    })
    if (claim.count !== 1) throw new Error("Le lot a changé pendant la préparation de l'analyse ; rechargez-le avant de réessayer")

    const records = new Map<string, ParsedMigrationRecord>()
    const issues: MigrationParseIssue[] = []
    let embeddedDocuments = 0

    try {
      for (const document of run.documents) {
        const bytes = await readMigrationArtifact(document.storageKey)
        const actualSha256 = createHash("sha256").update(bytes).digest("hex")
        if (bytes.byteLength !== document.size || actualSha256 !== document.sha256) {
          throw new Error(`L’archive ${document.fileName} ne correspond pas à son manifeste d’intégrité`)
        }
        const parsed = await parseMigrationArtifact({
          fileName: document.fileName,
          bytes,
          objectTypeHint: document.sourceObjectType ?? undefined,
        })
        issues.push(...parsed.issues)

        for (const record of parsed.records) {
          const key = `${record.objectType}\u0000${record.sourceId}`
          const existing = records.get(key)
          if (existing && existing.checksum !== record.checksum) {
            issues.push({
              severity: "WARNING",
              code: "INGEST_DUPLICATE_SOURCE_ID",
              message: `${record.objectType} / ${record.sourceId} apparaît plusieurs fois avec un contenu différent. La version la plus récente a été retenue dans la zone brute normalisée.`,
              objectType: record.objectType,
              sourceId: record.sourceId,
            })
          }
          records.set(key, existing ? pickDuplicateRecord(existing, record) : record)
        }

        for (const embedded of parsed.embeddedFiles) {
          const sha256 = createHash("sha256").update(embedded.bytes).digest("hex")
          if (sha256 === document.sha256 && embedded.fileName === document.fileName) continue
          const sourceDocumentId = `embedded:${run.id}:${document.sha256}:${createHash("sha256").update(embedded.sourcePath).digest("hex")}`
          const existing = await prisma.documentManifest.findUnique({
            where: { companyId_provider_sourceDocumentId: { companyId, provider: run.provider, sourceDocumentId } },
            select: { id: true },
          })
          if (existing) continue
          const stored = await storeMigrationArtifact({
            companyId,
            runId: run.id,
            provider: run.provider,
            fileName: embedded.fileName,
            bytes: embedded.bytes,
          })
          await prisma.documentManifest.create({
            data: {
              companyId,
              runId: run.id,
              provider: run.provider,
              sourceDocumentId,
              fileName: stored.fileName,
              mimeType: embedded.mimeType,
              size: stored.size,
              sha256: stored.sha256,
              storageKey: stored.storageKey,
            },
          })
          embeddedDocuments += 1
        }
      }

      const normalizedRecords = [...records.values()]
      for (const group of batches(normalizedRecords, 200)) {
        await prisma.$transaction(group.map((record) => prisma.sourceRecord.upsert({
          where: { runId_objectType_sourceId: { runId: run.id, objectType: record.objectType, sourceId: record.sourceId } },
          update: {
            payload: record.payload as Prisma.InputJsonValue,
            checksum: record.checksum,
            sourceCreatedAt: record.sourceCreatedAt,
            sourceUpdatedAt: record.sourceUpdatedAt,
          },
          create: {
            companyId,
            runId: run.id,
            provider: run.provider,
            objectType: record.objectType,
            sourceId: record.sourceId,
            payload: record.payload as Prisma.InputJsonValue,
            checksum: record.checksum,
            sourceCreatedAt: record.sourceCreatedAt,
            sourceUpdatedAt: record.sourceUpdatedAt,
          },
        })))
      }

      await prisma.migrationIssue.deleteMany({ where: { runId: run.id, code: { startsWith: "INGEST_" } } })
      if (issues.length) {
        await prisma.migrationIssue.createMany({
          data: issues.slice(0, 1_000).map((issue) => ({
            runId: run.id,
            severity: issue.severity,
            objectType: issue.objectType,
            sourceId: issue.sourceId,
            code: issue.code,
            message: issue.message.slice(0, 2_000),
            details: issue.details as Prisma.InputJsonValue | undefined,
          })),
        })
      }

      const counts = new Map<string, number>()
      for (const record of normalizedRecords) counts.set(record.objectType, (counts.get(record.objectType) ?? 0) + 1)
      await prisma.migrationMetric.deleteMany({ where: { runId: run.id } })
      if (counts.size) {
        await prisma.migrationMetric.createMany({
          data: [...counts.entries()].map(([objectType, count]) => ({ runId: run.id, objectType, sourceCount: count, extracted: count })),
        })
      }

      const errorCount = issues.filter((issue) => issue.severity === "ERROR").length
      const warningCount = issues.filter((issue) => issue.severity === "WARNING").length
      const status = errorCount ? "PARTIAL" : "ANALYZED"
      await prisma.migrationRun.update({
        where: { id: run.id },
        data: {
          status,
          completedAt: new Date(),
          summary: {
            sourceRecords: normalizedRecords.length,
            objectTypes: counts.size,
            documents: run.documents.length + embeddedDocuments,
            errors: errorCount,
            warnings: warningCount,
          },
        },
      })
      revalidatePath("/dashboard/migrations")
      return { success: true as const, status, records: normalizedRecords.length, objectTypes: counts.size, errors: errorCount, warnings: warningCount }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Analyse impossible"
      await prisma.migrationRun.update({
        where: { id: run.id },
        data: { status: "FAILED", completedAt: new Date(), summary: { error: message } },
      })
      revalidatePath("/dashboard/migrations")
      throw error
    }
  }, "migration.manage")
}

export async function simulateMigrationRun(runId: string) {
  return withAuth(async ({ companyId }) => {
    const parsedId = connectionIdSchema.parse(runId)
    const run = await prisma.migrationRun.findFirst({
      where: { id: parsedId, companyId },
      include: {
        records: { select: { objectType: true, payload: true } },
        issues: { where: { status: "OPEN", severity: "ERROR" }, select: { id: true } },
      },
    })
    if (!run) throw new Error("Lot de migration introuvable")
    if (!["ANALYZED", "SIMULATED"].includes(run.status)) throw new Error("Ce lot est déjà importé ou finalisé")
    if (!run.records.length) throw new Error("Analysez d'abord les archives de ce lot")
    if (run.issues.length) throw new Error("Corrigez les anomalies bloquantes avant la simulation")

    const counts: Record<ReturnType<typeof classifySourceObject>, number> = {
      CLIENT: 0,
      CONTACT: 0,
      SITE: 0,
      SUPPLIER: 0,
      PRODUCT: 0,
      WAREHOUSE: 0,
      OPPORTUNITY: 0,
      PROJECT: 0,
      EQUIPMENT: 0,
      TICKET: 0,
      INTERVENTION: 0,
      MAINTENANCE_CONTRACT: 0,
      PURCHASE_ORDER: 0,
      CUSTOMER_ORDER: 0,
      DELIVERY_NOTE: 0,
      GOODS_RECEIPT: 0,
      STOCK_RESERVATION: 0,
      STOCK_MOVEMENT: 0,
      QUOTE: 0,
      INVOICE: 0,
      LINE_ITEM: 0,
      PAYMENT: 0,
      ACTIVITY: 0,
      UNSUPPORTED: 0,
    }
    let activitiesWithoutAssociation = 0
    for (const record of run.records) {
      const kind = classifySourceObject(record.objectType)
      counts[kind] += 1
      if (kind === "ACTIVITY") {
        const payload = record.payload as SourcePayload
        if (!associationIds(payload, "company").length && !associationIds(payload, "contact").length && !associationIds(payload, "deal").length) {
          activitiesWithoutAssociation += 1
        }
      }
    }

    const previousSummary = run.summary && typeof run.summary === "object" && !Array.isArray(run.summary) ? run.summary : {}
    await prisma.migrationRun.update({
      where: { id: run.id },
      data: {
        status: "SIMULATED",
        summary: {
          ...previousSummary,
          simulation: { ...counts, activitiesWithoutAssociation },
        } as Prisma.InputJsonValue,
      },
    })
    revalidatePath("/dashboard/migrations")
    return { success: true as const, counts, activitiesWithoutAssociation }
  }, "migration.manage")
}
