import { addDays, differenceInCalendarDays } from "date-fns"
import { z } from "zod"

export const invoiceReminderStepSchema = z.object({
  daysAfterDue: z.number().int().min(0).max(365),
})

export const invoiceReminderSettingsSchema = z.object({
  enabled: z.boolean(),
  steps: z.array(invoiceReminderStepSchema).min(1).max(5),
}).transform((value) => ({
  ...value,
  steps: [...new Map(value.steps.map((step) => [step.daysAfterDue, step])).values()].sort((left, right) => left.daysAfterDue - right.daysAfterDue),
}))

export type InvoiceReminderSettings = z.infer<typeof invoiceReminderSettingsSchema>

type ExistingAutomaticReminder = {
  sourceKey: string | null
  status: string
  updatedAt: Date
}

export const defaultInvoiceReminderSettings: InvoiceReminderSettings = {
  enabled: false,
  steps: [{ daysAfterDue: 3 }, { daysAfterDue: 10 }, { daysAfterDue: 20 }],
}

export function parseInvoiceReminderSettings(value: unknown, enabled = false): InvoiceReminderSettings {
  const parsed = invoiceReminderSettingsSchema.safeParse({ enabled, steps: value })
  return parsed.success ? parsed.data : { ...defaultInvoiceReminderSettings, enabled }
}

export function invoiceReminderSourceKey(daysAfterDue: number) {
  return `AUTO:DUE+${daysAfterDue}`
}

function sourceKeyDays(value: string | null) {
  const match = value?.match(/^AUTO:DUE\+(\d{1,3})$/)
  return match ? Number(match[1]) : null
}

export function invoiceReminderDueAt(dueDate: Date, daysAfterDue: number) {
  return addDays(dueDate, daysAfterDue)
}

export function invoiceDaysOverdue(dueDate: Date, at = new Date()) {
  return Math.max(0, differenceInCalendarDays(at, dueDate))
}

/**
 * Chooses at most one reminder stage for an invoice. When scheduling is enabled
 * late, the most appropriate due stage wins so a client never receives several
 * catch-up reminders during the same worker run.
 */
export function selectInvoiceReminderStep(input: {
  dueDate: Date
  at: Date
  steps: InvoiceReminderSettings["steps"]
  reminders: ExistingAutomaticReminder[]
  retryAfterHours?: number
}) {
  const completedDays = input.reminders
    .filter((reminder) => ["SENT", "SKIPPED"].includes(reminder.status))
    .flatMap((reminder) => {
      const days = sourceKeyDays(reminder.sourceKey)
      return days === null ? [] : [days]
    })
  const latestCompletedDay = completedDays.length ? Math.max(...completedDays) : -1
  const candidate = [...input.steps]
    .sort((left, right) => right.daysAfterDue - left.daysAfterDue)
    .find((step) => step.daysAfterDue > latestCompletedDay && invoiceReminderDueAt(input.dueDate, step.daysAfterDue) <= input.at)
  if (!candidate) return null

  const existing = input.reminders.find((reminder) => reminder.sourceKey === invoiceReminderSourceKey(candidate.daysAfterDue))
  const retryAfterMs = (input.retryAfterHours ?? 24) * 60 * 60 * 1_000
  if (existing?.status === "SENDING" && existing.updatedAt.getTime() > input.at.getTime() - 15 * 60 * 1_000) return null
  if (existing?.status === "FAILED" && existing.updatedAt.getTime() > input.at.getTime() - retryAfterMs) return null
  return candidate
}

export function buildInvoiceReminderContent(input: {
  companyName: string
  invoiceNumber: string
  remainingCents: number
  dueDate: Date
  daysAfterDue?: number
}) {
  const amount = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(input.remainingCents / 100)
  const dueDate = input.dueDate.toLocaleDateString("fr-FR")
  const level = input.daysAfterDue ?? invoiceDaysOverdue(input.dueDate)
  const subject = level >= 15 ? `Rappel important — facture ${input.invoiceNumber}` : `Relance facture ${input.invoiceNumber}`
  const request = level >= 15
    ? "Merci de régulariser la situation ou de nous signaler sans délai tout point bloquant."
    : "Pouvez-vous nous confirmer sa date de mise en paiement ?"
  const message = [
    "Bonjour,",
    "",
    `Sauf erreur de notre part, la facture ${input.invoiceNumber} d’un montant restant de ${amount}, échue le ${dueDate}, reste en attente de règlement.`,
    "",
    request,
    "",
    "Cordialement,",
    input.companyName,
  ].join("\n")
  return { subject, message }
}

export function plainTextToEmailHtml(value: string) {
  const escaped = value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
  const paragraphs = escaped.split(/\n{2,}/).map((paragraph) => `<p>${paragraph.replaceAll("\n", "<br>")}</p>`).join("")
  return `<!doctype html><html lang="fr"><body><main>${paragraphs}</main></body></html>`
}
