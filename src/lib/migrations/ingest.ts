import { createHash } from "node:crypto"

import { unzipSync } from "fflate"
import Papa from "papaparse"
import readXlsxFile from "read-excel-file/node"

const MAX_STRUCTURED_FILE_BYTES = 60 * 1024 * 1024
const MAX_UNCOMPRESSED_ARCHIVE_BYTES = 500 * 1024 * 1024
const MAX_ARCHIVE_ENTRIES = 2_000
const MAX_ROWS_PER_FILE = 250_000

const ARCHIVE_ONLY_EXTENSIONS = new Set([
  ".pdf", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".tif", ".tiff", ".heic",
  ".doc", ".docx", ".odt", ".txt", ".eml", ".msg",
])

const MIME_TYPES: Record<string, string> = {
  ".csv": "text/csv",
  ".json": "application/json",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".txt": "text/plain",
  ".eml": "message/rfc822",
}

type JsonScalar = string | number | boolean | null
export type MigrationPayload = JsonScalar | MigrationPayload[] | { [key: string]: MigrationPayload }

export type ParsedMigrationRecord = {
  objectType: string
  sourceId: string
  payload: { [key: string]: MigrationPayload }
  checksum: string
  sourceCreatedAt?: Date
  sourceUpdatedAt?: Date
}

export type EmbeddedMigrationFile = {
  sourcePath: string
  fileName: string
  mimeType: string | null
  bytes: Uint8Array
}

export type MigrationParseIssue = {
  severity: "INFO" | "WARNING" | "ERROR"
  code: string
  message: string
  objectType?: string
  sourceId?: string
  details?: { [key: string]: MigrationPayload }
}

export type MigrationParseResult = {
  records: ParsedMigrationRecord[]
  embeddedFiles: EmbeddedMigrationFile[]
  issues: MigrationParseIssue[]
}

function fileExtension(fileName: string) {
  const cleanName = fileName.split(/[?#]/, 1)[0]
  const index = cleanName.lastIndexOf(".")
  return index >= 0 ? cleanName.slice(index).toLowerCase() : ""
}

function cleanArchivePath(fileName: string) {
  return fileName.replace(/\\/g, "/").replace(/^\/+/, "")
}

function isUnsafeArchivePath(fileName: string) {
  const normalized = cleanArchivePath(fileName)
  return !normalized || normalized.split("/").some((segment) => segment === "..") || /^[a-zA-Z]:/.test(normalized)
}

function normalizeLabel(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
}

function normalizedObjectType(fileName: string, sheetName?: string) {
  const withoutExtension = fileName.replace(/\.[^.]+$/, "")
  const raw = normalizeLabel(sheetName ? `${withoutExtension}_${sheetName}` : withoutExtension)
  return (raw || "records").toUpperCase().slice(0, 100)
}

function uniqueHeaders(values: unknown[]) {
  const counts = new Map<string, number>()
  return values.map((value, index) => {
    const base = String(value ?? "").trim() || `column_${index + 1}`
    const count = (counts.get(base) ?? 0) + 1
    counts.set(base, count)
    return count === 1 ? base : `${base}_${count}`
  })
}

export type DecodedDelimitedText = {
  text: string
  encoding: "utf-8" | "utf-16le" | "utf-16be" | "windows-1252"
  usedFallback: boolean
}

/**
 * Decode exports produced by the desktop tools commonly used by pool
 * contractors.  UTF-8 is preferred, but a fatal probe prevents Windows-1252
 * bytes such as € and é from being silently replaced by U+FFFD.
 */
export function decodeDelimitedText(bytes: Uint8Array): DecodedDelimitedText {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { text: new TextDecoder("utf-16le").decode(bytes).replace(/^\uFEFF/, ""), encoding: "utf-16le", usedFallback: false }
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { text: new TextDecoder("utf-16be").decode(bytes).replace(/^\uFEFF/, ""), encoding: "utf-16be", usedFallback: false }
  }
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, ""), encoding: "utf-8", usedFallback: false }
  } catch {
    return { text: new TextDecoder("windows-1252").decode(bytes).replace(/^\uFEFF/, ""), encoding: "windows-1252", usedFallback: true }
  }
}

function jsonValue(value: unknown): MigrationPayload {
  if (value === null || value === undefined) return null
  if (value instanceof Date) return value.toISOString()
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value
  if (Array.isArray(value)) return value.map(jsonValue)
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, jsonValue(child)]))
  }
  return String(value)
}

function objectPayload(value: unknown) {
  const converted = jsonValue(value)
  if (converted && !Array.isArray(converted) && typeof converted === "object") return converted
  return { value: converted }
}

function dateFromPayload(payload: { [key: string]: MigrationPayload }, candidates: string[]) {
  const entries = new Map(Object.entries(payload).map(([key, value]) => [normalizeLabel(key), value]))
  for (const candidate of candidates) {
    const value = entries.get(candidate)
    if (typeof value !== "string" && typeof value !== "number") continue
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.valueOf())) return parsed
  }
  return undefined
}

function sourceIdFor(payload: { [key: string]: MigrationPayload }, checksum: string) {
  const entries = new Map(Object.entries(payload).map(([key, value]) => [normalizeLabel(key), value]))
  const candidates = [
    "hs_object_id", "record_id", "object_id", "source_id", "id", "identifiant",
    "numero", "number", "reference", "ref",
  ]
  for (const candidate of candidates) {
    const value = entries.get(candidate)
    if ((typeof value === "string" || typeof value === "number") && String(value).trim()) {
      return String(value).trim().slice(0, 240)
    }
  }
  return `row:${checksum}`
}

function makeRecord(objectType: string, input: unknown): ParsedMigrationRecord {
  const payload = objectPayload(input)
  const serialized = JSON.stringify(payload)
  const checksum = createHash("sha256").update(serialized).digest("hex")
  return {
    objectType,
    sourceId: sourceIdFor(payload, checksum),
    payload,
    checksum,
    sourceCreatedAt: dateFromPayload(payload, ["createdate", "created_at", "date_creation", "created"]),
    sourceUpdatedAt: dateFromPayload(payload, ["hs_lastmodifieddate", "updated_at", "date_modification", "updated", "lastmodifieddate"]),
  }
}

function rowsToRecords(rows: unknown[][], objectType: string) {
  if (!rows.length) return []
  const headers = uniqueHeaders(rows[0])
  return rows
    .slice(1, MAX_ROWS_PER_FILE + 1)
    .filter((row) => row.some((cell) => cell !== null && cell !== undefined && String(cell).trim() !== ""))
    .map((row) => makeRecord(objectType, Object.fromEntries(headers.map((header, index) => [header, row[index] ?? null]))))
}

function parseCsv(bytes: Uint8Array, fileName: string, objectTypeHint?: string): MigrationParseResult {
  if (bytes.byteLength > MAX_STRUCTURED_FILE_BYTES) {
    return {
      records: [], embeddedFiles: [],
      issues: [{ severity: "ERROR", code: "INGEST_STRUCTURED_FILE_TOO_LARGE", message: `${fileName} dépasse 60 Mo et doit être découpé avant analyse.` }],
    }
  }

  const decoded = decodeDelimitedText(bytes)
  const text = decoded.text
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: "greedy" })
  const objectType = objectTypeHint || normalizedObjectType(fileName)
  const records = rowsToRecords(parsed.data, objectType)
  const issues: MigrationParseIssue[] = decoded.usedFallback
    ? [{ severity: "WARNING", code: "INGEST_CSV_ENCODING_FALLBACK", message: `${fileName} a été décodé en Windows-1252 après échec du décodage UTF-8. Vérifiez les caractères accentués avant import.`, objectType }]
    : []
  issues.push(...parsed.errors.slice(0, 50).map((error): MigrationParseIssue => ({
    severity: "WARNING",
    code: "INGEST_CSV_PARSE_WARNING",
    message: `${fileName}, ligne ${(error.row ?? 0) + 1} : ${error.message}`,
    objectType,
  })))
  if (parsed.data.length - 1 > MAX_ROWS_PER_FILE) {
    issues.push({ severity: "ERROR", code: "INGEST_ROW_LIMIT", message: `${fileName} contient plus de ${MAX_ROWS_PER_FILE.toLocaleString("fr-FR")} lignes. Le fichier brut reste archivé mais doit être découpé.`, objectType })
  }
  return { records, embeddedFiles: [], issues }
}

function parseJson(bytes: Uint8Array, fileName: string, objectTypeHint?: string): MigrationParseResult {
  if (bytes.byteLength > MAX_STRUCTURED_FILE_BYTES) {
    return {
      records: [], embeddedFiles: [],
      issues: [{ severity: "ERROR", code: "INGEST_STRUCTURED_FILE_TOO_LARGE", message: `${fileName} dépasse 60 Mo et doit être découpé avant analyse.` }],
    }
  }
  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as unknown
    const baseType = objectTypeHint || normalizedObjectType(fileName)
    const collections: Array<{ objectType: string; values: unknown[] }> = []
    if (Array.isArray(parsed)) collections.push({ objectType: baseType, values: parsed })
    else if (parsed && typeof parsed === "object") {
      const entries = Object.entries(parsed)
      const arrays = entries.filter((entry): entry is [string, unknown[]] => Array.isArray(entry[1]))
      if (arrays.length) {
        for (const [key, values] of arrays) collections.push({ objectType: objectTypeHint || normalizedObjectType(fileName, key), values })
      } else collections.push({ objectType: baseType, values: [parsed] })
    } else collections.push({ objectType: baseType, values: [{ value: parsed }] })

    const issues: MigrationParseIssue[] = []
    const records = collections.flatMap(({ objectType, values }) => {
      if (values.length > MAX_ROWS_PER_FILE) issues.push({ severity: "ERROR", code: "INGEST_ROW_LIMIT", message: `${fileName} contient plus de ${MAX_ROWS_PER_FILE.toLocaleString("fr-FR")} objets.`, objectType })
      return values.slice(0, MAX_ROWS_PER_FILE).map((value) => makeRecord(objectType, value))
    })
    return { records, embeddedFiles: [], issues }
  } catch (error) {
    return {
      records: [], embeddedFiles: [],
      issues: [{ severity: "ERROR", code: "INGEST_INVALID_JSON", message: `${fileName} n'est pas un JSON valide : ${error instanceof Error ? error.message : "erreur inconnue"}` }],
    }
  }
}

async function parseXlsx(bytes: Uint8Array, fileName: string, objectTypeHint?: string): Promise<MigrationParseResult> {
  if (bytes.byteLength > MAX_STRUCTURED_FILE_BYTES) {
    return {
      records: [], embeddedFiles: [],
      issues: [{ severity: "ERROR", code: "INGEST_STRUCTURED_FILE_TOO_LARGE", message: `${fileName} dépasse 60 Mo et doit être découpé avant analyse.` }],
    }
  }
  try {
    const sheets = await readXlsxFile(Buffer.from(bytes))
    const issues: MigrationParseIssue[] = []
    const records = sheets.flatMap(({ sheet, data }) => {
      const objectType = objectTypeHint || normalizedObjectType(fileName, sheets.length > 1 ? sheet : undefined)
      if (data.length - 1 > MAX_ROWS_PER_FILE) issues.push({ severity: "ERROR", code: "INGEST_ROW_LIMIT", message: `${fileName} / ${sheet} contient plus de ${MAX_ROWS_PER_FILE.toLocaleString("fr-FR")} lignes.`, objectType })
      return rowsToRecords(data, objectType)
    })
    return { records, embeddedFiles: [], issues }
  } catch (error) {
    return {
      records: [], embeddedFiles: [],
      issues: [{ severity: "ERROR", code: "INGEST_INVALID_XLSX", message: `${fileName} n'est pas un classeur XLSX lisible : ${error instanceof Error ? error.message : "erreur inconnue"}` }],
    }
  }
}

function archiveFile(fileName: string, bytes: Uint8Array): MigrationParseResult {
  const extension = fileExtension(fileName)
  return {
    records: [], issues: [],
    embeddedFiles: [{ sourcePath: cleanArchivePath(fileName), fileName: cleanArchivePath(fileName).split("/").at(-1) || "document.bin", mimeType: MIME_TYPES[extension] ?? null, bytes }],
  }
}

async function parseZip(bytes: Uint8Array, fileName: string, objectTypeHint?: string): Promise<MigrationParseResult> {
  let entryCount = 0
  let uncompressedBytes = 0
  let unsafeEntries = 0
  try {
    const entries = unzipSync(bytes, {
      filter: (entry) => {
        entryCount += 1
        uncompressedBytes += entry.originalSize
        if (entryCount > MAX_ARCHIVE_ENTRIES) throw new Error(`plus de ${MAX_ARCHIVE_ENTRIES} entrées`)
        if (uncompressedBytes > MAX_UNCOMPRESSED_ARCHIVE_BYTES) throw new Error("plus de 500 Mo décompressés")
        if (entry.size > 0 && entry.originalSize / entry.size > 1_000) throw new Error("taux de compression suspect")
        if (cleanArchivePath(entry.name).endsWith("/")) return false
        if (isUnsafeArchivePath(entry.name)) {
          unsafeEntries += 1
          return false
        }
        return true
      },
    })

    const result: MigrationParseResult = { records: [], embeddedFiles: [], issues: [] }
    if (unsafeEntries) {
      result.issues.push({ severity: "ERROR", code: "INGEST_UNSAFE_ARCHIVE_PATH", message: `${fileName} contient ${unsafeEntries} chemin${unsafeEntries > 1 ? "s" : ""} dangereux, ignoré${unsafeEntries > 1 ? "s" : ""}.` })
    }
    for (const [entryName, entryBytes] of Object.entries(entries)) {
      const extension = fileExtension(entryName)
      if (extension === ".zip") {
        result.issues.push({ severity: "WARNING", code: "INGEST_NESTED_ARCHIVE", message: `${fileName} contient l'archive imbriquée ${entryName}, conservée mais non décompressée automatiquement.` })
        result.embeddedFiles.push(...archiveFile(entryName, entryBytes).embeddedFiles)
        continue
      }
      const parsed = await parseMigrationArtifact({ fileName: entryName, bytes: entryBytes, objectTypeHint })
      result.records.push(...parsed.records)
      result.issues.push(...parsed.issues)
      result.embeddedFiles.push(...parsed.embeddedFiles)
    }
    return result
  } catch (error) {
    return {
      records: [], embeddedFiles: [],
      issues: [{ severity: "ERROR", code: "INGEST_UNSAFE_OR_INVALID_ZIP", message: `${fileName} a été conservé mais pas décompressé : ${error instanceof Error ? error.message : "archive invalide"}` }],
    }
  }
}

export async function parseMigrationArtifact(input: { fileName: string; bytes: Uint8Array; objectTypeHint?: string }): Promise<MigrationParseResult> {
  const extension = fileExtension(input.fileName)
  if (extension === ".csv") return parseCsv(input.bytes, input.fileName, input.objectTypeHint)
  if (extension === ".json") return parseJson(input.bytes, input.fileName, input.objectTypeHint)
  if (extension === ".xlsx") return parseXlsx(input.bytes, input.fileName, input.objectTypeHint)
  if (extension === ".zip") return parseZip(input.bytes, input.fileName, input.objectTypeHint)
  if (extension === ".xls") {
    return {
      records: [], embeddedFiles: [],
      issues: [{ severity: "ERROR", code: "INGEST_LEGACY_XLS", message: `${input.fileName} utilise l'ancien format XLS. Exportez-le en CSV ou XLSX afin de préserver toutes les cellules.` }],
    }
  }
  if (ARCHIVE_ONLY_EXTENSIONS.has(extension)) return archiveFile(input.fileName, input.bytes)
  return {
    records: [], embeddedFiles: [],
    issues: [{ severity: "WARNING", code: "INGEST_UNSUPPORTED_FILE", message: `${input.fileName} est archivé mais son format n'est pas analysé.` }],
  }
}
