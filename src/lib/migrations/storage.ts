import "server-only"

import { createHash, randomUUID } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3"

const migrationRoot = path.resolve(process.cwd(), "data", "migrations")
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
  const configured = process.env.MIGRATION_STORAGE_DRIVER?.trim().toLowerCase()
  if (configured && configured !== "local" && configured !== "r2") throw new Error("MIGRATION_STORAGE_DRIVER doit valoir local ou r2")
  if (configured === "r2" && !r2Config()) throw new Error("Configuration R2 incomplète pour les archives de migration")
  if (configured === "local") return "local" as const
  if (r2Config()) return "r2" as const
  if (process.env.NODE_ENV === "production") throw new Error("Le stockage R2 est obligatoire en production pour les archives de migration")
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
  const result = value.replace(/[^a-zA-Z0-9_-]/g, "")
  if (!result) throw new Error("Identifiant de migration invalide")
  return result
}

function safeFileName(value: string) {
  return path.basename(value).replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 180) || "export.bin"
}

function resolveStorageKey(storageKey: string) {
  const localKey = storageKey.startsWith(LOCAL_PREFIX) ? storageKey.slice(LOCAL_PREFIX.length) : storageKey
  const absolutePath = path.resolve(migrationRoot, localKey)
  const prefix = `${migrationRoot}${path.sep}`
  if (!absolutePath.startsWith(prefix)) throw new Error("Chemin d'archive invalide")
  return absolutePath
}

export async function storeMigrationArtifact(input: {
  companyId: string
  runId: string
  provider: string
  fileName: string
  bytes: Uint8Array
}) {
  const fileName = safeFileName(input.fileName)
  const objectKey = [
    safeSegment(input.companyId),
    safeSegment(input.runId),
    safeSegment(input.provider),
    `${randomUUID()}-${fileName}`,
  ].join("/")
  const sha256 = createHash("sha256").update(input.bytes).digest("hex")
  const driver = storageDriver()
  let storageKey: string

  if (driver === "r2") {
    const config = r2Config()
    if (!config) throw new Error("Configuration R2 indisponible")
    await r2Client(config).send(new PutObjectCommand({
      Bucket: config.bucket,
      Key: objectKey,
      Body: input.bytes,
      Metadata: { sha256, company: safeSegment(input.companyId), run: safeSegment(input.runId) },
    }))
    storageKey = `${R2_PREFIX}${objectKey}`
  } else {
    storageKey = `${LOCAL_PREFIX}${objectKey}`
    const absolutePath = resolveStorageKey(storageKey)
    await mkdir(path.dirname(absolutePath), { recursive: true })
    await writeFile(absolutePath, input.bytes, { flag: "wx" })
  }

  return {
    storageKey,
    fileName,
    size: input.bytes.byteLength,
    sha256,
  }
}

export async function readMigrationArtifact(storageKey: string) {
  if (storageKey.startsWith(R2_PREFIX)) {
    const config = r2Config()
    if (!config) throw new Error("Configuration R2 indisponible pour lire cette archive")
    const response = await r2Client(config).send(new GetObjectCommand({ Bucket: config.bucket, Key: storageKey.slice(R2_PREFIX.length) }))
    if (!response.Body) throw new Error("Archive R2 vide ou introuvable")
    return Buffer.from(await response.Body.transformToByteArray())
  }
  return readFile(resolveStorageKey(storageKey))
}
