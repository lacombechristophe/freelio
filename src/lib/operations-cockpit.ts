export const DEFAULT_HOURLY_RATE_CENTS = 6250

export type ProjectRiskLevel = "normal" | "warning" | "critical"

export type ProjectRiskInput = {
  budgetCents: number
  consumedCents: number
  endDate?: Date | string | null
  today?: Date
}

function startOfDay(date: Date) {
  const result = new Date(date)
  result.setHours(0, 0, 0, 0)
  return result
}

function parseDate(value: Date | string | null | undefined) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function daysUntil(value: Date | string | null | undefined, today = new Date()) {
  const date = parseDate(value)
  if (!date) return null
  const from = startOfDay(today).getTime()
  const to = startOfDay(date).getTime()
  return Math.ceil((to - from) / (24 * 60 * 60 * 1000))
}

export function computeUnbilledValueCents(durationSec: number, hourlyRateCents = DEFAULT_HOURLY_RATE_CENTS) {
  return Math.round((Math.max(0, durationSec) / 3600) * hourlyRateCents)
}

export function computeProjectRisk(input: ProjectRiskInput) {
  const budgetCents = Math.max(0, input.budgetCents)
  const consumedCents = Math.max(0, input.consumedCents)
  const budgetUsagePct = budgetCents > 0 ? Math.round((consumedCents / budgetCents) * 100) : 0
  const remainingBudgetCents = budgetCents > 0 ? budgetCents - consumedCents : null
  const daysLeft = daysUntil(input.endDate, input.today)
  const reasons: string[] = []
  let level: ProjectRiskLevel = "normal"

  if (budgetCents > 0 && budgetUsagePct >= 100) {
    level = "critical"
    reasons.push("Budget dépassé")
  } else if (budgetCents > 0 && budgetUsagePct >= 80) {
    level = "warning"
    reasons.push("Budget consommé à plus de 80%")
  }

  if (daysLeft !== null && daysLeft < 0) {
    level = "critical"
    reasons.push("Échéance dépassée")
  } else if (daysLeft !== null && daysLeft <= 7) {
    level = level === "critical" ? "critical" : "warning"
    reasons.push("Échéance à moins de 7 jours")
  }

  return { level, budgetUsagePct, remainingBudgetCents, daysLeft, reasons }
}

export function isInvoiceActionable(status: string, dueDate: Date | string, today = new Date()) {
  if (["PAID", "CANCELLED", "VOID"].includes(status)) return false
  return status === "OVERDUE" || daysUntil(dueDate, today)! < 0
}

export function isQuoteStale(input: {
  status: string
  validUntil?: Date | string | null
  updatedAt: Date | string
  today?: Date
  staleAfterDays?: number
}) {
  if (!["DRAFT", "SENT"].includes(input.status)) return false
  const today = input.today ?? new Date()
  const validDaysLeft = daysUntil(input.validUntil, today)
  if (validDaysLeft !== null && validDaysLeft < 0) return true
  const updated = parseDate(input.updatedAt)
  if (!updated) return false
  const ageDays = Math.floor((startOfDay(today).getTime() - startOfDay(updated).getTime()) / (24 * 60 * 60 * 1000))
  return ageDays >= (input.staleAfterDays ?? 14)
}
