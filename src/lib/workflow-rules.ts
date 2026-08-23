import { createHash } from "node:crypto"
import { addMonths, addYears } from "date-fns"

export function getEInvoiceReadiness(input: {
  companySiret: string | null
  clientSiret: string | null
  clientType: string
}) {
  if (!input.companySiret) return { status: "NOT_READY", error: "SIRET émetteur manquant" }
  if (input.clientType === "ENTERPRISE" && !input.clientSiret) {
    return { status: "NOT_READY", error: "SIRET client manquant" }
  }
  return { status: "READY", error: null }
}

export function getNextRecurringDate(date: Date, frequency: string) {
  if (frequency === "MONTHLY") return addMonths(date, 1)
  if (frequency === "QUARTERLY") return addMonths(date, 3)
  return addYears(date, 1)
}

export function advanceTaskRecurrence(date: Date | null, recurrence: string, interval: number) {
  if (!date) return null
  const result = new Date(date)
  if (recurrence === "DAILY") result.setDate(result.getDate() + interval)
  else if (recurrence === "WEEKLY") result.setDate(result.getDate() + interval * 7)
  else result.setMonth(result.getMonth() + interval)
  return result
}

export function computeCreditBreakdown(totalTtcCents: number, totalHtCents: number, amountCents: number) {
  const htCents = totalTtcCents > 0
    ? Math.round(amountCents * totalHtCents / totalTtcCents)
    : amountCents
  const tvaCents = amountCents - htCents
  const tvaRate = htCents > 0 ? Math.round((tvaCents / htCents) * 10_000) / 100 : 0
  return { htCents, tvaCents, tvaRate }
}

export function bankTransactionFingerprint(row: {
  date: Date
  label: string
  amountCents: number
  reference?: string | null
}) {
  return createHash("sha256")
    .update([row.date.toISOString().slice(0, 10), row.amountCents, row.label.trim().toLowerCase(), row.reference?.trim() ?? ""].join("|"))
    .digest("hex")
}
