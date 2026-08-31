import "server-only"

import { createHash, randomUUID } from "node:crypto"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

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

export type LocalFileKind = "client" | "expense" | "project" | "intervention"
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
  if (!/^[a-f0-9]{32}$/i.test(accountId)) return null
  if ([accessKeyId, secretAccessKey].some((value) => /^(your-|change-?me|example|placeholder)/i.test(value))) return null
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

function safeFileName(value: string) {
  return path.basename(value).replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 180) || "document"
}

function assertFileMetadata(input: { name: string; type: string; size: number; sha256?: string }) {
  if (!Number.isSafeInteger(input.size) || input.size <= 0) throw new Error("Le fichier est vide")
  if (input.size > MAX_LOCAL_FILE_BYTES) throw new Error("Le fichier dépasse 15 Mo")
  if (!ALLOWED_MIME_TYPES.has(input.type)) throw new Error("Type de fichier non autorisé")
  if (input.sha256 !== undefined && !/^[a-f0-9]{64}$/i.test(input.sha256)) throw new Error("Empreinte de fichier invalide")
}

function encodeCopySource(bucket: string, key: string) {
  return `${encodeURIComponent(bucket)}/${key.split("/").map(encodeURIComponent).join("/")}`
}

function hasExpectedSignature(type: string, bytes: Buffer) {
  if (type === "application/pdf") return bytes.subarray(0, 5).toString("ascii") === "%PDF-"
  if (type === "application/zip") return bytes[0] === 0x50 && bytes[1] === 0x4b
  if (type === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  if (type === "image/png") return bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  if (type === "image/webp") return bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP"
  return true
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
  if (!hasExpectedSignature(type, bytes)) throw new Error("Le contenu du fichier ne correspond pas à son type")
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
  assertFileMetadata({ name: file.name, type: file.type, size: file.size })
  return storeFileBytes({ ...input, originalName: file.name, type: file.type, bytes: new Uint8Array(await file.arrayBuffer()) })
}

export function directFileUploadAvailable() {
  const configured = process.env.FILE_STORAGE_DRIVER?.trim().toLowerCase()
  if (configured === "local") return false
  return Boolean(r2Config())
}

export async function createDirectFileUpload(input: {
  companyId: string
  kind: LocalFileKind
  resourceId: string
  originalName: string
  type: string
  size: number
  sha256: string
}) {
  assertFileMetadata({ name: input.originalName, type: input.type, size: input.size, sha256: input.sha256 })
  if (storageDriver() !== "r2") throw new Error("L’envoi direct nécessite le stockage R2")
  const config = r2Config()
  if (!config) throw new Error("Configuration R2 indisponible")

  const safeCompanyId = safeSegment(input.companyId)
  const safeResourceId = safeSegment(input.resourceId)
  const objectName = `${randomUUID()}${safeExtension(input.originalName)}`
  const objectKey = ["_pending", safeCompanyId, input.kind, safeResourceId, objectName].join("/")
  const sha256 = input.sha256.toLowerCase()
  const metadata = { sha256, company: safeCompanyId, resource: safeResourceId, kind: input.kind }
  const command = new PutObjectCommand({
    Bucket: config.bucket,
    Key: objectKey,
    ContentLength: input.size,
    ContentType: input.type,
    Metadata: metadata,
  })
  const uploadUrl = await getSignedUrl(r2Client(config), command, { expiresIn: 15 * 60 })

  return {
    uploadUrl,
    storageKey: `${R2_PREFIX}${objectKey}`,
    headers: {
      "content-type": input.type,
      "x-amz-meta-sha256": sha256,
      "x-amz-meta-company": safeCompanyId,
      "x-amz-meta-resource": safeResourceId,
      "x-amz-meta-kind": input.kind,
    },
  }
}

export async function confirmDirectFileUpload(input: {
  companyId: string
  kind: LocalFileKind
  resourceId: string
  originalName: string
  type: string
  size: number
  sha256: string
  storageKey: string
}): Promise<StoredLocalFile> {
  assertFileMetadata({ name: input.originalName, type: input.type, size: input.size, sha256: input.sha256 })
  if (storageDriver() !== "r2") throw new Error("La confirmation directe nécessite le stockage R2")
  const config = r2Config()
  if (!config) throw new Error("Configuration R2 indisponible")
  if (!input.storageKey.startsWith(R2_PREFIX)) throw new Error("Clé de transfert invalide")

  const safeCompanyId = safeSegment(input.companyId)
  const safeResourceId = safeSegment(input.resourceId)
  const objectKey = input.storageKey.slice(R2_PREFIX.length)
  const expectedPrefix = `_pending/${safeCompanyId}/${input.kind}/${safeResourceId}/`
  if (!objectKey.startsWith(expectedPrefix)) throw new Error("Ce transfert n’appartient pas à cette ressource")

  const expectedSha256 = input.sha256.toLowerCase()
  const object = await r2Client(config).send(new HeadObjectCommand({ Bucket: config.bucket, Key: objectKey }))
  if (object.ContentLength !== input.size || object.ContentType !== input.type) throw new Error("Les caractéristiques du fichier transféré ne correspondent pas")
  if (
    object.Metadata?.sha256 !== expectedSha256 ||
    object.Metadata?.company !== safeCompanyId ||
    object.Metadata?.resource !== safeResourceId ||
    object.Metadata?.kind !== input.kind
  ) {
    throw new Error("Les métadonnées du fichier transféré ne correspondent pas")
  }

  const uploaded = await r2Client(config).send(new GetObjectCommand({ Bucket: config.bucket, Key: objectKey }))
  if (!uploaded.Body) throw new Error("Le fichier transféré est vide ou introuvable")
  const bytes = Buffer.from(await uploaded.Body.transformToByteArray())
  if (bytes.length !== input.size) throw new Error("La taille réelle du fichier ne correspond pas")
  if (createHash("sha256").update(bytes).digest("hex") !== expectedSha256) throw new Error("L’intégrité du fichier transféré est invalide")
  if (!hasExpectedSignature(input.type, bytes)) throw new Error("Le contenu du fichier ne correspond pas à son type")

  const fileName = safeFileName(input.originalName)
  const finalKey = [safeCompanyId, input.kind, safeResourceId, path.basename(objectKey)].join("/")
  await r2Client(config).send(
    new CopyObjectCommand({
      Bucket: config.bucket,
      CopySource: encodeCopySource(config.bucket, objectKey),
      Key: finalKey,
      ContentType: input.type,
      Metadata: { sha256: expectedSha256, company: safeCompanyId, resource: safeResourceId, kind: input.kind },
      MetadataDirective: "REPLACE",
    }),
  )
  await r2Client(config).send(new DeleteObjectCommand({ Bucket: config.bucket, Key: objectKey })).catch(() => {})

  return {
    relativePath: `${R2_PREFIX}${finalKey}`,
    originalName: fileName,
    size: input.size,
    type: input.type,
    sha256: expectedSha256,
  }
}

export async function abortDirectFileUpload(input: {
  companyId: string
  kind: LocalFileKind
  resourceId: string
  storageKey: string
}) {
  if (!input.storageKey.startsWith(R2_PREFIX)) throw new Error("Clé de transfert invalide")
  const objectKey = input.storageKey.slice(R2_PREFIX.length)
  const expectedPrefix = `_pending/${safeSegment(input.companyId)}/${input.kind}/${safeSegment(input.resourceId)}/`
  if (!objectKey.startsWith(expectedPrefix)) throw new Error("Ce transfert n’appartient pas à cette ressource")
  const config = r2Config()
  if (!config) throw new Error("Configuration R2 indisponible")
  await r2Client(config).send(new DeleteObjectCommand({ Bucket: config.bucket, Key: objectKey }))
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
