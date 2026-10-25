import { z } from "zod"

export const emailAddressSchema = z.string().trim().toLowerCase().max(254).email().refine(value => !/[\r\n\x00-\x1f\x7f]/.test(value), "Adresse invalide")
export const copyRecipientsSchema = z.array(emailAddressSchema).max(20, "20 adresses maximum par champ")

export function parseCopyRecipients(value: string) {
  const parsed = copyRecipientsSchema.safeParse(value.trim() ? value.split(/[;,]/).map(address => address.trim()) : [])
  if (!parsed.success) throw new Error("CC et CCI : renseignez au maximum 20 adresses valides par champ, séparées par une virgule")
  return parsed.data
}

export function validateRecipients(to: string | null, cc: string[] = [], bcc: string[] = []) {
  const addresses = [...(to ? [emailAddressSchema.parse(to)] : []), ...copyRecipientsSchema.parse(cc), ...copyRecipientsSchema.parse(bcc)]
  if (new Set(addresses).size !== addresses.length) throw new Error("Une adresse ne peut figurer qu’une fois parmi À, CC et CCI")
}
