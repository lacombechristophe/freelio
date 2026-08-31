import { createHash } from "node:crypto"
import { z } from "zod"

import { PayloadTooLargeError, readBodyBytes, readJsonBody } from "@/lib/http-body"
import { confirmMigrationArtifactUpload, createMigrationArtifactUpload, migrationDirectUploadAvailable, storeMigrationArtifact } from "@/lib/migrations/storage"
import prisma from "@/lib/prisma"
import { withRouteAuth } from "@/lib/route-auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const MAX_FILE_BYTES = 250 * 1024 * 1024
const MAX_TOTAL_BYTES = 500 * 1024 * 1024
const MAX_LEGACY_BODY_BYTES = 4 * 1024 * 1024
const ALLOWED_EXTENSIONS = new Set([".csv", ".json", ".xlsx", ".xls", ".zip", ".pdf"])

const directFileSchema = z.object({
  name: z.string().trim().min(1).max(180),
  size: z.number().int().positive().max(MAX_FILE_BYTES),
  type: z.string().trim().max(120).default("application/octet-stream"),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i),
})
const directRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("presign"), files: z.array(directFileSchema).min(1).max(30) }),
  z.object({
    action: z.literal("complete"),
    files: z
      .array(directFileSchema.extend({ storageKey: z.string().trim().min(10).max(1_000) }))
      .min(1)
      .max(30),
  }),
  z.object({ action: z.literal("abort") }),
])

function extension(fileName: string) {
  const index = fileName.lastIndexOf(".")
  return index >= 0 ? fileName.slice(index).toLowerCase() : ""
}

function validateBatch(files: Array<{ name: string; size: number }>) {
  const totalBytes = files.reduce((total, file) => total + file.size, 0)
  if (totalBytes > MAX_TOTAL_BYTES || files.some((file) => file.size > MAX_FILE_BYTES)) throw new PayloadTooLargeError()
  if (files.some((file) => !ALLOWED_EXTENSIONS.has(extension(file.name)))) throw new TypeError("Formats acceptés : CSV, JSON, Excel, ZIP et PDF")
  return totalBytes
}

export async function POST(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  return withRouteAuth("migration.manage", async ({ companyId }) => {
    const { runId } = await params

    const run = await prisma.migrationRun.findFirst({
      where: { id: runId, companyId, kind: "MANUAL_ARCHIVE" },
      select: { id: true, provider: true, status: true },
    })
    if (!run) return Response.json({ error: "Lot d'import introuvable" }, { status: 404 })
    if (run.status !== "PENDING" && run.status !== "RUNNING") return Response.json({ error: "Ce lot est déjà finalisé" }, { status: 409 })

    const storedFiles: Array<{ name: string; size: number; sha256: string }> = []
    let shouldMarkFailed = false

    try {
      const contentType = request.headers.get("content-type") || ""
      if (contentType.includes("application/json")) {
        const data = directRequestSchema.parse(await readJsonBody(request, 128 * 1024))
        if (data.action === "abort") {
          await prisma.migrationRun.update({
            where: { id: run.id },
            data: { status: "FAILED", completedAt: new Date(), summary: { error: "Transfert interrompu avant confirmation" } },
          })
          return Response.json({ success: true })
        }
        const totalBytes = validateBatch(data.files)

        if (data.action === "presign") {
          if (!migrationDirectUploadAvailable()) {
            return Response.json(
              { success: true, direct: false, code: "DIRECT_UPLOAD_UNAVAILABLE" },
            )
          }
          const uploads = await Promise.all(
            data.files.map((file) =>
              createMigrationArtifactUpload({
                companyId,
                runId: run.id,
                provider: run.provider,
                fileName: file.name,
                contentType: file.type,
                size: file.size,
                sha256: file.sha256.toLowerCase(),
              }),
            ),
          )
          await prisma.migrationRun.update({
            where: { id: run.id },
            data: { status: "RUNNING", startedAt: run.status === "PENDING" ? new Date() : undefined },
          })
          return Response.json({ success: true, runId: run.id, uploads })
        }

        shouldMarkFailed = true
        for (const file of data.files) {
          const sha256 = file.sha256.toLowerCase()
          const confirmed = await confirmMigrationArtifactUpload({
            companyId,
            runId: run.id,
            provider: run.provider,
            storageKey: file.storageKey,
            expectedSize: file.size,
            expectedSha256: sha256,
          })
          storedFiles.push({ name: file.name.replace(/^.*[\\/]/, "").slice(0, 180), size: confirmed.size, sha256 })
        }

        await prisma.$transaction(async (tx) => {
          for (const [index, file] of data.files.entries()) {
            const stored = storedFiles[index]
            const sourceDocumentId = `manual:${stored.sha256}`
            await tx.documentManifest.upsert({
              where: { companyId_provider_sourceDocumentId: { companyId, provider: run.provider, sourceDocumentId } },
              update: { runId: run.id, fileName: stored.name, mimeType: file.type || null, size: stored.size, sha256: stored.sha256, storageKey: file.storageKey },
              create: {
                companyId,
                runId: run.id,
                provider: run.provider,
                sourceDocumentId,
                fileName: stored.name,
                mimeType: file.type || null,
                size: stored.size,
                sha256: stored.sha256,
                storageKey: file.storageKey,
              },
            })
          }
          await tx.migrationRun.update({
            where: { id: run.id },
            data: { status: "READY", completedAt: new Date(), summary: { files: storedFiles.length, totalBytes } },
          })
        })
        return Response.json({ success: true, runId: run.id, files: storedFiles })
      }

      // Kept for local development without R2. Production clients use the
      // signed direct-upload flow above to stay below the Vercel body limit.
      const boundedRequest = new Request(request.url, {
        method: "POST",
        headers: { "content-type": contentType },
        body: Buffer.from(await readBodyBytes(request, MAX_LEGACY_BODY_BYTES)),
      })
      const formData = await boundedRequest.formData()
      const files = formData.getAll("artifacts").filter((value): value is File => value instanceof File)
      if (!files.length) return Response.json({ error: "Ajoutez au moins un fichier" }, { status: 400 })
      if (files.length > 30) return Response.json({ error: "Maximum 30 fichiers par lot" }, { status: 413 })
      const totalBytes = validateBatch(files)
      shouldMarkFailed = true
      await prisma.migrationRun.update({ where: { id: run.id }, data: { status: "RUNNING", startedAt: new Date() } })

      for (const file of files) {
        const bytes = new Uint8Array(await file.arrayBuffer())
        const sourceDocumentId = `manual:${createHash("sha256").update(bytes).digest("hex")}`
        const stored = await storeMigrationArtifact({
          companyId,
          runId: run.id,
          provider: run.provider,
          fileName: file.name,
          bytes,
        })
        await prisma.documentManifest.upsert({
          where: { companyId_provider_sourceDocumentId: { companyId, provider: run.provider, sourceDocumentId } },
          update: { runId: run.id, fileName: stored.fileName, mimeType: file.type || null, size: stored.size, sha256: stored.sha256, storageKey: stored.storageKey },
          create: {
            companyId,
            runId: run.id,
            provider: run.provider,
            sourceDocumentId,
            fileName: stored.fileName,
            mimeType: file.type || null,
            size: stored.size,
            sha256: stored.sha256,
            storageKey: stored.storageKey,
          },
        })
        storedFiles.push({ name: stored.fileName, size: stored.size, sha256: stored.sha256 })
      }

      await prisma.migrationRun.update({
        where: { id: run.id },
        data: { status: "READY", completedAt: new Date(), summary: { files: storedFiles.length, totalBytes } },
      })
      return Response.json({ success: true, runId: run.id, files: storedFiles })
    } catch (error) {
      const message = error instanceof TypeError ? error.message : "Archivage impossible"
      if (shouldMarkFailed) {
        await prisma.migrationRun.update({
          where: { id: run.id },
          data: { status: "FAILED", completedAt: new Date(), summary: { error: message } },
        })
      }
      if (error instanceof PayloadTooLargeError) return Response.json({ error: "Archive trop volumineuse" }, { status: 413 })
      if (error instanceof TypeError) return Response.json({ error: message }, { status: 415 })
      if (error instanceof z.ZodError || error instanceof SyntaxError) return Response.json({ error: "Demande d’archivage invalide" }, { status: 400 })
      return Response.json({ error: "Archivage impossible" }, { status: 400 })
    }
  })
}
