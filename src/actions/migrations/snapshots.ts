"use server"

import { Prisma } from "@/generated/prisma/client"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { withAuth } from "@/lib/auth-wrapper"
import {
  discoverHubSpot,
  downloadHubSpotExport,
  getHubSpotExportStatus,
  startHubSpotExport,
  type HubSpotObjectType,
} from "@/lib/migrations/hubspot"
import { storeMigrationArtifact } from "@/lib/migrations/storage"
import { migrationDatabase as prisma } from "@/lib/migrations/database"
import { readCredentials } from "./credentials"
import { connectionIdSchema, providerSchema } from "./schemas"

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
          exportName: `crm-${object.objectType}-${new Date().toISOString().slice(0, 10)}`,
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

export async function refreshHubSpotSnapshot(runId: string) {
  return withAuth(async ({ companyId }) => {
    const parsedId = connectionIdSchema.parse(runId)
    const run = await prisma.migrationRun.findFirst({
      where: { id: parsedId, companyId, provider: "HUBSPOT", kind: "FULL_SNAPSHOT" },
      include: { connection: true },
    })
    if (!run?.connection) throw new Error("Migration HubSpot introuvable")
    if (!["PROCESSING", "COMPLETE", "PARTIAL", "FAILED"].includes(run.status)) {
      throw new Error("Ce lot ne peut plus être actualisé après son analyse ou son import.")
    }
    const checkpoint = checkpointSchema.parse(run.checkpoint)
    const startFailures = await prisma.migrationIssue.count({ where: { runId: run.id, code: "HUBSPOT_EXPORT_START_FAILED" } })
    const { accessToken } = readCredentials(run.connection) as { accessToken: string }

    for (const task of checkpoint.tasks) {
      if (task.downloaded || task.status === "CANCELED") continue
      try {
        const status = await getHubSpotExportStatus(accessToken, task.taskId)
        task.status = status.status
        delete task.error
        if ((status.numErrors ?? 0) > 0 || status.errors?.length) {
          task.error = "HubSpot signale des erreurs dans cet export. Vérifiez son contenu avant import."
        }
        if (status.status === "COMPLETE" && !status.result) {
          task.error = "Export terminé sans fichier téléchargeable. Actualisez à nouveau ou relancez l’export."
        }
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
    const failed = startFailures + checkpoint.tasks.filter((task) => task.status === "CANCELED" || task.error).length
    const total = checkpoint.tasks.length + startFailures
    const saved = await prisma.migrationRun.updateMany({
      where: { id: run.id, companyId, status: run.status, updatedAt: run.updatedAt },
      data: {
        checkpoint: checkpoint as unknown as Prisma.InputJsonValue,
        status: !checkpoint.tasks.length ? "FAILED" : finished ? (failed ? "PARTIAL" : "COMPLETE") : "PROCESSING",
        completedAt: finished ? new Date() : null,
        summary: { total, downloaded: checkpoint.tasks.filter((task) => task.downloaded).length, failed },
      },
    })
    if (saved.count !== 1) throw new Error("Le lot a changé pendant l’actualisation. Rechargez son état avant de réessayer.")
    revalidatePath("/dashboard/migrations")
    return { success: true as const, finished, downloaded: checkpoint.tasks.filter((task) => task.downloaded).length, total, failed }
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
