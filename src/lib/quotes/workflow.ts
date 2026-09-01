import { z } from "zod"

export const quoteStatusSchema = z.enum(["DRAFT", "SENT", "ACCEPTED", "REJECTED", "EXPIRED"])

export type QuoteStatus = z.infer<typeof quoteStatusSchema>

const QUOTE_STATUS_TRANSITIONS: Record<QuoteStatus, readonly QuoteStatus[]> = {
  DRAFT: ["SENT"],
  SENT: ["ACCEPTED", "REJECTED", "EXPIRED"],
  ACCEPTED: [],
  REJECTED: [],
  EXPIRED: [],
}

export function assertQuoteStatusTransition(currentStatus: string, requestedStatus: unknown) {
  const current = quoteStatusSchema.parse(currentStatus)
  const next = quoteStatusSchema.parse(requestedStatus)

  if (current === next) return { current, next, changed: false as const }
  if (!QUOTE_STATUS_TRANSITIONS[current].includes(next)) {
    throw new Error("Transition de statut non autorisée. Un devis accepté, refusé ou expiré reste figé dans son historique.")
  }

  return { current, next, changed: true as const }
}

export function quoteStatusDates(status: QuoteStatus, now = new Date()) {
  if (status === "SENT") return { sentAt: now }
  if (status === "ACCEPTED") return { acceptedAt: now }
  if (status === "REJECTED") return { rejectedAt: now }
  if (status === "EXPIRED") return { expiredAt: now }
  return {}
}
