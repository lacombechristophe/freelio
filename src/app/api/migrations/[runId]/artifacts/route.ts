import { createHash } from "node:crypto"

import { storeMigrationArtifact } from "@/lib/migrations/storage"
import prisma from "@/lib/prisma"
import { getRouteAuth } from "@/lib/route-auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const MAX_FILE_BYTES = 250 * 1024 * 1024
const MAX_TOTAL_BYTES = 500 * 1024 * 1024
const ALLOWED_EXTENSIONS = new Set([".csv", ".json", ".xlsx", ".xls", ".zip", ".pdf"])

function extension(fileName: string) {
  const index = fileName.lastIndexOf(".")
  return index >= 0 ? fileName.slice(index).toLowerCase() : ""
}

export async function POST(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const access = await getRouteAuth("migration.manage")
  if (!access.ok) return access.response
  const { companyId } = access.context
  const { runId } = await params

  const run = await prisma.migrationRun.findFirst({
    where: { id: runId, companyId, kind: "MANUAL_ARCHIVE" },
    select: { id: true, provider: true, status: true },
  })
  if (!run) return Response.json({ error: "Lot d'import introuvable" }, { status: 404 })
  if (run.status !== "PENDING" && run.status !== "RUNNING") return Response.json({ error: "Ce lot est déjà finalisé" }, { status: 409 })

  const formData = await request.formData()
  const files = formData.getAll("artifacts").filter((value): value is File => value instanceof File)
  if (!files.length) return Response.json({ error: "Ajoutez au moins un fichier" }, { status: 400 })
  if (files.length > 30) return Response.json({ error: "Maximum 30 fichiers par lot" }, { status: 413 })

  const totalBytes = files.reduce((total, file) => total + file.size, 0)
  if (totalBytes > MAX_TOTAL_BYTES || files.some((file) => file.size > MAX_FILE_BYTES)) {
    return Response.json({ error: "Archive trop volumineuse" }, { status: 413 })
  }
  if (files.some((file) => !ALLOWED_EXTENSIONS.has(extension(file.name)))) {
    return Response.json({ error: "Formats acceptés : CSV, JSON, Excel, ZIP et PDF" }, { status: 415 })
  }

  await prisma.migrationRun.update({ where: { id: run.id }, data: { status: "RUNNING", startedAt: new Date() } })
  const storedFiles: Array<{ name: string; size: number; sha256: string }> = []

  try {
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
    const message = error instanceof Error ? error.message : "Archivage impossible"
    await prisma.migrationRun.update({
      where: { id: run.id },
      data: { status: "FAILED", completedAt: new Date(), summary: { error: message } },
    })
    return Response.json({ error: message }, { status: 400 })
  }
}
