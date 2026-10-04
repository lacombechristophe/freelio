import "server-only"
import { z } from "zod"
import type { Prisma } from "@prisma/client"
import prisma from "@/lib/prisma"
import { channelConfig } from "./sync-state"
import { replyMailboxAddresses } from "./reply-context"
import { copyRecipientsSchema, emailAddressSchema } from "./recipients"

export class ReplyAllUnavailable extends Error {}

function addresses(value: Prisma.JsonValue | null) {
  if (value === null) return []
  if (!Array.isArray(value) || value.some(address => typeof address !== "string")) throw new ReplyAllUnavailable("Les destinataires du message sont invalides ; vérifiez la conversation avant de répondre")
  return (value as string[]).flatMap(replyMailboxAddresses)
}

export async function readReplyAllRecipients(companyId: string, threadId: string) {
  const thread = await prisma.emailThread.findFirst({ where: { companyId, id: z.string().cuid().parse(threadId) },
    select: { id: true, contact: { select: { id: true, email: true } }, channel: { select: { id: true, emailAddress: true, status: true, config: true } } } })
  if (!thread) throw new ReplyAllUnavailable("Conversation introuvable")
  if (!thread.channel || thread.channel.status !== "ACTIVE" || channelConfig(thread.channel.config).mailEnabled === false) throw new ReplyAllUnavailable("La boîte de cette conversation est déconnectée ou ne permet plus l’envoi ; reconnectez-la avant de répondre")
  const primary = emailAddressSchema.safeParse(thread.contact?.email)
  const sender = emailAddressSchema.safeParse(thread.channel.emailAddress)
  if (!thread.contact || !primary.success || !sender.success) throw new ReplyAllUnavailable("Associez cette conversation à un contact avec une adresse valide avant de répondre à tous")
  // Match the incoming parent selection used by freezeReplyContext, beyond the displayed page.
  const message = await prisma.emailMessage.findFirst({ where: { companyId, threadId: thread.id, direction: "INBOUND" },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { fromAddress: true, toAddresses: true, ccAddresses: true } })
  if (!message) throw new ReplyAllUnavailable("Aucun message reçu dans cette conversation ; utilisez Répondre pour un fil uniquement sortant")
  const parsed = z.array(emailAddressSchema).safeParse([...replyMailboxAddresses(message.fromAddress), ...addresses(message.toAddresses), ...addresses(message.ccAddresses)])
  if (!parsed.success) throw new ReplyAllUnavailable("Les destinataires du message sont invalides ; vérifiez la conversation avant de répondre")
  const cc = [...new Set(parsed.data)].filter(address => address !== primary.data && address !== sender.data)
  if (!copyRecipientsSchema.safeParse(cc).success) throw new ReplyAllUnavailable("Cette réponse dépasse la limite de 20 adresses CC ; préparez les destinataires manuellement")
  return { threadId: thread.id, channelId: thread.channel.id, contactId: thread.contact.id, cc }
}
