import { z } from "zod"

export const emailPurposeSchema = z.enum(["SERVICE", "MARKETING"])
export type EmailPurpose = z.infer<typeof emailPurposeSchema>
export class EmailPurposeError extends Error {}

export function emailPurposeLabel(value: string | null | undefined) {
  return value === "SERVICE" ? "Service" : value === "MARKETING" ? "Prospection" : "Finalité non renseignée"
}

export function requireEmailPurpose(value: unknown): EmailPurpose {
  const parsed = emailPurposeSchema.safeParse(value)
  if (!parsed.success) throw new EmailPurposeError("Choisissez Service ou Prospection avant de préparer cet envoi")
  return parsed.data
}

export function assertPurposeRecipients(purpose: string | null | undefined, cc: string[], bcc: string[]) {
  if (purpose === "MARKETING" && (cc.length || bcc.length)) throw new EmailPurposeError("La prospection manuelle est limitée à un destinataire, sans CC ni CCI")
}
