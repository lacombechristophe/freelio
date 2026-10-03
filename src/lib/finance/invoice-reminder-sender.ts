import "server-only"
import { z } from "zod"

import { sendManualEmail } from "@/lib/communications/manual-send"
import { withProcessorLease } from "@/lib/processing/lease"
import {
  buildInvoiceReminderContent,
  invoiceReminderDueAt,
  invoiceReminderSourceKey,
  parseInvoiceReminderSettings,
  plainTextToEmailHtml,
  selectInvoiceReminderStep,
} from "@/lib/finance/invoice-reminders"
import prisma from "@/lib/prisma"

const senderInclude = {
  invoice: {
    include: {
      company: { select: { id: true, name: true, email: true } },
      client: { include: { contacts: { orderBy: { isPrimary: "desc" as const } } } },
    },
  },
} as const

export async function sendInvoiceReminderRecord(input: {
  companyId: string
  reminderId: string
  channelId?: string | null
  subject?: string
  message?: string
}) {
  const execution = await withProcessorLease(`invoice-reminder:${input.reminderId}`, async control => {
    const reminder = await prisma.invoiceReminder.findFirst({
      where: { id: input.reminderId, companyId: input.companyId, invoice: { companyId: input.companyId } },
      include: senderInclude,
    })
    if (!reminder) throw new Error("Relance introuvable")
    if (reminder.status === "SENT") return { reminder, alreadySent: true as const }

    const requestKey = `invoice-reminder:${reminder.id}`
    const delivery = await prisma.emailDelivery.findUnique({ where: { companyId_requestKey: { companyId: input.companyId, requestKey } } })
    const accepted = delivery && ["SENT", "DELIVERED", "OPENED", "CLICKED"].includes(delivery.status)
    // Older attempts never persisted a transport identity. Their outcome must
    // be reconciled instead of recreating a fresh OAuth draft or Resend command.
    if (!delivery && ["FAILED", "SENDING"].includes(reminder.status)) throw new Error("Ancienne relance sans commande figée : vérifiez son résultat fournisseur avant de créer une nouvelle relance")
    if (!accepted && !["PREPARED", "FAILED", "SENDING"].includes(reminder.status)) throw new Error("Cette relance ne peut pas être envoyée")

    const contact = reminder.invoice.client.contacts.find((item) => item.email)
    if (!contact?.email) throw new Error("Aucune adresse e-mail n’est renseignée pour ce client")

    const subject = input.subject?.trim() || reminder.subject
    const message = input.message?.trim() || reminder.message
    if (delivery && (subject !== reminder.subject || message !== reminder.message)) throw new Error("Le contenu de cette relance est déjà figé ; vérifiez son résultat avant de créer une nouvelle relance")
    const storedPayload = delivery?.payload
    const storedSnapshot = storedPayload && typeof storedPayload === "object" && !Array.isArray(storedPayload) ? storedPayload.invoiceSnapshot : undefined
    if (!delivery && !reminder.remainingCents) throw new Error("Ancienne relance sans solde figé : préparez une nouvelle relance après vérification de la facture")
    const invoiceSnapshot = delivery
      ? z.object({ invoiceId: z.literal(reminder.invoiceId), remainingCents: z.number().int().positive() }).parse(storedSnapshot)
      : { invoiceId: reminder.invoiceId, remainingCents: reminder.remainingCents! }
    const assertInvoiceUnpaid = async () => {
      await control.assertOwned()
      const invoice = await prisma.invoice.findFirst({ where: { id: reminder.invoiceId, companyId: input.companyId }, select: { status: true, totalTtcCents: true, paidAmountCents: true } })
      if (!invoice || !["SENT", "OVERDUE"].includes(invoice.status) || invoice.paidAmountCents >= invoice.totalTtcCents) throw new Error("Cette facture n’est plus éligible à une relance : vérifiez son statut et son solde")
      if (invoice.totalTtcCents - invoice.paidAmountCents !== invoiceSnapshot.remainingCents) throw new Error("Le solde a changé depuis la préparation ; vérifiez la relance et son résultat avant de créer un nouveau message")
    }
    if (!accepted) await assertInvoiceUnpaid()
    await prisma.invoiceReminder.updateMany({ where: { id: reminder.id, companyId: input.companyId }, data: { status: "SENDING", subject, message, error: null } })
    try {
      const emailMessage = await sendManualEmail({
        companyId: input.companyId, userId: "SYSTEM_INVOICE_REMINDER", requestKey,
        channelId: input.channelId || null, companyName: reminder.invoice.company.name,
        to: contact.email, replyTo: reminder.invoice.company.email,
        contactId: contact.id, clientId: reminder.invoice.clientId, threadId: null, serviceTicketId: null,
        subject, html: plainTextToEmailHtml(message), beforeDispatch: assertInvoiceUnpaid, invoiceSnapshot,
      })
      const updated = await prisma.invoiceReminder.update({
        where: { id: reminder.id },
        data: { status: "SENT", channel: emailMessage.provider, subject, message, sentAt: emailMessage.sentAt || new Date(), error: null },
      })
      return { reminder: updated, emailMessage, alreadySent: false as const }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Envoi impossible"
      const prepared = await prisma.emailDelivery.count({ where: { companyId: input.companyId, requestKey } })
      await prisma.invoiceReminder.update({ where: { id: reminder.id }, data: { status: prepared ? "FAILED" : "PREPARED", error: message } })
      throw error
    }
  })
  if (!execution.acquired) throw new Error("Cette relance est déjà en cours d’envoi")
  return execution.value
}

export async function processDueInvoiceReminders(input: { companyId?: string; limit?: number } = {}) {
  const now = new Date()
  const configs = await prisma.relanceConfig.findMany({
    where: { ...(input.companyId ? { companyId: input.companyId } : {}), enabled: true },
    orderBy: [{ lastProcessedAt: "asc" }, { companyId: "asc" }],
    take: 250,
  })
  const summary = { companies: configs.length, examined: 0, prepared: 0, sent: 0, skipped: 0, failed: 0 }
  let remainingCapacity = Math.min(Math.max(input.limit ?? 100, 1), 250)

  for (const config of configs) {
    if (remainingCapacity <= 0) break
    const settings = parseInvoiceReminderSettings(config.steps, config.enabled)
    const auditMembership = await prisma.membership.findFirst({
      where: { companyId: config.companyId, status: "ACTIVE", role: { in: ["OWNER", "ADMIN", "ACCOUNTING"] } },
      orderBy: { createdAt: "asc" },
      select: { userId: true },
    })
    const earliestThreshold = Math.min(...settings.steps.map((step) => step.daysAfterDue))
    const invoices = await prisma.invoice.findMany({
      where: {
        companyId: config.companyId,
        status: { in: ["SENT", "OVERDUE"] },
        dueDate: { lte: invoiceReminderDueAt(now, -earliestThreshold) },
      },
      include: {
        company: { select: { name: true } },
        reminders: { where: { sourceKey: { not: null } }, select: { sourceKey: true, status: true, updatedAt: true } },
      },
      orderBy: { dueDate: "asc" },
      take: Math.min(remainingCapacity, 25),
    })

    for (const invoice of invoices) {
      if (remainingCapacity <= 0) break
      summary.examined += 1
      if (invoice.totalTtcCents - invoice.paidAmountCents <= 0) {
        summary.skipped += 1
        continue
      }
      const step = selectInvoiceReminderStep({ dueDate: invoice.dueDate, at: now, steps: settings.steps, reminders: invoice.reminders })
      if (!step) {
        summary.skipped += 1
        continue
      }
      const sourceKey = invoiceReminderSourceKey(step.daysAfterDue)
      const existing = invoice.reminders.find((item) => item.sourceKey === sourceKey)
      const content = buildInvoiceReminderContent({
        companyName: invoice.company.name,
        invoiceNumber: invoice.number,
        remainingCents: invoice.totalTtcCents - invoice.paidAmountCents,
        dueDate: invoice.dueDate,
        daysAfterDue: step.daysAfterDue,
      })
      const reminder = await prisma.invoiceReminder.upsert({
        where: { invoiceId_sourceKey: { invoiceId: invoice.id, sourceKey } },
        update: {},
        create: { companyId: config.companyId, invoiceId: invoice.id, sourceKey, ...content, remainingCents: invoice.totalTtcCents - invoice.paidAmountCents },
      })
      if (!existing) summary.prepared += 1
      remainingCapacity -= 1
      try {
        const result = await sendInvoiceReminderRecord({ companyId: config.companyId, reminderId: reminder.id })
        if (result.alreadySent) summary.skipped += 1
        else {
          summary.sent += 1
          if (auditMembership) await prisma.auditLog.create({
            data: { userId: auditMembership.userId, action: "SEND_INVOICE_REMINDER", resource: "INVOICE_REMINDER", resourceId: reminder.id, payload: { automatic: true, sourceKey } },
          }).catch(() => undefined)
        }
      } catch {
        summary.failed += 1
      }
    }
    await prisma.relanceConfig.update({ where: { id: config.id }, data: { lastProcessedAt: now } })
  }
  return summary
}
