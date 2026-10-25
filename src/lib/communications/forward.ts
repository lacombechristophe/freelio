import "server-only"
import { z } from "zod"
import prisma from "@/lib/prisma"
import { channelConfig } from "./sync-state"
import { prepareManualEmailContent } from "./email-content"

export class ForwardUnavailable extends Error {}

function escapeHtml(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;")
}

export async function readForwardMessage(companyId: string, messageId: string) {
  const id = z.string().cuid().safeParse(messageId)
  if (!id.success) throw new ForwardUnavailable("Message introuvable")
  // The scoped Prisma client enforces tenant and mailbox visibility.
  // Do not select recipient headers, attachments or provider payloads.
  const message = await prisma.emailMessage.findFirst({ where: { companyId, id: id.data }, select: {
    threadId: true, subject: true, fromAddress: true, bodyText: true, bodyHtml: true, sentAt: true, receivedAt: true, createdAt: true,
  } })
  if (!message) throw new ForwardUnavailable("Message introuvable")
  // A required to-one relation cannot accept the nested `where` added by mailbox scopes.
  // Read the thread separately through the same scopes, rather than bypassing them.
  const thread = await prisma.emailThread.findFirst({ where: { companyId, id: message.threadId },
    select: { channel: { select: { id: true, status: true, config: true } } } })
  if (!thread) throw new ForwardUnavailable("Message introuvable")
  const subject = `Tr: ${message.subject.trim()}`
  if (subject.length > 180 || /[\r\n]/.test(subject)) throw new ForwardUnavailable("L’objet du message ne peut pas être transféré automatiquement ; rédigez un nouvel e-mail avec un objet de 180 caractères maximum")
  const text = message.bodyText?.trim() ? message.bodyText : prepareManualEmailContent(message.bodyHtml || "").text
  const date = (message.sentAt || message.receivedAt || message.createdAt).toISOString()
  const bodyHtml = `<p>Bonjour,</p><p></p><blockquote><p>De : ${escapeHtml(message.fromAddress)}<br>Date : ${date}</p><p>${escapeHtml(text).replace(/\r\n|\r|\n/g, "<br>")}</p></blockquote>`
  if (bodyHtml.length > 100_000) throw new ForwardUnavailable("Ce message dépasse la taille d’un brouillon ; rédigez le transfert manuellement avec un extrait du texte")
  const channel = thread.channel
  return { subject, bodyHtml, channelId: channel?.status === "ACTIVE" && channelConfig(channel.config).mailEnabled !== false ? channel.id : null }
}
