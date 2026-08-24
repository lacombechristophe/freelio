import "server-only"

import { createHash, randomUUID } from "node:crypto"
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import {
  assembleReversibilityExport,
  redactSensitiveExportValues,
  REVERSIBILITY_SCHEMA,
  sortRows,
  verifyReversibilityExport,
  type ReversibilityExport,
  type ReversibilityExportBase,
  type ReversibilityFile,
  type ReversibilityFileReference,
  type ReversibilityTable,
} from "@/lib/backup-integrity"
import prisma from "@/lib/prisma"
import { listR2CompanyObjects, localFilesRoot, readLocalFile } from "@/lib/local-files"
import { readMigrationArtifact } from "@/lib/migrations/storage"

const LEGACY_BACKUP_SCHEMA = "freelio.local-backup.v2"
const BACKUP_SCHEMA = REVERSIBILITY_SCHEMA
const MAX_LOCAL_BACKUPS = 14
const backupsRoot = path.resolve(process.cwd(), "data", "backups")
const restoreRoot = path.resolve(process.cwd(), "data", "restore-staging")

type LocalFileBackup = {
  path: string
  size: number
  sha256: string
  contentBase64: string
}

type LegacyBackupPayload = {
  schema: typeof LEGACY_BACKUP_SCHEMA
  exportedAt: string
  warning: string
  user: Record<string, any>
  company: Record<string, any>
  notifications: Array<Record<string, any>>
  auditLogs: Array<Record<string, any>>
  apiKeys: Array<Record<string, any>>
  localFiles: LocalFileBackup[]
}

type BackupPayload = ReversibilityExport

type TableSpec = {
  model: string
  delegate: string
  where: (companyId: string) => Record<string, unknown>
}

const direct = (model: string, delegate: string = `${model[0].toLowerCase()}${model.slice(1)}`): TableSpec => ({
  model,
  delegate,
  where: (companyId) => ({ companyId }),
})

const related = (
  model: string,
  relation: Record<string, unknown>,
  delegate: string = `${model[0].toLowerCase()}${model.slice(1)}`
): TableSpec => ({ model, delegate, where: (companyId) => replaceCompanyId(relation, companyId) })

function replaceCompanyId(value: unknown, companyId: string): any {
  if (Array.isArray(value)) return value.map((item) => replaceCompanyId(item, companyId))
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
      key,
      nested === "$companyId" ? companyId : replaceCompanyId(nested, companyId),
    ]))
  }
  return value
}

const COMPANY_TABLE_SPECS: TableSpec[] = [
  { model: "Company", delegate: "company", where: (companyId) => ({ id: companyId }) },
  direct("Membership"),
  direct("Client"),
  related("Contact", { client: { companyId: "$companyId" } }),
  related("ClientActivity", { client: { companyId: "$companyId" } }),
  direct("LeadCapture"),
  direct("MarketingConsent"),
  direct("EmailTemplate"),
  direct("EmailSequence"),
  related("EmailSequenceStep", { sequence: { companyId: "$companyId" } }),
  related("EmailSequenceEnrollment", { sequence: { companyId: "$companyId" } }),
  direct("EmailDelivery"),
  direct("AutomationWorkflow"),
  direct("AutomationRun"),
  related("ClientFile", { client: { companyId: "$companyId" } }),
  direct("Project"),
  related("ProjectMilestone", { project: { companyId: "$companyId" } }),
  related("ProjectFile", { project: { companyId: "$companyId" } }),
  related("ProjectTechnicalProfile", { project: { companyId: "$companyId" } }),
  related("ProjectAcceptanceItem", { project: { companyId: "$companyId" } }),
  direct("Pipeline"),
  related("Opportunity", { pipeline: { companyId: "$companyId" } }),
  related("OpportunityActivity", { opportunity: { pipeline: { companyId: "$companyId" } } }),
  related("TimeEntry", { project: { companyId: "$companyId" } }),
  direct("OrganisationGoal"),
  direct("OrganisationTask"),
  direct("ServiceCategory"),
  direct("Service"),
  direct("CustomerSite"),
  direct("Supplier"),
  direct("Product"),
  direct("ProductOptionGroup"),
  direct("ProductOptionValue"),
  direct("ProductComponent"),
  direct("ProductPrice"),
  direct("Warehouse"),
  direct("InventoryItem"),
  direct("StockMovement"),
  direct("PurchaseOrder"),
  related("PurchaseOrderLine", { purchaseOrder: { companyId: "$companyId" } }),
  direct("PurchaseIssue"),
  direct("SupplierReturn"),
  direct("CustomerOrder"),
  related("CustomerOrderLine", { customerOrder: { companyId: "$companyId" } }),
  direct("DeliveryNote"),
  related("DeliveryNoteLine", { deliveryNote: { companyId: "$companyId" } }),
  direct("GoodsReceipt"),
  related("GoodsReceiptLine", { goodsReceipt: { companyId: "$companyId" } }),
  direct("StockReservation"),
  direct("Equipment"),
  direct("ServiceTicket"),
  direct("FieldIntervention"),
  related("InterventionFile", { intervention: { companyId: "$companyId" } }),
  direct("MaintenanceContract"),
  related("MaintenanceContractEquipment", { contract: { companyId: "$companyId" } }),
  direct("Quote"),
  related("QuoteVersion", { quote: { companyId: "$companyId" } }),
  related("QuoteSection", { version: { quote: { companyId: "$companyId" } } }),
  related("QuoteLine", { section: { version: { quote: { companyId: "$companyId" } } } }),
  direct("Invoice"),
  related("InvoiceLine", { invoice: { companyId: "$companyId" } }),
  related("InvoicePayment", { invoice: { companyId: "$companyId" } }),
  direct("InvoiceReminder"),
  related("CreditNote", { invoice: { companyId: "$companyId" } }),
  direct("RecurringInvoice"),
  related("RecurringInvoiceOccurrence", { recurring: { companyId: "$companyId" } }),
  direct("ContractTemplate"),
  direct("Contract"),
  related("ContractClause", { template: { companyId: "$companyId" } }),
  related("ContractSignature", { contract: { companyId: "$companyId" } }),
  direct("Expense"),
  related("ExpenseFile", { expense: { companyId: "$companyId" } }),
  direct("BankTransaction"),
  direct("WebhookEndpoint"),
  related("WebhookDelivery", { endpoint: { companyId: "$companyId" } }),
  direct("DataSourceConnection"),
  direct("MigrationRun"),
  direct("SourceRecord"),
  direct("ExternalIdMap"),
  related("MigrationIssue", { run: { companyId: "$companyId" } }),
  related("MigrationMetric", { run: { companyId: "$companyId" } }),
  direct("DocumentManifest"),
  direct("RelanceConfig"),
  related("EInvoiceLog", { invoice: { companyId: "$companyId" } }),
]

const EXCLUDED_MODELS = [
  { model: "Account", reason: "Jetons OAuth exclus pour éviter de réactiver des accès externes lors d’une reprise." },
  { model: "Session", reason: "Sessions actives exclues volontairement pour des raisons de sécurité." },
  { model: "Notification", reason: "Le schéma actuel ne porte pas de companyId ; une extraction multi-tenant sûre est impossible." },
  { model: "ApiKey", reason: "Clés personnelles non rattachées à une entreprise et exclues volontairement." },
  { model: "EmailLog", reason: "Journal global sans companyId : export inter-entreprises interdit." },
  { model: "EReportingBatch", reason: "Lot global sans companyId : export inter-entreprises interdit." },
  { model: "CompanyInvitation", reason: "Invitation et jeton éphémères exclus ; ils doivent être recréés après reprise." },
  { model: "ContractSigningToken", reason: "Jeton de signature porteur exclu ; un nouveau lien doit être émis après reprise." },
  { model: "SensitiveFields", reason: "IBAN chiffré, secrets webhook, identifiants de connexion et jetons éventuellement imbriqués sont retirés récursivement de l’export JSON." },
]

type FileCandidate = {
  storageKey: string
  reader: "FILE" | "MIGRATION" | "INLINE" | "EXTERNAL"
  references: ReversibilityFileReference[]
  preloaded?: Buffer
}

const FILE_FIELDS: Record<string, Array<{ field: string; size?: string; sha256?: string; reader?: FileCandidate["reader"] }>> = {
  ClientFile: [{ field: "url", size: "size", sha256: "sha256" }],
  ProjectFile: [{ field: "url", size: "size", sha256: "sha256" }],
  InterventionFile: [{ field: "url", size: "size", sha256: "sha256" }],
  Invoice: [{ field: "pdfUrl", sha256: "pdfHash" }],
  ExpenseFile: [{ field: "url", size: "size", sha256: "sha256" }],
  DocumentManifest: [{ field: "storageKey", size: "size", sha256: "sha256", reader: "MIGRATION" }],
  EInvoiceLog: [{ field: "xmlUrl" }],
}

const DATE_FIELDS = new Set([
  "createdAt", "updatedAt", "emailVerified", "expires", "lastBackupAt", "nextActionAt",
  "happenedAt", "startDate", "endDate", "dueDate", "validUntil", "date", "signedAt",
  "nextGenDate", "periodStart", "periodEnd", "scheduledDate", "recurrenceEnd",
  "domainExpiresAt", "lockedAt", "sentAt", "importedAt", "lastUsed", "validFrom",
])

function normalizeRecord(record: Record<string, any>, omitted: string[] = []): any {
  const omittedSet = new Set(omitted)
  return Object.fromEntries(
    Object.entries(record)
      .filter(([key]) => !omittedSet.has(key))
      .map(([key, value]) => [
        key,
        DATE_FIELDS.has(key) && typeof value === "string" ? new Date(value) : value,
      ])
  )
}

async function walkFiles(directory: string): Promise<string[]> {
  try {
    const entries = await readdir(directory, { withFileTypes: true })
    const nested = await Promise.all(entries.map(async (entry) => {
      const absolute = path.join(directory, entry.name)
      return entry.isDirectory() ? walkFiles(absolute) : [absolute]
    }))
    return nested.flat()
  } catch {
    return []
  }
}

async function collectLocalFiles(companyId: string): Promise<LocalFileBackup[]> {
  const root = localFilesRoot()
  const companyRoot = path.resolve(root, companyId)
  if (!companyRoot.startsWith(`${root}${path.sep}`)) throw new Error("Répertoire entreprise invalide")

  const paths = await walkFiles(companyRoot)
  return Promise.all(paths.map(async (absolute) => {
    const [content, info] = await Promise.all([readFile(absolute), stat(absolute)])
    return {
      path: path.relative(root, absolute),
      size: info.size,
      sha256: createHash("sha256").update(content).digest("hex"),
      contentBase64: content.toString("base64"),
    }
  }))
}

async function collectCompanyTables(userId: string, companyId: string): Promise<ReversibilityTable[]> {
  const database = prisma as unknown as Record<string, {
    findMany: (args: { where: Record<string, unknown> }) => Promise<Array<Record<string, unknown>>>
  }>
  const tables = await Promise.all(COMPANY_TABLE_SPECS.map(async (spec) => {
    const delegate = database[spec.delegate]
    if (!delegate?.findMany) throw new Error(`Modèle Prisma indisponible pour l’export : ${spec.model}`)
    const rows = await delegate.findMany({ where: spec.where(companyId) })
    return {
      model: spec.model,
      rows: sortRows(rows.map((row) => redactSensitiveExportValues(row) as Record<string, unknown>)),
    }
  }))

  const byModel = new Map(tables.map((table) => [table.model, table]))
  if (!byModel.get("Company")?.rows.length) throw new Error("Entreprise introuvable pour l’export")
  const memberships = byModel.get("Membership")?.rows ?? []
  const userIds = new Set<string>([userId])
  for (const row of memberships) if (typeof row.userId === "string") userIds.add(row.userId)
  const users = await prisma.user.findMany({ where: { id: { in: [...userIds] } } })
  tables.splice(1, 0, {
    model: "User",
    rows: sortRows(users.map((row) => redactSensitiveExportValues(row) as Record<string, unknown>)),
  })

  const resourceIds = new Set<string>([companyId])
  for (const table of tables) {
    for (const row of table.rows) if (typeof row.id === "string") resourceIds.add(row.id)
  }
  const auditLogs = await prisma.auditLog.findMany({ where: { userId: { in: [...userIds] } } })
  const scopedAuditLogs = auditLogs.filter((row) => row.resourceId && resourceIds.has(row.resourceId))
  tables.push({
    model: "AuditLog",
    rows: sortRows(scopedAuditLogs.map((row) => redactSensitiveExportValues(row) as Record<string, unknown>)),
  })
  return tables
}

function recordId(row: Record<string, unknown>) {
  if (typeof row.id === "string") return row.id
  const composite = [row.contractId, row.equipmentId].filter((value): value is string => typeof value === "string")
  return composite.length ? composite.join(":") : "unknown"
}

function normalizedStorageKey(value: string) {
  if (value.startsWith("r2:")) return `r2:${value.slice(3).replaceAll("\\", "/")}`
  if (value.startsWith("local:")) return `local:${value.slice(6).replaceAll("\\", "/")}`
  return value.replaceAll("\\", "/")
}

function storageReader(value: string, preferred?: FileCandidate["reader"]): FileCandidate["reader"] {
  if (value.startsWith("data:")) return "INLINE"
  if (/^https?:\/\//i.test(value) || value.startsWith("/")) return "EXTERNAL"
  return preferred ?? "FILE"
}

function fileCandidateId(candidate: Pick<FileCandidate, "storageKey" | "reader">) {
  return candidate.storageKey.startsWith("r2:") ? candidate.storageKey : `${candidate.reader}:${candidate.storageKey}`
}

function addCandidate(map: Map<string, FileCandidate>, candidate: FileCandidate) {
  const id = fileCandidateId(candidate)
  const current = map.get(id)
  if (current) {
    current.references.push(...candidate.references)
    if (!current.preloaded && candidate.preloaded) current.preloaded = candidate.preloaded
  } else {
    map.set(id, candidate)
  }
}

function collectReferencedFiles(tables: ReversibilityTable[]) {
  const candidates = new Map<string, FileCandidate>()
  for (const table of tables) {
    for (const row of table.rows) {
      for (const field of FILE_FIELDS[table.model] ?? []) {
        const rawValue = row[field.field]
        if (typeof rawValue !== "string" || !rawValue.trim()) continue
        const reader = storageReader(rawValue, field.reader)
        let storageKey = normalizedStorageKey(rawValue.trim())
        let preloaded: Buffer | undefined
        if (reader === "INLINE") {
          const separator = rawValue.indexOf(",")
          if (separator >= 0) {
            try {
              const metadata = rawValue.slice(0, separator)
              const data = rawValue.slice(separator + 1)
              preloaded = metadata.endsWith(";base64") ? Buffer.from(data, "base64") : Buffer.from(decodeURIComponent(data))
            } catch {
              preloaded = undefined
            }
          }
          storageKey = `inline:${table.model}:${recordId(row)}:${field.field}`
        }
        const expectedSize = field.size && typeof row[field.size] === "number" ? row[field.size] as number : undefined
        const expectedSha256 = field.sha256 && typeof row[field.sha256] === "string"
          ? (row[field.sha256] as string).toLowerCase()
          : undefined
        addCandidate(candidates, {
          storageKey,
          reader,
          preloaded,
          references: [{ model: table.model, recordId: recordId(row), field: field.field, expectedSize, expectedSha256 }],
        })
      }
    }
  }
  return candidates
}

async function addStorageInventory(candidates: Map<string, FileCandidate>, companyId: string, warnings: string[]) {
  try {
    const localFiles = await collectLocalFiles(companyId)
    for (const file of localFiles) {
      addCandidate(candidates, {
        storageKey: `local:${file.path.replaceAll("\\", "/")}`,
        reader: "FILE",
        references: [{ model: "StorageInventory", recordId: companyId, field: "localDirectory", expectedSize: file.size, expectedSha256: file.sha256 }],
        preloaded: Buffer.from(file.contentBase64, "base64"),
      })
    }
  } catch (error) {
    warnings.push(`Inventaire local incomplet : ${error instanceof Error ? error.message : "lecture impossible"}`)
  }
  try {
    const r2Objects = await listR2CompanyObjects(companyId)
    for (const object of r2Objects) {
      addCandidate(candidates, {
        storageKey: object.relativePath,
        reader: "FILE",
        references: [{ model: "StorageInventory", recordId: companyId, field: "r2Prefix", expectedSize: object.size }],
      })
    }
  } catch (error) {
    warnings.push(`Inventaire R2 incomplet : ${error instanceof Error ? error.message : "lecture impossible"}`)
  }
}

function fileStorage(candidate: FileCandidate): ReversibilityFile["storage"] {
  if (candidate.reader === "INLINE") return "INLINE"
  if (candidate.reader === "EXTERNAL") return "EXTERNAL"
  if (candidate.storageKey.startsWith("r2:")) return "R2"
  if (candidate.storageKey.startsWith("local:")) return "LOCAL"
  return "UNKNOWN"
}

async function materializeFile(candidate: FileCandidate): Promise<ReversibilityFile> {
  const storage = fileStorage(candidate)
  if (candidate.reader === "EXTERNAL") {
    return { storageKey: candidate.storageKey, storage, status: "EXTERNAL_REFERENCE", references: candidate.references }
  }
  try {
    const bytes = candidate.preloaded ?? (candidate.reader === "MIGRATION"
      ? await readMigrationArtifact(candidate.storageKey)
      : await readLocalFile(candidate.storageKey))
    const sha256 = createHash("sha256").update(bytes).digest("hex")
    const corrupt = candidate.references.some((reference) =>
      (reference.expectedSize !== undefined && reference.expectedSize !== bytes.byteLength)
      || (reference.expectedSha256 !== undefined && reference.expectedSha256 !== sha256)
    )
    return {
      storageKey: candidate.storageKey,
      storage,
      status: corrupt ? "CORRUPT" : "EMBEDDED",
      references: candidate.references,
      size: bytes.byteLength,
      sha256,
      contentBase64: bytes.toString("base64"),
    }
  } catch (error) {
    return {
      storageKey: candidate.storageKey,
      storage,
      status: "MISSING",
      references: candidate.references,
      error: (error instanceof Error ? error.message : "Lecture impossible").slice(0, 240),
    }
  }
}

async function collectReversibilityFiles(tables: ReversibilityTable[], companyId: string) {
  const warnings: string[] = []
  const candidates = collectReferencedFiles(tables)
  await addStorageInventory(candidates, companyId, warnings)
  const files = await Promise.all([...candidates.values()]
    .sort((left, right) => fileCandidateId(left).localeCompare(fileCandidateId(right)))
    .map(materializeFile))
  return { files, warnings }
}

export async function buildBackupPayload(userId: string, companyId: string): Promise<BackupPayload> {
  const tables = await collectCompanyTables(userId, companyId)
  const { files, warnings } = await collectReversibilityFiles(tables, companyId)
  const base: ReversibilityExportBase = {
    schema: BACKUP_SCHEMA,
    exportId: randomUUID(),
    exportedAt: new Date().toISOString(),
    scope: { companyId, requestedByUserId: userId, kind: "COMPANY_BUSINESS_DATA" },
    restoration: {
      automaticRestoreSupported: false,
      mode: "CONTROLLED_LOGICAL_IMPORT",
      reason: "Cet export logique est vérifiable et réversible, mais sa réinjection exige une procédure contrôlée tenant compte des clés étrangères et de la version du schéma.",
    },
    collectionWarnings: warnings,
    tables,
    files,
  }
  return assembleReversibilityExport(base, EXCLUDED_MODELS)
}

export async function writeLocalBackup(payload: BackupPayload, label = "auto") {
  await mkdir(backupsRoot, { recursive: true })
  const stamp = payload.exportedAt.replace(/[:.]/g, "-")
  const destination = path.join(backupsRoot, `crm-${label}-${stamp}.json`)
  await writeFile(destination, JSON.stringify(payload), { flag: "wx" })

  const files = (await readdir(backupsRoot))
    .filter((name) => (name.startsWith("crm-") || name.startsWith("diskoov-") || name.startsWith("freelio-")) && name.endsWith(".json"))
    .sort()
    .reverse()
  await Promise.all(files.slice(MAX_LOCAL_BACKUPS).map((name) => {
    const target = path.resolve(backupsRoot, name)
    if (!target.startsWith(`${backupsRoot}${path.sep}`)) throw new Error("Chemin de sauvegarde invalide")
    return rm(target, { force: true })
  }))
  return destination
}

export async function ensureDailyBackup(userId: string, companyId: string) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { lastBackupAt: true },
  })
  const today = new Date().toISOString().slice(0, 10)
  if (company?.lastBackupAt?.toISOString().slice(0, 10) === today) return false

  const payload = await buildBackupPayload(userId, companyId)
  await writeLocalBackup(payload)
  await prisma.company.update({ where: { id: companyId }, data: { lastBackupAt: new Date() } })
  return true
}

function validateLegacyPayload(input: unknown, companyId: string): asserts input is LegacyBackupPayload {
  if (!input || typeof input !== "object") throw new Error("Sauvegarde invalide")
  const payload = input as Partial<LegacyBackupPayload>
  if (payload.schema !== LEGACY_BACKUP_SCHEMA) throw new Error("Version de sauvegarde non prise en charge")
  if (!payload.company || payload.company.id !== companyId) {
    throw new Error("Cette sauvegarde appartient à une autre entreprise")
  }
  if (!Array.isArray(payload.localFiles)) throw new Error("Inventaire de fichiers absent")
}

async function stageLocalFiles(payload: LegacyBackupPayload, companyId: string) {
  const stage = path.resolve(restoreRoot, randomUUID())
  await mkdir(stage, { recursive: true })
  for (const file of payload.localFiles) {
    const normalized = path.normalize(file.path)
    if (!normalized.startsWith(`${companyId}${path.sep}`)) throw new Error("Fichier hors entreprise")
    const destination = path.resolve(stage, normalized)
    if (!destination.startsWith(`${stage}${path.sep}`)) throw new Error("Chemin de restauration invalide")
    const content = Buffer.from(file.contentBase64, "base64")
    if (content.length !== file.size) throw new Error(`Taille invalide pour ${file.path}`)
    if (createHash("sha256").update(content).digest("hex") !== file.sha256) {
      throw new Error(`Empreinte invalide pour ${file.path}`)
    }
    await mkdir(path.dirname(destination), { recursive: true })
    await writeFile(destination, content, { flag: "wx" })
  }
  return stage
}

const LEGACY_UNREPRESENTED_TABLES = [
  "LeadCapture", "MarketingConsent", "CustomerSite", "Supplier", "Product", "ProductOptionGroup",
  "ProductOptionValue", "ProductComponent", "ProductPrice", "Warehouse",
  "InventoryItem", "StockMovement", "PurchaseOrder", "PurchaseIssue", "SupplierReturn", "CustomerOrder", "DeliveryNote",
  "GoodsReceipt", "StockReservation", "Equipment", "ServiceTicket", "FieldIntervention",
  "MaintenanceContract", "DataSourceConnection", "MigrationRun", "SourceRecord", "ExternalIdMap",
  "DocumentManifest", "ContractSigningToken", "EmailTemplate", "EmailSequence", "EmailSequenceStep",
  "EmailSequenceEnrollment", "EmailDelivery", "AutomationWorkflow", "AutomationRun",
]

async function assertLegacyRestoreIsSafe(companyId: string) {
  const specsByModel = new Map(COMPANY_TABLE_SPECS.map((spec) => [spec.model, spec]))
  const database = prisma as unknown as Record<string, {
    count: (args: { where: Record<string, unknown> }) => Promise<number>
  }>
  for (const model of LEGACY_UNREPRESENTED_TABLES) {
    const spec = specsByModel.get(model)
    if (!spec) continue
    const count = await database[spec.delegate].count({ where: spec.where(companyId) })
    if (count > 0) {
      throw new Error(
        `Restauration v2 refusée : ${count} enregistrement(s) ${model} ne figurent pas dans cette ancienne sauvegarde. Exportez d’abord les données actuelles et utilisez une reprise contrôlée.`
      )
    }
  }
}

async function activateStagedLocalFiles(stage: string, companyId: string) {
  const filesRoot = localFilesRoot()
  const current = path.resolve(filesRoot, companyId)
  const staged = path.resolve(stage, companyId)
  const displacedRoot = path.resolve(restoreRoot, randomUUID())
  const displaced = path.resolve(displacedRoot, companyId)
  if (!current.startsWith(`${filesRoot}${path.sep}`)
    || !staged.startsWith(`${stage}${path.sep}`)
    || !displaced.startsWith(`${displacedRoot}${path.sep}`)) {
    throw new Error("Répertoire de restauration invalide")
  }
  await mkdir(staged, { recursive: true })
  await mkdir(displacedRoot, { recursive: true })
  let previousFilesMoved = false
  try {
    await rename(current, displaced)
    previousFilesMoved = true
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error
  }
  try {
    await mkdir(filesRoot, { recursive: true })
    await rename(staged, current)
  } catch (error) {
    if (previousFilesMoved) await rename(displaced, current)
    await rm(displacedRoot, { recursive: true, force: true })
    throw error
  }
  return {
    async commit() {
      await rm(displacedRoot, { recursive: true, force: true })
      await rm(stage, { recursive: true, force: true })
    },
    async rollback() {
      await rm(current, { recursive: true, force: true })
      if (previousFilesMoved) await rename(displaced, current)
      await rm(displacedRoot, { recursive: true, force: true })
      await rm(stage, { recursive: true, force: true })
    },
  }
}

function nestedRows<T extends Record<string, any>>(parents: T[], key: string) {
  return parents.flatMap((parent) => Array.isArray(parent[key]) ? parent[key] : [])
}

export async function restoreBackupPayload(input: unknown, userId: string, companyId: string) {
  if (input && typeof input === "object" && (input as { schema?: unknown }).schema === BACKUP_SCHEMA) {
    const verification = verifyReversibilityExport(input)
    if (!verification.ok) throw new Error(`Export de réversibilité invalide : ${verification.errors.join(" ")}`)
    const exportCompanyId = (input as ReversibilityExport).scope.companyId
    if (exportCompanyId !== companyId) throw new Error("Cet export appartient à une autre entreprise")
    throw new Error(
      `Export de réversibilité ${verification.status === "COMPLETE" ? "complet" : "partiel"} et manifeste vérifié. La restauration automatique n’est pas proposée : utilisez une reprise logique contrôlée adaptée à la version du schéma.`
    )
  }
  validateLegacyPayload(input, companyId)
  const payload = input
  await assertLegacyRestoreIsSafe(companyId)
  const safety = await buildBackupPayload(userId, companyId)
  await writeLocalBackup(safety, "before-restore")
  const stage = await stageLocalFiles(payload, companyId)
  const fileSwap = await activateStagedLocalFiles(stage, companyId)
  const c = payload.company

  const clients = c.clients ?? []
  const projects = c.projects ?? []
  const quotes = c.quotes ?? []
  const quoteVersions = nestedRows(quotes, "versions")
  const quoteSections = nestedRows(quoteVersions, "sections")
  const invoices = c.invoices ?? []
  const recurring = c.recurring ?? []
  const contracts = c.contracts ?? []
  const contractTemplates = c.contractTemplates ?? []
  const expenses = c.expenses ?? []
  const pipelines = c.pipelines ?? []
  const opportunities = nestedRows(pipelines, "opportunities")
  const webhooks = c.webhooks ?? []

  try {
    await prisma.$transaction(async (tx) => {
      await tx.bankTransaction.deleteMany({ where: { companyId } })
      await tx.webhookDelivery.deleteMany({ where: { endpoint: { companyId } } })
      await tx.webhookEndpoint.deleteMany({ where: { companyId } })
      await tx.opportunityActivity.deleteMany({ where: { opportunity: { pipeline: { companyId } } } })
      await tx.opportunity.deleteMany({ where: { pipeline: { companyId } } })
      await tx.pipeline.deleteMany({ where: { companyId } })
      await tx.organisationTask.deleteMany({ where: { companyId } })
      await tx.organisationGoal.deleteMany({ where: { companyId } })
      await tx.contractSignature.deleteMany({ where: { contract: { companyId } } })
      await tx.contractClause.deleteMany({ where: { template: { companyId } } })
      await tx.contract.deleteMany({ where: { companyId } })
      await tx.contractTemplate.deleteMany({ where: { companyId } })
      await tx.recurringInvoiceOccurrence.deleteMany({ where: { recurring: { companyId } } })
      await tx.recurringInvoice.deleteMany({ where: { companyId } })
      await tx.invoiceReminder.deleteMany({ where: { companyId } })
      await tx.eInvoiceLog.deleteMany({ where: { invoice: { companyId } } })
      await tx.creditNote.deleteMany({ where: { invoice: { companyId } } })
      await tx.invoicePayment.deleteMany({ where: { invoice: { companyId } } })
      await tx.invoiceLine.deleteMany({ where: { invoice: { companyId } } })
      await tx.invoice.deleteMany({ where: { companyId } })
      await tx.quoteLine.deleteMany({ where: { section: { version: { quote: { companyId } } } } })
      await tx.quoteSection.deleteMany({ where: { version: { quote: { companyId } } } })
      await tx.quoteVersion.deleteMany({ where: { quote: { companyId } } })
      await tx.quote.deleteMany({ where: { companyId } })
      await tx.expenseFile.deleteMany({ where: { expense: { companyId } } })
      await tx.expense.deleteMany({ where: { companyId } })
      await tx.projectAcceptanceItem.deleteMany({ where: { project: { companyId } } })
      await tx.projectTechnicalProfile.deleteMany({ where: { project: { companyId } } })
      await tx.projectFile.deleteMany({ where: { project: { companyId } } })
      await tx.projectMilestone.deleteMany({ where: { project: { companyId } } })
      await tx.timeEntry.deleteMany({ where: { project: { companyId } } })
      await tx.project.deleteMany({ where: { companyId } })
      await tx.clientActivity.deleteMany({ where: { client: { companyId } } })
      await tx.contact.deleteMany({ where: { client: { companyId } } })
      await tx.clientFile.deleteMany({ where: { client: { companyId } } })
      await tx.client.deleteMany({ where: { companyId } })
      await tx.service.deleteMany({ where: { companyId } })
      await tx.serviceCategory.deleteMany({ where: { companyId } })
      await tx.relanceConfig.deleteMany({ where: { companyId } })
      await tx.notification.deleteMany({ where: { userId } })
      await tx.auditLog.deleteMany({ where: { userId } })
      await tx.apiKey.deleteMany({ where: { userId } })

      await tx.company.update({
        where: { id: companyId },
        data: normalizeRecord(c, [
          "id", "user", "clients", "serviceCats", "services", "projects", "quotes", "invoices",
          "recurring", "contracts", "contractTemplates", "expenses", "pipelines", "organisationGoals",
          "organisationTasks", "webhooks", "relanceConfig", "bankTransactions", "invoiceReminders",
        ]),
      })
      await tx.user.update({
        where: { id: userId },
        data: normalizeRecord(payload.user, ["id", "companyId", "createdAt", "updatedAt"]),
      })

      if (clients.length) await tx.client.createMany({ data: clients.map((row: any) => normalizeRecord(row, ["contacts", "activities", "files", "projects", "quotes", "invoices", "opportunities", "contracts", "organisationTasks", "recurringInvoices", "expenses"])) })
      const contacts = nestedRows(clients, "contacts")
      const clientActivities = nestedRows(clients, "activities")
      const clientFiles = nestedRows(clients, "files")
      if (contacts.length) await tx.contact.createMany({ data: contacts.map((row: any) => normalizeRecord(row)) })
      if (clientActivities.length) await tx.clientActivity.createMany({ data: clientActivities.map((row: any) => normalizeRecord(row)) })
      if (clientFiles.length) await tx.clientFile.createMany({ data: clientFiles.map((row: any) => normalizeRecord(row)) })

      if ((c.serviceCats ?? []).length) await tx.serviceCategory.createMany({ data: c.serviceCats.map((row: any) => normalizeRecord(row, ["services"])) })
      if ((c.services ?? []).length) await tx.service.createMany({ data: c.services.map((row: any) => normalizeRecord(row, ["category", "company"])) })
      if (projects.length) await tx.project.createMany({ data: projects.map((row: any) => normalizeRecord(row, ["milestones", "files", "timeEntries", "quotes", "invoices", "organisationTasks", "expenses", "technicalProfile", "acceptanceItems", "client", "company"])) })
      const milestones = nestedRows(projects, "milestones")
      const projectFiles = nestedRows(projects, "files")
      const timeEntries = nestedRows(projects, "timeEntries")
      const technicalProfiles = projects.flatMap((row: any) => row.technicalProfile ? [row.technicalProfile] : [])
      const acceptanceItems = nestedRows(projects, "acceptanceItems")
      if (milestones.length) await tx.projectMilestone.createMany({ data: milestones.map((row: any) => normalizeRecord(row)) })
      if (projectFiles.length) await tx.projectFile.createMany({ data: projectFiles.map((row: any) => normalizeRecord(row)) })
      if (timeEntries.length) await tx.timeEntry.createMany({ data: timeEntries.map((row: any) => normalizeRecord(row)) })
      if (technicalProfiles.length) await tx.projectTechnicalProfile.createMany({ data: technicalProfiles.map((row: any) => normalizeRecord(row)) })
      if (acceptanceItems.length) await tx.projectAcceptanceItem.createMany({ data: acceptanceItems.map((row: any) => normalizeRecord(row)) })

      if (quotes.length) await tx.quote.createMany({ data: quotes.map((row: any) => normalizeRecord(row, ["versions", "company", "client", "project"])) })
      if (quoteVersions.length) await tx.quoteVersion.createMany({ data: quoteVersions.map((row: any) => normalizeRecord(row, ["sections", "quote"])) })
      if (quoteSections.length) await tx.quoteSection.createMany({ data: quoteSections.map((row: any) => normalizeRecord(row, ["lines", "version"])) })
      const quoteLines = nestedRows(quoteSections, "lines")
      if (quoteLines.length) await tx.quoteLine.createMany({ data: quoteLines.map((row: any) => normalizeRecord(row, ["section"])) })

      if (invoices.length) await tx.invoice.createMany({ data: invoices.map((row: any) => normalizeRecord(row, ["lines", "payments", "creditNotes", "facturXLog", "reminders", "company", "client", "project"])) })
      const invoiceLines = nestedRows(invoices, "lines")
      const payments = nestedRows(invoices, "payments")
      const creditNotes = nestedRows(invoices, "creditNotes")
      const invoiceLogs = invoices.flatMap((row: any) => row.facturXLog ? [row.facturXLog] : [])
      const reminders = nestedRows(invoices, "reminders")
      if (invoiceLines.length) await tx.invoiceLine.createMany({ data: invoiceLines.map((row: any) => normalizeRecord(row, ["invoice"])) })
      if (payments.length) await tx.invoicePayment.createMany({ data: payments.map((row: any) => normalizeRecord(row, ["invoice", "bankTransaction"])) })
      if (creditNotes.length) await tx.creditNote.createMany({ data: creditNotes.map((row: any) => normalizeRecord(row, ["invoice"])) })
      if (invoiceLogs.length) await tx.eInvoiceLog.createMany({ data: invoiceLogs.map((row: any) => normalizeRecord(row, ["invoice"])) })
      if (reminders.length) await tx.invoiceReminder.createMany({ data: reminders.map((row: any) => normalizeRecord(row, ["invoice", "company"])) })

      if (recurring.length) await tx.recurringInvoice.createMany({ data: recurring.map((row: any) => normalizeRecord(row, ["occurrences", "company", "client"])) })
      const occurrences = nestedRows(recurring, "occurrences")
      if (occurrences.length) await tx.recurringInvoiceOccurrence.createMany({ data: occurrences.map((row: any) => normalizeRecord(row, ["recurring"])) })
      if (contractTemplates.length) await tx.contractTemplate.createMany({ data: contractTemplates.map((row: any) => normalizeRecord(row, ["clauses", "company"])) })
      const clauses = nestedRows(contractTemplates, "clauses")
      if (clauses.length) await tx.contractClause.createMany({ data: clauses.map((row: any) => normalizeRecord(row, ["template"])) })
      if (contracts.length) await tx.contract.createMany({ data: contracts.map((row: any) => normalizeRecord(row, ["signatures", "company", "client"])) })
      const signatures = nestedRows(contracts, "signatures")
      if (signatures.length) await tx.contractSignature.createMany({ data: signatures.map((row: any) => normalizeRecord(row, ["contract"])) })

      if (expenses.length) await tx.expense.createMany({ data: expenses.map((row: any) => normalizeRecord(row, ["files", "company", "client", "project", "bankTransaction"])) })
      const expenseFiles = nestedRows(expenses, "files")
      if (expenseFiles.length) await tx.expenseFile.createMany({ data: expenseFiles.map((row: any) => normalizeRecord(row, ["expense"])) })
      if (pipelines.length) await tx.pipeline.createMany({ data: pipelines.map((row: any) => normalizeRecord(row, ["opportunities", "company"])) })
      if (opportunities.length) await tx.opportunity.createMany({ data: opportunities.map((row: any) => normalizeRecord(row, ["activities", "pipeline", "client"])) })
      const opportunityActivities = nestedRows(opportunities, "activities")
      if (opportunityActivities.length) await tx.opportunityActivity.createMany({ data: opportunityActivities.map((row: any) => normalizeRecord(row, ["opportunity"])) })
      if ((c.organisationGoals ?? []).length) await tx.organisationGoal.createMany({ data: c.organisationGoals.map((row: any) => normalizeRecord(row, ["tasks", "company"])) })
      if ((c.organisationTasks ?? []).length) await tx.organisationTask.createMany({ data: c.organisationTasks.map((row: any) => normalizeRecord(row, ["company", "client", "project", "goal"])) })
      if (webhooks.length) await tx.webhookEndpoint.createMany({ data: webhooks.map((row: any) => normalizeRecord(row, ["deliveries", "company"])) })
      const deliveries = nestedRows(webhooks, "deliveries")
      if (deliveries.length) await tx.webhookDelivery.createMany({ data: deliveries.map((row: any) => normalizeRecord(row, ["endpoint"])) })
      if (c.relanceConfig) await tx.relanceConfig.create({ data: normalizeRecord(c.relanceConfig, ["company"]) as any })
      if ((c.bankTransactions ?? []).length) await tx.bankTransaction.createMany({ data: c.bankTransactions.map((row: any) => normalizeRecord(row, ["company", "matchedPayment", "matchedExpense"])) })
      if (payload.notifications.length) await tx.notification.createMany({ data: payload.notifications.map((row: any) => normalizeRecord(row, ["user"])) as any })
      if (payload.auditLogs.length) await tx.auditLog.createMany({ data: payload.auditLogs.map((row: any) => normalizeRecord(row, ["user"])) as any })
      if (payload.apiKeys.length) await tx.apiKey.createMany({ data: payload.apiKeys.map((row: any) => normalizeRecord(row, ["user"])) as any })
    }, { timeout: 60_000, maxWait: 10_000 })

    await fileSwap.commit()
    return { ok: true, restoredAt: new Date().toISOString() }
  } catch (error) {
    await fileSwap.rollback()
    throw error
  }
}

export { BACKUP_SCHEMA, LEGACY_BACKUP_SCHEMA, verifyReversibilityExport }
