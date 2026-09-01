"use server"

import { randomUUID } from "node:crypto"
import { revalidatePath } from "next/cache"
import { z } from "zod"

import { logAction } from "@/lib/audit"
import { sanitizeSequenceEmailHtml } from "@/lib/automations/email"
import { withAuth } from "@/lib/auth-wrapper"
import { readResendCredentials } from "@/lib/communications/provider-credentials"
import { sendEmailThroughChannel } from "@/lib/communications/email-provider"
import { syncOAuthCommunicationChannel } from "@/lib/communications/communication-sync"
import { jsonValue, recordOutgoingEmail } from "@/lib/communications/threads"
import { encrypt } from "@/lib/crypto"
import prisma from "@/lib/prisma"

const cuid = z.string().cuid()

export async function getCommunicationDashboard() {
  return withAuth(async ({ companyId }) => {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1_000)
    const [company, channels, threads, events, contacts] = await Promise.all([
      prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { name: true, email: true } }),
      prisma.communicationChannel.findMany({ where: { companyId }, select: { id: true, provider: true, emailAddress: true, displayName: true, status: true, config: true, credentialsEncrypted: true, lastSyncAt: true, lastError: true }, orderBy: { createdAt: "desc" } }),
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
    return {
      company,
      channels: channels.map(({ credentialsEncrypted, config, ...channel }) => ({
        ...channel,
        hasCredentials: Boolean(credentialsEncrypted),
        connectionMode: config && typeof config === "object" && !Array.isArray(config) && "mode" in config && typeof config.mode === "string" ? config.mode : null,
      })),
      threads,
      contacts,
      stats: { sent, received, events: Object.fromEntries(events.map((event) => [event.type, event._count._all])) },
    }
  }, "automation.read")
}

const sendSchema = z.object({
  contactId: cuid,
  channelId: z.union([cuid, z.literal("")]).optional(),
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
    const ticket = data.serviceTicketId ? await prisma.serviceTicket.findFirst({ where: { id: data.serviceTicketId, companyId, clientId: contact.clientId, status: { not: "MERGED" }, mergedIntoTicketId: null }, select: { id: true } }) : null
    if (data.serviceTicketId && !ticket) throw new Error("Ticket introuvable ou sans rapport avec ce contact")
    if (data.threadId) {
      const thread = await prisma.emailThread.findFirst({ where: { id: data.threadId, companyId, clientId: contact.clientId, ...(ticket ? { OR: [{ serviceTicketId: null }, { serviceTicketId: ticket.id }] } : {}) }, select: { id: true } })
      if (!thread) throw new Error("Conversation introuvable")
    }
    const subject = data.subject.replace(/[\r\n]+/g, " ").trim()
    const content = sanitizeSequenceEmailHtml(data.bodyHtml)
    const html = `<!doctype html><html lang="fr"><body><main>${content}</main></body></html>`
    const idempotencyKey = randomUUID()
    const sent = await sendEmailThroughChannel({ companyId, channelId: data.channelId || null, companyName: company.name, to: contact.email, replyTo: company.email, subject, html, idempotencyKey })
    const message = await recordOutgoingEmail({ companyId, threadId: data.threadId || null, clientId: contact.clientId, contactId: contact.id, provider: sent.provider, providerId: sent.providerId, from: sent.from, to: [contact.email], subject, bodyHtml: html })
    if (ticket) await prisma.$transaction([
      prisma.emailThread.update({ where: { id: message.threadId }, data: { serviceTicketId: ticket.id } }),
      prisma.serviceTicket.updateMany({ where: { id: ticket.id, firstRespondedAt: null }, data: { firstRespondedAt: new Date() } }),
    ])
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
  apiKey: z.string().trim().max(500).optional().default(""),
  webhookSecret: z.string().trim().max(500).optional().default(""),
})

export async function configureCommunicationChannel(input: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    const data = channelSchema.parse(input)
    const existing = await prisma.communicationChannel.findUnique({ where: { companyId_provider_emailAddress: { companyId, provider: data.provider, emailAddress: data.emailAddress } }, select: { id: true, status: true, credentialsEncrypted: true, config: true } })
    const suppliedResendCredentials = data.provider === "RESEND" && Boolean(data.apiKey && data.webhookSecret)
    if (data.provider === "RESEND" && Boolean(data.apiKey) !== Boolean(data.webhookSecret)) {
      throw new Error("La clé API et le secret webhook doivent être renseignés ensemble")
    }
    if (data.provider === "RESEND" && data.apiKey && !data.apiKey.startsWith("re_")) throw new Error("Format de clé API Resend invalide")
    if (data.provider === "RESEND" && data.webhookSecret && !data.webhookSecret.startsWith("whsec_")) throw new Error("Format de secret webhook Resend invalide")
    const existingResendCredentials = data.provider === "RESEND" ? readResendCredentials(existing?.credentialsEncrypted) : null
    const platformResendConfigured = Boolean(process.env.RESEND_API_KEY?.trim() && process.env.RESEND_WEBHOOK_SECRET?.trim())
    const resendReady = suppliedResendCredentials || Boolean(existingResendCredentials) || platformResendConfigured
    const status = data.provider === "RESEND" ? (resendReady ? "ACTIVE" : "PENDING") : (existing?.status === "ACTIVE" ? "ACTIVE" : "PENDING")
    const credentialsEncrypted = suppliedResendCredentials
      ? encrypt(JSON.stringify({ mode: "BYOK", apiKey: data.apiKey, webhookSecret: data.webhookSecret }))
      : existing?.credentialsEncrypted
    const config = data.provider === "RESEND"
      ? { mode: suppliedResendCredentials || existingResendCredentials ? "BYOK" : "PLATFORM" }
      : existing?.config == null ? undefined : jsonValue(existing.config)
    const channel = await prisma.communicationChannel.upsert({
      where: { companyId_provider_emailAddress: { companyId, provider: data.provider, emailAddress: data.emailAddress } },
      update: { displayName: data.displayName || null, status, credentialsEncrypted, config, lastError: status === "ACTIVE" ? null : data.provider === "RESEND" ? "Clé API et secret webhook requis" : "Autorisation OAuth requise" },
      create: { companyId, provider: data.provider, emailAddress: data.emailAddress, displayName: data.displayName || null, status, credentialsEncrypted, config, lastError: status === "ACTIVE" ? null : data.provider === "RESEND" ? "Clé API et secret webhook requis" : "Autorisation OAuth requise" },
    })
    await logAction({ userId, action: "UPDATE_COMMUNICATION_CHANNEL", resource: "COMMUNICATION_CHANNEL", resourceId: channel.id, payload: { provider: channel.provider, emailAddress: channel.emailAddress, status: channel.status } })
    revalidatePath("/dashboard/communications")
    return { success: true as const, status: channel.status, channelId: channel.id, connectPath: data.provider === "RESEND" ? null : `/api/integrations/email/oauth/start?channelId=${encodeURIComponent(channel.id)}` }
  }, "company.manage")
}

export async function disconnectCommunicationChannel(channelId: string) {
  return withAuth(async ({ companyId, userId }) => {
    const id = cuid.parse(channelId)
    const channel = await prisma.communicationChannel.findFirst({ where: { id, companyId }, select: { id: true, provider: true, emailAddress: true } })
    if (!channel) throw new Error("Connexion introuvable")
    await prisma.communicationChannel.update({ where: { id }, data: { status: "PENDING", credentialsEncrypted: null, config: { mode: "DISCONNECTED" }, lastSyncAt: null, lastError: "Connexion révoquée" } })
    await logAction({ userId, action: "UPDATE_COMMUNICATION_CHANNEL", resource: "COMMUNICATION_CHANNEL", resourceId: id, payload: { operation: "DISCONNECT", provider: channel.provider, emailAddress: channel.emailAddress } })
    revalidatePath("/dashboard/communications")
    return { success: true as const }
  }, "company.manage")
}

export async function syncCommunicationChannel(channelId: string) {
  return withAuth(async ({ companyId, userId }) => {
    const id = cuid.parse(channelId)
    const result = await syncOAuthCommunicationChannel(companyId, id)
    await logAction({ userId, action: "UPDATE_COMMUNICATION_CHANNEL", resource: "COMMUNICATION_CHANNEL", resourceId: id, payload: { operation: "SYNC", ...result } })
    revalidatePath("/dashboard/communications")
    return { success: true as const, ...result }
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
