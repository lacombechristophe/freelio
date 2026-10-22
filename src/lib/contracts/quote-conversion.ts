import "server-only"

import prisma from "@/lib/prisma"
import type { AuthContext } from "@/lib/auth-wrapper"
import { buildYearlyDocumentPrefix, isUniqueConstraintConflict, nextDocumentNumber, readCompanyDocumentNumbers, withDocumentNumberRetry } from "@/lib/document-numbering"
import { MAX_COMMERCIAL_CENTS } from "@/lib/finance/commercial-calculation"
import { operationsDashboardScope } from "@/lib/operations/dashboard-scope"
import { quoteContractRevision } from "@/lib/quotes/conversion-source"
import { CONTRACT_TEMPLATE_PRESETS } from "./templates"

export const quoteContractChanged = "Le devis a changé. Rechargez la page avant de préparer le contrat ; votre saisie est conservée."

export async function prepareQuoteContract(context: AuthContext, quoteId: string, expectedRevision?: string) {
  const prefix = buildYearlyDocumentPrefix("CONT-", "CONT-")
  const prepare = () => withDocumentNumberRetry(async () => {
    const numbers = await readCompanyDocumentNumbers(() => prisma.contract.findMany({
      where: { companyId: context.companyId, number: { startsWith: prefix } }, select: { number: true },
    }))
    return prisma.$transaction(async tx => {
      const quote = await tx.quote.findFirst({
        where: { id: quoteId, companyId: context.companyId, client: { companyId: context.companyId } },
        include: {
          generatedContract: { select: { id: true } },
          versions: { orderBy: [{ version: "desc" }, { id: "asc" }], include: {
            sections: { orderBy: [{ order: "asc" }, { id: "asc" }], include: { lines: { orderBy: [{ order: "asc" }, { id: "asc" }] } } },
          } },
        },
      })
      if (!quote) throw new Error("Devis introuvable")
      if (quote.projectId) {
        const scope = operationsDashboardScope(context.companyId, context.agencyIds)
        const project = await tx.project.findFirst({
          where: { id: quote.projectId, ...scope.project, clientId: quote.clientId,
            OR: [{ projectTemplateId: null }, { projectTemplate: { companyId: context.companyId } }] },
          select: { site: { select: { clientId: true } } },
        })
        if (!project || project.site && project.site.clientId !== quote.clientId) throw new Error("Référence liée indisponible")
      }
      if (quote.generatedContract) {
        const existing = await tx.contract.findFirst({ where: {
          id: quote.generatedContract.id, companyId: context.companyId, clientId: quote.clientId, client: { companyId: context.companyId },
        }, select: { id: true, number: true } })
        if (!existing) throw new Error("Référence liée indisponible")
        return existing
      }
      if (quote.status !== "ACCEPTED") throw new Error("Le devis doit être accepté avant de préparer le contrat")
      const sourceRevision = quoteContractRevision(quote)
      if (expectedRevision !== sourceRevision) throw new Error(quoteContractChanged)
      const version = quote.versions[0]
      if (!version) throw new Error("Aucune version disponible")
      if (version.version !== quote.currentVersion || quote.versions.filter(item => item.version === version.version).length !== 1) {
        throw new Error("La version acceptée du devis doit être vérifiée.")
      }
      const lines = version.sections.flatMap(section => section.lines)
      if (!lines.length) throw new Error("Le devis ne contient aucune ligne.")
      const amounts = [version.totalHtCents, version.totalTvaCents, version.totalTtcCents]
      if (amounts.some(amount => !Number.isSafeInteger(amount) || amount < 0 || amount > MAX_COMMERCIAL_CENTS)
        || version.totalHtCents + version.totalTvaCents !== version.totalTtcCents) {
        throw new Error("Les montants du devis doivent être vérifiés.")
      }
      const claimed = await tx.quote.updateMany({ where: {
        id: quote.id, companyId: context.companyId, status: "ACCEPTED", updatedAt: quote.updatedAt, currentVersion: quote.currentVersion, projectId: quote.projectId,
      }, data: { updatedAt: quote.updatedAt } })
      if (claimed.count !== 1) throw new Error(quoteContractChanged)
      const number = nextDocumentNumber(numbers, prefix)
      const contract = await tx.contract.create({ data: {
        companyId: context.companyId, clientId: quote.clientId, sourceQuoteId: quote.id, number,
        title: `Contrat de fourniture et pose — ${quote.object}`, status: "DRAFT",
        content: buildContractContentFromQuote(quote, lines, version.totalTtcCents), validFrom: new Date(), validUntil: quote.validUntil,
      }, select: { id: true, number: true } })
      await tx.auditLog.create({ data: {
        userId: context.userId, action: "CREATE_CONTRACT", resource: "CONTRACT", resourceId: contract.id,
        payload: { fromQuote: quote.id, quoteVersionId: version.id, version: version.version, sourceRevision, number },
      } })
      return contract
    }, { isolationLevel: "Serializable" })
  }, { label: "le contrat issu du devis", retryTransactionConflicts: true })
  try { return await prepare() }
  catch (error) {
    if (!isUniqueConstraintConflict(error, "sourceQuoteId")) throw error
    return prepare()
  }
}

function escapeContractHtml(value: string | null | undefined) {
  if (!value) return ""
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;")
}

function formatEuro(cents: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100)
}

function buildContractContentFromQuote(
  quote: {
    object: string
    number: string
    validUntil: Date | null
  },
  lines: Array<{
    label: string
    description: string | null
    quantity: number
    unitPriceCents: number
  }>,
  totalTtcCents: number,
) {
  const scope = lines
    .map((line) => {
      const description = line.description ? `<br><span>${escapeContractHtml(line.description)}</span>` : ""
      return `<li><strong>${escapeContractHtml(line.label)}</strong>${description}</li>`
    })
    .join("")

  const template = CONTRACT_TEMPLATE_PRESETS.find((preset) => preset.id === "vertical-fourniture-pose")
  if (!template) throw new Error("Le modèle métier de fourniture et pose est indisponible")

  const quoteAppendix = [
    "<h2>Annexe — périmètre accepté</h2>",
    `<p>Objet : <strong>${escapeContractHtml(quote.object)}</strong>. Devis de référence : <strong>${escapeContractHtml(quote.number)}</strong>.</p>`,
    `<ul>${scope}</ul>`,
    `<p>Montant total de référence : <strong>${formatEuro(totalTtcCents)}</strong>. Toute fourniture ou intervention hors de ce périmètre nécessite un avenant ou un devis complémentaire accepté.</p>`,
  ].join("")

  return template.content.replace("<h2>Signature électronique</h2>", `${quoteAppendix}<h2>Signature électronique</h2>`)
}
