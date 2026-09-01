import "server-only"

import { subMinutes } from "date-fns"

import { sendEmailThroughChannel } from "@/lib/communications/email-provider"
import { recordOutgoingEmail } from "@/lib/communications/threads"
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
  const reminder = await prisma.invoiceReminder.findFirst({
    where: { id: input.reminderId, companyId: input.companyId, invoice: { companyId: input.companyId } },
    include: senderInclude,
  })
  if (!reminder) throw new Error("Relance introuvable")
  if (reminder.status === "SENT") return { reminder, alreadySent: true as const }

  const contact = reminder.invoice.client.contacts.find((item) => item.email)
  if (!contact?.email) throw new Error("Aucune adresse e-mail n’est renseignée pour ce client")

  const lock = await prisma.invoiceReminder.updateMany({
    where: {
      id: reminder.id,
      companyId: input.companyId,
      OR: [
        { status: { in: ["PREPARED", "FAILED"] } },
        { status: "SENDING", updatedAt: { lt: subMinutes(new Date(), 15) } },
      ],
    },
    data: { status: "SENDING", error: null },
  })
  if (lock.count !== 1) throw new Error("Cette relance est déjà en cours d’envoi")

  const subject = input.subject?.trim() || reminder.subject
  const message = input.message?.trim() || reminder.message
  try {
    const sent = await sendEmailThroughChannel({
      companyId: input.companyId,
      channelId: input.channelId || null,
      companyName: reminder.invoice.company.name,
      to: contact.email,
      replyTo: reminder.invoice.company.email,
      subject,
      html: plainTextToEmailHtml(message),
      idempotencyKey: `invoice-reminder:${reminder.id}`,
    })
    const updated = await prisma.invoiceReminder.update({
      where: { id: reminder.id },
      data: { status: "SENT", channel: sent.provider, subject, message, sentAt: new Date(), error: null },
    })
    let emailMessage = null
    try {
      emailMessage = await recordOutgoingEmail({
        companyId: input.companyId,
        clientId: reminder.invoice.clientId,
        contactId: contact.id,
        provider: sent.provider,
        providerId: sent.providerId,
        from: sent.from,
        to: [contact.email],
        subject,
        bodyHtml: plainTextToEmailHtml(message),
        bodyText: message,
      })
    } catch (error) {
      const historyError = error instanceof Error ? error.message : "historique indisponible"
      await prisma.invoiceReminder.update({ where: { id: reminder.id }, data: { error: `Message envoyé, mais journalisation incomplète : ${historyError}` } }).catch(() => undefined)
    }
    return { reminder: updated, emailMessage, alreadySent: false as const }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Envoi impossible"
    await prisma.invoiceReminder.update({ where: { id: reminder.id }, data: { status: "FAILED", error: message } })
    throw error
  }
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
        create: { companyId: config.companyId, invoiceId: invoice.id, sourceKey, ...content },
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
