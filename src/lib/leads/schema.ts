import { z } from "zod"

const optionalText = (max: number) => z.string().trim().max(max).optional().transform((value) => value || undefined)
const optionalUrl = z.string().trim().max(2_048).url().optional().transform((value) => value || undefined)
const checkboxBoolean = z.preprocess(
  (value) => typeof value === "string" ? ["1", "true", "on", "yes", "oui"].includes(value.toLowerCase()) : value,
  z.boolean(),
)

export const publicLeadSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email().max(254).optional().or(z.literal("")).transform((value) => value || undefined),
  phone: optionalText(40),
  postalCode: optionalText(20),
  city: optionalText(100),
  projectType: optionalText(120),
  message: optionalText(5_000),
  source: z.string().trim().min(1).max(80).regex(/^[a-zA-Z0-9 _.-]+$/).default("WEBSITE"),
  landingPage: optionalUrl,
  referrer: optionalUrl,
  utmSource: optionalText(120),
  utmMedium: optionalText(120),
  utmCampaign: optionalText(160),
  utmContent: optionalText(160),
  utmTerm: optionalText(160),
  privacyAccepted: checkboxBoolean.refine((value) => value, "La politique de confidentialité doit être acceptée."),
  marketingOptIn: checkboxBoolean.default(false),
  website: optionalText(200),
}).superRefine((value, context) => {
  if (!value.email && !value.phone) {
    context.addIssue({ code: "custom", path: ["email"], message: "Un e-mail ou un téléphone est requis." })
  }
})

export type PublicLeadInput = z.infer<typeof publicLeadSchema>

export function normalizePhone(value: string | undefined) {
  if (!value) return undefined
  const trimmed = value.trim().replace(/\(0\)/, "")
  const prefix = trimmed.startsWith("+") ? "+" : ""
  const digits = trimmed.replace(/\D/g, "")
  return digits.length >= 8 ? `${prefix}${digits}` : trimmed
}
