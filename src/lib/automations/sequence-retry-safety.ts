import type { EmailDelivery } from "@prisma/client"

export const SEQUENCE_RETRY_REVIEW_MESSAGE = "Résultat fournisseur incertain : vérifiez le résultat avant toute relance."

type RetryEvidence = Pick<EmailDelivery, "provider" | "firstAttemptAt" | "providerId" | "sentAt" | "closedAt" | "recoveryOutcome">

/** A reset retry counter never extends the provider's original safety window. */
export function sequenceRetryNeedsReview(delivery: RetryEvidence, now: Date) {
  if (delivery.closedAt || delivery.providerId || delivery.sentAt || delivery.recoveryOutcome === "ACCEPTED") return true
  if (delivery.provider !== "RESEND") return false
  return !delivery.firstAttemptAt || delivery.firstAttemptAt > now || now.getTime() - delivery.firstAttemptAt.getTime() >= 23 * 3_600_000
}
