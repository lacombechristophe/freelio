import "server-only"

import { createHash, randomUUID } from "node:crypto"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3"

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
type StoredFileKind = LocalFileKind | "generated"

export type StoredLocalFile = {
  relativePath: string
  originalName: string
  size: number
  type: string
  sha256: string
}

const filesRoot = path.resolve(process.cwd(), "data", "files")
const LOCAL_PREFIX = "local:"
const R2_PREFIX = "r2:"

type R2Config = { accountId: string; accessKeyId: string; secretAccessKey: string; bucket: string }
let cachedR2Client: S3Client | null = null

function r2Config(): R2Config | null {
  const accountId = process.env.R2_ACCOUNT_ID?.trim()
  const accessKeyId = (process.env.R2_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY)?.trim()
  const secretAccessKey = (process.env.R2_SECRET_ACCESS_KEY || process.env.R2_SECRET_KEY)?.trim()
  const bucket = process.env.R2_BUCKET_NAME?.trim()
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null
  return { accountId, accessKeyId, secretAccessKey, bucket }
}

function storageDriver() {
  const configured = process.env.FILE_STORAGE_DRIVER?.trim().toLowerCase()
  if (configured && configured !== "local" && configured !== "r2") throw new Error("FILE_STORAGE_DRIVER doit valoir local ou r2")
  if (configured === "r2" && !r2Config()) throw new Error("Configuration R2 incomplète pour les documents")
  if (configured === "local") return "local" as const
  if (r2Config()) return "r2" as const
  if (process.env.NODE_ENV === "production") throw new Error("Le stockage R2 est obligatoire en production pour les documents")
  return "local" as const
}

function r2Client(config: R2Config) {
  if (!cachedR2Client) {
    cachedR2Client = new S3Client({
      region: "auto",
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    })
  }
  return cachedR2Client
}

function safeSegment(value: string) {
  const cleaned = value.replace(/[^a-zA-Z0-9_-]/g, "")
  if (!cleaned) throw new Error("Identifiant de fichier invalide")
  return cleaned
}

function resolveInsideFilesRoot(relativePath: string) {
  const localPath = relativePath.startsWith(LOCAL_PREFIX) ? relativePath.slice(LOCAL_PREFIX.length) : relativePath
  const resolved = path.resolve(filesRoot, localPath)
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

export async function storeFileBytes(input: {
  companyId: string
  kind: StoredFileKind
  resourceId: string
  originalName: string
  type: string
  bytes: Uint8Array
}): Promise<StoredLocalFile> {
  const { companyId, kind, resourceId, originalName, type } = input
  const bytes = Buffer.from(input.bytes)
  if (bytes.length <= 0) throw new Error("Le fichier est vide")
  const sha256 = createHash("sha256").update(bytes).digest("hex")
  const objectKey = [
    safeSegment(companyId),
    kind,
    safeSegment(resourceId),
    `${randomUUID()}${safeExtension(originalName)}`,
  ].join("/")
  const driver = storageDriver()
  let relativePath: string

  if (driver === "r2") {
    const config = r2Config()
    if (!config) throw new Error("Configuration R2 indisponible")
    await r2Client(config).send(new PutObjectCommand({
      Bucket: config.bucket,
      Key: objectKey,
      Body: bytes,
      ContentType: type,
      Metadata: { sha256, company: safeSegment(companyId), resource: safeSegment(resourceId) },
    }))
    relativePath = `${R2_PREFIX}${objectKey}`
  } else {
    relativePath = `${LOCAL_PREFIX}${objectKey}`
    const absolutePath = resolveInsideFilesRoot(relativePath)
    await mkdir(path.dirname(absolutePath), { recursive: true })
    await writeFile(absolutePath, bytes, { flag: "wx" })
  }

  return {
    relativePath,
    originalName: path.basename(originalName).slice(0, 180) || "document",
    size: bytes.length,
    type,
    sha256,
  }
}

export async function storeLocalFile(input: {
  companyId: string
  kind: LocalFileKind
  resourceId: string
  file: File
}): Promise<StoredLocalFile> {
  const { file } = input
  if (file.size <= 0) throw new Error("Le fichier est vide")
  if (file.size > MAX_LOCAL_FILE_BYTES) throw new Error("Le fichier dépasse 15 Mo")
  if (!ALLOWED_MIME_TYPES.has(file.type)) throw new Error("Type de fichier non autorisé")
  return storeFileBytes({ ...input, originalName: file.name, type: file.type, bytes: new Uint8Array(await file.arrayBuffer()) })
}

export async function readLocalFile(relativePath: string) {
  if (relativePath.startsWith(R2_PREFIX)) {
    const config = r2Config()
    if (!config) throw new Error("Configuration R2 indisponible pour lire ce document")
    const response = await r2Client(config).send(new GetObjectCommand({ Bucket: config.bucket, Key: relativePath.slice(R2_PREFIX.length) }))
    if (!response.Body) throw new Error("Document R2 vide ou introuvable")
    return Buffer.from(await response.Body.transformToByteArray())
  }
  return readFile(resolveInsideFilesRoot(relativePath))
}

export async function removeLocalFile(relativePath: string) {
  if (relativePath.startsWith(R2_PREFIX)) {
    const config = r2Config()
    if (!config) throw new Error("Configuration R2 indisponible pour supprimer ce document")
    await r2Client(config).send(new DeleteObjectCommand({ Bucket: config.bucket, Key: relativePath.slice(R2_PREFIX.length) }))
    return
  }
  await rm(resolveInsideFilesRoot(relativePath), { force: true })
}

export async function listR2CompanyObjects(companyId: string) {
  const config = r2Config()
  if (!config) return []
  const prefix = `${safeSegment(companyId)}/`
  const objects: Array<{ relativePath: string; size: number }> = []
  let continuationToken: string | undefined
  do {
    const response = await r2Client(config).send(new ListObjectsV2Command({
      Bucket: config.bucket,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    }))
    for (const object of response.Contents ?? []) {
      if (!object.Key || object.Key.endsWith("/")) continue
      objects.push({ relativePath: `${R2_PREFIX}${object.Key}`, size: object.Size ?? 0 })
    }
    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined
  } while (continuationToken)
  return objects
}

export function localFilesRoot() {
  return filesRoot
}

export function resolveLocalFile(relativePath: string) {
  return resolveInsideFilesRoot(relativePath)
}
