"use server"

import type { z } from "zod"
import prisma from "@/lib/prisma"
import { withAuth } from "@/lib/auth-wrapper"
import { runAutomationEvent } from "@/lib/automations/engine"
import { revalidatePath } from "next/cache"
import { logAction } from "@/lib/audit"
import { QuoteSchema } from "@/lib/validations"
import {
  buildYearlyDocumentPrefix,
  nextDocumentNumber,
  withDocumentNumberRetry,
} from "@/lib/document-numbering"

type QuoteInput = z.input<typeof QuoteSchema>

export async function getQuotes(cursor?: string, limit = 50) {
  return await withAuth(async ({ companyId }) => {
    return await prisma.quote.findMany({
      where: { companyId },
      take: limit,
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
  })
}

export async function getQuoteById(id: string) {
  return await withAuth(async ({ companyId }) => {
    return await prisma.quote.findFirst({
      where: { id, companyId },
      include: {
        client: true,
        company: true,
        project: true,
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
  })
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

async function generateInvoiceNumber(companyId: string, customPrefix?: string) {
  const prefix = buildYearlyDocumentPrefix(customPrefix, "FACT-")
  const last = await prisma.invoice.findFirst({
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
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

function formatEuro(cents: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100)
}

function buildContractContentFromQuote(quote: {
  object: string
  number: string
  validUntil: Date | null
}, lines: Array<{
  label: string
  description: string | null
  quantity: number
  unitPriceCents: number
}>, totalTtcCents: number) {
  const scope = lines
    .map((line) => {
      const description = line.description ? `<br><span>${escapeContractHtml(line.description)}</span>` : ""
      return `<li><strong>${escapeContractHtml(line.label)}</strong>${description}</li>`
    })
    .join("")

  return [
    "<h1>{{contract.title}}</h1>",
    "<p><strong>Entre les soussignes :</strong></p>",
    '<p>{{entreprise.name}}, immatriculee sous le SIRET {{entreprise.siret}}, ci-apres "le Prestataire",</p>',
    '<p>Et {{client.name}}, ci-apres "le Client".</p>',
    "<h2>1. Objet</h2>",
    `<p>Le present contrat encadre la mission de prestation relative a : <strong>${escapeContractHtml(quote.object)}</strong>, issue du devis ${escapeContractHtml(quote.number)}.</p>`,
    "<h2>2. Perimetre et livrables</h2>",
    `<ul>${scope}</ul>`,
    "<p>Toute demande non prevue dans ce perimetre fait l'objet d'une validation ecrite et d'une estimation complementaire avant execution.</p>",
    "<h2>3. Prix et facturation</h2>",
    `<p>Le montant total de reference issu du devis est de <strong>${formatEuro(totalTtcCents)}</strong>. Les modalites de paiement, acomptes et echeances sont celles convenues au devis ou par ecrit entre les Parties.</p>`,
    "<h2>4. Collaboration et acces</h2>",
    "<p>Le Client fournit les contenus, acces, identifiants, decisions et validations necessaires dans des delais compatibles avec le planning. Les retards imputables au Client decalent les echeances a due concurrence.</p>",
    "<h2>5. Recette et validation</h2>",
    "<p>Les livrables sont soumis a validation. A defaut de retour motive dans un delai de sept jours ouvrables apres mise a disposition, ils sont reputes acceptes.</p>",
    "<h2>6. Propriete intellectuelle</h2>",
    "<p>Sous reserve du paiement integral des sommes dues, les droits d'exploitation sur les livrables specifiquement crees pour le Client sont cedes dans la limite des usages convenus. Les methodes, outils, composants generiques et savoir-faire preexistants du Prestataire restent sa propriete.</p>",
    "<h2>7. Confidentialite</h2>",
    "<p>Chaque Partie conserve confidentielles les informations non publiques recues de l'autre Partie et ne les utilise que pour l'execution de la mission.</p>",
    "<h2>8. Responsabilite</h2>",
    "<p>La responsabilite du Prestataire est limitee aux dommages directs, certains et prouves, a l'exclusion des pertes d'exploitation, pertes de donnees indirectes ou prejudice commercial indirect.</p>",
    "<h2>9. Signature electronique</h2>",
    "<p>Les Parties reconnaissent que la signature electronique du present contrat produit les memes effets qu'une signature manuscrite, sous reserve de l'identification du signataire et de la conservation de la preuve de signature.</p>",
  ].join("")
}

function computeTotals(lines: Array<{ quantity: number; unitPriceCents: number; tvaRate: number }>) {
  let totalHtCents = 0
  let totalTvaCents = 0
  for (const l of lines) {
    const lineHt = Math.round(l.quantity * l.unitPriceCents)
    const lineTva = Math.round((lineHt * l.tvaRate) / 100)
    totalHtCents += lineHt
    totalTvaCents += lineTva
  }
  return { totalHtCents, totalTvaCents, totalTtcCents: totalHtCents + totalTvaCents }
}

export async function createQuote(data: QuoteInput) {
  return await withAuth(async ({ companyId, userId }) => {
    const validated = QuoteSchema.parse(data)
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { isTvaApplicable: true, quotePrefix: true }
    })
    if (!company) throw new Error("Entreprise introuvable")

    const lines = company.isTvaApplicable
      ? validated.lines
      : validated.lines.map((l) => ({ ...l, tvaRate: 0 }))

    const totals = computeTotals(lines)

    const quote = await withDocumentNumberRetry(async () => {
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
    }, { label: "le devis" })

    revalidatePath("/dashboard/devis")
    return quote
  })
}

export async function updateQuote(id: string, data: QuoteInput) {
  return await withAuth(async ({ companyId, userId }) => {
    const validated = QuoteSchema.parse(data)
    const existing = await prisma.quote.findFirst({
      where: { id, companyId },
      include: { versions: { orderBy: { version: "desc" }, take: 1 } },
    })
    if (!existing) throw new Error("Devis introuvable")
    if (existing.status !== "DRAFT") throw new Error("Seuls les devis en brouillon peuvent être modifiés.")

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { isTvaApplicable: true }
    })
    if (!company) throw new Error("Entreprise introuvable")

    const lines = company.isTvaApplicable
      ? validated.lines
      : validated.lines.map((l) => ({ ...l, tvaRate: 0 }))

    const totals = computeTotals(lines)
    const latestVersion = existing.versions[0]

    // Replace the latest version's sections/lines
    if (latestVersion) {
      await prisma.quoteSection.deleteMany({ where: { versionId: latestVersion.id } })
      await prisma.quoteVersion.update({
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
                create: lines.map((l, i) => ({
                  label: l.label,
                  description: l.description || null,
                  quantity: l.quantity,
                  unitPriceCents: l.unitPriceCents,
                  tvaRate: l.tvaRate,
                  order: i,
                })),
              },
            },
          },
        },
      })
    }

    const quote = await prisma.quote.update({
      where: { id },
      data: {
        clientId: validated.clientId,
        projectId: validated.projectId || null,
        object: validated.object,
        validUntil: validated.validUntil ? new Date(validated.validUntil) : null,
      },
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
  })
}

export async function updateQuoteStatus(
  quoteId: string,
  status: "DRAFT" | "SENT" | "ACCEPTED" | "REJECTED" | "EXPIRED"
) {
  return await withAuth(async ({ userId, companyId }) => {
    const existing = await prisma.quote.findFirst({
      where: { id: quoteId, companyId },
      include: { client: { select: { leadCaptures: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true } } } } },
    })
    if (!existing) throw new Error("Devis introuvable")

    const quote = await prisma.quote.update({
      where: { id: quoteId },
      data: { status },
    })
    await logAction({
      userId,
      action: "UPDATE_QUOTE_STATUS",
      resource: "QUOTE",
      resourceId: quoteId,
      payload: { status },
    })
    await runAutomationEvent({
      companyId,
      event: "QUOTE_STATUS_CHANGED",
      eventKey: `${quote.id}:status:${status}`,
      subjectModel: "Quote",
      subjectId: quote.id,
      leadId: existing.client.leadCaptures[0]?.id,
    }).catch((error) => console.error("Quote automation failed", error))
    revalidatePath("/dashboard/devis")
    revalidatePath(`/dashboard/devis/${quoteId}`)
    return quote
  })
}

export async function deleteQuote(id: string) {
  return await withAuth(async ({ companyId, userId }) => {
    const existing = await prisma.quote.findFirst({ where: { id, companyId } })
    if (!existing) throw new Error("Devis introuvable")
    if (existing.status !== "DRAFT") throw new Error("Seuls les brouillons peuvent être supprimés.")
    await prisma.quote.delete({ where: { id } })
    await logAction({
      userId,
      action: "DELETE_QUOTE",
      resource: "QUOTE",
      resourceId: id,
      payload: { number: existing.number },
    })
    revalidatePath("/dashboard/devis")
    return { ok: true }
  })
}

export async function convertQuoteToInvoice(quoteId: string) {
  return await withAuth(async ({ companyId, userId }) => {
    const quote = await prisma.quote.findFirst({
      where: { id: quoteId, companyId },
      include: {
        versions: {
          orderBy: { version: "desc" },
          take: 1,
          include: { sections: { include: { lines: true } } },
        },
      },
    })
    if (!quote) throw new Error("Devis introuvable")
    const latest = quote.versions[0]
    if (!latest) throw new Error("Aucune version disponible")

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { isTvaApplicable: true, invoicePrefix: true }
    })
    if (!company) throw new Error("Entreprise introuvable")

    let allLines = latest.sections.flatMap((s) => s.lines)
    if (!company.isTvaApplicable) {
      allLines = allLines.map((l) => ({ ...l, tvaRate: 0 }))
    }

    const dueDate = new Date()
    dueDate.setDate(dueDate.getDate() + 30)

    const totals = company.isTvaApplicable
      ? { totalHtCents: latest.totalHtCents, totalTvaCents: latest.totalTvaCents, totalTtcCents: latest.totalTtcCents }
      : computeTotals(allLines)

    const invoice = await withDocumentNumberRetry(async () => {
      const number = await generateInvoiceNumber(companyId, company.invoicePrefix)
      return await prisma.invoice.create({
        data: {
          companyId,
          clientId: quote.clientId,
          projectId: quote.projectId,
          number,
          object: quote.object,
          status: "DRAFT",
          type: "STANDARD",
          dueDate,
          totalHtCents: totals.totalHtCents,
          totalTvaCents: totals.totalTvaCents,
          totalTtcCents: totals.totalTtcCents,
          lines: {
            create: allLines.map((l, i) => ({
              label: l.label,
              description: l.description,
              quantity: l.quantity,
              unitPriceCents: l.unitPriceCents,
              tvaRate: l.tvaRate,
              order: i,
            })),
          },
        },
      })
    }, { label: "la facture issue du devis" })

    await prisma.quote.update({
      where: { id: quoteId },
      data: { status: "ACCEPTED" },
    })

    await logAction({
      userId,
      action: "CREATE_INVOICE",
      resource: "INVOICE",
      resourceId: invoice.id,
      payload: { fromQuote: quoteId },
    })

    revalidatePath("/dashboard/devis")
    revalidatePath("/dashboard/factures")
    return invoice
  })
}

export async function createContractFromQuote(quoteId: string) {
  return await withAuth(async ({ companyId, userId }) => {
    const quote = await prisma.quote.findFirst({
      where: { id: quoteId, companyId },
      include: {
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

    const latest = quote.versions[0]
    if (!latest) throw new Error("Aucune version disponible")
    const lines = latest.sections.flatMap((section) => section.lines)
    if (!lines.length) throw new Error("Le devis ne contient aucune ligne.")

    const contract = await withDocumentNumberRetry(async () => {
      const number = await generateContractNumber(companyId)
      const title = `Contrat de prestation - ${quote.object}`

      const created = await prisma.contract.create({
        data: {
          companyId,
          clientId: quote.clientId,
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
        payload: { fromQuote: quoteId, number },
      })

      return created
    }, { label: "le contrat issu du devis" })

    revalidatePath("/dashboard/devis")
    revalidatePath("/dashboard/contrats")
    return contract
  })
}
