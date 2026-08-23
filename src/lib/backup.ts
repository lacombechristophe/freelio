import "server-only"

import { createHash, randomUUID } from "node:crypto"
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import prisma from "@/lib/prisma"
import { localFilesRoot } from "@/lib/local-files"

const BACKUP_SCHEMA = "freelio.local-backup.v2"
const MAX_LOCAL_BACKUPS = 14
const backupsRoot = path.resolve(process.cwd(), "data", "backups")
const restoreRoot = path.resolve(process.cwd(), "data", "restore-staging")

type LocalFileBackup = {
  path: string
  size: number
  sha256: string
  contentBase64: string
}

type BackupPayload = {
  schema: typeof BACKUP_SCHEMA
  exportedAt: string
  warning: string
  user: Record<string, any>
  company: Record<string, any>
  notifications: Array<Record<string, any>>
  auditLogs: Array<Record<string, any>>
  apiKeys: Array<Record<string, any>>
  localFiles: LocalFileBackup[]
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

export async function buildBackupPayload(userId: string, companyId: string): Promise<BackupPayload> {
  const [user, company, notifications, auditLogs, apiKeys, localFiles] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, name: true, email: true, image: true, aiUsageCount: true,
        companyId: true, createdAt: true, updatedAt: true,
      },
    }),
    prisma.company.findUnique({
      where: { id: companyId },
      include: {
        clients: { include: { contacts: true, activities: true, files: true } },
        serviceCats: true,
        services: true,
        projects: {
          include: {
            milestones: true, files: true, timeEntries: true,
            technicalProfile: true, acceptanceItems: true,
          },
        },
        quotes: { include: { versions: { include: { sections: { include: { lines: true } } } } } },
        invoices: {
          include: {
            lines: true, payments: true, creditNotes: true, facturXLog: true, reminders: true,
          },
        },
        recurring: { include: { occurrences: true } },
        contracts: { include: { signatures: true } },
        contractTemplates: { include: { clauses: true } },
        expenses: { include: { files: true } },
        pipelines: { include: { opportunities: { include: { activities: true } } } },
        organisationGoals: true,
        organisationTasks: true,
        webhooks: { include: { deliveries: true } },
        relanceConfig: true,
        bankTransactions: true,
      },
    }),
    prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
    prisma.auditLog.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
    prisma.apiKey.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
    collectLocalFiles(companyId),
  ])

  if (!user || !company) throw new Error("Compte local incomplet")
  return {
    schema: BACKUP_SCHEMA,
    exportedAt: new Date().toISOString(),
    warning: "Sauvegarde privée contenant des données clients, financières et des secrets chiffrés.",
    user,
    company,
    notifications,
    auditLogs,
    apiKeys,
    localFiles,
  }
}

export async function writeLocalBackup(payload: BackupPayload, label = "auto") {
  await mkdir(backupsRoot, { recursive: true })
  const stamp = payload.exportedAt.replace(/[:.]/g, "-")
  const destination = path.join(backupsRoot, `freelio-${label}-${stamp}.json`)
  await writeFile(destination, JSON.stringify(payload), { flag: "wx" })

  const files = (await readdir(backupsRoot))
    .filter((name) => name.startsWith("freelio-") && name.endsWith(".json"))
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

function validatePayload(input: unknown, companyId: string): asserts input is BackupPayload {
  if (!input || typeof input !== "object") throw new Error("Sauvegarde invalide")
  const payload = input as Partial<BackupPayload>
  if (payload.schema !== BACKUP_SCHEMA) throw new Error("Version de sauvegarde non prise en charge")
  if (!payload.company || payload.company.id !== companyId) {
    throw new Error("Cette sauvegarde appartient à une autre entreprise")
  }
  if (!Array.isArray(payload.localFiles)) throw new Error("Inventaire de fichiers absent")
}

async function stageLocalFiles(payload: BackupPayload, companyId: string) {
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

function nestedRows<T extends Record<string, any>>(parents: T[], key: string) {
  return parents.flatMap((parent) => Array.isArray(parent[key]) ? parent[key] : [])
}

export async function restoreBackupPayload(input: unknown, userId: string, companyId: string) {
  validatePayload(input, companyId)
  const payload = input
  const safety = await buildBackupPayload(userId, companyId)
  await writeLocalBackup(safety, "before-restore")
  const stage = await stageLocalFiles(payload, companyId)
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

    const filesRoot = localFilesRoot()
    const currentCompanyFiles = path.resolve(filesRoot, companyId)
    const stagedCompanyFiles = path.resolve(stage, companyId)
    if (!currentCompanyFiles.startsWith(`${filesRoot}${path.sep}`)) throw new Error("Répertoire cible invalide")
    await rm(currentCompanyFiles, { recursive: true, force: true })
    await mkdir(filesRoot, { recursive: true })
    try {
      await rename(stagedCompanyFiles, currentCompanyFiles)
    } catch {
      await mkdir(currentCompanyFiles, { recursive: true })
    }
    await rm(stage, { recursive: true, force: true })
    return { ok: true, restoredAt: new Date().toISOString() }
  } catch (error) {
    await rm(stage, { recursive: true, force: true })
    throw error
  }
}

export { BACKUP_SCHEMA }
