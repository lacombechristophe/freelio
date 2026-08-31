import { createHash } from "node:crypto"

export const REVERSIBILITY_SCHEMA = "crm.reversibility-export.v4" as const

export type ReversibilityTable = {
  model: string
  rows: Array<Record<string, unknown>>
}

export type ReversibilityFileReference = {
  model: string
  recordId: string
  field: string
  expectedSize?: number
  expectedSha256?: string
}

export type ReversibilityFile = {
  storageKey: string
  storage: "LOCAL" | "R2" | "EXTERNAL" | "INLINE" | "UNKNOWN"
  status: "EMBEDDED" | "EXTERNAL_REFERENCE" | "MISSING" | "CORRUPT"
  references: ReversibilityFileReference[]
  size?: number
  sha256?: string
  contentBase64?: string
  error?: string
}

export type ReversibilityExportBase = {
  schema: typeof REVERSIBILITY_SCHEMA
  exportId: string
  exportedAt: string
  scope: {
    companyId: string
    requestedByUserId: string
    kind: "COMPANY_BUSINESS_DATA"
  }
  restoration: {
    automaticRestoreSupported: false
    mode: "CONTROLLED_LOGICAL_IMPORT"
    reason: string
  }
  collectionWarnings: string[]
  tables: ReversibilityTable[]
  files: ReversibilityFile[]
}

export type ReversibilityManifest = {
  algorithm: "SHA-256"
  status: "COMPLETE" | "PARTIAL"
  payloadSha256: string
  tables: Array<{ model: string; rowCount: number; sha256: string }>
  files: {
    total: number
    embedded: number
    externalReferences: number
    missing: number
    corrupt: number
    bytesEmbedded: number
  }
  excludedModels: Array<{ model: string; reason: string }>
  warnings: string[]
}

export type ReversibilityExport = ReversibilityExportBase & {
  manifest: ReversibilityManifest
}

function canonicalValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(canonicalValue)
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalValue(nested)])
    )
  }
  return value
}

export function canonicalStringify(value: unknown) {
  return JSON.stringify(canonicalValue(value))
}

export function sha256Hex(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex")
}

export function sortRows(rows: Array<Record<string, unknown>>) {
  return [...rows].sort((left, right) => canonicalStringify(left).localeCompare(canonicalStringify(right)))
}

const SENSITIVE_EXPORT_KEYS = new Set([
  "accesstoken",
  "access_token",
  "apikey",
  "authorization",
  "credentialsencrypted",
  "mfasecretencrypted",
  "iban",
  "idtoken",
  "id_token",
  "password",
  "passwordhash",
  "refreshtoken",
  "refresh_token",
  "secret",
  "sessiontoken",
  "tokenhash",
])

/**
 * Removes bearer credentials and encrypted secrets from the portable JSON,
 * including when a source payload or audit metadata contains them deeply.
 * Business integrity hashes (proofHash, sha256, signatureSha256) are retained.
 */
export function redactSensitiveExportValues(value: unknown): unknown {
  if (value instanceof Date) return value
  if (Array.isArray(value)) return value.map(redactSensitiveExportValues)
  if (!value || typeof value !== "object") return value

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !SENSITIVE_EXPORT_KEYS.has(key.toLowerCase()))
      .map(([key, nested]) => [key, redactSensitiveExportValues(nested)]),
  )
}

function embeddedBytes(file: ReversibilityFile) {
  if (!file.contentBase64 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(file.contentBase64)) {
    return null
  }
  return Buffer.from(file.contentBase64, "base64")
}

function expectedFileMismatch(file: ReversibilityFile, size: number, sha256: string) {
  return file.references.some((reference) =>
    (reference.expectedSize !== undefined && reference.expectedSize !== size)
    || (reference.expectedSha256 !== undefined && reference.expectedSha256.toLowerCase() !== sha256)
  )
}

export function createReversibilityManifest(
  base: ReversibilityExportBase,
  excludedModels: ReversibilityManifest["excludedModels"] = []
): ReversibilityManifest {
  const tables = base.tables.map((table) => ({
    model: table.model,
    rowCount: table.rows.length,
    sha256: sha256Hex(canonicalStringify(table.rows)),
  }))
  const fileSummary = {
    total: base.files.length,
    embedded: base.files.filter((file) => file.status === "EMBEDDED").length,
    externalReferences: base.files.filter((file) => file.status === "EXTERNAL_REFERENCE").length,
    missing: base.files.filter((file) => file.status === "MISSING").length,
    corrupt: base.files.filter((file) => file.status === "CORRUPT").length,
    bytesEmbedded: base.files.reduce((total, file) => total + (file.contentBase64 ? (embeddedBytes(file)?.byteLength ?? 0) : 0), 0),
  }
  const warnings: string[] = []
  if (fileSummary.externalReferences) {
    warnings.push(`${fileSummary.externalReferences} fichier(s) externe(s) sont conservés comme références sans copie binaire.`)
  }
  if (fileSummary.missing) warnings.push(`${fileSummary.missing} fichier(s) référencé(s) sont introuvables.`)
  if (fileSummary.corrupt) warnings.push(`${fileSummary.corrupt} fichier(s) ne correspondent pas à leur taille ou empreinte enregistrée.`)
  warnings.push(...base.collectionWarnings)

  return {
    algorithm: "SHA-256",
    status: fileSummary.externalReferences || fileSummary.missing || fileSummary.corrupt || base.collectionWarnings.length ? "PARTIAL" : "COMPLETE",
    payloadSha256: sha256Hex(canonicalStringify(base)),
    tables,
    files: fileSummary,
    excludedModels,
    warnings,
  }
}

export function assembleReversibilityExport(
  base: ReversibilityExportBase,
  excludedModels: ReversibilityManifest["excludedModels"] = []
): ReversibilityExport {
  return { ...base, manifest: createReversibilityManifest(base, excludedModels) }
}

export function verifyReversibilityExport(input: unknown): {
  ok: boolean
  status?: "COMPLETE" | "PARTIAL"
  errors: string[]
  warnings: string[]
} {
  const errors: string[] = []
  const warnings: string[] = []
  if (!input || typeof input !== "object") return { ok: false, errors: ["Export invalide."], warnings }
  const payload = input as Partial<ReversibilityExport>
  if (payload.schema !== REVERSIBILITY_SCHEMA) errors.push("Schéma de réversibilité non pris en charge.")
  if (!Array.isArray(payload.tables)) errors.push("Tables logiques absentes.")
  if (!Array.isArray(payload.files)) errors.push("Inventaire de fichiers absent.")
  if (!payload.manifest || typeof payload.manifest !== "object") errors.push("Manifeste d’intégrité absent.")
  if (errors.length || !payload.manifest || !payload.tables || !payload.files) return { ok: false, errors, warnings }

  const base: ReversibilityExportBase = {
    schema: REVERSIBILITY_SCHEMA,
    exportId: String(payload.exportId ?? ""),
    exportedAt: String(payload.exportedAt ?? ""),
    scope: payload.scope as ReversibilityExportBase["scope"],
    restoration: payload.restoration as ReversibilityExportBase["restoration"],
    collectionWarnings: Array.isArray(payload.collectionWarnings) ? payload.collectionWarnings : [],
    tables: payload.tables,
    files: payload.files,
  }
  if (!base.exportId || !base.exportedAt || !base.scope?.companyId || !base.scope?.requestedByUserId) {
    errors.push("Périmètre ou identité de l’export incomplet.")
  }
  if (base.restoration?.automaticRestoreSupported !== false || base.restoration?.mode !== "CONTROLLED_LOGICAL_IMPORT") {
    errors.push("Capacité de restauration ambiguë ou invalide.")
  }
  if (payload.manifest.algorithm !== "SHA-256") errors.push("Algorithme de manifeste non pris en charge.")
  if (sha256Hex(canonicalStringify(base)) !== payload.manifest.payloadSha256) errors.push("Empreinte globale invalide.")

  const tableNames = new Set<string>()
  for (const table of base.tables) {
    if (!table || typeof table.model !== "string" || !Array.isArray(table.rows)) {
      errors.push("Entrée de table invalide.")
      continue
    }
    if (tableNames.has(table.model)) errors.push(`Table dupliquée : ${table.model}.`)
    tableNames.add(table.model)
    const expected = payload.manifest.tables.find((entry) => entry.model === table.model)
    if (!expected) {
      errors.push(`Manifeste absent pour ${table.model}.`)
      continue
    }
    if (expected.rowCount !== table.rows.length) errors.push(`Nombre de lignes invalide pour ${table.model}.`)
    if (expected.sha256 !== sha256Hex(canonicalStringify(table.rows))) errors.push(`Empreinte invalide pour ${table.model}.`)
  }
  if (payload.manifest.tables.length !== base.tables.length) errors.push("Nombre de tables du manifeste incohérent.")

  const observed = { embedded: 0, externalReferences: 0, missing: 0, corrupt: 0, bytesEmbedded: 0 }
  for (const file of base.files) {
    if (file.status === "EMBEDDED" || file.status === "CORRUPT") {
      const bytes = embeddedBytes(file)
      if (!bytes) {
        errors.push(`Contenu Base64 invalide pour ${file.storageKey}.`)
        continue
      }
      const digest = sha256Hex(bytes)
      if (file.size !== bytes.byteLength || file.sha256 !== digest) errors.push(`Empreinte ou taille invalide pour ${file.storageKey}.`)
      const mismatch = expectedFileMismatch(file, bytes.byteLength, digest)
      if (file.status === "EMBEDDED" && mismatch) errors.push(`Le fichier ${file.storageKey} contredit sa référence métier.`)
      if (file.status === "CORRUPT" && !mismatch) errors.push(`Le fichier ${file.storageKey} est marqué corrompu sans divergence constatée.`)
      observed.bytesEmbedded += bytes.byteLength
      if (file.status === "EMBEDDED") observed.embedded += 1
      else observed.corrupt += 1
    } else if (file.status === "EXTERNAL_REFERENCE") {
      observed.externalReferences += 1
    } else if (file.status === "MISSING") {
      observed.missing += 1
    } else {
      errors.push(`Statut de fichier invalide pour ${file.storageKey}.`)
    }
  }
  if (payload.manifest.files.total !== base.files.length
    || payload.manifest.files.embedded !== observed.embedded
    || payload.manifest.files.externalReferences !== observed.externalReferences
    || payload.manifest.files.missing !== observed.missing
    || payload.manifest.files.corrupt !== observed.corrupt
    || payload.manifest.files.bytesEmbedded !== observed.bytesEmbedded) {
    errors.push("Résumé des fichiers incohérent.")
  }

  const expectedStatus = observed.externalReferences || observed.missing || observed.corrupt || base.collectionWarnings.length ? "PARTIAL" : "COMPLETE"
  if (payload.manifest.status !== expectedStatus) errors.push("Statut global du manifeste incohérent.")
  warnings.push(...payload.manifest.warnings)
  return { ok: errors.length === 0, status: payload.manifest.status, errors, warnings }
}
