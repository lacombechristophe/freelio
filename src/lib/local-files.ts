import "server-only"

import { createHash, randomUUID } from "node:crypto"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"

export const MAX_LOCAL_FILE_BYTES = 15 * 1024 * 1024

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/json",
  "application/zip",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/csv",
  "text/plain",
])

export type LocalFileKind = "client" | "expense" | "project"

export type StoredLocalFile = {
  relativePath: string
  originalName: string
  size: number
  type: string
  sha256: string
}

const filesRoot = path.resolve(process.cwd(), "data", "files")

function safeSegment(value: string) {
  const cleaned = value.replace(/[^a-zA-Z0-9_-]/g, "")
  if (!cleaned) throw new Error("Identifiant de fichier invalide")
  return cleaned
}

function resolveInsideFilesRoot(relativePath: string) {
  const resolved = path.resolve(filesRoot, relativePath)
  const prefix = `${filesRoot}${path.sep}`
  if (resolved !== filesRoot && !resolved.startsWith(prefix)) {
    throw new Error("Chemin de fichier invalide")
  }
  return resolved
}

function safeExtension(name: string) {
  const extension = path.extname(name).toLowerCase().replace(/[^a-z0-9.]/g, "")
  return extension.slice(0, 12)
}

export async function storeLocalFile(input: {
  companyId: string
  kind: LocalFileKind
  resourceId: string
  file: File
}): Promise<StoredLocalFile> {
  const { companyId, kind, resourceId, file } = input
  if (file.size <= 0) throw new Error("Le fichier est vide")
  if (file.size > MAX_LOCAL_FILE_BYTES) throw new Error("Le fichier dépasse 15 Mo")
  if (!ALLOWED_MIME_TYPES.has(file.type)) throw new Error("Type de fichier non autorisé")

  const bytes = Buffer.from(await file.arrayBuffer())
  const sha256 = createHash("sha256").update(bytes).digest("hex")
  const relativePath = path.join(
    safeSegment(companyId),
    kind,
    safeSegment(resourceId),
    `${randomUUID()}${safeExtension(file.name)}`
  )
  const absolutePath = resolveInsideFilesRoot(relativePath)

  await mkdir(path.dirname(absolutePath), { recursive: true })
  await writeFile(absolutePath, bytes, { flag: "wx" })

  return {
    relativePath,
    originalName: path.basename(file.name).slice(0, 180) || "document",
    size: file.size,
    type: file.type,
    sha256,
  }
}

export async function readLocalFile(relativePath: string) {
  return readFile(resolveInsideFilesRoot(relativePath))
}

export async function removeLocalFile(relativePath: string) {
  await rm(resolveInsideFilesRoot(relativePath), { force: true })
}

export function localFilesRoot() {
  return filesRoot
}

export function resolveLocalFile(relativePath: string) {
  return resolveInsideFilesRoot(relativePath)
}
