"use server"

import { randomUUID } from "node:crypto"
import { revalidatePath } from "next/cache"
import { z } from "zod"

import { logAction } from "@/lib/audit"
import { prepareManualEmailContent } from "@/lib/communications/email-content"
import { getEmailSignature, saveEmailSignature, EmailSignatureConflict } from "@/lib/communications/signatures"
import { withAuth } from "@/lib/auth-wrapper"
import { readResendCredentials } from "@/lib/communications/provider-credentials"
import { sendManualEmail } from "@/lib/communications/manual-send"
import { syncOAuthCommunicationChannel } from "@/lib/communications/communication-sync"
import { jsonValue } from "@/lib/communications/threads"
import { encrypt } from "@/lib/crypto"
import prisma from "@/lib/prisma"
import { channelConfig } from "@/lib/communications/sync-state"
import { readInboxPage, readPreviousThreadMessages, type InboxQuery } from "@/lib/communications/inbox-reader"
import { readRecipientPage } from "@/lib/communications/recipient-reader"
import { deleteEmailDraft, EmailDraftConflict, getEmailDraft, listEmailDrafts, saveEmailDraft, sendEmailDraft } from "@/lib/communications/drafts"
import { copyRecipientsSchema, validateRecipients } from "@/lib/communications/recipients"
import { readReplyAllRecipients, ReplyAllUnavailable } from "@/lib/communications/reply-all"
import { readForwardMessage, ForwardUnavailable } from "@/lib/communications/forward"
import { scheduleEmailDraft, cancelScheduledEmail, EmailScheduleError } from "@/lib/communications/scheduled-emails"
import type { EmailAttachment } from "@/lib/communications/attachment-types"
import { listCrmEmailDocuments, attachCrmEmailDocument, EmailCrmDocumentError } from "@/lib/communications/crm-documents"
import { EmailAttachmentError } from "@/lib/communications/draft-attachments"

export async function getCommunicationCrmDocuments(input: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    try { return { success: true as const, page: await listCrmEmailDocuments(companyId, userId, input) } }
    catch (error) {
      if (error instanceof EmailCrmDocumentError) return { success: false as const, error: error.message }
      throw error
    }
  }, "automation.read")
}

export async function attachCommunicationCrmDocument(input: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    try {
      const draft = await attachCrmEmailDocument(companyId, userId, input)
      revalidatePath("/dashboard/communications")
      return { success: true as const, draft }
    } catch (error) {
      if (error instanceof EmailCrmDocumentError || error instanceof EmailDraftConflict || error instanceof EmailAttachmentError) return { success: false as const, error: error.message }
      throw error
    }
  }, "automation.write")
}

export async function getCommunicationDrafts(input: unknown = {}) {
  return withAuth(({ companyId, userId }) => listEmailDrafts(companyId, userId, input), "automation.read")
}

export async function scheduleCommunicationDraft(input: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    try {
      const draft = await scheduleEmailDraft(companyId, userId, input)
      revalidatePath("/dashboard/communications")
      return { success: true as const, draft }
    } catch (error) {
      if (error instanceof EmailScheduleError || error instanceof EmailDraftConflict) return { success: false as const, error: error.message }
      throw error
    }
  }, "automation.write")
}

export async function cancelCommunicationDraftSchedule(input: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    try {
      const draft = await cancelScheduledEmail(companyId, userId, input)
      revalidatePath("/dashboard/communications")
      return { success: true as const, draft }
    } catch (error) {
      if (error instanceof EmailScheduleError || error instanceof EmailDraftConflict) return { success: false as const, error: error.message }
      throw error
    }
  }, "automation.write")
}

export async function getCommunicationReplyAll(threadId: string) {
  return withAuth(async ({ companyId }) => {
    try { return { success: true as const, reply: await readReplyAllRecipients(companyId, threadId) } }
    catch (error) {
      if (error instanceof ReplyAllUnavailable) return { success: false as const, error: error.message }
      throw error
    }
  }, "automation.read")
}

export async function getCommunicationForward(messageId: string) {
  return withAuth(async ({ companyId }) => {
    try { return { success: true as const, forward: await readForwardMessage(companyId, messageId) } }
    catch (error) {
      if (error instanceof ForwardUnavailable) return { success: false as const, error: error.message }
      throw error
    }
  }, "automation.read")
}

export async function saveCommunicationSignature(input: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    try {
      const signature = await saveEmailSignature(companyId, userId, input)
      revalidatePath("/dashboard/communications")
      return { success: true as const, signature }
    } catch (error) {
      if (error instanceof EmailSignatureConflict) return { success: false as const, error: error.message }
      throw error
    }
  }, "automation.write")
}

export async function previewCommunicationEmail(input: unknown) {
  return withAuth(async () => {
    const { bodyHtml } = z.object({ bodyHtml: z.string().max(100_000) }).parse(input)
    return prepareManualEmailContent(bodyHtml)
  }, "automation.read")
}

export async function getCommunicationDraft(id: string) {
  return withAuth(({ companyId, userId }) => getEmailDraft(companyId, userId, id), "automation.read")
}

export async function saveCommunicationDraft(input: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    try {
      const expected = z.object({ expectedCompanyId: z.string().min(1).max(200).optional(), expectedAuthorId: z.string().min(1).max(200).optional() }).parse(input)
      if ((expected.expectedCompanyId && expected.expectedCompanyId !== companyId) || (expected.expectedAuthorId && expected.expectedAuthorId !== userId)) {
        throw new EmailDraftConflict("Le compte ou l’espace actif a changé. Votre texte est conservé ; rouvrez Communications avant de sauvegarder")
      }
      const draft = await saveEmailDraft(companyId, userId, input)
      revalidatePath("/dashboard/communications")
      return { success: true as const, draft }
    } catch (error) {
      if (error instanceof EmailDraftConflict) return { success: false as const, error: error.message }
      throw error
    }
  }, "automation.write")
}

export async function deleteCommunicationDraft(input: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    try {
      const result = await deleteEmailDraft(companyId, userId, input)
      revalidatePath("/dashboard/communications")
      return result
    } catch (error) {
      if (error instanceof EmailDraftConflict) return { success: false as const, error: error.message }
      throw error
    }
  }, "automation.write")
}

const cuid = z.string().cuid()

export async function getCommunicationDashboard() {
  return withAuth(async ({ companyId, userId }) => {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1_000)
    const [company, channels, inbox, events, recipients, unread, signature] = await Promise.all([
      prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { id: true, name: true, email: true } }),
      prisma.communicationChannel.findMany({ where: { companyId }, select: { id: true, provider: true, emailAddress: true, displayName: true, status: true, visibility: true, mailEnabled: true, calendarEnabled: true, config: true, credentialsEncrypted: true, lastSyncAt: true, lastError: true }, orderBy: { createdAt: "desc" } }),
      readInboxPage(companyId),
      prisma.emailEvent.groupBy({ where: { companyId, occurredAt: { gte: since } }, by: ["type"], _count: { _all: true } }),
      readRecipientPage(companyId),
      prisma.emailThread.aggregate({ where: { companyId, status: { not: "ARCHIVED" } }, _sum: { unreadCount: true } }),
      getEmailSignature(companyId, userId),
    ])
    const sent = await prisma.emailMessage.count({ where: { companyId, direction: "OUTBOUND", createdAt: { gte: since } } })
    const received = await prisma.emailMessage.count({ where: { companyId, direction: "INBOUND", createdAt: { gte: since } } })
    return {
      company,
      signature,
      signatureOwnerId: userId,
      channels: channels.map(({ credentialsEncrypted, config, ...channel }) => ({
        ...channel,
        hasCredentials: Boolean(credentialsEncrypted),
        connectionMode: config && typeof config === "object" && !Array.isArray(config) && "mode" in config && typeof config.mode === "string" ? config.mode : null,
        config: { mode: channelConfig(config).mode ?? null },
        emailSyncStatus: channelConfig(config).emailSyncStatus ?? null,
        calendarSyncStatus: channelConfig(config).calendarSyncStatus ?? null,
      })),
      threads: inbox.threads,
      inbox,
      recipients,
      stats: { sent, received, unread: unread._sum.unreadCount ?? 0, events: Object.fromEntries(events.map((event) => [event.type, event._count._all])) },
    }
  }, "automation.read")
}

export async function getCommunicationInboxPage(input: InboxQuery) {
  return withAuth(({ companyId }) => readInboxPage(companyId, input), "automation.read")
}

export async function getPreviousCommunicationMessages(input: unknown) {
  return withAuth(({ companyId }) => readPreviousThreadMessages(companyId, input), "automation.read")
}

export async function getCommunicationRecipients(input: unknown = {}) {
  return withAuth(({ companyId }) => readRecipientPage(companyId, input), "automation.read")
}

const sendSchema = z.object({
  requestKey: z.string().uuid().optional(),
  contactId: cuid,
  channelId: z.union([cuid, z.literal("")]).optional(),
  threadId: z.union([cuid, z.literal("")]).optional(),
  serviceTicketId: z.union([cuid, z.literal("")]).optional(),
  subject: z.string().trim().min(2).max(180),
  bodyHtml: z.string().trim().min(10).max(100_000),
  cc: copyRecipientsSchema.default([]), bcc: copyRecipientsSchema.default([]),
  draftId: cuid.optional(), draftVersion: z.number().int().positive().optional(),
  attachmentIds: z.array(z.string().uuid()).max(5).default([]),
})

export async function sendCrmEmail(input: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    const data = sendSchema.parse(input)
    if (data.attachmentIds.length && !data.draftId) throw new Error("Enregistrez les pièces jointes dans un brouillon avant l’envoi")
    const [company, contact] = await Promise.all([
      prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { name: true, email: true } }),
      prisma.contact.findFirst({ where: { id: data.contactId, client: { companyId }, email: { not: null } }, select: { id: true, email: true, clientId: true } }),
    ])
    if (!contact?.email) throw new Error("Contact ou adresse e-mail introuvable")
    validateRecipients(contact.email, data.cc, data.bcc)
    const ticket = data.serviceTicketId ? await prisma.serviceTicket.findFirst({ where: { id: data.serviceTicketId, companyId, clientId: contact.clientId, status: { not: "MERGED" }, mergedIntoTicketId: null }, select: { id: true } }) : null
    if (data.serviceTicketId && !ticket) throw new Error("Ticket introuvable ou sans rapport avec ce contact")
    if (data.threadId) {
      const thread = await prisma.emailThread.findFirst({ where: { id: data.threadId, companyId, clientId: contact.clientId, ...(ticket ? { OR: [{ serviceTicketId: null }, { serviceTicketId: ticket.id }] } : {}) }, select: { id: true } })
      if (!thread) throw new Error("Conversation introuvable")
    }
    const subject = data.subject.replace(/[\r\n]+/g, " ").trim()
    const { html } = prepareManualEmailContent(data.bodyHtml)
    const send = (requestKey: string, attachments: EmailAttachment[] = []) => sendManualEmail({ companyId, userId, requestKey, channelId: data.channelId || null, companyName: company.name, replyTo: company.email, to: contact.email!, contactId: contact.id, clientId: contact.clientId, threadId: data.threadId || null, serviceTicketId: ticket?.id || null, subject, html, cc: data.cc, bcc: data.bcc, attachments })
    const message = await (async () => {
      try {
        return data.draftId ? await sendEmailDraft(companyId, userId, { ...data, id: data.draftId, version: data.draftVersion }, send) : await send(data.requestKey || randomUUID())
      } catch (error) {
        if (error instanceof EmailDraftConflict) return { success: false as const, error: error.message }
        throw error
      }
    })()
    if ("success" in message) return message
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
  visibility: z.enum(["PRIVATE", "SHARED"]).default("PRIVATE"),
  capabilities: z.enum(["MAIL", "CALENDAR", "BOTH"]).default("BOTH"),
  sharingAcknowledged: z.boolean().default(false),
  emailAddress: z.string().trim().toLowerCase().email().max(254),
  displayName: z.string().trim().max(120).optional().default(""),
  apiKey: z.string().trim().max(500).optional().default(""),
  webhookSecret: z.string().trim().max(500).optional().default(""),
})

export async function configureCommunicationChannel(input: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    const data = channelSchema.parse(input)
    if (data.visibility === "SHARED" && !data.sharingAcknowledged) throw new Error("Confirmez explicitement le partage de cette messagerie")
    if (data.provider === "RESEND" && data.capabilities === "CALENDAR") throw new Error("Resend ne fournit pas de calendrier")
    const existing = await prisma.communicationChannel.findUnique({ where: { companyId_provider_emailAddress: { companyId, provider: data.provider, emailAddress: data.emailAddress } }, select: { id: true, ownerUserId: true, status: true, credentialsEncrypted: true, config: true } })
    const access = { visibility: data.visibility, ownerUserId: existing?.ownerUserId || userId, mailEnabled: data.capabilities !== "CALENDAR", calendarEnabled: data.provider !== "RESEND" && data.capabilities !== "MAIL" }
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
      update: { ...access, displayName: data.displayName || null, status, credentialsEncrypted, config, lastError: status === "ACTIVE" ? null : data.provider === "RESEND" ? "Clé API et secret webhook requis" : "Autorisation OAuth requise" },
      create: { ...access, companyId, provider: data.provider, emailAddress: data.emailAddress, displayName: data.displayName || null, status, credentialsEncrypted, config, lastError: status === "ACTIVE" ? null : data.provider === "RESEND" ? "Clé API et secret webhook requis" : "Autorisation OAuth requise" },
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
    await prisma.communicationChannel.update({ where: { id }, data: { status: "PENDING", credentialsEncrypted: null, oauthNonceHash: null, oauthAttemptId: null, oauthExpiresAt: null, oauthStartedByUserId: null, config: { mode: "DISCONNECTED" }, lastSyncAt: null, lastError: "Déconnectée de Freelio ; l’accès fournisseur reste à révoquer" } })
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
