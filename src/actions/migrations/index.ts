"use server"

import { createHash } from "node:crypto"
import { Prisma } from "@prisma/client"
import { revalidatePath } from "next/cache"
import { z } from "zod"

import { withAuth } from "@/lib/auth-wrapper"
import { decrypt, encrypt } from "@/lib/crypto"
import {
  discoverHubSpot,
  downloadHubSpotExport,
  getHubSpotExportStatus,
  startHubSpotExport,
  testHubSpotConnection,
  type HubSpotObjectType,
} from "@/lib/migrations/hubspot"
import { parseMigrationArtifact, type MigrationParseIssue, type ParsedMigrationRecord } from "@/lib/migrations/ingest"
import {
  activityCandidate,
  associationIds,
  classifySourceObject,
  clientCandidate,
  contactCandidate,
  customerOrderCandidate,
  deliveryNoteCandidate,
  equipmentCandidate,
  goodsReceiptCandidate,
  invoiceCandidate,
  interventionCandidate,
  lineItemCandidate,
  maintenanceContractCandidate,
  opportunityCandidate,
  paymentCandidate,
  productCandidate,
  projectCandidate,
  purchaseOrderCandidate,
  quoteCandidate,
  siteCandidate,
  sourceDisplayName,
  sourceValue,
  stockMovementCandidate,
  stockReservationCandidate,
  supplierCandidate,
  ticketCandidate,
  type SourcePayload,
  warehouseCandidate,
} from "@/lib/migrations/normalize"
import { readMigrationArtifact, storeMigrationArtifact } from "@/lib/migrations/storage"
import { testExtrabatConnection, type ExtrabatConnectionConfig } from "@/lib/migrations/extrabat"
import prisma from "@/lib/prisma"

const connectionIdSchema = z.string().cuid()
const providerSchema = z.enum(["HUBSPOT", "EXTRABAT"])
const connectionSchema = z.object({
  provider: providerSchema,
  name: z.string().trim().min(2).max(80),
  apiKey: z.string().trim().min(12).max(2_000),
  baseUrl: z.string().url().optional(),
  testPath: z.string().trim().max(300).optional(),
  authHeader: z.string().trim().max(80).optional(),
  authScheme: z.string().trim().max(40).optional(),
})

type SnapshotTask = {
  objectType: HubSpotObjectType
  taskId: string
  status: "PENDING" | "PROCESSING" | "COMPLETE" | "CANCELED"
  downloaded: boolean
  propertyCount: number
  error?: string
}

const checkpointSchema = z.object({ tasks: z.array(z.object({
  objectType: z.string().min(1).max(120),
  taskId: z.string(),
  status: z.enum(["PENDING", "PROCESSING", "COMPLETE", "CANCELED"]),
  downloaded: z.boolean(),
  propertyCount: z.number().int().nonnegative(),
  error: z.string().optional(),
})) })

function encryptedCredentials(provider: "HUBSPOT" | "EXTRABAT", apiKey: string) {
  return encrypt(JSON.stringify(provider === "HUBSPOT" ? { accessToken: apiKey } : { apiKey }))
}

function readCredentials(connection: { provider: string; credentialsEncrypted: string }) {
  const parsed = JSON.parse(decrypt(connection.credentialsEncrypted)) as Record<string, unknown>
  if (connection.provider === "HUBSPOT" && typeof parsed.accessToken === "string") {
    return { accessToken: parsed.accessToken }
  }
  if (connection.provider === "EXTRABAT" && typeof parsed.apiKey === "string") {
    return { apiKey: parsed.apiKey }
  }
  throw new Error("Identifiants de connexion invalides")
}

function extrabatConfig(value: Prisma.JsonValue | null): ExtrabatConnectionConfig {
  const parsed = z.object({
    baseUrl: z.string().url(),
    testPath: z.string(),
    authHeader: z.string(),
    authScheme: z.string(),
  }).parse(value)
  return parsed
}

export async function getMigrationDashboard() {
  return withAuth(async ({ companyId }) => {
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
  return withAuth(async ({ companyId }) => {
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

export async function saveSourceConnection(data: unknown) {
  return withAuth(async ({ companyId }) => {
    const parsed = connectionSchema.safeParse(data)
    if (!parsed.success) return { success: false as const, error: "Paramètres de connexion invalides." }

    const config: Prisma.InputJsonValue = parsed.data.provider === "EXTRABAT"
      ? {
          baseUrl: parsed.data.baseUrl || "https://myextrabat.com",
          testPath: parsed.data.testPath || "/",
          authHeader: parsed.data.authHeader || "Authorization",
          authScheme: parsed.data.authScheme ?? "Bearer",
        }
      : {}

    const connection = await prisma.dataSourceConnection.upsert({
      where: { companyId_provider_name: { companyId, provider: parsed.data.provider, name: parsed.data.name } },
      update: {
        credentialsEncrypted: encryptedCredentials(parsed.data.provider, parsed.data.apiKey),
        config,
        status: "PENDING",
        lastError: null,
      },
      create: {
        companyId,
        provider: parsed.data.provider,
        name: parsed.data.name,
        credentialsEncrypted: encryptedCredentials(parsed.data.provider, parsed.data.apiKey),
        config,
      },
      select: { id: true },
    })
    revalidatePath("/dashboard/migrations")
    return { success: true as const, connectionId: connection.id }
  }, "migration.manage")
}

export async function testSourceConnection(connectionId: string) {
  return withAuth(async ({ companyId }) => {
    const parsedId = connectionIdSchema.safeParse(connectionId)
    if (!parsedId.success) return { success: false as const, error: "Connexion invalide." }
    const connection = await prisma.dataSourceConnection.findFirst({ where: { id: parsedId.data, companyId } })
    if (!connection) return { success: false as const, error: "Connexion introuvable." }

    try {
      const credentials = readCredentials(connection)
      const result = connection.provider === "HUBSPOT"
        ? await testHubSpotConnection((credentials as { accessToken: string }).accessToken)
        : await testExtrabatConnection((credentials as { apiKey: string }).apiKey, extrabatConfig(connection.config))
      await prisma.dataSourceConnection.update({
        where: { id: connection.id },
        data: { status: "ACTIVE", lastTestAt: new Date(), lastError: null },
      })
      revalidatePath("/dashboard/migrations")
      return { success: true as const, detail: result }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Connexion impossible"
      await prisma.dataSourceConnection.update({
        where: { id: connection.id },
        data: { status: "ERROR", lastTestAt: new Date(), lastError: message.slice(0, 500) },
      })
      revalidatePath("/dashboard/migrations")
      return { success: false as const, error: message }
    }
  }, "migration.manage")
}

export async function discoverSourceConnection(connectionId: string) {
  return withAuth(async ({ companyId }) => {
    const parsedId = connectionIdSchema.parse(connectionId)
    const connection = await prisma.dataSourceConnection.findFirst({ where: { id: parsedId, companyId } })
    if (!connection) throw new Error("Connexion introuvable")
    if (connection.provider !== "HUBSPOT") {
      return { success: false as const, error: "La découverte Extrabat attend la documentation d'API du compte. Utilisez les exports manuels entre-temps." }
    }

    const run = await prisma.migrationRun.create({
      data: { companyId, connectionId: connection.id, provider: "HUBSPOT", kind: "DISCOVERY", status: "RUNNING", startedAt: new Date() },
    })

    try {
      const { accessToken } = readCredentials(connection) as { accessToken: string }
      const objects = await discoverHubSpot(accessToken)
      await prisma.$transaction(async (tx) => {
        for (const object of objects) {
          const payload = object as unknown as Prisma.InputJsonValue
          await tx.sourceRecord.create({
            data: {
              companyId,
              runId: run.id,
              provider: "HUBSPOT",
              objectType: "HUBSPOT_SCHEMA",
              sourceId: object.objectType,
              payload,
              checksum: createHash("sha256").update(JSON.stringify(object)).digest("hex"),
            },
          })
          await tx.migrationMetric.create({
            data: {
              runId: run.id,
              objectType: object.objectType,
              sourceCount: object.hasRecords ? 1 : 0,
              extracted: object.accessible ? 1 : 0,
              rejected: object.accessible ? 0 : 1,
            },
          })
          if (!object.accessible) {
            await tx.migrationIssue.create({
              data: {
                runId: run.id,
                severity: "WARNING",
                objectType: object.objectType,
                code: "HUBSPOT_SCOPE_OR_OBJECT_UNAVAILABLE",
                message: object.error || "Objet HubSpot inaccessible",
              },
            })
          }
        }
        await tx.migrationRun.update({
          where: { id: run.id },
          data: {
            status: "COMPLETE",
            completedAt: new Date(),
            summary: { accessible: objects.filter((object) => object.accessible).length, total: objects.length },
          },
        })
      })
      revalidatePath("/dashboard/migrations")
      return {
        success: true as const,
        runId: run.id,
        objects: objects.map((object) => ({
          objectType: object.objectType,
          accessible: object.accessible,
          propertyCount: object.propertyCount,
          hasRecords: object.hasRecords,
          ...(object.error ? { error: object.error } : {}),
        })),
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Découverte impossible"
      await prisma.migrationRun.update({ where: { id: run.id }, data: { status: "FAILED", completedAt: new Date(), summary: { error: message } } })
      throw error
    }
  }, "migration.manage")
}

export async function startHubSpotSnapshot(connectionId: string) {
  return withAuth(async ({ companyId }) => {
    const parsedId = connectionIdSchema.parse(connectionId)
    const connection = await prisma.dataSourceConnection.findFirst({ where: { id: parsedId, companyId } })
    if (!connection || connection.provider !== "HUBSPOT") throw new Error("Connexion HubSpot introuvable")
    const { accessToken } = readCredentials(connection) as { accessToken: string }

    const discovery = await discoverHubSpot(accessToken)
    const available = discovery.filter((object) => object.accessible)
    const run = await prisma.migrationRun.create({
      data: { companyId, connectionId: connection.id, provider: "HUBSPOT", kind: "FULL_SNAPSHOT", status: "RUNNING", startedAt: new Date() },
    })

    const tasks: SnapshotTask[] = []
    for (const object of available) {
      try {
        const exportTask = await startHubSpotExport({
          accessToken,
          objectType: object.objectType,
          propertyNames: object.properties.map((property) => property.name),
          exportName: `diskoov-${object.objectType}-${new Date().toISOString().slice(0, 10)}`,
        })
        tasks.push({ objectType: object.objectType, taskId: exportTask.id, status: "PENDING", downloaded: false, propertyCount: object.propertyCount })
        await prisma.migrationMetric.create({ data: { runId: run.id, objectType: object.objectType } })
      } catch (error) {
        const message = error instanceof Error ? error.message : "Export impossible"
        await prisma.migrationIssue.create({
          data: { runId: run.id, severity: "ERROR", objectType: object.objectType, code: "HUBSPOT_EXPORT_START_FAILED", message },
        })
      }
    }

    await prisma.migrationRun.update({
      where: { id: run.id },
      data: {
        status: tasks.length ? "PROCESSING" : "FAILED",
        checkpoint: { tasks } as unknown as Prisma.InputJsonValue,
        completedAt: tasks.length ? null : new Date(),
      },
    })
    revalidatePath("/dashboard/migrations")
    return { success: tasks.length > 0, runId: run.id, taskCount: tasks.length }
  }, "migration.manage")
}

function artifactFileName(objectType: string, mimeType: string, disposition: string | null) {
  const encoded = disposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
  const plain = disposition?.match(/filename="?([^";]+)"?/i)?.[1]
  if (encoded) return decodeURIComponent(encoded)
  if (plain) return plain
  return `hubspot-${objectType}.${mimeType.includes("zip") ? "zip" : "csv"}`
}

function countCsvRows(bytes: Uint8Array, mimeType: string) {
  if (!mimeType.includes("csv") && !mimeType.includes("text")) return 0
  const text = new TextDecoder().decode(bytes)
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0)
  return Math.max(lines.length - 1, 0)
}

function batches<T>(values: T[], size: number) {
  const result: T[][] = []
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size))
  return result
}

function pickDuplicateRecord(current: ParsedMigrationRecord, candidate: ParsedMigrationRecord) {
  if (current.checksum === candidate.checksum) return current
  const currentTime = current.sourceUpdatedAt?.valueOf() ?? 0
  const candidateTime = candidate.sourceUpdatedAt?.valueOf() ?? 0
  return candidateTime > currentTime ? candidate : current
}

const IMPORT_ORDER = {
  CLIENT: 1,
  CONTACT: 2,
  SITE: 3,
  SUPPLIER: 4,
  PRODUCT: 5,
  WAREHOUSE: 6,
  OPPORTUNITY: 7,
  PROJECT: 8,
  EQUIPMENT: 9,
  TICKET: 10,
  INTERVENTION: 11,
  MAINTENANCE_CONTRACT: 12,
  PURCHASE_ORDER: 13,
  QUOTE: 14,
  CUSTOMER_ORDER: 15,
  INVOICE: 16,
  LINE_ITEM: 17,
  DELIVERY_NOTE: 18,
  GOODS_RECEIPT: 19,
  STOCK_RESERVATION: 20,
  STOCK_MOVEMENT: 21,
  PAYMENT: 22,
  ACTIVITY: 23,
  UNSUPPORTED: 24,
} as const

async function findMappedTarget(companyId: string, provider: string, sourceRecordId: string, targetModel: string, sourceObjectType?: string) {
  return prisma.externalIdMap.findFirst({
    where: { companyId, provider, sourceRecordId, targetModel, ...(sourceObjectType ? { sourceObjectType } : {}) },
    select: { id: true, targetRecordId: true },
  })
}

async function mapExternalTarget(input: {
  companyId: string
  provider: string
  sourceObjectType: string
  sourceRecordId: string
  targetModel: string
  targetRecordId: string
  sourceUpdatedAt: Date | null
}) {
  return prisma.externalIdMap.upsert({
    where: {
      companyId_provider_sourceObjectType_sourceRecordId: {
        companyId: input.companyId,
        provider: input.provider,
        sourceObjectType: input.sourceObjectType,
        sourceRecordId: input.sourceRecordId,
      },
    },
    update: {
      targetModel: input.targetModel,
      targetRecordId: input.targetRecordId,
      sourceUpdatedAt: input.sourceUpdatedAt,
    },
    create: input,
  })
}

async function mappedClientFromAssociations(companyId: string, provider: string, payload: SourcePayload) {
  for (const sourceId of associationIds(payload, "company")) {
    const mapping = await findMappedTarget(companyId, provider, sourceId, "Client")
    if (mapping) return mapping.targetRecordId
  }
  for (const sourceId of associationIds(payload, "contact")) {
    const mapping = await findMappedTarget(companyId, provider, sourceId, "Contact")
    if (!mapping) continue
    const contact = await prisma.contact.findUnique({ where: { id: mapping.targetRecordId }, select: { clientId: true } })
    if (contact) return contact.clientId
  }
  for (const sourceId of associationIds(payload, "deal")) {
    const mapping = await findMappedTarget(companyId, provider, sourceId, "Opportunity")
    if (!mapping) continue
    const opportunity = await prisma.opportunity.findUnique({ where: { id: mapping.targetRecordId }, select: { clientId: true } })
    if (opportunity) return opportunity.clientId
  }
  return null
}

async function mappedTargetFromAssociations(
  companyId: string,
  provider: string,
  payload: SourcePayload,
  association: "site" | "supplier" | "product" | "project" | "equipment" | "ticket" | "warehouse" | "quote" | "invoice" | "customerOrder" | "purchaseOrder",
  targetModel: string,
) {
  for (const sourceId of associationIds(payload, association)) {
    const mapping = await findMappedTarget(companyId, provider, sourceId, targetModel)
    if (mapping) return mapping.targetRecordId
  }
  return null
}

function migrationReference(prefix: string, sourceId: string) {
  const normalized = sourceId.trim().replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "record"
  return `${prefix}-${normalized}`.slice(0, 100)
}

function migrationCollisionNumber(base: string, provider: string, objectType: string, sourceId: string) {
  const suffix = createHash("sha256").update(`${provider}\u0000${objectType}\u0000${sourceId}`).digest("hex").slice(0, 8).toUpperCase()
  return `${base}-${provider}-${suffix}`.slice(0, 180)
}

async function ensureMigrationPipeline(companyId: string) {
  return prisma.pipeline.upsert({
    where: { companyId },
    update: {},
    create: {
      companyId,
      name: "Pipeline commercial Diskoov",
      stages: [
        { id: "PROSPECT", title: "Prospect" },
        { id: "CONTACTED", title: "Contact pris" },
        { id: "QUALIFIED", title: "Besoin qualifié" },
        { id: "SENT", title: "Devis envoyé" },
        { id: "WON", title: "Gagné" },
        { id: "LOST", title: "Perdu" },
      ],
    },
  })
}

export async function refreshHubSpotSnapshot(runId: string) {
  return withAuth(async ({ companyId }) => {
    const parsedId = connectionIdSchema.parse(runId)
    const run = await prisma.migrationRun.findFirst({
      where: { id: parsedId, companyId, provider: "HUBSPOT", kind: "FULL_SNAPSHOT" },
      include: { connection: true },
    })
    if (!run?.connection) throw new Error("Migration HubSpot introuvable")
    const checkpoint = checkpointSchema.parse(run.checkpoint)
    const { accessToken } = readCredentials(run.connection) as { accessToken: string }

    for (const task of checkpoint.tasks) {
      if (task.downloaded || task.status === "CANCELED") continue
      try {
        const status = await getHubSpotExportStatus(accessToken, task.taskId)
        task.status = status.status
        if (status.status === "COMPLETE" && status.result) {
          const download = await downloadHubSpotExport(status.result)
          const stored = await storeMigrationArtifact({
            companyId,
            runId: run.id,
            provider: "HUBSPOT",
            fileName: artifactFileName(task.objectType, download.mimeType, download.contentDisposition),
            bytes: download.bytes,
          })
          await prisma.documentManifest.upsert({
            where: { companyId_provider_sourceDocumentId: { companyId, provider: "HUBSPOT", sourceDocumentId: `export:${task.taskId}` } },
            update: { ...stored, mimeType: download.mimeType, runId: run.id },
            create: {
              companyId,
              runId: run.id,
              provider: "HUBSPOT",
              sourceDocumentId: `export:${task.taskId}`,
              sourceObjectType: task.objectType,
              fileName: stored.fileName,
              mimeType: download.mimeType,
              size: stored.size,
              sha256: stored.sha256,
              storageKey: stored.storageKey,
            },
          })
          await prisma.migrationMetric.update({
            where: { runId_objectType: { runId: run.id, objectType: task.objectType } },
            data: { extracted: countCsvRows(download.bytes, download.mimeType) },
          })
          task.downloaded = true
        }
        if (status.status === "CANCELED") task.error = "Export annulé par HubSpot"
      } catch (error) {
        task.error = error instanceof Error ? error.message : "Actualisation impossible"
      }
    }

    const finished = checkpoint.tasks.every((task) => task.downloaded || task.status === "CANCELED")
    const failed = checkpoint.tasks.filter((task) => task.status === "CANCELED" || task.error).length
    await prisma.migrationRun.update({
      where: { id: run.id },
      data: {
        checkpoint: checkpoint as unknown as Prisma.InputJsonValue,
        status: finished ? (failed ? "PARTIAL" : "COMPLETE") : "PROCESSING",
        completedAt: finished ? new Date() : null,
        summary: { total: checkpoint.tasks.length, downloaded: checkpoint.tasks.filter((task) => task.downloaded).length, failed },
      },
    })
    revalidatePath("/dashboard/migrations")
    return { success: true as const, finished, downloaded: checkpoint.tasks.filter((task) => task.downloaded).length, total: checkpoint.tasks.length, failed }
  }, "migration.manage")
}

export async function analyzeMigrationRun(runId: string) {
  return withAuth(async ({ companyId }) => {
    const parsedId = connectionIdSchema.parse(runId)
    const run = await prisma.migrationRun.findFirst({
      where: { id: parsedId, companyId },
      include: { documents: { orderBy: { createdAt: "asc" } } },
    })
    if (!run) throw new Error("Lot de migration introuvable")
    if (!run.documents.length) throw new Error("Ce lot ne contient aucune archive")

    await prisma.migrationRun.update({
      where: { id: run.id },
      data: { status: "ANALYZING", startedAt: run.startedAt ?? new Date(), completedAt: null },
    })

    const records = new Map<string, ParsedMigrationRecord>()
    const issues: MigrationParseIssue[] = []
    let embeddedDocuments = 0

    try {
      for (const document of run.documents) {
        const bytes = await readMigrationArtifact(document.storageKey)
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
          const sourceDocumentId = `embedded:${document.sha256}:${createHash("sha256").update(embedded.sourcePath).digest("hex")}`
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

export async function importMigrationRun(runId: string) {
  return withAuth(async ({ companyId }) => {
    const parsedId = connectionIdSchema.parse(runId)
    const run = await prisma.migrationRun.findFirst({
      where: { id: parsedId, companyId, status: { in: ["SIMULATED", "IMPORTED", "PARTIAL"] } },
      include: { records: true },
    })
    if (!run) throw new Error("Simulez ce lot avant de l'importer")
    const runProvider = run.provider

    await prisma.migrationRun.update({ where: { id: run.id }, data: { status: "IMPORTING", completedAt: null } })
    await prisma.migrationIssue.deleteMany({ where: { runId: run.id, code: { startsWith: "IMPORT_" } } })

    const sourceRecords = [...run.records].sort((a, b) => IMPORT_ORDER[classifySourceObject(a.objectType)] - IMPORT_ORDER[classifySourceObject(b.objectType)])
    const imported = new Map<string, number>()
    const rejected = new Map<string, number>()
    const issues: Array<{ severity: "WARNING" | "ERROR"; objectType: string; sourceId: string; code: string; message: string }> = []
    let pipelineId: string | null = null
    let fallbackClientId: string | null = null
    let fallbackSiteId: string | null = null
    let fallbackSupplierId: string | null = null

    async function ensureFallbackClient() {
      if (fallbackClientId) return fallbackClientId
      const name = `À rapprocher · Migration ${runProvider}`
      const client = await prisma.client.findFirst({ where: { companyId, name }, select: { id: true } })
        ?? await prisma.client.create({ data: { companyId, name, type: "ENTERPRISE", lifecycleStage: "MIGRATION_REVIEW" }, select: { id: true } })
      fallbackClientId = client.id
      return client.id
    }

    async function ensureFallbackSite() {
      if (fallbackSiteId) return fallbackSiteId
      const clientId = await ensureFallbackClient()
      const label = `Site à rapprocher · ${runProvider}`
      const site = await prisma.customerSite.findFirst({ where: { companyId, clientId, label }, select: { id: true } })
        ?? await prisma.customerSite.create({ data: { companyId, clientId, label, address1: "Adresse à compléter", kind: "MIGRATION_REVIEW" }, select: { id: true } })
      fallbackSiteId = site.id
      return site.id
    }

    async function ensureFallbackSupplier() {
      if (fallbackSupplierId) return fallbackSupplierId
      const name = `Fournisseur à rapprocher · ${runProvider}`
      const supplier = await prisma.supplier.findFirst({ where: { companyId, name }, select: { id: true } })
        ?? await prisma.supplier.create({ data: { companyId, name, active: false }, select: { id: true } })
      fallbackSupplierId = supplier.id
      return supplier.id
    }

    try {
      for (const record of sourceRecords) {
        const kind = classifySourceObject(record.objectType)
        const payload = record.payload as SourcePayload
        let targetModel: string | null = null
        let targetRecordId: string | null = null

        if (kind === "CLIENT") {
          const candidate = clientCandidate(payload)
          const mapping = await findMappedTarget(companyId, run.provider, record.sourceId, "Client", record.objectType)
          const existing = mapping ? await prisma.client.findFirst({ where: { id: mapping.targetRecordId, companyId }, select: { id: true } }) : null
          const client = existing
            ? await prisma.client.update({ where: { id: existing.id }, data: candidate })
            : await prisma.client.create({ data: { companyId, ...candidate } })
          targetModel = "Client"
          targetRecordId = client.id

          const contact = contactCandidate(payload)
          const hasContact = Boolean(sourceValue(payload, ["firstname", "first_name", "prenom", "lastname", "last_name", "nom_de_famille", "email", "phone", "telephone", "mobilephone"]))
          if (hasContact) {
            const existingContact = await prisma.contact.findFirst({
              where: {
                clientId: client.id,
                ...(contact.email ? { email: contact.email } : { firstName: contact.firstName, lastName: contact.lastName }),
              },
              select: { id: true },
            })
            if (existingContact) await prisma.contact.update({ where: { id: existingContact.id }, data: contact })
            else await prisma.contact.create({ data: { clientId: client.id, isPrimary: true, ...contact } })
          }
        } else if (kind === "CONTACT") {
          const candidate = contactCandidate(payload)
          const mapping = await findMappedTarget(companyId, run.provider, record.sourceId, "Contact", record.objectType)
          const existing = mapping ? await prisma.contact.findFirst({ where: { id: mapping.targetRecordId, client: { companyId } }, select: { id: true, clientId: true } }) : null
          let clientId = existing?.clientId ?? await mappedClientFromAssociations(companyId, run.provider, payload)
          if (!clientId) {
            const individual = await prisma.client.create({
              data: { companyId, name: `${candidate.firstName} ${candidate.lastName}`.trim(), type: "INDIVIDUAL", lifecycleStage: candidate.lifecycleStage, customFields: payload as Prisma.InputJsonValue },
            })
            clientId = individual.id
          }
          const contact = existing
            ? await prisma.contact.update({ where: { id: existing.id }, data: { ...candidate, clientId } })
            : await prisma.contact.create({ data: { clientId, isPrimary: true, ...candidate } })
          targetModel = "Contact"
          targetRecordId = contact.id
        } else if (kind === "SITE") {
          const candidate = siteCandidate(payload)
          const mapping = await findMappedTarget(companyId, run.provider, record.sourceId, "CustomerSite", record.objectType)
          const existing = mapping ? await prisma.customerSite.findFirst({ where: { id: mapping.targetRecordId, companyId }, select: { id: true, clientId: true } }) : null
          const mappedClientId = existing?.clientId ?? await mappedClientFromAssociations(companyId, run.provider, payload)
          const clientId = mappedClientId ?? await ensureFallbackClient()
          if (!mappedClientId) issues.push({ severity: "WARNING", objectType: record.objectType, sourceId: record.sourceId, code: "IMPORT_SITE_WITHOUT_CLIENT", message: "Site rattaché au client de contrôle faute d’association source." })
          const site = existing
            ? await prisma.customerSite.update({ where: { id: existing.id }, data: { ...candidate, clientId } })
            : await prisma.customerSite.create({ data: { companyId, clientId, ...candidate } })
          targetModel = "CustomerSite"
          targetRecordId = site.id
        } else if (kind === "SUPPLIER") {
          const candidate = supplierCandidate(payload)
          const mapping = await findMappedTarget(companyId, run.provider, record.sourceId, "Supplier", record.objectType)
          const existing = mapping ? await prisma.supplier.findFirst({ where: { id: mapping.targetRecordId, companyId }, select: { id: true } }) : null
          const supplier = existing
            ? await prisma.supplier.update({ where: { id: existing.id }, data: candidate })
            : await prisma.supplier.upsert({ where: { companyId_name: { companyId, name: candidate.name } }, update: candidate, create: { companyId, ...candidate } })
          targetModel = "Supplier"
          targetRecordId = supplier.id
        } else if (kind === "PRODUCT") {
          const candidate = productCandidate(payload, migrationReference(run.provider, record.sourceId))
          const supplierId = await mappedTargetFromAssociations(companyId, run.provider, payload, "supplier", "Supplier")
          const mapping = await findMappedTarget(companyId, run.provider, record.sourceId, "Product", record.objectType)
          const existing = mapping ? await prisma.product.findFirst({ where: { id: mapping.targetRecordId, companyId }, select: { id: true } }) : null
          const product = existing
            ? await prisma.product.update({ where: { id: existing.id }, data: { ...candidate, supplierId } })
            : await prisma.product.upsert({ where: { companyId_sku: { companyId, sku: candidate.sku } }, update: { ...candidate, supplierId }, create: { companyId, supplierId, ...candidate } })
          targetModel = "Product"
          targetRecordId = product.id
        } else if (kind === "WAREHOUSE") {
          const candidate = warehouseCandidate(payload, migrationReference("DEPOT", record.sourceId))
          const mapping = await findMappedTarget(companyId, run.provider, record.sourceId, "Warehouse", record.objectType)
          const existing = mapping ? await prisma.warehouse.findFirst({ where: { id: mapping.targetRecordId, companyId }, select: { id: true } }) : null
          const warehouse = existing
            ? await prisma.warehouse.update({ where: { id: existing.id }, data: candidate })
            : await prisma.warehouse.upsert({ where: { companyId_code: { companyId, code: candidate.code } }, update: candidate, create: { companyId, ...candidate } })
          targetModel = "Warehouse"
          targetRecordId = warehouse.id
        } else if (kind === "OPPORTUNITY") {
          const candidate = opportunityCandidate(payload)
          const mapping = await findMappedTarget(companyId, run.provider, record.sourceId, "Opportunity", record.objectType)
          const existing = mapping ? await prisma.opportunity.findFirst({ where: { id: mapping.targetRecordId, pipeline: { companyId } }, select: { id: true, clientId: true } }) : null
          let clientId = existing?.clientId ?? await mappedClientFromAssociations(companyId, run.provider, payload)
          if (!clientId) {
            const placeholder = await prisma.client.create({ data: { companyId, name: `À rapprocher · ${sourceDisplayName(payload)}`, type: "ENTERPRISE", customFields: payload as Prisma.InputJsonValue } })
            clientId = placeholder.id
            issues.push({ severity: "WARNING", objectType: record.objectType, sourceId: record.sourceId, code: "IMPORT_DEAL_WITHOUT_CLIENT", message: "Affaire importée dans un client provisoire faute d'association source." })
          }
          if (!pipelineId) pipelineId = (await ensureMigrationPipeline(companyId)).id
          const opportunity = existing
            ? await prisma.opportunity.update({ where: { id: existing.id }, data: { ...candidate, clientId, pipelineId } })
            : await prisma.opportunity.create({ data: { ...candidate, clientId, pipelineId } })
          targetModel = "Opportunity"
          targetRecordId = opportunity.id
        } else if (kind === "PROJECT") {
          const candidate = projectCandidate(payload)
          const mapping = await findMappedTarget(companyId, run.provider, record.sourceId, "Project", record.objectType)
          const existing = mapping ? await prisma.project.findFirst({ where: { id: mapping.targetRecordId, companyId }, select: { id: true, clientId: true } }) : null
          const mappedClientId = existing?.clientId ?? await mappedClientFromAssociations(companyId, run.provider, payload)
          const clientId = mappedClientId ?? await ensureFallbackClient()
          const siteId = await mappedTargetFromAssociations(companyId, run.provider, payload, "site", "CustomerSite")
          if (!mappedClientId) issues.push({ severity: "WARNING", objectType: record.objectType, sourceId: record.sourceId, code: "IMPORT_PROJECT_WITHOUT_CLIENT", message: "Chantier rattaché au client de contrôle faute d’association source." })
          const project = existing
            ? await prisma.project.update({ where: { id: existing.id }, data: { ...candidate, clientId, siteId } })
            : await prisma.project.create({ data: { companyId, clientId, siteId, ...candidate } })
          targetModel = "Project"
          targetRecordId = project.id
        } else if (kind === "EQUIPMENT") {
          const candidate = equipmentCandidate(payload)
          const mapping = await findMappedTarget(companyId, run.provider, record.sourceId, "Equipment", record.objectType)
          const existing = mapping ? await prisma.equipment.findFirst({ where: { id: mapping.targetRecordId, companyId }, select: { id: true, siteId: true } }) : null
          let siteId = existing?.siteId ?? await mappedTargetFromAssociations(companyId, run.provider, payload, "site", "CustomerSite")
          if (!siteId) {
            const clientId = await mappedClientFromAssociations(companyId, run.provider, payload)
            if (clientId) siteId = (await prisma.customerSite.findFirst({ where: { companyId, clientId }, select: { id: true } }))?.id ?? null
          }
          if (!siteId) {
            siteId = await ensureFallbackSite()
            issues.push({ severity: "WARNING", objectType: record.objectType, sourceId: record.sourceId, code: "IMPORT_EQUIPMENT_WITHOUT_SITE", message: "Équipement rattaché au site de contrôle faute d’association source." })
          }
          const productId = await mappedTargetFromAssociations(companyId, run.provider, payload, "product", "Product")
          const equipment = existing
            ? await prisma.equipment.update({ where: { id: existing.id }, data: { ...candidate, siteId, productId } })
            : candidate.serialNumber
              ? await prisma.equipment.upsert({ where: { companyId_serialNumber: { companyId, serialNumber: candidate.serialNumber } }, update: { ...candidate, siteId, productId }, create: { companyId, siteId, productId, ...candidate } })
              : await prisma.equipment.create({ data: { companyId, siteId, productId, ...candidate } })
          targetModel = "Equipment"
          targetRecordId = equipment.id
        } else if (kind === "TICKET") {
          const candidate = ticketCandidate(payload, migrationReference("SAV", record.sourceId))
          const mapping = await findMappedTarget(companyId, run.provider, record.sourceId, "ServiceTicket", record.objectType)
          const existing = mapping ? await prisma.serviceTicket.findFirst({ where: { id: mapping.targetRecordId, companyId }, select: { id: true, clientId: true, siteId: true, equipmentId: true } }) : null
          if (!existing && await prisma.serviceTicket.findFirst({ where: { companyId, number: candidate.number }, select: { id: true } })) {
            candidate.number = migrationCollisionNumber(candidate.number, run.provider, record.objectType, record.sourceId)
            issues.push({ severity: "WARNING", objectType: record.objectType, sourceId: record.sourceId, code: "IMPORT_NUMBER_COLLISION", message: "Numéro de ticket déjà utilisé : un suffixe source stable a été ajouté sans écraser la fiche existante." })
          }
          const equipmentId = existing?.equipmentId ?? await mappedTargetFromAssociations(companyId, run.provider, payload, "equipment", "Equipment")
          const equipment = equipmentId ? await prisma.equipment.findFirst({ where: { id: equipmentId, companyId }, select: { siteId: true, site: { select: { clientId: true } } } }) : null
          const siteId = existing?.siteId ?? equipment?.siteId ?? await mappedTargetFromAssociations(companyId, run.provider, payload, "site", "CustomerSite")
          const site = siteId ? await prisma.customerSite.findFirst({ where: { id: siteId, companyId }, select: { clientId: true } }) : null
          const mappedClientId = existing?.clientId ?? site?.clientId ?? equipment?.site.clientId ?? await mappedClientFromAssociations(companyId, run.provider, payload)
          const clientId = mappedClientId ?? await ensureFallbackClient()
          if (!mappedClientId) issues.push({ severity: "WARNING", objectType: record.objectType, sourceId: record.sourceId, code: "IMPORT_TICKET_WITHOUT_CLIENT", message: "Ticket SAV rattaché au client de contrôle faute d’association source." })
          const ticket = existing
            ? await prisma.serviceTicket.update({ where: { id: existing.id }, data: { ...candidate, clientId, siteId, equipmentId } })
            : await prisma.serviceTicket.upsert({ where: { companyId_number: { companyId, number: candidate.number } }, update: { ...candidate, clientId, siteId, equipmentId }, create: { companyId, clientId, siteId, equipmentId, ...candidate } })
          targetModel = "ServiceTicket"
          targetRecordId = ticket.id
        } else if (kind === "INTERVENTION") {
          const candidate = interventionCandidate(payload)
          const mapping = await findMappedTarget(companyId, run.provider, record.sourceId, "FieldIntervention", record.objectType)
          const existing = mapping ? await prisma.fieldIntervention.findFirst({ where: { id: mapping.targetRecordId, companyId }, select: { id: true, siteId: true } }) : null
          const ticketId = await mappedTargetFromAssociations(companyId, run.provider, payload, "ticket", "ServiceTicket")
          const projectId = await mappedTargetFromAssociations(companyId, run.provider, payload, "project", "Project")
          let siteId = existing?.siteId ?? await mappedTargetFromAssociations(companyId, run.provider, payload, "site", "CustomerSite")
          if (!siteId && ticketId) siteId = (await prisma.serviceTicket.findFirst({ where: { id: ticketId, companyId }, select: { siteId: true } }))?.siteId ?? null
          if (!siteId && projectId) siteId = (await prisma.project.findFirst({ where: { id: projectId, companyId }, select: { siteId: true } }))?.siteId ?? null
          if (!siteId) {
            siteId = await ensureFallbackSite()
            issues.push({ severity: "WARNING", objectType: record.objectType, sourceId: record.sourceId, code: "IMPORT_INTERVENTION_WITHOUT_SITE", message: "Intervention rattachée au site de contrôle faute d’association source." })
          }
          const intervention = existing
            ? await prisma.fieldIntervention.update({ where: { id: existing.id }, data: { ...candidate, siteId, ticketId, projectId } })
            : await prisma.fieldIntervention.create({ data: { companyId, siteId, ticketId, projectId, ...candidate } })
          targetModel = "FieldIntervention"
          targetRecordId = intervention.id
        } else if (kind === "MAINTENANCE_CONTRACT") {
          const candidate = maintenanceContractCandidate(payload, migrationReference("CTR", record.sourceId))
          const mapping = await findMappedTarget(companyId, run.provider, record.sourceId, "MaintenanceContract", record.objectType)
          const existing = mapping ? await prisma.maintenanceContract.findFirst({ where: { id: mapping.targetRecordId, companyId }, select: { id: true, clientId: true, siteId: true } }) : null
          if (!existing && await prisma.maintenanceContract.findFirst({ where: { companyId, number: candidate.number }, select: { id: true } })) {
            candidate.number = migrationCollisionNumber(candidate.number, run.provider, record.objectType, record.sourceId)
            issues.push({ severity: "WARNING", objectType: record.objectType, sourceId: record.sourceId, code: "IMPORT_NUMBER_COLLISION", message: "Numéro de contrat déjà utilisé : un suffixe source stable a été ajouté sans écraser la fiche existante." })
          }
          let siteId = existing?.siteId ?? await mappedTargetFromAssociations(companyId, run.provider, payload, "site", "CustomerSite")
          if (!siteId) siteId = await ensureFallbackSite()
          const site = await prisma.customerSite.findFirstOrThrow({ where: { id: siteId, companyId }, select: { clientId: true } })
          const mappedClientId = existing?.clientId ?? await mappedClientFromAssociations(companyId, run.provider, payload)
          const clientId = mappedClientId ?? site.clientId
          if (!mappedClientId) issues.push({ severity: "WARNING", objectType: record.objectType, sourceId: record.sourceId, code: "IMPORT_CONTRACT_WITHOUT_CLIENT", message: "Contrat rattaché au client du site faute d’association source explicite." })
          const contract = existing
            ? await prisma.maintenanceContract.update({ where: { id: existing.id }, data: { ...candidate, clientId, siteId } })
            : await prisma.maintenanceContract.upsert({ where: { companyId_number: { companyId, number: candidate.number } }, update: { ...candidate, clientId, siteId }, create: { companyId, clientId, siteId, ...candidate } })
          targetModel = "MaintenanceContract"
          targetRecordId = contract.id
        } else if (kind === "PURCHASE_ORDER") {
          const candidate = purchaseOrderCandidate(payload, migrationReference("ACH", record.sourceId))
          const mapping = await findMappedTarget(companyId, run.provider, record.sourceId, "PurchaseOrder", record.objectType)
          const existing = mapping ? await prisma.purchaseOrder.findFirst({ where: { id: mapping.targetRecordId, companyId }, select: { id: true, supplierId: true } }) : null
          if (!existing && await prisma.purchaseOrder.findFirst({ where: { companyId, number: candidate.number }, select: { id: true } })) {
            candidate.number = migrationCollisionNumber(candidate.number, run.provider, record.objectType, record.sourceId)
            issues.push({ severity: "WARNING", objectType: record.objectType, sourceId: record.sourceId, code: "IMPORT_NUMBER_COLLISION", message: "Numéro de commande fournisseur déjà utilisé : un suffixe source stable a été ajouté sans écraser le document existant." })
          }
          const mappedSupplierId = existing?.supplierId ?? await mappedTargetFromAssociations(companyId, run.provider, payload, "supplier", "Supplier")
          const supplierId = mappedSupplierId ?? await ensureFallbackSupplier()
          const projectId = await mappedTargetFromAssociations(companyId, run.provider, payload, "project", "Project")
          const productId = await mappedTargetFromAssociations(companyId, run.provider, payload, "product", "Product")
          if (!mappedSupplierId) issues.push({ severity: "WARNING", objectType: record.objectType, sourceId: record.sourceId, code: "IMPORT_PURCHASE_WITHOUT_SUPPLIER", message: "Commande rattachée au fournisseur de contrôle faute d’association source." })
          const order = await prisma.$transaction(async (tx) => {
            const base = existing
              ? await tx.purchaseOrder.update({ where: { id: existing.id }, data: { ...candidate, supplierId, projectId } })
              : await tx.purchaseOrder.upsert({ where: { companyId_number: { companyId, number: candidate.number } }, update: { ...candidate, supplierId, projectId }, create: { companyId, supplierId, projectId, ...candidate } })
            const sourceKey = `aggregate:${run.provider}:${record.objectType}:${record.sourceId}`
            await tx.purchaseOrderLine.upsert({
              where: { purchaseOrderId_sourceKey: { purchaseOrderId: base.id, sourceKey } },
              update: { productId, label: sourceDisplayName(payload), quantity: 1, unitPriceCents: candidate.totalHtCents },
              create: { purchaseOrderId: base.id, productId, label: sourceDisplayName(payload), quantity: 1, unitPriceCents: candidate.totalHtCents, sourceKey },
            })
            return base
          })
          targetModel = "PurchaseOrder"
          targetRecordId = order.id
        } else if (kind === "CUSTOMER_ORDER") {
          const candidate = customerOrderCandidate(payload, migrationReference("CMD", record.sourceId))
          const mapping = await findMappedTarget(companyId, run.provider, record.sourceId, "CustomerOrder", record.objectType)
          const existing = mapping ? await prisma.customerOrder.findFirst({ where: { id: mapping.targetRecordId, companyId }, select: { id: true, clientId: true } }) : null
          if (!existing && await prisma.customerOrder.findFirst({ where: { companyId, number: candidate.number }, select: { id: true } })) {
            candidate.number = migrationCollisionNumber(candidate.number, run.provider, record.objectType, record.sourceId)
            issues.push({ severity: "WARNING", objectType: record.objectType, sourceId: record.sourceId, code: "IMPORT_NUMBER_COLLISION", message: "Numéro de commande client déjà utilisé : un suffixe source stable a été ajouté sans écraser le document existant." })
          }
          const mappedClientId = existing?.clientId ?? await mappedClientFromAssociations(companyId, run.provider, payload)
          const clientId = mappedClientId ?? await ensureFallbackClient()
          const projectId = await mappedTargetFromAssociations(companyId, run.provider, payload, "project", "Project")
          let quoteId = await mappedTargetFromAssociations(companyId, run.provider, payload, "quote", "Quote")
          if (quoteId && await prisma.customerOrder.findFirst({ where: { quoteId, ...(existing ? { id: { not: existing.id } } : {}) }, select: { id: true } })) {
            quoteId = null
            issues.push({ severity: "WARNING", objectType: record.objectType, sourceId: record.sourceId, code: "IMPORT_QUOTE_ALREADY_CONVERTED", message: "Le devis associé est déjà lié à une autre commande ; la commande source a été conservée sans ce lien unique." })
          }
          const productId = await mappedTargetFromAssociations(companyId, run.provider, payload, "product", "Product")
          if (!mappedClientId) issues.push({ severity: "WARNING", objectType: record.objectType, sourceId: record.sourceId, code: "IMPORT_ORDER_WITHOUT_CLIENT", message: "Commande client rattachée au client de contrôle faute d’association source." })
          const tvaRate = candidate.totalHtCents ? Math.round(candidate.totalTvaCents / candidate.totalHtCents * 10_000) / 100 : 0
          const order = await prisma.$transaction(async (tx) => {
            const data = { ...candidate, clientId, projectId, quoteId }
            const base = existing
              ? await tx.customerOrder.update({ where: { id: existing.id }, data })
              : await tx.customerOrder.create({ data: { companyId, ...data } })
            const sourceKey = `aggregate:${run.provider}:${record.objectType}:${record.sourceId}`
            await tx.customerOrderLine.upsert({
              where: { customerOrderId_sourceKey: { customerOrderId: base.id, sourceKey } },
              update: { productId, label: sourceDisplayName(payload), description: `Référence source ${run.provider} · ${record.sourceId}`, quantity: 1, unitPriceCents: candidate.totalHtCents, tvaRate },
              create: { customerOrderId: base.id, productId, label: sourceDisplayName(payload), description: `Référence source ${run.provider} · ${record.sourceId}`, quantity: 1, unitPriceCents: candidate.totalHtCents, tvaRate, sourceKey },
            })
            return base
          })
          targetModel = "CustomerOrder"
          targetRecordId = order.id
        } else if (kind === "DELIVERY_NOTE") {
          let customerOrderId = await mappedTargetFromAssociations(companyId, run.provider, payload, "customerOrder", "CustomerOrder")
          if (!customerOrderId) {
            const orderNumber = sourceValue(payload, ["order_number", "numero_commande", "commande", "customer_order"])
            if (orderNumber) customerOrderId = (await prisma.customerOrder.findFirst({ where: { companyId, number: orderNumber }, select: { id: true } }))?.id ?? null
          }
          if (!customerOrderId) {
            rejected.set(record.objectType, (rejected.get(record.objectType) ?? 0) + 1)
            issues.push({ severity: "WARNING", objectType: record.objectType, sourceId: record.sourceId, code: "IMPORT_DELIVERY_WITHOUT_ORDER", message: "Bon de livraison conservé en zone brute mais non importé : commande client source non associée." })
            continue
          }
          const orderLine = await prisma.customerOrderLine.findFirst({ where: { customerOrderId }, orderBy: { order: "asc" } })
          if (!orderLine) {
            rejected.set(record.objectType, (rejected.get(record.objectType) ?? 0) + 1)
            issues.push({ severity: "WARNING", objectType: record.objectType, sourceId: record.sourceId, code: "IMPORT_DELIVERY_WITHOUT_LINE", message: "Bon de livraison conservé en zone brute : la commande cible ne contient aucune ligne." })
            continue
          }
          const candidate = deliveryNoteCandidate(payload, migrationReference("BL", record.sourceId))
          const mapping = await findMappedTarget(companyId, run.provider, record.sourceId, "DeliveryNote", record.objectType)
          const existing = mapping ? await prisma.deliveryNote.findFirst({ where: { id: mapping.targetRecordId, companyId }, select: { id: true } }) : null
          if (!existing && await prisma.deliveryNote.findFirst({ where: { companyId, number: candidate.number }, select: { id: true } })) {
            candidate.number = migrationCollisionNumber(candidate.number, run.provider, record.objectType, record.sourceId)
            issues.push({ severity: "WARNING", objectType: record.objectType, sourceId: record.sourceId, code: "IMPORT_NUMBER_COLLISION", message: "Numéro de bon de livraison déjà utilisé : un suffixe source stable a été ajouté sans écraser le document existant." })
          }
          const delivery = await prisma.$transaction(async (tx) => {
            const { quantity, ...document } = candidate
            const base = existing
              ? await tx.deliveryNote.update({ where: { id: existing.id }, data: { ...document, customerOrderId } })
              : await tx.deliveryNote.create({ data: { companyId, customerOrderId, ...document } })
            await tx.deliveryNoteLine.deleteMany({ where: { deliveryNoteId: base.id } })
            await tx.deliveryNoteLine.create({ data: { deliveryNoteId: base.id, customerOrderLineId: orderLine.id, productId: orderLine.productId, label: orderLine.label, quantity } })
            const delivered = await tx.deliveryNoteLine.aggregate({ where: { customerOrderLineId: orderLine.id }, _sum: { quantity: true } })
            await tx.customerOrderLine.update({ where: { id: orderLine.id }, data: { deliveredQuantity: delivered._sum.quantity ?? 0 } })
            return base
          })
          targetModel = "DeliveryNote"
          targetRecordId = delivery.id
        } else if (kind === "GOODS_RECEIPT") {
          let purchaseOrderId = await mappedTargetFromAssociations(companyId, run.provider, payload, "purchaseOrder", "PurchaseOrder")
          if (!purchaseOrderId) {
            const orderNumber = sourceValue(payload, ["order_number", "numero_commande", "commande_fournisseur", "purchase_order"])
            if (orderNumber) purchaseOrderId = (await prisma.purchaseOrder.findFirst({ where: { companyId, number: orderNumber }, select: { id: true } }))?.id ?? null
          }
          const warehouseId = await mappedTargetFromAssociations(companyId, run.provider, payload, "warehouse", "Warehouse")
          const productId = await mappedTargetFromAssociations(companyId, run.provider, payload, "product", "Product")
          if (!purchaseOrderId || !warehouseId || !productId) {
            rejected.set(record.objectType, (rejected.get(record.objectType) ?? 0) + 1)
            issues.push({ severity: "WARNING", objectType: record.objectType, sourceId: record.sourceId, code: "IMPORT_RECEIPT_WITHOUT_REFERENCE", message: "Réception conservée en zone brute mais non importée : commande, dépôt ou produit non associé." })
            continue
          }
          const purchaseLine = await prisma.purchaseOrderLine.findFirst({ where: { purchaseOrderId, OR: [{ productId }, { productId: null }] }, orderBy: { order: "asc" } })
          if (!purchaseLine) {
            rejected.set(record.objectType, (rejected.get(record.objectType) ?? 0) + 1)
            issues.push({ severity: "WARNING", objectType: record.objectType, sourceId: record.sourceId, code: "IMPORT_RECEIPT_WITHOUT_LINE", message: "Réception conservée en zone brute : aucune ligne de commande fournisseur cible." })
            continue
          }
          const candidate = goodsReceiptCandidate(payload, migrationReference("REC", record.sourceId))
          const mapping = await findMappedTarget(companyId, run.provider, record.sourceId, "GoodsReceipt", record.objectType)
          const existing = mapping ? await prisma.goodsReceipt.findFirst({ where: { id: mapping.targetRecordId, companyId }, select: { id: true } }) : null
          if (!existing && await prisma.goodsReceipt.findFirst({ where: { companyId, number: candidate.number }, select: { id: true } })) {
            candidate.number = migrationCollisionNumber(candidate.number, run.provider, record.objectType, record.sourceId)
            issues.push({ severity: "WARNING", objectType: record.objectType, sourceId: record.sourceId, code: "IMPORT_NUMBER_COLLISION", message: "Numéro de réception déjà utilisé : un suffixe source stable a été ajouté sans écraser le document existant." })
          }
          const receipt = await prisma.$transaction(async (tx) => {
            const { quantity, unitCostCents, ...document } = candidate
            const base = existing
              ? await tx.goodsReceipt.update({ where: { id: existing.id }, data: { ...document, purchaseOrderId, warehouseId } })
              : await tx.goodsReceipt.create({ data: { companyId, purchaseOrderId, warehouseId, ...document } })
            await tx.goodsReceiptLine.deleteMany({ where: { goodsReceiptId: base.id } })
            await tx.goodsReceiptLine.create({ data: { goodsReceiptId: base.id, purchaseOrderLineId: purchaseLine.id, productId, quantity, unitCostCents } })
            const received = await tx.goodsReceiptLine.aggregate({ where: { purchaseOrderLineId: purchaseLine.id }, _sum: { quantity: true } })
            await tx.purchaseOrderLine.update({ where: { id: purchaseLine.id }, data: { receivedQuantity: received._sum.quantity ?? 0 } })
            const movementReference = `Réception ${base.number}`
            const movement = await tx.stockMovement.findFirst({ where: { companyId, warehouseId, productId, type: "IN", reference: movementReference }, select: { id: true } })
            if (movement) await tx.stockMovement.update({ where: { id: movement.id }, data: { quantity, unitCostCents, happenedAt: candidate.receivedAt } })
            else await tx.stockMovement.create({ data: { companyId, warehouseId, productId, type: "IN", quantity, unitCostCents, happenedAt: candidate.receivedAt, reference: movementReference } })
            const stock = await tx.stockMovement.aggregate({ where: { companyId, warehouseId, productId }, _sum: { quantity: true } })
            const quantityOnHand = Math.max(0, stock._sum.quantity ?? 0)
            const current = await tx.inventoryItem.findUnique({ where: { warehouseId_productId: { warehouseId, productId } }, select: { reservedQuantity: true } })
            await tx.inventoryItem.upsert({ where: { warehouseId_productId: { warehouseId, productId } }, update: { quantity: quantityOnHand, reservedQuantity: Math.min(quantityOnHand, current?.reservedQuantity ?? 0) }, create: { companyId, warehouseId, productId, quantity: quantityOnHand } })
            return base
          })
          targetModel = "GoodsReceipt"
          targetRecordId = receipt.id
        } else if (kind === "STOCK_RESERVATION") {
          const warehouseId = await mappedTargetFromAssociations(companyId, run.provider, payload, "warehouse", "Warehouse")
          const productId = await mappedTargetFromAssociations(companyId, run.provider, payload, "product", "Product")
          const projectId = await mappedTargetFromAssociations(companyId, run.provider, payload, "project", "Project")
          const customerOrderId = await mappedTargetFromAssociations(companyId, run.provider, payload, "customerOrder", "CustomerOrder")
          if (!warehouseId || !productId || (!projectId && !customerOrderId)) {
            rejected.set(record.objectType, (rejected.get(record.objectType) ?? 0) + 1)
            issues.push({ severity: "WARNING", objectType: record.objectType, sourceId: record.sourceId, code: "IMPORT_RESERVATION_WITHOUT_REFERENCE", message: "Réservation conservée en zone brute mais non importée : stock et dossier cible incomplets." })
            continue
          }
          const candidate = stockReservationCandidate(payload)
          const mapping = await findMappedTarget(companyId, run.provider, record.sourceId, "StockReservation", record.objectType)
          const existing = mapping ? await prisma.stockReservation.findFirst({ where: { id: mapping.targetRecordId, companyId }, select: { id: true } }) : null
          const reservation = existing
            ? await prisma.stockReservation.update({ where: { id: existing.id }, data: { ...candidate, warehouseId, productId, projectId, customerOrderId } })
            : await prisma.stockReservation.create({ data: { companyId, warehouseId, productId, projectId, customerOrderId, ...candidate } })
          const reserved = await prisma.stockReservation.aggregate({ where: { companyId, warehouseId, productId, status: "ACTIVE" }, _sum: { quantity: true } })
          const inventory = await prisma.inventoryItem.findUnique({ where: { warehouseId_productId: { warehouseId, productId } }, select: { id: true, quantity: true } })
          if (inventory) await prisma.inventoryItem.update({ where: { id: inventory.id }, data: { reservedQuantity: Math.min(inventory.quantity, reserved._sum.quantity ?? 0) } })
          targetModel = "StockReservation"
          targetRecordId = reservation.id
        } else if (kind === "STOCK_MOVEMENT") {
          const warehouseId = await mappedTargetFromAssociations(companyId, run.provider, payload, "warehouse", "Warehouse")
          const productId = await mappedTargetFromAssociations(companyId, run.provider, payload, "product", "Product")
          if (!warehouseId || !productId) {
            rejected.set(record.objectType, (rejected.get(record.objectType) ?? 0) + 1)
            issues.push({ severity: "WARNING", objectType: record.objectType, sourceId: record.sourceId, code: "IMPORT_STOCK_WITHOUT_REFERENCE", message: "Mouvement conservé en zone brute mais non importé : dépôt ou article source non associé." })
            continue
          }
          const candidate = stockMovementCandidate(payload)
          const projectId = await mappedTargetFromAssociations(companyId, run.provider, payload, "project", "Project")
          const mapping = await findMappedTarget(companyId, run.provider, record.sourceId, "StockMovement", record.objectType)
          const existing = mapping ? await prisma.stockMovement.findFirst({ where: { id: mapping.targetRecordId, companyId }, select: { id: true } }) : null
          const movement = existing
            ? await prisma.stockMovement.update({ where: { id: existing.id }, data: { ...candidate, warehouseId, productId, projectId } })
            : await prisma.stockMovement.create({ data: { companyId, warehouseId, productId, projectId, ...candidate } })
          const aggregate = await prisma.stockMovement.aggregate({ where: { companyId, warehouseId, productId }, _sum: { quantity: true } })
          const quantity = Math.max(0, aggregate._sum.quantity ?? 0)
          const currentInventory = await prisma.inventoryItem.findUnique({ where: { warehouseId_productId: { warehouseId, productId } }, select: { reservedQuantity: true } })
          const reservedQuantity = Math.min(quantity, currentInventory?.reservedQuantity ?? 0)
          await prisma.inventoryItem.upsert({
            where: { warehouseId_productId: { warehouseId, productId } },
            update: { quantity, reservedQuantity },
            create: { companyId, warehouseId, productId, quantity, reservedQuantity },
          })
          targetModel = "StockMovement"
          targetRecordId = movement.id
        } else if (kind === "QUOTE") {
          const candidate = quoteCandidate(payload, migrationReference("DEV", record.sourceId))
          const mapping = await findMappedTarget(companyId, run.provider, record.sourceId, "Quote", record.objectType)
          const existing = mapping ? await prisma.quote.findFirst({ where: { id: mapping.targetRecordId, companyId }, select: { id: true, clientId: true, currentVersion: true } }) : null
          if (!existing && await prisma.quote.findFirst({ where: { companyId, number: candidate.number }, select: { id: true } })) {
            candidate.number = migrationCollisionNumber(candidate.number, run.provider, record.objectType, record.sourceId)
            issues.push({ severity: "WARNING", objectType: record.objectType, sourceId: record.sourceId, code: "IMPORT_NUMBER_COLLISION", message: "Numéro de devis déjà utilisé : un suffixe source stable a été ajouté sans écraser le document existant." })
          }
          const mappedClientId = existing?.clientId ?? await mappedClientFromAssociations(companyId, run.provider, payload)
          const clientId = mappedClientId ?? await ensureFallbackClient()
          if (!mappedClientId) issues.push({ severity: "WARNING", objectType: record.objectType, sourceId: record.sourceId, code: "IMPORT_QUOTE_WITHOUT_CLIENT", message: "Devis rattaché au client de contrôle faute d’association source." })
          const tvaRate = candidate.totalHtCents ? Math.round(candidate.totalTvaCents / candidate.totalHtCents * 10_000) / 100 : 0
          const quote = await prisma.$transaction(async (tx) => {
            const base = existing
              ? await tx.quote.update({ where: { id: existing.id }, data: { number: candidate.number, object: candidate.object, status: candidate.status, date: candidate.date, validUntil: candidate.validUntil, clientId } })
              : await tx.quote.create({ data: { companyId, clientId, number: candidate.number, object: candidate.object, status: candidate.status, date: candidate.date, validUntil: candidate.validUntil } })
            const version = await tx.quoteVersion.findFirst({ where: { quoteId: base.id, version: base.currentVersion }, select: { id: true } })
            const versionId = version
              ? (await tx.quoteVersion.update({ where: { id: version.id }, data: { totalHtCents: candidate.totalHtCents, totalTvaCents: candidate.totalTvaCents, totalTtcCents: candidate.totalTtcCents } })).id
              : (await tx.quoteVersion.create({ data: { quoteId: base.id, version: base.currentVersion, totalHtCents: candidate.totalHtCents, totalTvaCents: candidate.totalTvaCents, totalTtcCents: candidate.totalTtcCents } })).id
            await tx.quoteSection.deleteMany({ where: { versionId } })
            await tx.quoteSection.create({
              data: {
                versionId,
                title: "Données reprises de la source",
                lines: { create: { label: candidate.object, description: `Référence source ${run.provider} · ${record.sourceId}`, quantity: 1, unitPriceCents: candidate.totalHtCents, tvaRate, sourceKey: `aggregate:${run.provider}:${record.objectType}:${record.sourceId}` } },
              },
            })
            return base
          })
          targetModel = "Quote"
          targetRecordId = quote.id
        } else if (kind === "INVOICE") {
          const candidate = invoiceCandidate(payload, migrationReference("FACT", record.sourceId))
          const mapping = await findMappedTarget(companyId, run.provider, record.sourceId, "Invoice", record.objectType)
          const existing = mapping ? await prisma.invoice.findFirst({ where: { id: mapping.targetRecordId, companyId }, select: { id: true, clientId: true } }) : null
          if (!existing && await prisma.invoice.findFirst({ where: { companyId, number: candidate.number }, select: { id: true } })) {
            candidate.number = migrationCollisionNumber(candidate.number, run.provider, record.objectType, record.sourceId)
            issues.push({ severity: "WARNING", objectType: record.objectType, sourceId: record.sourceId, code: "IMPORT_NUMBER_COLLISION", message: "Numéro de facture déjà utilisé : un suffixe source stable a été ajouté sans écraser le document existant." })
          }
          const mappedClientId = existing?.clientId ?? await mappedClientFromAssociations(companyId, run.provider, payload)
          const clientId = mappedClientId ?? await ensureFallbackClient()
          if (!mappedClientId) issues.push({ severity: "WARNING", objectType: record.objectType, sourceId: record.sourceId, code: "IMPORT_INVOICE_WITHOUT_CLIENT", message: "Facture rattachée au client de contrôle faute d’association source." })
          const tvaRate = candidate.totalHtCents ? Math.round(candidate.totalTvaCents / candidate.totalHtCents * 10_000) / 100 : 0
          const invoice = await prisma.$transaction(async (tx) => {
            const data = { ...candidate, clientId }
            const base = existing
              ? await tx.invoice.update({ where: { id: existing.id }, data })
              : await tx.invoice.create({ data: { companyId, ...data } })
            const sourceKey = `aggregate:${run.provider}:${record.objectType}:${record.sourceId}`
            await tx.invoiceLine.upsert({
              where: { invoiceId_sourceKey: { invoiceId: base.id, sourceKey } },
              update: { label: candidate.object, description: `Référence source ${run.provider} · ${record.sourceId}`, quantity: 1, unitPriceCents: candidate.totalHtCents, tvaRate },
              create: { invoiceId: base.id, label: candidate.object, description: `Référence source ${run.provider} · ${record.sourceId}`, quantity: 1, unitPriceCents: candidate.totalHtCents, tvaRate, sourceKey },
            })
            return base
          })
          targetModel = "Invoice"
          targetRecordId = invoice.id
        } else if (kind === "LINE_ITEM") {
          const candidate = lineItemCandidate(record.objectType, payload)
          const sourceKey = `${run.provider}:${record.objectType}:${record.sourceId}`
          const productId = await mappedTargetFromAssociations(companyId, run.provider, payload, "product", "Product")
          const quoteId = await mappedTargetFromAssociations(companyId, run.provider, payload, "quote", "Quote")
          const invoiceId = await mappedTargetFromAssociations(companyId, run.provider, payload, "invoice", "Invoice")
          const customerOrderId = await mappedTargetFromAssociations(companyId, run.provider, payload, "customerOrder", "CustomerOrder")
          const purchaseOrderId = await mappedTargetFromAssociations(companyId, run.provider, payload, "purchaseOrder", "PurchaseOrder")
          const createdTargets: Array<{ model: string; id: string }> = []

          if (quoteId) {
            const quote = await prisma.quote.findFirst({ where: { id: quoteId, companyId }, select: { currentVersion: true } })
            if (quote) {
              const version = await prisma.quoteVersion.findFirst({ where: { quoteId, version: quote.currentVersion }, select: { id: true } })
              if (version) {
                const section = await prisma.quoteSection.findFirst({ where: { versionId: version.id, title: "Lignes reprises de la source" }, select: { id: true } })
                  ?? await prisma.quoteSection.create({ data: { versionId: version.id, title: "Lignes reprises de la source", order: 900 }, select: { id: true } })
                const line = await prisma.quoteLine.upsert({
                  where: { sectionId_sourceKey: { sectionId: section.id, sourceKey } },
                  update: candidate,
                  create: { sectionId: section.id, sourceKey, ...candidate },
                })
                await prisma.quoteLine.deleteMany({ where: { section: { versionId: version.id }, sourceKey: { startsWith: "aggregate:" } } })
                createdTargets.push({ model: "QuoteLine", id: line.id })
              }
            }
          }

          if (invoiceId) {
            const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, companyId }, select: { id: true } })
            if (invoice) {
              const line = await prisma.invoiceLine.upsert({
                where: { invoiceId_sourceKey: { invoiceId, sourceKey } },
                update: candidate,
                create: { invoiceId, sourceKey, ...candidate },
              })
              await prisma.invoiceLine.deleteMany({ where: { invoiceId, sourceKey: { startsWith: "aggregate:" } } })
              createdTargets.push({ model: "InvoiceLine", id: line.id })
            }
          }

          if (customerOrderId) {
            const order = await prisma.customerOrder.findFirst({ where: { id: customerOrderId, companyId }, select: { id: true } })
            if (order) {
              const quantity = Math.max(1, Math.round(candidate.quantity))
              const line = await prisma.customerOrderLine.upsert({
                where: { customerOrderId_sourceKey: { customerOrderId, sourceKey } },
                update: { productId, label: candidate.label, description: candidate.description, quantity, unitPriceCents: candidate.unitPriceCents, tvaRate: candidate.tvaRate, order: candidate.order },
                create: { customerOrderId, productId, sourceKey, label: candidate.label, description: candidate.description, quantity, unitPriceCents: candidate.unitPriceCents, tvaRate: candidate.tvaRate, order: candidate.order },
              })
              await prisma.customerOrderLine.deleteMany({ where: { customerOrderId, sourceKey: { startsWith: "aggregate:" } } })
              createdTargets.push({ model: "CustomerOrderLine", id: line.id })
            }
          }

          if (purchaseOrderId) {
            const order = await prisma.purchaseOrder.findFirst({ where: { id: purchaseOrderId, companyId }, select: { id: true } })
            if (order) {
              const quantity = Math.max(1, Math.round(candidate.quantity))
              const line = await prisma.purchaseOrderLine.upsert({
                where: { purchaseOrderId_sourceKey: { purchaseOrderId, sourceKey } },
                update: { productId, label: candidate.label, quantity, unitPriceCents: candidate.unitPriceCents, order: candidate.order },
                create: { purchaseOrderId, productId, sourceKey, label: candidate.label, quantity, unitPriceCents: candidate.unitPriceCents, order: candidate.order },
              })
              await prisma.purchaseOrderLine.deleteMany({ where: { purchaseOrderId, sourceKey: { startsWith: "aggregate:" } } })
              createdTargets.push({ model: "PurchaseOrderLine", id: line.id })
            }
          }

          if (!createdTargets.length) {
            rejected.set(record.objectType, (rejected.get(record.objectType) ?? 0) + 1)
            issues.push({ severity: "WARNING", objectType: record.objectType, sourceId: record.sourceId, code: "IMPORT_LINE_WITHOUT_DOCUMENT", message: "Ligne conservée en zone brute mais non matérialisée : aucun devis, commande ou facture source associé." })
            continue
          }
          targetModel = createdTargets[0].model
          targetRecordId = createdTargets[0].id
        } else if (kind === "PAYMENT") {
          let invoiceId = await mappedTargetFromAssociations(companyId, run.provider, payload, "invoice", "Invoice")
          if (!invoiceId) {
            const invoiceNumber = sourceValue(payload, ["invoice_number", "numero_facture", "facture", "invoice"])
            if (invoiceNumber) invoiceId = (await prisma.invoice.findFirst({ where: { companyId, number: invoiceNumber }, select: { id: true } }))?.id ?? null
          }
          if (!invoiceId) {
            rejected.set(record.objectType, (rejected.get(record.objectType) ?? 0) + 1)
            issues.push({ severity: "WARNING", objectType: record.objectType, sourceId: record.sourceId, code: "IMPORT_PAYMENT_WITHOUT_INVOICE", message: "Règlement conservé en zone brute mais non importé : facture source non associée." })
            continue
          }
          const candidate = paymentCandidate(payload)
          const mapping = await findMappedTarget(companyId, run.provider, record.sourceId, "InvoicePayment", record.objectType)
          const existing = mapping ? await prisma.invoicePayment.findFirst({ where: { id: mapping.targetRecordId, invoice: { companyId } }, select: { id: true } }) : null
          const payment = existing
            ? await prisma.invoicePayment.update({ where: { id: existing.id }, data: { ...candidate, invoiceId } })
            : await prisma.invoicePayment.create({ data: { invoiceId, ...candidate } })
          const [aggregate, invoice] = await Promise.all([
            prisma.invoicePayment.aggregate({ where: { invoiceId }, _sum: { amountCents: true } }),
            prisma.invoice.findFirstOrThrow({ where: { id: invoiceId, companyId }, select: { totalTtcCents: true, paidAmountCents: true, status: true } }),
          ])
          const paidAmountCents = Math.max(invoice.paidAmountCents, aggregate._sum.amountCents ?? 0)
          await prisma.invoice.update({ where: { id: invoiceId }, data: { paidAmountCents, status: paidAmountCents >= invoice.totalTtcCents ? "PAID" : invoice.status } })
          targetModel = "InvoicePayment"
          targetRecordId = payment.id
        } else if (kind === "ACTIVITY") {
          const clientId = await mappedClientFromAssociations(companyId, run.provider, payload)
          if (!clientId) {
            rejected.set(record.objectType, (rejected.get(record.objectType) ?? 0) + 1)
            issues.push({ severity: "WARNING", objectType: record.objectType, sourceId: record.sourceId, code: "IMPORT_ACTIVITY_WITHOUT_CLIENT", message: "Activité conservée dans la zone brute mais non importée : aucun client, contact ou affaire associé." })
            continue
          }
          const candidate = activityCandidate(record.objectType, payload)
          const happenedAt = candidate.happenedAt.valueOf() === 0 ? record.sourceCreatedAt ?? record.sourceUpdatedAt ?? new Date() : candidate.happenedAt
          const mapping = await findMappedTarget(companyId, run.provider, record.sourceId, "ClientActivity", record.objectType)
          const existing = mapping ? await prisma.clientActivity.findFirst({ where: { id: mapping.targetRecordId, client: { companyId } }, select: { id: true } }) : null
          const activity = existing
            ? await prisma.clientActivity.update({ where: { id: existing.id }, data: { ...candidate, happenedAt, clientId } })
            : await prisma.clientActivity.create({ data: { ...candidate, happenedAt, clientId } })
          targetModel = "ClientActivity"
          targetRecordId = activity.id
        } else {
          rejected.set(record.objectType, (rejected.get(record.objectType) ?? 0) + 1)
          continue
        }

        if (targetModel && targetRecordId) {
          await mapExternalTarget({
            companyId,
            provider: run.provider,
            sourceObjectType: record.objectType,
            sourceRecordId: record.sourceId,
            targetModel,
            targetRecordId,
            sourceUpdatedAt: record.sourceUpdatedAt,
          })
          await prisma.sourceRecord.update({ where: { id: record.id }, data: { targetModel, targetRecordId, importedAt: new Date() } })
          imported.set(record.objectType, (imported.get(record.objectType) ?? 0) + 1)
        }
      }

      if (issues.length) await prisma.migrationIssue.createMany({ data: issues.slice(0, 1_000).map((issue) => ({ runId: run.id, ...issue })) })
      for (const metric of await prisma.migrationMetric.findMany({ where: { runId: run.id } })) {
        await prisma.migrationMetric.update({
          where: { id: metric.id },
          data: { imported: imported.get(metric.objectType) ?? 0, rejected: rejected.get(metric.objectType) ?? 0 },
        })
      }

      const importedCount = [...imported.values()].reduce((sum, count) => sum + count, 0)
      const rejectedCount = [...rejected.values()].reduce((sum, count) => sum + count, 0)
      const status = rejectedCount ? "PARTIAL" : "IMPORTED"
      await prisma.migrationRun.update({
        where: { id: run.id },
        data: { status, completedAt: new Date(), summary: { imported: importedCount, rejected: rejectedCount, warnings: issues.length } },
      })
      revalidatePath("/dashboard/migrations")
      revalidatePath("/dashboard/clients")
      revalidatePath("/dashboard/pipeline")
      revalidatePath("/dashboard/operations")
      revalidatePath("/dashboard/projets")
      return { success: true as const, status, imported: importedCount, rejected: rejectedCount, warnings: issues.length }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Import impossible"
      await prisma.migrationRun.update({ where: { id: run.id }, data: { status: "FAILED", completedAt: new Date(), summary: { error: message } } })
      revalidatePath("/dashboard/migrations")
      throw error
    }
  }, "migration.manage")
}

export async function verifyMigrationRun(runId: string) {
  return withAuth(async ({ companyId }) => {
    const parsedId = connectionIdSchema.parse(runId)
    const run = await prisma.migrationRun.findFirst({
      where: { id: parsedId, companyId, status: { in: ["IMPORTED", "PARTIAL", "VERIFIED", "VERIFICATION_FAILED"] } },
      include: {
        metrics: { orderBy: { objectType: "asc" } },
        documents: { orderBy: { createdAt: "asc" } },
        records: { select: { objectType: true, sourceId: true, targetModel: true, targetRecordId: true, importedAt: true } },
      },
    })
    if (!run) throw new Error("Import terminé introuvable")
    const accounted = run.metrics.reduce((sum, metric) => sum + metric.imported + metric.rejected + metric.excluded, 0)
    if (!accounted && run.records.length) throw new Error("Importez le lot avant de lancer la vérification")

    await prisma.migrationIssue.deleteMany({ where: { runId: run.id, code: { startsWith: "VERIFY_" } } })
    const verificationIssues: Array<{ severity: "ERROR" | "WARNING"; code: string; message: string; objectType?: string; details?: Prisma.InputJsonValue }> = []

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
        select: { sourceObjectType: true, sourceRecordId: true },
      })
      const keys = new Set(mappings.map((mapping) => `${mapping.sourceObjectType}\u0000${mapping.sourceRecordId}`))
      for (const record of group) {
        if (!keys.has(`${record.objectType}\u0000${record.sourceId}`)) missingMappings.push({ objectType: record.objectType, sourceId: record.sourceId })
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

    if (verificationIssues.length) {
      await prisma.migrationIssue.createMany({ data: verificationIssues.map((issue) => ({ runId: run.id, ...issue })) })
    }
    const blocking = verificationIssues.filter((issue) => issue.severity === "ERROR").length
    const verifiedAt = new Date()
    const evidence = {
      runId: run.id,
      provider: run.provider,
      records: run.records.length,
      imported: importedMetricCount,
      rejected: run.metrics.reduce((sum, metric) => sum + metric.rejected, 0),
      excluded: run.metrics.reduce((sum, metric) => sum + metric.excluded, 0),
      documents: verifiedDocuments,
      documentManifestCount: run.documents.length,
      blocking,
      verifiedAt: verifiedAt.toISOString(),
    }
    const evidenceSha256 = createHash("sha256").update(JSON.stringify(evidence)).digest("hex")
    const previousSummary = run.summary && typeof run.summary === "object" && !Array.isArray(run.summary) ? run.summary : {}
    const status = blocking ? "VERIFICATION_FAILED" : "VERIFIED"
    await prisma.migrationRun.update({
      where: { id: run.id },
      data: {
        status,
        summary: { ...previousSummary, verification: { ...evidence, evidenceSha256 } } as Prisma.InputJsonValue,
      },
    })
    revalidatePath("/dashboard/migrations")
    revalidatePath(`/dashboard/migrations/${run.id}`)
    return { success: blocking === 0, status, ...evidence, evidenceSha256 }
  }, "migration.manage")
}

export async function createManualImportRun(provider: "HUBSPOT" | "EXTRABAT") {
  return withAuth(async ({ companyId }) => {
    const parsedProvider = providerSchema.parse(provider)
    const run = await prisma.migrationRun.create({
      data: { companyId, provider: parsedProvider, kind: "MANUAL_ARCHIVE", status: "PENDING" },
      select: { id: true },
    })
    revalidatePath("/dashboard/migrations")
    return { success: true as const, runId: run.id }
  }, "migration.manage")
}
