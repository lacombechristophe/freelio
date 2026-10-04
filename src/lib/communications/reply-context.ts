import "server-only"
import { z } from "zod"
import prisma from "@/lib/prisma"
import { canonicalEmailSubject } from "@/lib/communications/threads"

export function validInternetMessageId(value: string | null | undefined): value is string {
  return !!value && value.length <= 900 && [...value].every(char => char.charCodeAt(0) >= 33 && char.charCodeAt(0) !== 127) && /^<[^\s<>@]+@[^\s<>@]+>$/.test(value)
}

export const replyContextSchema = z.object({
  messageId: z.string().cuid(),
  provider: z.enum(["GOOGLE", "MICROSOFT", "RESEND"]),
  providerId: z.string().max(2000).nullable(),
  internetMessageId: z.string().refine(validInternetMessageId, "Référence Internet du message invalide"),
  subject: z.string().max(250),
  direction: z.enum(["INBOUND", "OUTBOUND"]),
})
export type ReplyContext = z.infer<typeof replyContextSchema>

export async function freezeReplyContext(companyId: string, threadId: string | null, provider: string, subject: string) {
  if (!threadId) return null
  // Reply to the latest received message; fall back to an outgoing-only thread.
  const message = await prisma.emailMessage.findFirst({ where: { companyId, threadId }, orderBy: [{ direction: "asc" }, { createdAt: "desc" }, { id: "desc" }],
    select: { id: true, provider: true, providerId: true, internetMessageId: true, subject: true, direction: true } })
  if (!message || message.provider !== provider) throw new Error("La référence du message d’origine est absente ou incompatible ; synchronisez la conversation")
  if (canonicalEmailSubject(subject) !== canonicalEmailSubject(message.subject)) throw new Error("L’objet de la réponse doit conserver celui de la conversation")
  if (message.internetMessageId && !validInternetMessageId(message.internetMessageId)) throw new Error("Référence Internet du message invalide")
  if (!message.internetMessageId) throw new Error("Référence Internet du message absente ; réconciliation de l’historique nécessaire")
  return replyContextSchema.parse({ ...message, messageId: message.id })
}

export function replyMailboxAddresses(value: string) {
  const bracketed = [...value.matchAll(/<([^<>]+)>/g)].map(match => match[1].trim())
  if (!bracketed.length) return value.split(",").map(address => address.trim()).filter(Boolean)
  // Quoted display names may contain commas. Reject mixed bare/bracketed lists
  // instead of silently overlooking an additional reply destination.
  const remainder = value.replace(/"(?:\\.|[^"\\])*"/g, "").replace(/<[^<>]*>/g, "")
  return remainder.includes("@") ? [...bracketed, ""] : bracketed
}

export async function assertReplyContext(companyId: string, threadId: string, reply: ReplyContext) {
  const message = await prisma.emailMessage.findFirst({ where: { companyId, threadId, id: reply.messageId, provider: reply.provider,
    providerId: reply.providerId, internetMessageId: reply.internetMessageId, subject: reply.subject, direction: reply.direction }, select: { id: true } })
  if (!message) throw new Error("Le message d’origine a changé depuis la préparation ; vérifiez la conversation")
}

export function replyHeaders(reply: ReplyContext, metadata?: { internetMessageId: string; subject: string; references?: string; replyTo?: string[] }, to?: string) {
  if (metadata && (metadata.internetMessageId !== reply.internetMessageId || canonicalEmailSubject(metadata.subject) !== canonicalEmailSubject(reply.subject))) {
    throw new Error("Le message distant ne correspond plus à la réponse préparée")
  }
  if (reply.direction === "INBOUND" && metadata && (metadata.replyTo?.length !== 1 || metadata.replyTo[0].trim().toLowerCase() !== to?.trim().toLowerCase())) {
    throw new Error("L’adresse Reply-To du message diffère du contact choisi ; vérifiez le destinataire")
  }
  const references = (metadata?.references || "").trim().split(/\s+/).filter(Boolean)
  if (references.some(id => !validInternetMessageId(id)) || references.length > 100) throw new Error("Références de conversation distantes invalides")
  // Bound the MIME header while retaining the immediate parent.
  const chain = [...new Set([...references, reply.internetMessageId])].slice(-10)
  while (chain.join(" ").length > 900) chain.shift()
  return { "In-Reply-To": reply.internetMessageId, References: chain.join(" ") }
}
