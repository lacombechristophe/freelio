"use server"

import { z } from "zod"
import prisma from "@/lib/prisma"
import { withAuth } from "@/lib/auth-wrapper"
import { runAutomationEvent } from "@/lib/automations/engine"
import { revalidatePath } from "next/cache"
import { logAction } from "@/lib/audit"
import { QuoteSchema } from "@/lib/validations"
import { calculateConfiguredProductPrice, resolveProductOptionSelection } from "@/lib/product-pricing"
import { calculateCommercialDocument } from "@/lib/finance/commercial-calculation"
import { buildYearlyDocumentPrefix, isUniqueConstraintConflict, nextDocumentNumber, withDocumentNumberRetry } from "@/lib/document-numbering"
import { boundedPageSize } from "@/lib/pagination"
import { CONTRACT_TEMPLATE_PRESETS } from "@/lib/contracts/templates"
import { assertQuoteStatusTransition, quoteStatusDates, type QuoteStatus } from "@/lib/quotes/workflow"

type QuoteInput = z.input<typeof QuoteSchema>
type ValidatedQuoteLine = z.output<typeof QuoteSchema>["lines"][number]
const quoteIdSchema = z.string().cuid()

type QuoteFinancialLine = {
  quantity: number
  unitPriceCents: number
  tvaRate: number
  unitCostCents?: number | null
  listUnitPriceCents?: number | null
  discountRate?: number | null
}

function calculateQuoteTotals(lines: QuoteFinancialLine[]) {
  return calculateCommercialDocument(
    lines.map((line) => ({
      quantity: line.quantity,
      unitPriceCents: line.listUnitPriceCents ?? line.unitPriceCents,
      lineDiscountRate: line.discountRate ?? 0,
      tvaRate: line.tvaRate,
      unitCostCents: line.unitCostCents,
    })),
  )
}

export async function getQuotes(cursor?: string, limit = 50) {
  return await withAuth(async ({ companyId }) => {
    const pageSize = boundedPageSize(limit, 50, 100)
    return await prisma.quote.findMany({
      where: { companyId },
      take: pageSize,
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      include: {
        client: { select: { id: true, name: true } },
        versions: {
          orderBy: { version: "desc" },
          take: 1,
          select: { totalHtCents: true, totalTvaCents: true, totalTtcCents: true },
        },
      },
      orderBy: { createdAt: "desc" },
    })
  }, "sales.read")
}

export async function getQuoteById(id: string) {
  return await withAuth(async ({ companyId }) => {
    return await prisma.quote.findFirst({
      where: { id, companyId },
      include: {
        client: true,
        company: true,
        project: {
          include: {
            purchaseOrders: { select: { id: true, number: true, status: true } },
          },
        },
        customerOrder: {
          include: {
            invoices: { select: { id: true, number: true, status: true, type: true } },
          },
        },
        generatedContract: { select: { id: true, number: true, status: true } },
        versions: {
          orderBy: { version: "desc" },
          include: {
            sections: {
              orderBy: { order: "asc" },
              include: { lines: { orderBy: { order: "asc" } } },
            },
          },
        },
      },
    })
  }, "sales.read")
}

async function generateQuoteNumber(companyId: string, customPrefix?: string) {
  const prefix = buildYearlyDocumentPrefix(customPrefix, "DEV-")
  const last = await prisma.quote.findFirst({
    where: { companyId, number: { startsWith: prefix } },
    orderBy: { number: "desc" },
    select: { number: true },
  })
  return nextDocumentNumber(last?.number, prefix)
}

async function generateContractNumber(companyId: string) {
  const prefix = buildYearlyDocumentPrefix("CONT-", "CONT-")
  const last = await prisma.contract.findFirst({
    where: { companyId, number: { startsWith: prefix } },
    orderBy: { number: "desc" },
    select: { number: true },
  })
  return nextDocumentNumber(last?.number, prefix)
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

async function resolveCatalogQuoteLines(companyId: string, inputLines: ValidatedQuoteLine[]) {
  const productIds = [...new Set(inputLines.flatMap((line) => (line.productId ? [line.productId] : [])))]
  const products = productIds.length
    ? await prisma.product.findMany({
        where: { companyId, id: { in: productIds }, active: true },
        include: {
          optionGroups: { include: { values: { where: { active: true } } } },
          assemblyComponents: { include: { componentProduct: { select: { purchasePriceCents: true } } } },
          parentProduct: {
            include: {
              optionGroups: { include: { values: { where: { active: true } } } },
              assemblyComponents: { include: { componentProduct: { select: { purchasePriceCents: true } } } },
            },
          },
        },
      })
    : []
  if (products.length !== productIds.length) throw new Error("Une référence catalogue est inactive ou introuvable")
  const byId = new Map(products.map((product) => [product.id, product]))

  return inputLines.map((line) => {
    if (!line.productId)
      return {
        label: line.label,
        description: line.description || null,
        quantity: line.quantity,
        unitPriceCents: line.unitPriceCents,
        tvaRate: line.tvaRate,
        productId: null,
        configuration: undefined,
        unitCostCents: null,
        listUnitPriceCents: null,
        discountRate: 0,
      }
    const product = byId.get(line.productId)
    if (!product) throw new Error("Référence catalogue introuvable")
    const optionGroups = [...(product.parentProduct?.optionGroups ?? []), ...product.optionGroups]
    const optionValueIds = line.configuration?.optionValueIds ?? []
    const { uniqueIds, selectedValues, selections } = resolveProductOptionSelection(optionGroups, optionValueIds)
    const components = product.assemblyComponents.length ? product.assemblyComponents : (product.parentProduct?.assemblyComponents ?? [])
    const componentCost = components.reduce(
      (sum, component) => sum + Math.round(component.quantity * component.componentProduct.purchasePriceCents * (1 + component.wastePercent / 100)),
      0,
    )
    const pricing = calculateConfiguredProductPrice({
      baseSalePriceCents: product.salePriceCents,
      baseCostCents: components.length ? componentCost : product.purchasePriceCents,
      optionSaleDeltasCents: selectedValues.map((value) => value.priceDeltaCents),
      optionCostDeltasCents: selectedValues.map((value) => value.costDeltaCents),
      discountRate: line.discountRate ?? 0,
    })
    return {
      productId: product.id,
      label: [product.label, product.variantLabel].filter(Boolean).join(" · "),
      description: selections.map((selection) => `${selection.groupName} : ${selection.labels.join(", ")}`).join(" · ") || null,
      quantity: line.quantity,
      unitPriceCents: pricing.unitPriceCents,
      tvaRate: product.tvaRate,
      configuration: { optionValueIds: uniqueIds, selections },
      unitCostCents: pricing.unitCostCents,
      listUnitPriceCents: pricing.listUnitPriceCents,
      discountRate: pricing.discountRate,
    }
  })
}

export async function createQuote(data: QuoteInput) {
  return await withAuth(async ({ companyId, userId, agencyIds }) => {
    const validated = QuoteSchema.parse(data)
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { isTvaApplicable: true, quotePrefix: true },
    })
    if (!company) throw new Error("Entreprise introuvable")
    if (agencyIds !== null && !validated.projectId) throw new Error("Sélectionnez un chantier rattaché à votre agence")
    const [client, project] = await Promise.all([
      prisma.client.findFirst({ where: { id: validated.clientId, companyId }, select: { id: true } }),
      validated.projectId ? prisma.project.findFirst({ where: { id: validated.projectId, companyId, clientId: validated.clientId }, select: { id: true } }) : null,
    ])
    if (!client) throw new Error("Client introuvable")
    if (validated.projectId && !project) throw new Error("Le chantier ne correspond pas au client ou à votre agence")

    const resolvedLines = await resolveCatalogQuoteLines(companyId, validated.lines)
    const lines = company.isTvaApplicable ? resolvedLines : resolvedLines.map((line) => ({ ...line, tvaRate: 0 }))

    const totals = calculateQuoteTotals(lines)

    const quote = await withDocumentNumberRetry(
      async () => {
        const number = await generateQuoteNumber(companyId, company.quotePrefix)
        const created = await prisma.quote.create({
          data: {
            companyId,
            clientId: validated.clientId,
            projectId: validated.projectId || null,
            number,
            object: validated.object,
            status: "DRAFT",
            validUntil: validated.validUntil ? new Date(validated.validUntil) : null,
            currentVersion: 1,
            versions: {
              create: {
                version: 1,
                totalHtCents: totals.totalHtCents,
                totalTvaCents: totals.totalTvaCents,
                totalTtcCents: totals.totalTtcCents,
                sections: {
                  create: {
                    title: null,
                    order: 0,
                    lines: {
                      create: lines.map((l, i) => ({
                        label: l.label,
                        description: l.description || null,
                        quantity: l.quantity,
                        unitPriceCents: l.unitPriceCents,
                        tvaRate: l.tvaRate,
                        productId: l.productId,
                        configuration: l.configuration,
                        unitCostCents: l.unitCostCents,
                        listUnitPriceCents: l.listUnitPriceCents,
                        discountRate: l.discountRate,
                        order: i,
                      })),
                    },
                  },
                },
              },
            },
          },
        })

        await logAction({
          userId,
          action: "CREATE_QUOTE",
          resource: "QUOTE",
          resourceId: created.id,
          payload: { number, totalHtCents: totals.totalHtCents },
        })
        return created
      },
      { label: "le devis" },
    )

    revalidatePath("/dashboard/devis")
    return quote
  }, "sales.write")
}

export async function updateQuote(id: string, data: QuoteInput) {
  return await withAuth(async ({ companyId, userId, agencyIds }) => {
    const validated = QuoteSchema.parse(data)
    const existing = await prisma.quote.findFirst({
      where: { id, companyId },
      include: { versions: { orderBy: { version: "desc" }, take: 1 } },
    })
    if (!existing) throw new Error("Devis introuvable")
    if (existing.status !== "DRAFT") throw new Error("Seuls les devis en brouillon peuvent être modifiés.")

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { isTvaApplicable: true },
    })
    if (!company) throw new Error("Entreprise introuvable")
    if (agencyIds !== null && !validated.projectId) throw new Error("Sélectionnez un chantier rattaché à votre agence")
    const [client, project] = await Promise.all([
      prisma.client.findFirst({ where: { id: validated.clientId, companyId }, select: { id: true } }),
      validated.projectId ? prisma.project.findFirst({ where: { id: validated.projectId, companyId, clientId: validated.clientId }, select: { id: true } }) : null,
    ])
    if (!client) throw new Error("Client introuvable")
    if (validated.projectId && !project) throw new Error("Le chantier ne correspond pas au client ou à votre agence")

    const resolvedLines = await resolveCatalogQuoteLines(companyId, validated.lines)
    const lines = company.isTvaApplicable ? resolvedLines : resolvedLines.map((line) => ({ ...line, tvaRate: 0 }))

    const totals = calculateQuoteTotals(lines)
    const latestVersion = existing.versions[0]

    const quote = await prisma.$transaction(async (tx) => {
      const claimed = await tx.quote.updateMany({
        where: { id, companyId, status: "DRAFT", updatedAt: existing.updatedAt },
        data: {
          clientId: validated.clientId,
          projectId: validated.projectId || null,
          object: validated.object,
          validUntil: validated.validUntil ? new Date(validated.validUntil) : null,
        },
      })
      if (claimed.count !== 1) throw new Error("Le devis a changé pendant la modification. Rechargez-le puis réessayez.")

      if (latestVersion) {
        await tx.quoteSection.deleteMany({ where: { versionId: latestVersion.id } })
        await tx.quoteVersion.update({
          where: { id: latestVersion.id },
          data: {
            totalHtCents: totals.totalHtCents,
            totalTvaCents: totals.totalTvaCents,
            totalTtcCents: totals.totalTtcCents,
            sections: {
              create: {
                title: null,
                order: 0,
                lines: {
                  create: lines.map((line, order) => ({
                    label: line.label,
                    description: line.description || null,
                    quantity: line.quantity,
                    unitPriceCents: line.unitPriceCents,
                    tvaRate: line.tvaRate,
                    productId: line.productId,
                    configuration: line.configuration,
                    unitCostCents: line.unitCostCents,
                    listUnitPriceCents: line.listUnitPriceCents,
                    discountRate: line.discountRate,
                    order,
                  })),
                },
              },
            },
          },
        })
      }

      return tx.quote.findUniqueOrThrow({ where: { id } })
    })

    await logAction({
      userId,
      action: "UPDATE_QUOTE",
      resource: "QUOTE",
      resourceId: id,
      payload: { number: existing.number },
    })

    revalidatePath("/dashboard/devis")
    revalidatePath(`/dashboard/devis/${id}`)
    return quote
  }, "sales.write")
}

export async function updateQuoteStatus(quoteId: string, requestedStatus: QuoteStatus) {
  return await withAuth(async ({ userId, companyId }) => {
    const parsedQuoteId = quoteIdSchema.parse(quoteId)
    const existing = await prisma.quote.findFirst({
      where: { id: parsedQuoteId, companyId },
      include: { client: { select: { leadCaptures: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true } } } } },
    })
    if (!existing) throw new Error("Devis introuvable")

    const transition = assertQuoteStatusTransition(existing.status, requestedStatus)
    if (!transition.changed) return existing

    const claimed = await prisma.quote.updateMany({
      where: { id: parsedQuoteId, companyId, status: transition.current, updatedAt: existing.updatedAt },
      data: { status: transition.next, ...quoteStatusDates(transition.next) },
    })
    if (claimed.count !== 1) throw new Error("Le devis a changé. Rechargez-le avant de modifier son statut.")
    const quote = await prisma.quote.findUniqueOrThrow({ where: { id: parsedQuoteId } })
    await logAction({
      userId,
      action: "UPDATE_QUOTE_STATUS",
      resource: "QUOTE",
      resourceId: parsedQuoteId,
      payload: { previousStatus: transition.current, status: transition.next },
    })
    await runAutomationEvent({
      companyId,
      event: "QUOTE_STATUS_CHANGED",
      eventKey: `${quote.id}:status:${transition.next}`,
      subjectModel: "Quote",
      subjectId: quote.id,
      leadId: existing.client.leadCaptures[0]?.id,
      clientId: existing.clientId,
    }).catch((error) => console.error("Quote automation failed", error))
    revalidatePath("/dashboard/devis")
    revalidatePath(`/dashboard/devis/${parsedQuoteId}`)
    return quote
  }, "sales.write")
}

export async function deleteQuote(id: string) {
  return await withAuth(async ({ companyId, userId }) => {
    const parsedId = quoteIdSchema.parse(id)
    const existing = await prisma.quote.findFirst({ where: { id: parsedId, companyId } })
    if (!existing) throw new Error("Devis introuvable")
    if (existing.status !== "DRAFT") throw new Error("Seuls les brouillons peuvent être supprimés.")
    await prisma.quote.delete({ where: { id: parsedId } })
    await logAction({
      userId,
      action: "DELETE_QUOTE",
      resource: "QUOTE",
      resourceId: parsedId,
      payload: { number: existing.number },
    })
    revalidatePath("/dashboard/devis")
    return { ok: true }
  }, "sales.write")
}

export async function createContractFromQuote(quoteId: string) {
  return await withAuth(async ({ companyId, userId }) => {
    const parsedQuoteId = quoteIdSchema.parse(quoteId)
    const quote = await prisma.quote.findFirst({
      where: { id: parsedQuoteId, companyId },
      include: {
        generatedContract: true,
        versions: {
          orderBy: { version: "desc" },
          take: 1,
          include: {
            sections: {
              orderBy: { order: "asc" },
              include: { lines: { orderBy: { order: "asc" } } },
            },
          },
        },
      },
    })
    if (!quote) throw new Error("Devis introuvable")
    if (quote.generatedContract) return quote.generatedContract
    if (quote.status !== "ACCEPTED") throw new Error("Le devis doit être accepté avant de préparer le contrat")

    const latest = quote.versions[0]
    if (!latest) throw new Error("Aucune version disponible")
    const lines = latest.sections.flatMap((section) => section.lines)
    if (!lines.length) throw new Error("Le devis ne contient aucune ligne.")

    let contract
    try {
      contract = await withDocumentNumberRetry(
        async () => {
          const number = await generateContractNumber(companyId)
          const title = `Contrat de fourniture et pose — ${quote.object}`

          const created = await prisma.contract.upsert({
            where: { sourceQuoteId: quote.id },
            update: {},
            create: {
              companyId,
              clientId: quote.clientId,
              sourceQuoteId: quote.id,
              number,
              title,
              status: "DRAFT",
              content: buildContractContentFromQuote(quote, lines, latest.totalTtcCents),
              validFrom: new Date(),
              validUntil: quote.validUntil,
            },
          })

          await logAction({
            userId,
            action: "CREATE_CONTRACT",
            resource: "CONTRACT",
            resourceId: created.id,
            payload: { fromQuote: parsedQuoteId, number },
          })

          return created
        },
        { label: "le contrat issu du devis" },
      )
    } catch (error) {
      if (!isUniqueConstraintConflict(error, "sourceQuoteId")) throw error
      const concurrentContract = await prisma.contract.findFirst({ where: { companyId, sourceQuoteId: quote.id } })
      if (!concurrentContract) throw error
      return concurrentContract
    }

    revalidatePath("/dashboard/devis")
    revalidatePath("/dashboard/contrats")
    return contract
  }, "sales.write")
}
