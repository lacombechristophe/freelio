"use server"

import { z } from "zod"
import prisma from "@/lib/prisma"
import { withAuth } from "@/lib/auth-wrapper"
import { revalidatePath } from "next/cache"
import { logAction } from "@/lib/audit"
import {
  CreditNoteSchema,
  InvoiceSchema,
  PaymentSchema,
  RecurringInvoiceSchema,
  ReminderSchema,
} from "@/lib/validations"
import {
  buildYearlyDocumentPrefix,
  nextDocumentNumber,
  withDocumentNumberRetry,
} from "@/lib/document-numbering"
import { computeCreditBreakdown, getEInvoiceReadiness } from "@/lib/workflow-rules"
import { processDueRecurringInvoices } from "@/lib/scheduling/business"
import { calculateCommercialDocument } from "@/lib/finance/commercial-calculation"

type InvoiceInput = z.input<typeof InvoiceSchema>
type PaymentInput = z.input<typeof PaymentSchema>
type CreditNoteInput = z.input<typeof CreditNoteSchema>
type RecurringInvoiceInput = z.input<typeof RecurringInvoiceSchema>
type ReminderInput = z.input<typeof ReminderSchema>

const DEFAULT_HOURLY_RATE_CENTS = 6250

const InvoiceFromTimeEntriesSchema = z.object({
  timeEntryIds: z.array(z.string().min(1)).min(1, "S\u00e9lectionnez au moins une entr\u00e9e de temps."),
  hourlyRateCents: z.number().int().positive("Le taux horaire doit \u00eatre positif."),
  dueDate: z.string().min(1, "Date d'\u00e9ch\u00e9ance requise"),
  object: z.string().trim().min(3).max(180).optional(),
  lineMode: z.enum(["GROUP_BY_PROJECT", "DETAIL"]).default("GROUP_BY_PROJECT"),
})

type InvoiceFromTimeEntriesInput = z.input<typeof InvoiceFromTimeEntriesSchema>

type TimeEntryForInvoice = {
  id: string
  date: Date
  durationSec: number
  description: string | null
  projectId: string
  project: {
    id: string
    name: string
    clientId: string
    client: { id: string; name: string }
  }
}

export async function getInvoices(cursor?: string, limit = 50) {
  return await withAuth(async ({ companyId, userId }) => {
    await processDueRecurringInvoices({ companyId, userId, limit: 20 })
    await prisma.invoice.updateMany({
      where: { companyId, status: "SENT", dueDate: { lt: new Date() } },
      data: { status: "OVERDUE" },
    })
    return await prisma.invoice.findMany({
      where: { companyId },
      take: limit,
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      include: {
        client: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    })
  })
}

export async function getInvoiceById(id: string) {
  return await withAuth(async ({ companyId }) => {
    return await prisma.invoice.findFirst({
      where: { id, companyId },
      include: {
        client: true,
        company: true,
        project: true,
        lines: { orderBy: { order: "asc" } },
        payments: { orderBy: { date: "desc" } },
        creditNotes: true,
        creditInvoices: { orderBy: { date: "desc" } },
        originalInvoice: { select: { id: true, number: true } },
        reminders: { orderBy: { createdAt: "desc" } },
      },
    })
  })
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

async function generateCreditNoteNumber(companyId: string) {
  const prefix = buildYearlyDocumentPrefix("AV-", "AV-")
  const last = await prisma.invoice.findFirst({
    where: { companyId, number: { startsWith: prefix } },
    orderBy: { number: "desc" },
    select: { number: true },
  })
  return nextDocumentNumber(last?.number, prefix)
}

function formatInvoiceDate(date: Date) {
  return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" })
}

function roundHours(durationSec: number) {
  return Math.round((durationSec / 3600) * 100) / 100
}

function buildProjectTimeLines(
  entries: TimeEntryForInvoice[],
  hourlyRateCents: number,
  tvaRate: number,
  lineMode: "GROUP_BY_PROJECT" | "DETAIL"
) {
  if (lineMode === "DETAIL") {
    return entries
      .slice()
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .map((entry, index) => ({
        label: `${entry.project.name} - ${formatInvoiceDate(entry.date)}`,
        description: entry.description || "Temps de d\u00e9veloppement",
        quantity: roundHours(entry.durationSec),
        unitPriceCents: hourlyRateCents,
        tvaRate,
        order: index,
      }))
  }

  const grouped = new Map<string, TimeEntryForInvoice[]>()
  for (const entry of entries) {
    const group = grouped.get(entry.projectId) ?? []
    group.push(entry)
    grouped.set(entry.projectId, group)
  }

  return Array.from(grouped.values()).map((projectEntries, index) => {
    const first = projectEntries[0]
    const sorted = projectEntries.slice().sort((a, b) => a.date.getTime() - b.date.getTime())
    const durationSec = projectEntries.reduce((sum, entry) => sum + entry.durationSec, 0)
    const from = sorted[0]?.date
    const to = sorted[sorted.length - 1]?.date
    const period = from && to
      ? from.toDateString() === to.toDateString()
        ? formatInvoiceDate(from)
        : `${formatInvoiceDate(from)} - ${formatInvoiceDate(to)}`
      : "P\u00e9riode non renseign\u00e9e"

    return {
      label: `Temps pass\u00e9 - ${first.project.name}`,
      description: `${projectEntries.length} entr\u00e9e(s) de temps, p\u00e9riode ${period}.`,
      quantity: roundHours(durationSec),
      unitPriceCents: hourlyRateCents,
      tvaRate,
      order: index,
    }
  })
}

function assertSingleClient(entries: TimeEntryForInvoice[]) {
  const clientIds = new Set(entries.map((entry) => entry.project.clientId))
  if (clientIds.size !== 1) {
    throw new Error("Une facture ne peut pas regrouper plusieurs clients.")
  }
  return entries[0].project.clientId
}

function getSingleProjectId(entries: TimeEntryForInvoice[]) {
  const projectIds = new Set(entries.map((entry) => entry.projectId))
  return projectIds.size === 1 ? entries[0].projectId : null
}

export async function getUnbilledTimeEntries() {
  return await withAuth(async ({ companyId }) => {
    const entries = await prisma.timeEntry.findMany({
      where: {
        isBillable: true,
        invoiceId: null,
        project: { companyId },
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            clientId: true,
            client: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    })

    const totalDurationSec = entries.reduce((sum, entry) => sum + entry.durationSec, 0)
    const estimatedTotalCents = Math.round((totalDurationSec / 3600) * DEFAULT_HOURLY_RATE_CENTS)

    return {
      defaultHourlyRateCents: DEFAULT_HOURLY_RATE_CENTS,
      totalDurationSec,
      estimatedTotalCents,
      entries: entries.map((entry) => ({
        id: entry.id,
        date: entry.date.toISOString(),
        durationSec: entry.durationSec,
        description: entry.description,
        project: {
          id: entry.project.id,
          name: entry.project.name,
          clientId: entry.project.clientId,
          client: entry.project.client,
        },
      })),
    }
  })
}

export async function createInvoice(data: InvoiceInput) {
  return await withAuth(async ({ companyId, userId }) => {
    const validated = InvoiceSchema.parse(data)
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { isTvaApplicable: true, invoicePrefix: true }
    })
    if (!company) throw new Error("Entreprise introuvable")

    const lines = company.isTvaApplicable
      ? validated.lines
      : validated.lines.map((l) => ({ ...l, tvaRate: 0 }))

    const totals = calculateCommercialDocument(lines)

    const invoice = await withDocumentNumberRetry(async () => {
      const number = await generateInvoiceNumber(companyId, company.invoicePrefix)
      const created = await prisma.invoice.create({
        data: {
          companyId,
          clientId: validated.clientId,
          projectId: validated.projectId || null,
          number,
          object: validated.object,
          status: "DRAFT",
          type: validated.type ?? "STANDARD",
          dueDate: new Date(validated.dueDate),
          totalHtCents: totals.totalHtCents,
          totalTvaCents: totals.totalTvaCents,
          totalTtcCents: totals.totalTtcCents,
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
      })
      await logAction({
        userId,
        action: "CREATE_INVOICE",
        resource: "INVOICE",
        resourceId: created.id,
        payload: { number, totalTtcCents: totals.totalTtcCents },
      })
      return created
    }, { label: "la facture" })

    revalidatePath("/dashboard/factures")
    return invoice
  })
}

export async function createInvoiceFromTimeEntries(data: InvoiceFromTimeEntriesInput) {
  return await withAuth(async ({ companyId, userId }) => {
    const validated = InvoiceFromTimeEntriesSchema.parse(data)
    const uniqueEntryIds = Array.from(new Set(validated.timeEntryIds))

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: {
        isTvaApplicable: true,
        invoicePrefix: true,
      },
    })
    if (!company) throw new Error("Entreprise introuvable")

    const entries = await prisma.timeEntry.findMany({
      where: {
        id: { in: uniqueEntryIds },
        isBillable: true,
        invoiceId: null,
        project: { companyId },
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            clientId: true,
            client: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    })

    if (entries.length !== uniqueEntryIds.length) {
      throw new Error("Certaines entr\u00e9es sont introuvables, non facturables ou d\u00e9j\u00e0 factur\u00e9es.")
    }

    const clientId = assertSingleClient(entries)
    const projectId = getSingleProjectId(entries)
    const tvaRate = company.isTvaApplicable ? 20 : 0
    const lines = buildProjectTimeLines(
      entries,
      validated.hourlyRateCents,
      tvaRate,
      validated.lineMode
    )
    const totals = calculateCommercialDocument(lines)
    const clientName = entries[0].project.client.name
    const object = validated.object || `Temps pass\u00e9 - ${clientName}`

    const invoice = await withDocumentNumberRetry(async () => {
      const number = await generateInvoiceNumber(companyId, company.invoicePrefix)

      return await prisma.$transaction(async (tx) => {
        const created = await tx.invoice.create({
          data: {
            companyId,
            clientId,
            projectId,
            number,
            object,
            status: "DRAFT",
            type: "STANDARD",
            dueDate: new Date(validated.dueDate),
            totalHtCents: totals.totalHtCents,
            totalTvaCents: totals.totalTvaCents,
            totalTtcCents: totals.totalTtcCents,
            lines: {
              create: lines.map((line) => ({
                label: line.label,
                description: line.description,
                quantity: line.quantity,
                unitPriceCents: line.unitPriceCents,
                tvaRate: line.tvaRate,
                order: line.order,
              })),
            },
          },
        })

        const updated = await tx.timeEntry.updateMany({
          where: {
            id: { in: uniqueEntryIds },
            invoiceId: null,
          },
          data: { invoiceId: created.id },
        })

        if (updated.count !== uniqueEntryIds.length) {
          throw new Error("Les temps ont chang\u00e9 pendant la cr\u00e9ation de la facture. R\u00e9essayez.")
        }

        await tx.auditLog.create({
          data: {
            userId,
            action: "CREATE_INVOICE_FROM_TIME",
            resource: "INVOICE",
            resourceId: created.id,
            payload: {
              number,
              timeEntryIds: uniqueEntryIds,
              totalTtcCents: totals.totalTtcCents,
              lineMode: validated.lineMode,
            },
          },
        })

        return created
      })
    }, { label: "la facture issue des temps" })

    revalidatePath("/dashboard/factures")
    revalidatePath("/dashboard/factures/temps-non-facture")
    revalidatePath(`/dashboard/factures/${invoice.id}`)
    revalidatePath("/dashboard/temps")
    return invoice
  })
}

export async function updateInvoice(id: string, data: InvoiceInput) {
  return await withAuth(async ({ companyId }) => {
    const validated = InvoiceSchema.parse(data)
    const existing = await prisma.invoice.findFirst({ where: { id, companyId } })
    if (!existing) throw new Error("Facture introuvable")
    if (existing.status !== "DRAFT") {
      throw new Error("Une facture émise ne peut pas être modifiée.")
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { isTvaApplicable: true }
    })
    if (!company) throw new Error("Entreprise introuvable")

    const lines = company.isTvaApplicable
      ? validated.lines
      : validated.lines.map((l) => ({ ...l, tvaRate: 0 }))

    const totals = calculateCommercialDocument(lines)

    await prisma.invoiceLine.deleteMany({ where: { invoiceId: id } })

    const invoice = await prisma.invoice.update({
      where: { id },
      data: {
        clientId: validated.clientId,
        projectId: validated.projectId || null,
        object: validated.object,
        type: validated.type ?? existing.type,
        dueDate: new Date(validated.dueDate),
        totalHtCents: totals.totalHtCents,
        totalTvaCents: totals.totalTvaCents,
        totalTtcCents: totals.totalTtcCents,
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
    })
    revalidatePath("/dashboard/factures")
    revalidatePath(`/dashboard/factures/${id}`)
    return invoice
  })
}

export async function updateInvoiceStatus(
  invoiceId: string,
  status: "DRAFT" | "SENT" | "PAID" | "OVERDUE" | "CANCELLED"
) {
  return await withAuth(async ({ userId, companyId }) => {
    const existing = await prisma.invoice.findFirst({
      where: { id: invoiceId, companyId },
      include: {
        company: { select: { siret: true } },
        client: { select: { siret: true, type: true } },
      },
    })
    if (!existing) throw new Error("Facture introuvable")

    const allowedTransitions: Record<string, string[]> = {
      DRAFT: ["SENT", "CANCELLED"],
      SENT: ["PAID", "OVERDUE"],
      OVERDUE: ["PAID"],
      PAID: [],
      CANCELLED: [],
    }
    if (!allowedTransitions[existing.status]?.includes(status)) {
      throw new Error("Transition de statut non autorisée. Une facture émise se corrige avec un avoir.")
    }

    const readiness = status === "SENT"
      ? getEInvoiceReadiness({
          companySiret: existing.company.siret,
          clientSiret: existing.client.siret,
          clientType: existing.client.type,
        })
      : null

    const invoice = await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status,
        lockedAt: status === "SENT" ? new Date() : existing.lockedAt,
        eInvoiceStatus: readiness?.status ?? existing.eInvoiceStatus,
        eInvoiceError: readiness?.error ?? existing.eInvoiceError,
      },
    })
    await logAction({
      userId,
      action: "UPDATE_INVOICE_STATUS",
      resource: "INVOICE",
      resourceId: invoiceId,
      payload: { status },
    })
    revalidatePath("/dashboard/factures")
    revalidatePath(`/dashboard/factures/${invoiceId}`)
    return invoice
  })
}

export async function deleteInvoice(id: string) {
  return await withAuth(async ({ companyId, userId }) => {
    const existing = await prisma.invoice.findFirst({ where: { id, companyId } })
    if (!existing) throw new Error("Facture introuvable")
    if (existing.status !== "DRAFT") {
      throw new Error("Seules les factures en brouillon peuvent être supprimées.")
    }
    await prisma.$transaction([
      prisma.timeEntry.updateMany({
        where: { invoiceId: id },
        data: { invoiceId: null },
      }),
      prisma.invoice.delete({ where: { id } }),
    ])
    await logAction({
      userId,
      action: "DELETE_INVOICE",
      resource: "INVOICE",
      resourceId: id,
      payload: { number: existing.number },
    })
    revalidatePath("/dashboard/factures")
    return { ok: true }
  })
}

export async function recordPayment(data: PaymentInput) {
  return await withAuth(async ({ userId, companyId }) => {
    const validated = PaymentSchema.parse(data)
    const invoice = await prisma.invoice.findFirst({
      where: { id: validated.invoiceId, companyId },
    })
    if (!invoice) throw new Error("Facture introuvable")
    if (!['SENT', 'OVERDUE'].includes(invoice.status)) {
      throw new Error("Émettez la facture avant d'enregistrer un paiement.")
    }
    const remaining = invoice.totalTtcCents - invoice.paidAmountCents
    if (validated.amountCents > remaining) {
      throw new Error("Le paiement dépasse le reste à payer.")
    }

    const newPaid = invoice.paidAmountCents + validated.amountCents
    const isPaid = newPaid >= invoice.totalTtcCents

    const payment = await prisma.$transaction(async (tx) => {
      const created = await tx.invoicePayment.create({
        data: {
          invoiceId: validated.invoiceId,
          amountCents: validated.amountCents,
          method: validated.method,
          reference: validated.reference || null,
        },
      })
      await tx.invoice.update({
        where: { id: validated.invoiceId },
        data: {
          paidAmountCents: newPaid,
          status: isPaid ? "PAID" : invoice.status,
        },
      })
      return created
    })
    await logAction({
      userId,
      action: "UPDATE_INVOICE_STATUS",
      resource: "INVOICE",
      resourceId: validated.invoiceId,
      payload: { payment: validated.amountCents, isPaid },
    })
    revalidatePath("/dashboard/factures")
    revalidatePath(`/dashboard/factures/${validated.invoiceId}`)
    return payment
  })
}

export async function createCreditNote(data: CreditNoteInput) {
  return withAuth(async ({ companyId, userId }) => {
    const validated = CreditNoteSchema.parse(data)
    const original = await prisma.invoice.findFirst({
      where: { id: validated.invoiceId, companyId },
      include: {
        creditInvoices: { select: { totalTtcCents: true } },
        company: { select: { siret: true } },
        client: { select: { siret: true, type: true } },
      },
    })
    if (!original) throw new Error("Facture introuvable")
    if (!["SENT", "OVERDUE", "PAID"].includes(original.status) || original.type === "CREDIT_NOTE") {
      throw new Error("Un avoir ne peut être créé que depuis une facture émise.")
    }

    const alreadyCredited = original.creditInvoices.reduce(
      (sum, credit) => sum + Math.abs(credit.totalTtcCents),
      0
    )
    const available = original.totalTtcCents - alreadyCredited
    if (validated.amountCents > available) {
      throw new Error("Le montant de l'avoir dépasse le montant encore disponible.")
    }

    const { htCents, tvaCents, tvaRate } = computeCreditBreakdown(
      original.totalTtcCents,
      original.totalHtCents,
      validated.amountCents
    )
    const readiness = getEInvoiceReadiness({
      companySiret: original.company.siret,
      clientSiret: original.client.siret,
      clientType: original.client.type,
    })

    const credit = await withDocumentNumberRetry(async () => {
      const number = await generateCreditNoteNumber(companyId)
      return prisma.$transaction(async (tx) => {
        const created = await tx.invoice.create({
          data: {
            companyId,
            clientId: original.clientId,
            projectId: original.projectId,
            originalInvoiceId: original.id,
            number,
            object: `Avoir sur ${original.number} - ${validated.reason}`,
            status: "SENT",
            type: "CREDIT_NOTE",
            date: new Date(),
            dueDate: new Date(),
            totalHtCents: -htCents,
            totalTvaCents: -tvaCents,
            totalTtcCents: -validated.amountCents,
            lockedAt: new Date(),
            eInvoiceStatus: readiness.status,
            eInvoiceError: readiness.error,
            lines: {
              create: {
                label: `Avoir ${original.number}`,
                description: validated.reason,
                quantity: 1,
                unitPriceCents: -htCents,
                tvaRate,
                order: 0,
              },
            },
          },
        })
        await tx.creditNote.create({
          data: {
            invoiceId: original.id,
            number,
            amountCents: validated.amountCents,
            reason: validated.reason,
          },
        })
        await tx.auditLog.create({
          data: {
            userId,
            action: "CREATE_CREDIT_NOTE",
            resource: "INVOICE",
            resourceId: created.id,
            payload: { originalInvoiceId: original.id, amountCents: validated.amountCents },
          },
        })
        return created
      })
    }, { label: "l'avoir" })

    revalidatePath("/dashboard/factures")
    revalidatePath(`/dashboard/factures/${original.id}`)
    return credit
  })
}

export async function prepareInvoiceReminder(data: ReminderInput) {
  return withAuth(async ({ companyId }) => {
    const validated = ReminderSchema.parse(data)
    const invoice = await prisma.invoice.findFirst({
      where: { id: validated.invoiceId, companyId },
      include: {
        client: { include: { contacts: { orderBy: { isPrimary: "desc" } } } },
        company: { select: { name: true } },
      },
    })
    if (!invoice) throw new Error("Facture introuvable")
    if (!["SENT", "OVERDUE"].includes(invoice.status)) {
      throw new Error("Cette facture ne nécessite pas de relance.")
    }
    const remaining = invoice.totalTtcCents - invoice.paidAmountCents
    const amount = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(remaining / 100)
    const dueDate = invoice.dueDate.toLocaleDateString("fr-FR")
    const subject = validated.subject || `Relance facture ${invoice.number}`
    const message = validated.message || [
      `Bonjour,`,
      "",
      `Sauf erreur de notre part, la facture ${invoice.number} d'un montant restant de ${amount}, échue le ${dueDate}, reste en attente de règlement.`,
      "",
      "Pouvez-vous nous confirmer sa date de mise en paiement ?",
      "",
      `Cordialement,`,
      invoice.company.name,
    ].join("\n")
    const reminder = await prisma.invoiceReminder.create({
      data: { companyId, invoiceId: invoice.id, subject, message },
    })
    return {
      ...reminder,
      to: invoice.client.contacts.find((contact) => contact.email)?.email ?? "",
    }
  })
}

export async function markInvoiceReminderSent(id: string) {
  return withAuth(async ({ companyId }) => {
    const reminder = await prisma.invoiceReminder.findFirst({ where: { id, companyId } })
    if (!reminder) throw new Error("Relance introuvable")
    const updated = await prisma.invoiceReminder.update({
      where: { id },
      data: { status: "SENT", sentAt: new Date() },
    })
    revalidatePath(`/dashboard/factures/${reminder.invoiceId}`)
    return updated
  })
}

export async function getRecurringInvoices() {
  return withAuth(async ({ companyId }) => prisma.recurringInvoice.findMany({
    where: { companyId },
    include: { client: { select: { id: true, name: true } }, occurrences: true },
    orderBy: [{ isActive: "desc" }, { nextGenDate: "asc" }],
  }))
}

export async function createRecurringInvoice(data: RecurringInvoiceInput) {
  return withAuth(async ({ companyId }) => {
    const validated = RecurringInvoiceSchema.parse(data)
    const client = await prisma.client.findFirst({ where: { id: validated.clientId, companyId } })
    if (!client) throw new Error("Client introuvable")
    if (validated.projectId) {
      const project = await prisma.project.findFirst({
        where: { id: validated.projectId, companyId, clientId: validated.clientId },
      })
      if (!project) throw new Error("Projet incompatible avec ce client")
    }
    const recurring = await prisma.recurringInvoice.create({
      data: {
        companyId,
        clientId: validated.clientId,
        label: validated.label,
        frequency: validated.frequency,
        nextGenDate: new Date(validated.nextGenDate),
        template: {
          object: validated.object,
          projectId: validated.projectId || null,
          dueDays: validated.dueDays,
          lines: validated.lines,
        },
      },
    })
    revalidatePath("/dashboard/factures/recurrentes")
    return recurring
  })
}

export async function toggleRecurringInvoice(id: string, isActive: boolean) {
  return withAuth(async ({ companyId }) => {
    const existing = await prisma.recurringInvoice.findFirst({ where: { id, companyId } })
    if (!existing) throw new Error("Récurrence introuvable")
    const updated = await prisma.recurringInvoice.update({ where: { id }, data: { isActive } })
    revalidatePath("/dashboard/factures/recurrentes")
    return updated
  })
}

export async function deleteRecurringInvoice(id: string) {
  return withAuth(async ({ companyId }) => {
    const existing = await prisma.recurringInvoice.findFirst({ where: { id, companyId } })
    if (!existing) throw new Error("Récurrence introuvable")
    await prisma.recurringInvoice.delete({ where: { id } })
    revalidatePath("/dashboard/factures/recurrentes")
    return { ok: true }
  })
}
