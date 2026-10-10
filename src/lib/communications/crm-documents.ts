import "server-only"
import { createHash } from "node:crypto"
import type { Prisma } from "@prisma/client"
import { z } from "zod"
import prisma from "@/lib/prisma"
import { getContext, requestContext } from "@/lib/context"
import { hasPermission, normalizeCompanyRole } from "@/lib/permissions"
import { resolveAgencyAccess } from "@/lib/agency-access"
import { withProcessorLease } from "@/lib/processing/lease"
import { generatePdfFromHtml } from "@/lib/pdf/generator"
import { assertDemoMutationAllowed } from "@/lib/demo-policy"
import { hasExpectedSignature, readLocalFile, storeFileBytes } from "@/lib/local-files"
import { isIssuedInvoice, readIssuedInvoice } from "@/lib/finance/issued-invoice"
import { readContractArchive } from "@/lib/contracts/archive"
import { assertEditableDraft, addEmailDraftAttachment } from "./draft-attachments"
import { getEmailDraft, readEmailDraft } from "./drafts"
import { emailAttachmentsSchema, emailAttachmentMetadataSchema, MAX_EMAIL_FILE_BYTES } from "./attachment-types"
import { readCurrentQuoteCopy, captureQuoteCopy } from "./quote-copy"
import { EmailCrmDocumentError } from "./crm-document-error"

export { EmailCrmDocumentError } from "./crm-document-error"
const kind = z.enum(["CLIENT_FILE", "ISSUED_INVOICE", "QUOTE_COPY", "SIGNED_CONTRACT"])
const querySchema = z.object({ draftId: z.string().cuid(), kind, search: z.string().trim().max(200).default(""), page: z.number().int().positive().max(100_000).default(1) })
const attachSchema = z.object({ draftId: z.string().cuid(), version: z.number().int().positive(), kind, sourceId: z.string().cuid(), sourceHash: z.string().regex(/^[a-f0-9]{64}$/), attachmentId: z.string().uuid() })
const types = ["application/pdf", "image/png", "image/jpeg"]
const invoiceArchive: Prisma.InvoiceWhereInput = { pdfUrl: { not: null }, pdfHash: { not: null }, issuedDocument: { not: null }, OR: [{ lockedAt: { not: null } }, { status: { in: ["SENT", "OVERDUE", "PAID"] } }] }
const fileName = (name: string) => name.replace(/[\x00-\x1f\x7f/\\]/g, "_").slice(0, 180) || "document.pdf"

function assertActor(companyId: string, userId: string, sourceKind: z.infer<typeof kind>) {
  const actor = getContext()
  if (!actor || actor.companyId !== companyId || actor.userId !== userId || !hasPermission(actor.role, "automation.read")) throw new EmailCrmDocumentError("Documents inaccessibles")
  if (!hasPermission(actor.role, sourceKind === "ISSUED_INVOICE" ? "finance.read" : sourceKind === "QUOTE_COPY" || sourceKind === "SIGNED_CONTRACT" ? "sales.read" : "crm.read")) throw new EmailCrmDocumentError("Vous n’avez pas les droits de lecture de ces documents")
  return actor
}

async function clientForDraft(companyId: string, userId: string, draftId: string) {
  const draft = await readEmailDraft(companyId, userId, draftId).catch(error => {
    if (error instanceof Error && error.message === "Brouillon introuvable") throw new EmailCrmDocumentError("Brouillon introuvable")
    throw error
  })
  const contact = draft.contactId ? await prisma.contact.findFirst({ where: { id: draft.contactId, client: { companyId } }, select: { clientId: true } }) : null
  if (!contact) throw new EmailCrmDocumentError("Choisissez un destinataire avant de sélectionner un document CRM")
  return { draft, clientId: contact.clientId }
}

function assertStoredReference(reference: string, companyId: string, storageKind: string, resourceId: string) {
  const prefix = `${companyId}/${storageKind}/${resourceId}/`
  const key = reference.replace(/^(local:|r2:)/, "")
  const leaf = key.slice(prefix.length)
  if (!/^(local:|r2:)/.test(reference) || !key.startsWith(prefix) || !leaf || /[\\/\x00-\x1f]/.test(leaf) || leaf === "." || leaf === "..") throw new EmailCrmDocumentError("Référence du document invalide ; aucune URL externe n’est téléchargée")
}

export type CrmEmailDocumentPage = {
  kind: z.infer<typeof kind>; clientId: string; total: number; page: number; pageCount: number; canReadInvoices: boolean; canReadQuotes: boolean; canReadContracts: boolean
  documents: { id: string; name: string; type: string; size: number | null; sourceHash: string; date: string; quoteVersion?: number; title?: string }[]
}

export async function listCrmEmailDocuments(companyId: string, userId: string, input: unknown): Promise<CrmEmailDocumentPage> {
  const data = querySchema.safeParse(input)
  if (!data.success) throw new EmailCrmDocumentError("Recherche de documents invalide")
  const query = data.data
  const actor = assertActor(companyId, userId, query.kind)
  const { clientId } = await clientForDraft(companyId, userId, query.draftId)
  const contains = { contains: query.search, ...(process.env.DATABASE_URL?.startsWith("postgres") ? { mode: "insensitive" as const } : {}) }
  const capabilities = { canReadInvoices: hasPermission(actor.role, "finance.read"), canReadQuotes: hasPermission(actor.role, "sales.read"), canReadContracts: hasPermission(actor.role, "sales.read") }
  const result = await prisma.$transaction(async tx => {
    if (query.kind === "SIGNED_CONTRACT") {
      const where: Prisma.ContractWhereInput = { companyId, clientId, status: "SIGNED", archiveStatus: "READY", signedDocument: { not: null }, pdfUrl: { not: null }, pdfHash: { not: null }, signatures: { some: {} }, ...(query.search ? { OR: [{ number: contains }, { title: contains }] } : {}) }
      const total = await tx.contract.count({ where }), pageCount = Math.max(1, Math.ceil(total / 25)), page = Math.min(query.page, pageCount)
      const rows = await tx.contract.findMany({ where, select: { id: true, number: true, title: true, pdfHash: true, signatures: { orderBy: [{ signedAt: "desc" }, { id: "desc" }], take: 1, select: { signedAt: true } } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * 25, take: 25 })
      return { kind: query.kind, clientId, total, page, pageCount, ...capabilities, documents: rows.map(row => ({ id: row.id, name: fileName(`${row.number}.pdf`), title: row.title, type: "application/pdf", size: null, sourceHash: row.pdfHash!, date: row.signatures[0].signedAt.toISOString() })) }
    }
    if (query.kind === "QUOTE_COPY") {
      const where: Prisma.QuoteWhereInput = { companyId, clientId, versions: { some: {} }, ...(query.search ? { OR: [{ number: contains }, { object: contains }] } : {}) }
      const total = await tx.quote.count({ where }), pageCount = Math.max(1, Math.ceil(total / 25)), page = Math.min(query.page, pageCount)
      const rows = await tx.quote.findMany({ where, select: { id: true }, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], skip: (page - 1) * 25, take: 25 })
      const copies = []
      for (const row of rows) copies.push(await readCurrentQuoteCopy(companyId, clientId, row.id, tx))
      return { kind: query.kind, clientId, total, page, pageCount, ...capabilities, copies }
    }
    if (query.kind === "CLIENT_FILE") {
      const where: Prisma.ClientFileWhereInput = { clientId, client: { companyId }, type: { in: types }, size: { gt: 0, lte: MAX_EMAIL_FILE_BYTES }, sha256: { not: null }, ...(query.search ? { name: contains } : {}) }
      const total = await tx.clientFile.count({ where }), pageCount = Math.max(1, Math.ceil(total / 25)), page = Math.min(query.page, pageCount)
      const files = await tx.clientFile.findMany({ where, select: { id: true, name: true, type: true, size: true, sha256: true, createdAt: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * 25, take: 25 })
      return { kind: query.kind, clientId, total, page, pageCount, ...capabilities, documents: files.map(file => ({ id: file.id, name: fileName(file.name), type: file.type, size: file.size as number | null, sourceHash: file.sha256!, date: file.createdAt.toISOString() })) }
    }
    const where: Prisma.InvoiceWhereInput = { ...invoiceArchive, companyId, clientId, ...(query.search ? { AND: [{ OR: [{ number: contains }, { object: contains }] }] } : {}) }
    const total = await tx.invoice.count({ where }), pageCount = Math.max(1, Math.ceil(total / 25)), page = Math.min(query.page, pageCount)
    const invoices = await tx.invoice.findMany({ where, select: { id: true, number: true, pdfHash: true, date: true }, orderBy: [{ date: "desc" }, { id: "desc" }], skip: (page - 1) * 25, take: 25 })
    return { kind: query.kind, clientId, total, page, pageCount, ...capabilities, documents: invoices.map(invoice => ({ id: invoice.id, name: fileName(`${invoice.number}.pdf`), type: "application/pdf", size: null as number | null, sourceHash: invoice.pdfHash!, date: invoice.date.toISOString() })) }
  }, { isolationLevel: "Serializable" })
  if (result.kind !== "QUOTE_COPY") return result
  const { copies, ...pageInfo } = result
  const images = new Map<string, string>(), signal = AbortSignal.timeout(10_000)
  const documents: CrmEmailDocumentPage["documents"] = []
  for (const source of copies) {
    const copy = await captureForEmail(source, signal, images)
    documents.push({ id: copy.id, name: fileName(`${copy.number}-v${copy.quoteVersion}-copie.pdf`), type: "application/pdf", size: null, sourceHash: copy.fingerprint, date: copy.date, quoteVersion: copy.quoteVersion })
  }
  return { ...pageInfo, documents }
}

async function captureForEmail(source: Awaited<ReturnType<typeof readCurrentQuoteCopy>>, signal: AbortSignal, images?: Map<string, string>) {
  try { return await captureQuoteCopy(source, signal, images) }
  catch (error) {
    if (error instanceof EmailCrmDocumentError) throw error
    throw new EmailCrmDocumentError("Ressources du devis indisponibles ou délai dépassé ; aucune copie enregistrée", { cause: error })
  }
}

async function salesDocumentAuthor(companyId: string, userId: string) {
  const member = await prisma.membership.findUnique({ where: { companyId_userId: { companyId, userId } }, select: {
    id: true, status: true, role: true, agencyMemberships: { where: { agency: { active: true } }, select: { agencyId: true } },
  } })
  if (!member || member.status !== "ACTIVE") throw new EmailCrmDocumentError("Les droits de l’auteur ne permettent plus cette copie")
  const role = normalizeCompanyRole(member.role)
  if (!hasPermission(role, "sales.read") || !hasPermission(role, "automation.write")) throw new EmailCrmDocumentError("Les droits de l’auteur ne permettent plus cette copie")
  return { companyId, userId, membershipId: member.id, role, agencyIds: resolveAgencyAccess(role, member.agencyMemberships.map(item => item.agencyId)), actionPermission: "automation.write" as const }
}

async function attachQuoteCopy(companyId: string, userId: string, query: z.infer<typeof attachSchema>, clientId: string) {
  const result = await withProcessorLease("crm-quote-pdf", async control => {
    const signal = AbortSignal.any([control.signal, AbortSignal.timeout(45_000)])
    return requestContext.run(await salesDocumentAuthor(companyId, userId), async () => {
      const draft = await assertEditableDraft(companyId, userId, query.draftId, query.version)
      const files = emailAttachmentsSchema.parse(draft.attachments)
      if (files.length >= 5 || files.some(file => file.source?.kind === "QUOTE_COPY" && file.source.id === query.sourceId && file.source.fingerprint === query.sourceHash)) throw new EmailCrmDocumentError("Limites ou copie du devis déjà présente ; aucune génération engagée")
      const copy = await captureForEmail(await readCurrentQuoteCopy(companyId, clientId, query.sourceId), signal)
      if (copy.fingerprint !== query.sourceHash) throw new EmailCrmDocumentError("Le devis ou ses coordonnées ont été modifiés ; actualisez la sélection")
      let bytes: Buffer
      try { bytes = Buffer.from(await generatePdfFromHtml(copy.html, { signal })); signal.throwIfAborted() }
      catch (error) { throw new EmailCrmDocumentError("Génération du devis impossible ou délai dépassé ; aucune copie enregistrée", { cause: error }) }
      if (bytes.length > MAX_EMAIL_FILE_BYTES || !hasExpectedSignature("application/pdf", bytes)) throw new EmailCrmDocumentError("PDF du devis invalide ou supérieur à 5 Mo ; aucune copie enregistrée")
      const metadata = emailAttachmentMetadataSchema.parse({ id: query.attachmentId, name: fileName(`${copy.number}-v${copy.quoteVersion}-copie.pdf`), type: "application/pdf", size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") })
      return requestContext.run(await salesDocumentAuthor(companyId, userId), () => addEmailDraftAttachment(companyId, userId, query.draftId, query.version, metadata, async () => {
        await control.assertOwned(); signal.throwIfAborted()
        const current = await clientForDraft(companyId, userId, query.draftId)
        if (current.clientId !== clientId) throw new EmailCrmDocumentError("Le client destinataire a changé ; actualisez la sélection")
        const latest = await captureForEmail(await readCurrentQuoteCopy(companyId, clientId, query.sourceId), signal)
        if (latest.fingerprint !== copy.fingerprint) throw new EmailCrmDocumentError("Le devis a changé pendant la génération ; actualisez la sélection")
        await control.assertOwned(); signal.throwIfAborted()
        return storeFileBytes({ companyId, kind: "email-draft", resourceId: query.draftId, originalName: metadata.name, type: metadata.type, bytes })
      }, { kind: "QUOTE_COPY", id: copy.id, version: copy.quoteVersion, fingerprint: copy.fingerprint, copiedAt: new Date().toISOString() }))
    })
  }, 60_000)
  if (!result.acquired) throw new EmailCrmDocumentError("Une génération de copie PDF est déjà en cours ; réessayez dans un instant")
  return result.value
}

export async function attachCrmEmailDocument(companyId: string, userId: string, input: unknown) {
  assertDemoMutationAllowed()
  const data = attachSchema.safeParse(input)
  if (!data.success) throw new EmailCrmDocumentError("Sélection de document invalide")
  const query = data.data
  const actor = assertActor(companyId, userId, query.kind)
  if (!hasPermission(actor.role, "automation.write")) throw new EmailCrmDocumentError("Ajout de pièce jointes interdit")
  const { draft, clientId } = await clientForDraft(companyId, userId, query.draftId)
  const existing = emailAttachmentsSchema.parse(draft.attachments).find(file => file.id === query.attachmentId)
  if (existing) {
    if (query.kind === "QUOTE_COPY" ? existing.source?.kind !== "QUOTE_COPY" || existing.source.id !== query.sourceId || existing.source.fingerprint !== query.sourceHash : existing.sha256 !== query.sourceHash) throw new EmailCrmDocumentError("Cette pièce existe avec un autre contenu")
    return getEmailDraft(companyId, userId, draft.id)
  }
  if (query.kind === "QUOTE_COPY") return attachQuoteCopy(companyId, userId, query, clientId)
  await assertEditableDraft(companyId, userId, draft.id, query.version)
  let bytes: Buffer, name: string, type: string
  try {
    if (query.kind === "CLIENT_FILE") {
      const source = await prisma.clientFile.findFirst({ where: { id: query.sourceId, clientId, client: { companyId } }, select: { url: true, name: true, type: true, size: true, sha256: true } })
      if (!source || source.sha256 !== query.sourceHash || !types.includes(source.type) || source.size <= 0 || source.size > MAX_EMAIL_FILE_BYTES) throw new EmailCrmDocumentError("Document indisponible ou modifié ; actualisez la sélection")
      assertStoredReference(source.url, companyId, "client", clientId)
      bytes = await readLocalFile(source.url, source.size)
      if (bytes.length !== source.size) throw new EmailCrmDocumentError("Taille du document invalide")
      name = fileName(source.name); type = source.type
    } else if (query.kind === "SIGNED_CONTRACT") {
      const source = await prisma.contract.findFirst({ where: { id: query.sourceId, companyId, clientId, status: "SIGNED", signatures: { some: {} } } })
      if (!source || source.pdfHash !== query.sourceHash) throw new EmailCrmDocumentError("Contrat archivé indisponible ou modifié ; actualisez la sélection")
      bytes = (await readContractArchive(source, MAX_EMAIL_FILE_BYTES)).pdf
      name = fileName(`${source.number}.pdf`); type = "application/pdf"
    } else {
      const source = await prisma.invoice.findFirst({ where: { id: query.sourceId, companyId, clientId }, select: { id: true, companyId: true, number: true, status: true, lockedAt: true, issuedDocument: true, pdfUrl: true, pdfHash: true } })
      if (!source || !isIssuedInvoice(source) || source.pdfHash !== query.sourceHash || !source.pdfUrl) throw new EmailCrmDocumentError("Facture archivée indisponible ou modifiée ; actualisez la sélection")
      assertStoredReference(source.pdfUrl, companyId, "generated", source.id)
      bytes = (await readIssuedInvoice(source, MAX_EMAIL_FILE_BYTES)).pdf
      name = fileName(`${source.number}.pdf`); type = "application/pdf"
    }
    if (createHash("sha256").update(bytes).digest("hex") !== query.sourceHash || !hasExpectedSignature(type, bytes)) throw new EmailCrmDocumentError("Document altéré ; ajout refusé")
  } catch (error) {
    if (error instanceof EmailCrmDocumentError) throw error
    throw new EmailCrmDocumentError("Document absent, invalide ou supérieur à 5 Mo ; aucun PDF n’a été régénéré")
  }
  const metadata = emailAttachmentMetadataSchema.parse({ id: query.attachmentId, name, type, size: bytes.length, sha256: query.sourceHash })
  const copy = () => addEmailDraftAttachment(companyId, userId, draft.id, query.version, metadata, async () => {
    // Recheck the draft's recipient inside its mutation lease before storage.
    const current = await clientForDraft(companyId, userId, draft.id)
    if (current.clientId !== clientId) throw new EmailCrmDocumentError("Le client destinataire a changé ; actualisez la sélection")
    return storeFileBytes({ companyId, kind: "email-draft", resourceId: draft.id, originalName: metadata.name, type: metadata.type, bytes })
  })
  return query.kind === "SIGNED_CONTRACT" ? requestContext.run(await salesDocumentAuthor(companyId, userId), copy) : copy()
}
