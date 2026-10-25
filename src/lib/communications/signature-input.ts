import { z } from "zod"

export const signatureTextSchema = z.string().max(4_000, "La signature est limitée à 4 000 caractères").transform(value => value.replace(/\r\n?/g, "\n").trim())
  .refine(value => !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value), "La signature contient des caractères de contrôle")

export type EmailSignatureDto = { text: string; version: number | null }

export function insertEmailSignature(html: string, text: string) {
  const signature = signatureTextSchema.parse(text)
  if (!signature) return html
  const escaped = signature.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]!)
  const result = `${html}<p>${escaped.replace(/\n/g, "<br>")}</p>`
  if (result.length > 100_000) throw new Error("Le contenu avec signature dépasse la taille autorisée")
  return result
}
