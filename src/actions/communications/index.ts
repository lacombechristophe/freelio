"use server"

import { randomUUID } from "node:crypto"
import { revalidatePath } from "next/cache"
import { z } from "zod"

import { logAction } from "@/lib/audit"
import { sanitizeSequenceEmailHtml, senderFor } from "@/lib/automations/email"
import { withAuth } from "@/lib/auth-wrapper"
import { recordOutgoingEmail } from "@/lib/communications/threads"
import prisma from "@/lib/prisma"

const cuid = z.string().cuid()

export async function getCommunicationDashboard() {
  return withAuth(async ({ companyId }) => {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1_000)
    const [company, channels, threads, events, contacts] = await Promise.all([
      prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { name: true, email: true } }),
      prisma.communicationChannel.findMany({ where: { companyId }, select: { id: true, provider: true, emailAddress: true, displayName: true, status: true, lastSyncAt: true, lastError: true }, orderBy: { createdAt: "desc" } }),
      prisma.emailThread.findMany({
        where: { companyId, status: { not: "ARCHIVED" } },
        include: {
          client: { select: { id: true, name: true } },
          contact: { select: { id: true, firstName: true, lastName: true, email: true } },
          leadCapture: { select: { id: true, firstName: true, lastName: true, email: true } },
          messages: { include: { events: { orderBy: { occurredAt: "asc" } } }, orderBy: { createdAt: "asc" }, take: 100 },
        },
        orderBy: { lastMessageAt: "desc" },
        take: 100,
      }),
      prisma.emailEvent.groupBy({ where: { companyId, occurredAt: { gte: since } }, by: ["type"], _count: { _all: true } }),
      prisma.contact.findMany({ where: { client: { companyId }, email: { not: null } }, include: { client: { select: { id: true, name: true } } }, orderBy: [{ firstName: "asc" }, { lastName: "asc" }], take: 500 }),
    ])
    const sent = await prisma.emailMessage.count({ where: { companyId, direction: "OUTBOUND", createdAt: { gte: since } } })
    const received = await prisma.emailMessage.count({ where: { companyId, direction: "INBOUND", createdAt: { gte: since } } })
    return { company, channels, threads, contacts, stats: { sent, received, events: Object.fromEntries(events.map((event) => [event.type, event._count._all])) } }
  }, "automation.read")
}

const sendSchema = z.object({
  contactId: cuid,
  threadId: z.union([cuid, z.literal("")]).optional(),
  serviceTicketId: z.union([cuid, z.literal("")]).optional(),
  subject: z.string().trim().min(2).max(180),
  bodyHtml: z.string().trim().min(10).max(100_000),
})

export async function sendCrmEmail(input: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    const data = sendSchema.parse(input)
    const [company, contact] = await Promise.all([
      prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { name: true, email: true } }),
      prisma.contact.findFirst({ where: { id: data.contactId, client: { companyId }, email: { not: null } }, select: { id: true, email: true, clientId: true } }),
    ])
    if (!contact?.email) throw new Error("Contact ou adresse e-mail introuvable")
    const ticket = data.serviceTicketId ? await prisma.serviceTicket.findFirst({ where: { id: data.serviceTicketId, companyId, clientId: contact.clientId }, select: { id: true } }) : null
    if (data.serviceTicketId && !ticket) throw new Error("Ticket introuvable ou sans rapport avec ce contact")
    if (data.threadId) {
      const thread = await prisma.emailThread.findFirst({ where: { id: data.threadId, companyId, clientId: contact.clientId, ...(ticket ? { OR: [{ serviceTicketId: null }, { serviceTicketId: ticket.id }] } : {}) }, select: { id: true } })
      if (!thread) throw new Error("Conversation introuvable")
    }
    const apiKey = process.env.RESEND_API_KEY?.trim()
    if (!apiKey) throw new Error("RESEND_API_KEY n’est pas configurée")
    const subject = data.subject.replace(/[\r\n]+/g, " ").trim()
    const content = sanitizeSequenceEmailHtml(data.bodyHtml)
    const html = `<!doctype html><html lang="fr"><body><main>${content}</main></body></html>`
    const from = senderFor(company.name)
    const idempotencyKey = randomUUID()
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}`, "idempotency-key": idempotencyKey },
      body: JSON.stringify({ from, to: [contact.email], reply_to: company.email || undefined, subject, html }),
    })
    const payload = await response.json().catch(() => ({})) as { id?: string; message?: string }
    if (!response.ok || !payload.id) throw new Error(payload.message || `Envoi refusé (${response.status})`)
    const message = await recordOutgoingEmail({ companyId, threadId: data.threadId || null, clientId: contact.clientId, contactId: contact.id, providerId: payload.id, from, to: [contact.email], subject, bodyHtml: html })
    if (ticket) await prisma.emailThread.update({ where: { id: message.threadId }, data: { serviceTicketId: ticket.id } })
    await logAction({ userId, action: "SEND_CRM_EMAIL", resource: "EMAIL_MESSAGE", resourceId: message.id, payload: { contactId: contact.id, threadId: message.threadId } })
    revalidatePath("/dashboard/communications")
    revalidatePath(`/dashboard/clients/${contact.clientId}`)
    if (ticket) revalidatePath(`/dashboard/service/tickets/${ticket.id}`)
    return { success: true as const, messageId: message.id }
  }, "automation.write")
}

const channelSchema = z.object({
  provider: z.enum(["RESEND", "GOOGLE", "MICROSOFT"]),
  emailAddress: z.string().trim().toLowerCase().email().max(254),
  displayName: z.string().trim().max(120).optional().default(""),
})

export async function configureCommunicationChannel(input: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    const data = channelSchema.parse(input)
    const providerConfigured = data.provider === "RESEND"
      ? Boolean(process.env.RESEND_API_KEY && process.env.RESEND_WEBHOOK_SECRET)
      : data.provider === "GOOGLE"
        ? Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
        : Boolean(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET)
    const channel = await prisma.communicationChannel.upsert({
      where: { companyId_provider_emailAddress: { companyId, provider: data.provider, emailAddress: data.emailAddress } },
      update: { displayName: data.displayName || null, status: providerConfigured && data.provider === "RESEND" ? "ACTIVE" : "PENDING", lastError: providerConfigured ? null : "Identifiants fournisseur à configurer" },
      create: { companyId, provider: data.provider, emailAddress: data.emailAddress, displayName: data.displayName || null, status: providerConfigured && data.provider === "RESEND" ? "ACTIVE" : "PENDING", lastError: providerConfigured ? null : "Identifiants fournisseur à configurer" },
    })
    await logAction({ userId, action: "UPDATE_COMMUNICATION_CHANNEL", resource: "COMMUNICATION_CHANNEL", resourceId: channel.id, payload: { provider: channel.provider, emailAddress: channel.emailAddress, status: channel.status } })
    revalidatePath("/dashboard/communications")
    return { success: true as const, status: channel.status }
  }, "company.manage")
}

export async function updateEmailThread(threadId: string, input: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    const id = cuid.parse(threadId)
    const data = z.object({ status: z.enum(["OPEN", "CLOSED", "ARCHIVED"]).optional(), markRead: z.boolean().optional() }).parse(input)
    const thread = await prisma.emailThread.findFirst({ where: { id, companyId }, select: { id: true } })
    if (!thread) throw new Error("Conversation introuvable")
    await prisma.emailThread.update({ where: { id }, data: { ...(data.status ? { status: data.status } : {}), ...(data.markRead ? { unreadCount: 0 } : {}) } })
    await logAction({ userId, action: "UPDATE_EMAIL_THREAD", resource: "EMAIL_THREAD", resourceId: id, payload: data })
    revalidatePath("/dashboard/communications")
    return { success: true as const }
  }, "automation.write")
}
