import "server-only"

import prisma, { type TransactionClient } from "@/lib/prisma"
import type { AuthContext } from "@/lib/auth-wrapper"
import { getContext, requestContext } from "@/lib/context"
import { buildYearlyDocumentPrefix, isUniqueConstraintConflict, nextDocumentNumber, readCompanyDocumentNumbers, withDocumentNumberRetry } from "@/lib/document-numbering"
import { MAX_COMMERCIAL_CENTS } from "@/lib/finance/commercial-calculation"
import { calendarDayKey } from "@/lib/calendar-days"
import { operationsDashboardScope } from "./dashboard-scope"
import { quoteOrderRevision } from "@/lib/quotes/conversion-source"
import { QuoteConversionError } from "@/lib/quotes/conversion-error"

export const quoteConversionChanged = "Le devis a changé. Rechargez la page puis réessayez ; votre saisie est conservée."
type Input = { quoteId: string; depositRate: number; expectedInstallationAt: Date | null; expectedRevision?: string }

async function readSource(db: TransactionClient, context: AuthContext, quoteId: string) {
  const quote = await db.quote.findFirst({ where: { id: quoteId, companyId: context.companyId, client: { companyId: context.companyId } }, include: {
    customerOrder: { select: { id: true } },
    versions: { orderBy: [{ version: "desc" }, { id: "asc" }], include: { sections: { orderBy: [{ order: "asc" }, { id: "asc" }], include: { lines: { orderBy: [{ order: "asc" }, { id: "asc" }] } } } } },
  } })
  if (!quote) throw new QuoteConversionError("Devis introuvable")
  const scope = operationsDashboardScope(context.companyId, context.agencyIds)
  const project = quote.projectId ? await db.project.findFirst({ where: { id: quote.projectId, ...scope.project, clientId: quote.clientId,
    OR: [{ projectTemplateId: null }, { projectTemplate: { companyId: context.companyId } }] }, select: { id: true, status: true, site: { select: { clientId: true } } } }) : null
  if (quote.projectId && (!project || project.site && project.site.clientId !== quote.clientId)) throw new QuoteConversionError("Référence liée indisponible")
  const existing = quote.customerOrder ? await db.customerOrder.findFirst({ where: { id: quote.customerOrder.id, ...scope.customerOrder,
    quoteId: quote.id, clientId: quote.clientId, projectId: quote.projectId }, select: { id: true, number: true } }) : null
  if (quote.customerOrder && !existing) throw new QuoteConversionError("Référence liée indisponible")
  return { quote, project, existing, scope }
}

export async function convertAcceptedQuote(context: AuthContext, input: Input) {
  const prefix = buildYearlyDocumentPrefix("CMD-", "CMD-")
  const convert = () => withDocumentNumberRetry(async () => {
    const numbers = await readCompanyDocumentNumbers(() => prisma.customerOrder.findMany({ where: { companyId: context.companyId, number: { startsWith: prefix } }, select: { number: true } }))
    return prisma.$transaction(async tx => {
      const { quote, project, existing, scope } = await readSource(tx, context, input.quoteId)
      if (existing) return { success: true as const, ...existing, existing: true as const }
      if (quote.status !== "ACCEPTED") throw new QuoteConversionError("Enregistrez l’accord du client avant de lancer la commande")
      const sourceRevision = quoteOrderRevision(quote)
      if (input.expectedRevision !== sourceRevision) throw new QuoteConversionError(quoteConversionChanged)
      if (project && project.status !== "ACTIVE") throw new QuoteConversionError("Le chantier n’est plus actif")
      if (!project && context.agencyIds !== null) throw new QuoteConversionError("Sélectionnez un chantier accessible avant de lancer le dossier")
      const version = quote.versions[0]
      if (!version) throw new QuoteConversionError("Le devis ne contient aucune version")
      if (version.version !== quote.currentVersion || quote.versions.filter(item => item.version === version.version).length !== 1) throw new QuoteConversionError("La version acceptée du devis doit être vérifiée.")
      const lines = version.sections.flatMap(section => section.lines)
      if (!lines.length) throw new QuoteConversionError("Le devis ne contient aucune ligne")
      const amounts = [version.totalHtCents, version.totalTvaCents, version.totalTtcCents]
      if (amounts.some(amount => !Number.isSafeInteger(amount) || amount < 0 || amount > MAX_COMMERCIAL_CENTS)
        || version.totalHtCents + version.totalTvaCents !== version.totalTtcCents
        || lines.some(line => !Number.isFinite(line.quantity) || line.quantity <= 0 || !Number.isSafeInteger(line.unitPriceCents) || line.unitPriceCents < 0 || line.unitPriceCents > MAX_COMMERCIAL_CENTS || !Number.isFinite(line.tvaRate) || line.tvaRate < 0 || line.tvaRate > 100)) {
        throw new QuoteConversionError("Les montants du devis doivent être vérifiés.")
      }
      const productIds = [...new Set(lines.flatMap(line => line.productId ? [line.productId] : []))]
      if (productIds.length && await tx.product.count({ where: { id: { in: productIds }, ...scope.product } }) !== productIds.length) throw new QuoteConversionError("Référence liée indisponible")
      // Claim the quote before creating its unique operational dossier.
      const claimed = await tx.quote.updateMany({ where: { id: quote.id, companyId: context.companyId, status: "ACCEPTED", updatedAt: quote.updatedAt, currentVersion: quote.currentVersion, projectId: quote.projectId }, data: { updatedAt: quote.updatedAt } })
      if (claimed.count !== 1) throw new QuoteConversionError(quoteConversionChanged)
      const request = getContext()
      if (!request || request.actionPermission !== "sales.write") throw new QuoteConversionError("Accès commercial requis")
      return requestContext.run({ ...request, quoteOrderCreation: { quoteId: quote.id, clientId: quote.clientId } }, async () => {
        let projectId = quote.projectId
        if (!projectId) {
          const company = await tx.company.findUniqueOrThrow({ where: { id: context.companyId }, select: { serviceTimezone: true } })
          const startDate = new Date(`${calendarDayKey(new Date(), company.serviceTimezone)}T12:00:00.000Z`)
          const created = await tx.project.create({ data: { companyId: context.companyId, clientId: quote.clientId, name: `Chantier · ${quote.object}`,
            description: `Créé depuis le devis ${quote.number}`, worksiteType: "INSTALLATION", worksiteStage: "COMMANDE_CONFIRMEE", budgetCents: version.totalHtCents, startDate } })
          projectId = created.id
          const linked = await tx.quote.updateMany({ where: { id: quote.id, companyId: context.companyId, updatedAt: quote.updatedAt, projectId: null }, data: { projectId, updatedAt: new Date(Math.max(Date.now(), quote.updatedAt.getTime() + 1)) } })
          if (linked.count !== 1) throw new QuoteConversionError(quoteConversionChanged)
          await tx.auditLog.create({ data: { userId: context.userId, action: "CREATE_PROJECT", resource: "PROJECT", resourceId: projectId, payload: { quoteId: quote.id, quoteVersionId: version.id } } })
        }
        const depositCents = Math.round(version.totalTtcCents * input.depositRate / 100)
        const order = await tx.customerOrder.create({ data: { companyId: context.companyId, clientId: quote.clientId, quoteId: quote.id, projectId,
          number: nextDocumentNumber(numbers, prefix), status: "CONFIRMED", acceptedAt: quote.acceptedAt ?? new Date(), expectedInstallationAt: input.expectedInstallationAt,
          totalHtCents: version.totalHtCents, totalTvaCents: version.totalTvaCents, totalTtcCents: version.totalTtcCents, depositCents,
          lines: { create: lines.map((line, order) => ({ productId: line.productId, label: line.label, description: line.description, quantity: line.quantity, unitPriceCents: line.unitPriceCents, tvaRate: line.tvaRate, order, sourceKey: `quote:${line.id}` })) },
        } })
        await tx.auditLog.create({ data: { userId: context.userId, action: "CREATE_CUSTOMER_ORDER", resource: "CUSTOMER_ORDER", resourceId: order.id,
          payload: { quoteId: quote.id, quoteVersionId: version.id, version: version.version, sourceRevision, projectId, number: order.number, depositRate: input.depositRate, depositCents } } })
        return { success: true as const, id: order.id, number: order.number, existing: false as const }
      })
    }, { isolationLevel: "Serializable" })
  }, { label: "la commande issue du devis", retryTransactionConflicts: true })
  try { return await convert() }
  catch (error) {
    if (!isUniqueConstraintConflict(error, "quoteId")) throw error
    // A concurrent winner is returned only after rechecking all its references.
    return convert()
  }
}
