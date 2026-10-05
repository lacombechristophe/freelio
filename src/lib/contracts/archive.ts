import "server-only"
import { createHash } from "node:crypto"
import { z } from "zod"
import type { Prisma } from "@prisma/client"
import prisma from "@/lib/prisma"
import { encrypt, decrypt } from "@/lib/crypto"
import { assertDemoMutationAllowed } from "@/lib/demo-policy"
import { generatePdfFromHtml, inlinePdfFonts } from "@/lib/pdf/generator"
import { inlineSafePdfImages } from "@/lib/pdf/images"
import { renderContractHtml, signatureMarkup, CONTRACT_SIGNATURE_SLOT, CONTRACT_STATUS_SLOT } from "@/lib/pdf/contract-render"
import { compileContractVariables, sanitizeContractHtml } from "./html"
import { hasExpectedSignature, storeFileBytes, readLocalFile, removeLocalFile } from "@/lib/local-files"
import { withProcessorLease } from "@/lib/processing/lease"

const MAX_ARCHIVE_BYTES = 5 * 1024 * 1024
const digest = (value: string | Buffer) => createHash("sha256").update(value).digest("hex")
const snapshotSchema = z.object({
  version: z.literal(1), contractId: z.string().cuid(), companyId: z.string(), clientId: z.string().cuid(),
  number: z.string(), title: z.string(), content: z.string(), clientName: z.string(),
  validFrom: z.string().nullable(), validUntil: z.string().nullable(), html: z.string(),
  company: z.object({ name: z.string(), logo: z.string().nullable(), brandColor: z.string() }),
  source: z.object({ content: z.string(), title: z.string(), number: z.string(), clientId: z.string(), kind: z.string(), validFrom: z.string().nullable(), validUntil: z.string().nullable(), maintenanceContractId: z.string().nullable() }),
})
const signedSchema = z.object({ version: z.literal(1), contractId: z.string().cuid(), companyId: z.string(), clientId: z.string().cuid(), html: z.string(), content: z.string(), documentHash: z.string().regex(/^[a-f0-9]{64}$/), signedAt: z.string().datetime() })
export type ContractForSnapshot = Prisma.ContractGetPayload<{ include: { client: { include: { contacts: true } }; company: true } }>
export type ContractArchiveReference = { id: string; companyId: string; clientId: string; status: string; signedDocument: string | null; pdfUrl: string | null; pdfHash: string | null; archiveStatus: string | null }

export async function prepareContractSnapshot(contract: ContractForSnapshot, signal = AbortSignal.timeout(10_000)) {
  const primary = [...contract.client.contacts].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.id.localeCompare(b.id))[0]
  const content = sanitizeContractHtml(compileContractVariables({ content: contract.content,
    client: { name: contract.client.name, email: primary?.email }, company: contract.company,
    contract: { title: contract.title, validFrom: contract.validFrom, validUntil: contract.validUntil } }))
  if (Buffer.byteLength(content) > 1024 * 1024 || Buffer.byteLength(contract.content) > 1024 * 1024) throw new Error("Le contenu du contrat dépasse 1 Mo")
  const rendered = renderContractHtml({ number: contract.number, title: contract.title, status: "SENT", createdAt: contract.createdAt,
    validFrom: contract.validFrom, validUntil: contract.validUntil, contentHtml: content,
    client: { ...contract.client, email: primary?.email }, company: contract.company }, { signingSnapshot: true })
  const html = await inlineSafePdfImages(await inlinePdfFonts(rendered, true), signal)
  if (Buffer.byteLength(html) > 4 * 1024 * 1024) throw new Error("Le rendu du contrat dépasse 4 Mo")
  signal.throwIfAborted()
  const snapshot = snapshotSchema.parse({ version: 1, contractId: contract.id, companyId: contract.companyId, clientId: contract.clientId,
    number: contract.number, title: contract.title, content, clientName: contract.client.name,
    validFrom: contract.validFrom?.toISOString() ?? null, validUntil: contract.validUntil?.toISOString() ?? null, html,
    company: { name: contract.company.name, logo: html.match(/<img src="(data:[^"]+)"/)?.[1] ?? null, brandColor: contract.company.brandColor },
    source: { content: contract.content, title: contract.title, number: contract.number, clientId: contract.clientId, kind: contract.kind, validFrom: contract.validFrom?.toISOString() ?? null, validUntil: contract.validUntil?.toISOString() ?? null, maintenanceContractId: contract.maintenanceContractId } })
  const serialized = JSON.stringify(snapshot)
  return { documentSnapshot: encrypt(serialized), documentHash: digest(serialized), snapshot }
}

export function readContractSnapshot(value: string | null, hash: string | null, scope: { id: string; companyId: string; clientId: string }) {
  if (!value || !hash) throw new Error("Ce lien historique doit être renouvelé pour figer son contenu")
  const plain = decrypt(value)
  if (Buffer.byteLength(plain) > 6 * 1024 * 1024 || digest(plain) !== hash) throw new Error("Capture du contrat invalide")
  const snapshot = snapshotSchema.parse(JSON.parse(plain))
  if (snapshot.contractId !== scope.id || snapshot.companyId !== scope.companyId || snapshot.clientId !== scope.clientId) throw new Error("Capture du contrat hors périmètre")
  return snapshot
}

export function contractSnapshotWhere(snapshot: ReturnType<typeof readContractSnapshot>): Prisma.ContractWhereInput {
  return { id: snapshot.contractId, companyId: snapshot.companyId, ...snapshot.source, validFrom: snapshot.source.validFrom ? new Date(snapshot.source.validFrom) : null, validUntil: snapshot.source.validUntil ? new Date(snapshot.source.validUntil) : null }
}

export function sealContractSnapshot(snapshot: ReturnType<typeof readContractSnapshot>, documentHash: string, signature: { signerName: string; signerEmail: string; signedAt: Date; canvasData: string }) {
  if (snapshot.html.split(CONTRACT_SIGNATURE_SLOT).length !== 2 || snapshot.html.split(CONTRACT_STATUS_SLOT).length !== 2) throw new Error("Capture du contrat incompatible")
  const html = snapshot.html.replace(CONTRACT_SIGNATURE_SLOT, signatureMarkup({ signatures: [signature] }))
    .replace(CONTRACT_STATUS_SLOT, "Sign&eacute;").replace('data-status="sent"', 'data-status="signed"')
  if (Buffer.byteLength(html) > 6 * 1024 * 1024) throw new Error("Le contrat signé dépasse 6 Mo")
  return encrypt(JSON.stringify(signedSchema.parse({ version: 1, contractId: snapshot.contractId, companyId: snapshot.companyId, clientId: snapshot.clientId, html, content: snapshot.content, documentHash, signedAt: signature.signedAt.toISOString() })))
}

export function previewContractSnapshot(snapshot: ReturnType<typeof readContractSnapshot>) {
  if (snapshot.html.split(CONTRACT_SIGNATURE_SLOT).length !== 2 || snapshot.html.split(CONTRACT_STATUS_SLOT).length !== 2) throw new Error("Capture du contrat incompatible")
  return snapshot.html.replace(CONTRACT_SIGNATURE_SLOT, signatureMarkup({ signatures: [] })).replace(CONTRACT_STATUS_SLOT, "En attente de signature")
}

export function readSignedContractDocument(value: string | null, scope: { id: string; companyId: string; clientId: string }) {
  if (!value) throw new Error("Archive historique indisponible")
  const plain = decrypt(value)
  if (Buffer.byteLength(plain) > 7 * 1024 * 1024) throw new Error("Capture signée trop grande")
  const document = signedSchema.parse(JSON.parse(plain))
  if (document.contractId !== scope.id || document.companyId !== scope.companyId || document.clientId !== scope.clientId) throw new Error("Capture signée hors périmètre")
  return document
}

export async function readContractArchive(contract: ContractArchiveReference, maxBytes = MAX_ARCHIVE_BYTES) {
  if (contract.status !== "SIGNED" || !contract.signedDocument || contract.archiveStatus !== "READY" || !contract.pdfUrl || !contract.pdfHash) throw new Error(contract.signedDocument ? "Archive du contrat en préparation ou indisponible" : "Archive historique indisponible")
  const prefix = `${contract.companyId}/generated/${contract.id}/`, key = contract.pdfUrl.replace(/^(local:|r2:)/, ""), leaf = key.slice(prefix.length)
  if (!/^(local:|r2:)/.test(contract.pdfUrl) || !key.startsWith(prefix) || !leaf || /[\\/\x00-\x1f]/.test(leaf) || leaf === "." || leaf === "..") throw new Error("Archive du contrat hors périmètre")
  const document = readSignedContractDocument(contract.signedDocument, contract), pdf = await readLocalFile(contract.pdfUrl, Math.min(maxBytes, MAX_ARCHIVE_BYTES))
  if (!hasExpectedSignature("application/pdf", pdf) || digest(pdf) !== contract.pdfHash) throw new Error("Archive du contrat altérée")
  return { ...document, pdf }
}

export async function processDueContractArchives(input: { companyId?: string; limit?: number } = {}) {
  assertDemoMutationAllowed()
  const summary = { examined: 0, generated: 0, failed: 0 }
  const result = await withProcessorLease("signed-contract-pdf", async control => {
    const due = await prisma.contract.findMany({ where: { ...(input.companyId ? { companyId: input.companyId } : {}), status: "SIGNED", signedDocument: { not: null }, archiveStatus: { in: ["PENDING", "FAILED"] }, archiveNextAttemptAt: { lte: new Date() }, archiveAttempts: { lt: 5 } }, orderBy: [{ archiveNextAttemptAt: "asc" }, { id: "asc" }], take: Math.max(1, Math.min(input.limit ?? 5, 25)) })
    summary.examined = due.length
    for (const contract of due) {
      let path: string | undefined
      try {
        await control.assertOwned()
        const claimed = await prisma.contract.updateMany({ where: { id: contract.id, companyId: contract.companyId, status: "SIGNED", signedDocument: contract.signedDocument, archiveStatus: contract.archiveStatus, archiveAttempts: contract.archiveAttempts }, data: { archiveAttempts: { increment: 1 }, archiveNextAttemptAt: new Date(Date.now() + 5 * 60_000) } })
        if (!claimed.count) continue
        const document = readSignedContractDocument(contract.signedDocument, contract), signal = AbortSignal.any([control.signal, AbortSignal.timeout(45_000)])
        const bytes = Buffer.from(await generatePdfFromHtml(document.html, { signal }))
        signal.throwIfAborted(); await control.assertOwned()
        if (bytes.length > MAX_ARCHIVE_BYTES || !hasExpectedSignature("application/pdf", bytes)) throw new Error("PDF signé invalide ou supérieur à 5 Mo")
        const stored = await storeFileBytes({ companyId: contract.companyId, kind: "generated", resourceId: contract.id, originalName: `${contract.number}.pdf`, type: "application/pdf", bytes })
        path = stored.relativePath
        await control.assertOwned()
        const saved = await prisma.contract.updateMany({ where: { id: contract.id, companyId: contract.companyId, status: "SIGNED", signedDocument: contract.signedDocument, archiveAttempts: contract.archiveAttempts + 1, archiveStatus: { in: ["PENDING", "FAILED"] } }, data: { pdfUrl: stored.relativePath, pdfHash: stored.sha256, archiveStatus: "READY", archiveNextAttemptAt: null, archiveError: null } })
        if (!saved.count) throw new Error("Contrat modifié pendant l’archivage")
        path = undefined; summary.generated++
      } catch {
        if (path) await removeLocalFile(path).catch(() => undefined)
        await control.assertOwned()
        await prisma.contract.updateMany({ where: { id: contract.id, companyId: contract.companyId, status: "SIGNED", signedDocument: contract.signedDocument, archiveAttempts: contract.archiveAttempts + 1, archiveStatus: { not: "READY" } }, data: { archiveStatus: "FAILED", archiveError: "Génération du PDF signé échouée ; capture conservée", archiveNextAttemptAt: contract.archiveAttempts + 1 >= 5 ? null : new Date(Date.now() + Math.min(15, 2 ** contract.archiveAttempts) * 60_000) } })
        summary.failed++
      }
    }
  }, 60_000)
  return result.acquired ? result.value ?? summary : summary
}
