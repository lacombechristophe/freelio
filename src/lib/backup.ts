import "server-only"

import { createHash, randomUUID } from "node:crypto"
import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises"
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
import { readBoundedFile } from "@/lib/bounded-file-read"

const LEGACY_BACKUP_SCHEMA = "freelio.local-backup.v2"
const BACKUP_SCHEMA = REVERSIBILITY_SCHEMA
const MAX_LOCAL_BACKUPS = 14
// Logical exports are bounded. Larger tenants require the database/storage backup procedure.
const MAX_EXPORT_TABLE_BYTES = 16 * 1024 * 1024
const MAX_EXPORT_FILE_BYTES = 32 * 1024 * 1024
const MAX_EXPORT_ROWS = 50_000
const backupsRoot = path.resolve(process.cwd(), "data", "backups")

type LocalFileBackup = {
  path: string
  size: number
  sha256: string
  contentBase64: string
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
  direct("Agency"),
  related("AgencyMembership", { agency: { companyId: "$companyId" } }),
  direct("Client"),
  direct("ClientPortalMessage"),
  direct("ClientPortalAppointmentRequest"),
  related("Contact", { client: { companyId: "$companyId" } }),
  related("ClientActivity", { client: { companyId: "$companyId" } }),
  direct("LeadCapture"),
  direct("MarketingConsent"),
  direct("EmailTemplate"),
  direct("EmailSequence"),
  related("EmailSequenceStep", { sequence: { companyId: "$companyId" } }),
  related("EmailSequenceEnrollment", { sequence: { companyId: "$companyId" } }),
  direct("EmailSequenceTask"),
  direct("EmailDelivery"),
  direct("EmailSendQuotaPolicy"),
  direct("EmailSendQuotaState"),
  direct("EmailSendQuotaCharge"),
  direct("EmailThread"),
  direct("EmailMessage"),
  direct("EmailEvent"),
  direct("EmailSuppression"),
  direct("CommunicationChannel"),
  direct("LeadScoringRule"),
  direct("MarketingSegment"),
  related("MarketingSegmentMember", { segment: { companyId: "$companyId" } }),
  direct("MarketingCampaign"),
  related("MarketingCampaignAsset", { campaign: { companyId: "$companyId" } }),
  direct("CampaignAudience"),
  related("CampaignAudienceMember", { audience: { companyId: "$companyId" } }),
  direct("AutomationWorkflow"),
  direct("AutomationWorkflowVersion"),
  direct("AutomationRun"),
  direct("AutomationEventOutbox"),
  related("AutomationRunAction", { run: { companyId: "$companyId" } }),
  related("ClientFile", { client: { companyId: "$companyId" } }),
  direct("ProjectTemplate"),
  related("ProjectTemplateStep", { template: { companyId: "$companyId" } }),
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
  direct("StockTransfer"),
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
  direct("ServiceTicketNote"),
  direct("ServiceDiagnosticGuide"),
  direct("ServiceTicketDiagnostic"),
  direct("CustomerHealthRule"),
  direct("CustomerHealthSnapshot"),
  direct("KnowledgeArticle"),
  direct("SatisfactionSurvey"),
  direct("SatisfactionRequest"),
  direct("SavedView"),
  direct("CrmPropertyDefinition"),
  direct("CrmPropertyValue"),
  direct("CrmPropertyHistory"),
  direct("FieldIntervention"),
  related("InterventionFile", { intervention: { companyId: "$companyId" } }),
  direct("InterventionReservation"),
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
  related("ContractAmendmentChange", { contract: { companyId: "$companyId" } }),
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
  { model: "EmailSignature", reason: "Signatures personnelles : exclues de l’export de société. La sauvegarde native de la base les conserve." },
  { model: "EmailDraft", reason: "Brouillons privés à leur auteur : exclus de l’export de société. La sauvegarde native chiffrée de la base les conserve." },
  { model: "Account", reason: "Jetons OAuth exclus pour éviter de réactiver des accès externes lors d’une reprise." },
  { model: "Session", reason: "Sessions actives exclues volontairement pour des raisons de sécurité." },
  { model: "VerificationToken", reason: "Jetons de connexion à usage unique exclus volontairement pour des raisons de sécurité." },
  { model: "PasswordResetToken", reason: "Jetons de réinitialisation exclus volontairement pour des raisons de sécurité." },
  { model: "MfaRecoveryCode", reason: "Codes de secours hachés exclus volontairement pour des raisons de sécurité." },
  { model: "ClientPortalAccess", reason: "Liens d'accès porteurs exclus ; ils doivent être réémis après une reprise." },
  { model: "Notification", reason: "Notifications personnelles exclues de l'export d'entreprise ; les anciennes lignes sans société ne sont pas réattribuées." },
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
  Contract: [{ field: "pdfUrl", sha256: "pdfHash" }],
  ExpenseFile: [{ field: "url", size: "size", sha256: "sha256" }],
  DocumentManifest: [{ field: "storageKey", size: "size", sha256: "sha256", reader: "MIGRATION" }],
  EInvoiceLog: [{ field: "xmlUrl" }],
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
  const files: LocalFileBackup[] = []
  let totalBytes = 0
  for (const absolute of paths) {
    const info = await stat(absolute)
    totalBytes += info.size
    if (totalBytes > MAX_EXPORT_FILE_BYTES) throw new Error("Export logique trop volumineux : utiliser la sauvegarde native du stockage")
    const content = await readBoundedFile(absolute, MAX_EXPORT_FILE_BYTES - totalBytes + info.size)
    files.push({
      path: path.relative(root, absolute),
      size: info.size,
      sha256: createHash("sha256").update(content).digest("hex"),
      contentBase64: content.toString("base64"),
    })
  }
  return files
}

async function collectCompanyTables(userId: string, companyId: string, client: Pick<typeof prisma, "user" | "auditLog">): Promise<ReversibilityTable[]> {
  const database = client as unknown as Record<string, {
    findMany: (args: { where: Record<string, unknown>; take: number; skip: number; orderBy: Array<Record<string, string>> }) => Promise<Array<Record<string, unknown>>>
  }>
  const tables: ReversibilityTable[] = []
  let totalRows = 0
  let totalBytes = 0
  const accountBatch = (batch: readonly unknown[]) => {
    totalRows += batch.length
    totalBytes += Buffer.byteLength(JSON.stringify(batch), "utf8")
    if (totalRows > MAX_EXPORT_ROWS || totalBytes > MAX_EXPORT_TABLE_BYTES) throw new Error("Export logique trop volumineux : utiliser la sauvegarde native de la base")
  }
  for (const spec of COMPANY_TABLE_SPECS) {
    const delegate = database[spec.delegate]
    if (!delegate?.findMany) throw new Error(`Modèle Prisma indisponible pour l’export : ${spec.model}`)
    const rows: Array<Record<string, unknown>> = []
    for (let skip = 0; ; skip += 250) {
      const orderBy: Array<Record<string, string>> = spec.model === "MaintenanceContractEquipment" ? [{ contractId: "asc" }, { equipmentId: "asc" }] : spec.model === "AgencyMembership" ? [{ agencyId: "asc" }, { membershipId: "asc" }] : [{ id: "asc" }]
      const batch = await delegate.findMany({ where: spec.where(companyId), take: 250, skip, orderBy })
      accountBatch(batch)
      rows.push(...batch)
      if (batch.length < 250) break
    }
    tables.push({
      model: spec.model,
      rows: sortRows(rows.map((row) => redactSensitiveExportValues(row) as Record<string, unknown>)),
    })
  }

  const byModel = new Map(tables.map((table) => [table.model, table]))
  if (!byModel.get("Company")?.rows.length) throw new Error("Entreprise introuvable pour l’export")
  // In this same serializable snapshot, membership selects the exported users
  // without placing an unbounded list of their identifiers in every query.
  const userScope = { OR: [{ id: userId }, { memberships: { some: { companyId } } }] }
  const users = []
  for (let skip = 0; ; skip += 250) {
    const batch = await client.user.findMany({ where: userScope, orderBy: { id: "asc" }, take: 250, skip })
    accountBatch(batch)
    users.push(...batch)
    if (batch.length < 250) break
  }
  tables.splice(1, 0, {
    model: "User",
    rows: sortRows(users.map((row) => redactSensitiveExportValues(row) as Record<string, unknown>)),
  })

  const resourceIds = new Set<string>([companyId])
  for (const table of tables) {
    for (const row of table.rows) if (typeof row.id === "string") resourceIds.add(row.id)
  }
  const scopedAuditLogs = []
  const resources = [...resourceIds]
  for (let offset = 0; offset < resources.length; offset += 250) {
    for (let skip = 0; ; skip += 250) {
      const batch = await client.auditLog.findMany({ where: { user: userScope, resourceId: { in: resources.slice(offset, offset + 250) } }, orderBy: { id: "asc" }, take: 250, skip })
      accountBatch(batch)
      scopedAuditLogs.push(...batch)
      if (batch.length < 250) break
    }
  }
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
      ? await readMigrationArtifact(candidate.storageKey, MAX_EXPORT_FILE_BYTES)
      : await readLocalFile(candidate.storageKey, MAX_EXPORT_FILE_BYTES))
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
  const files: ReversibilityFile[] = []
  let totalBytes = 0
  for (const candidate of [...candidates.values()].sort((left, right) => fileCandidateId(left).localeCompare(fileCandidateId(right)))) {
    const expectedSize = Math.max(0, ...candidate.references.map(reference => reference.expectedSize ?? 0))
    if (totalBytes + expectedSize > MAX_EXPORT_FILE_BYTES) throw new Error("Export logique trop volumineux : utiliser la sauvegarde native du stockage")
    const file = await materializeFile(candidate)
    totalBytes += file.size ?? 0
    if (totalBytes > MAX_EXPORT_FILE_BYTES) throw new Error("Export logique trop volumineux : utiliser la sauvegarde native du stockage")
    files.push(file)
  }
  return { files, warnings }
}

export async function buildBackupPayload(userId: string, companyId: string): Promise<BackupPayload> {
  const tables = await prisma.$transaction(tx => collectCompanyTables(userId, companyId, tx), { isolationLevel: "Serializable", timeout: 30_000 })
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
    .filter((name) => (name.startsWith("crm-") || name.startsWith("freelio-")) && name.endsWith(".json"))
    .sort()
    .reverse()
  await Promise.all(files.slice(MAX_LOCAL_BACKUPS).map((name) => {
    const target = path.resolve(backupsRoot, name)
    if (!target.startsWith(`${backupsRoot}${path.sep}`)) throw new Error("Chemin de sauvegarde invalide")
    return rm(target, { force: true })
  }))
  return destination
}

/** Legacy archives require an isolated import; this entry point never rewrites live data. */
export async function restoreBackupPayload(input: unknown, _userId: string, companyId: string) {
  if (input && typeof input === "object" && (input as { schema?: unknown }).schema === BACKUP_SCHEMA) {
    const verification = verifyReversibilityExport(input)
    if (!verification.ok) throw new Error(`Export de réversibilité invalide : ${verification.errors.join(" ")}`)
    const exportCompanyId = (input as ReversibilityExport).scope.companyId
    if (exportCompanyId !== companyId) throw new Error("Cet export appartient à une autre entreprise")
    throw new Error(
      `Export de réversibilité ${verification.status === "COMPLETE" ? "complet" : "partiel"} et manifeste vérifié. La restauration automatique n’est pas proposée : utilisez une reprise logique contrôlée adaptée à la version du schéma.`
    )
  }
  if (!input || typeof input !== "object") throw new Error("Sauvegarde invalide")
  const payload = input as { schema?: unknown; company?: { id?: unknown } }
  if (payload.schema !== LEGACY_BACKUP_SCHEMA) throw new Error("Version de sauvegarde non prise en charge")
  if (payload.company?.id !== companyId) throw new Error("Cette sauvegarde appartient à une autre entreprise")
  throw new Error("Restauration v2 refusée : les relations de cet ancien format ne sont pas vérifiables avec le schéma actuel. Utilisez une reprise contrôlée dans un environnement isolé.")
}

export { BACKUP_SCHEMA, LEGACY_BACKUP_SCHEMA, verifyReversibilityExport }
