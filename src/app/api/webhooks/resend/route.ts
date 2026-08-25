import { Resend, type EmailReceivedEvent, type WebhookEventPayload } from "resend"

import { notifyPortalTeam } from "@/lib/portal/notifications"
import { getOrCreateEmailThread, jsonValue, resolveEmailParty } from "@/lib/communications/threads"
import prisma from "@/lib/prisma"
import { runAutomationEvent } from "@/lib/automations/engine"

export const runtime = "nodejs"

function normalizedAddress(value: string) {
  return (value.match(/<([^>]+)>/)?.[1] || value).trim().toLowerCase()
}

function eventStatus(type: string) {
  return ({
    "email.sent": "SENT",
    "email.delivered": "DELIVERED",
    "email.delivery_delayed": "DELAYED",
    "email.opened": "OPENED",
    "email.clicked": "CLICKED",
    "email.bounced": "BOUNCED",
    "email.failed": "FAILED",
    "email.complained": "COMPLAINED",
    "email.suppressed": "SUPPRESSED",
  } as Record<string, string>)[type]
}

async function findCompanyIdForInbound(event: EmailReceivedEvent) {
  const recipients = [...event.data.to, ...event.data.received_for].map(normalizedAddress)
  const channel = await prisma.communicationChannel.findFirst({
    where: { provider: "RESEND", status: "ACTIVE", emailAddress: { in: recipients } },
    select: { companyId: true },
  })
  if (channel) return channel.companyId
  const company = await prisma.company.findFirst({ where: { email: { in: recipients } }, select: { id: true } })
  return company?.id ?? null
}

async function handleInbound(event: EmailReceivedEvent, resend: Resend) {
  const companyId = await findCompanyIdForInbound(event)
  if (!companyId) return
  const received = await resend.emails.receiving.get(event.data.email_id, { html_format: "cid" })
  if (received.error || !received.data) throw new Error(received.error?.message || "E-mail entrant introuvable")
  const content = received.data
  const sender = normalizedAddress(content.from)
  const party = await resolveEmailParty(companyId, sender)
  const headers = Object.fromEntries(Object.entries(content.headers || {}).map(([key, value]) => [key.toLowerCase(), value]))
  const inReplyTo = headers["in-reply-to"]?.split(/\s+/)[0] || null
  const occurredAt = new Date(event.data.created_at)
  const thread = await getOrCreateEmailThread({ companyId, subject: content.subject, ...party, inReplyTo, occurredAt })

  await prisma.$transaction(async (tx) => {
    const existing = await tx.emailMessage.findUnique({ where: { provider_providerId: { provider: "RESEND", providerId: event.data.email_id } }, select: { id: true } })
    if (existing) return
    await tx.emailMessage.create({
      data: {
        companyId,
        threadId: thread.id,
        direction: "INBOUND",
        provider: "RESEND",
        providerId: event.data.email_id,
        internetMessageId: content.message_id || null,
        inReplyTo,
        fromAddress: content.from,
        toAddresses: content.to,
        ccAddresses: content.cc || undefined,
        bccAddresses: content.bcc || undefined,
        subject: content.subject,
        bodyHtml: content.html,
        bodyText: content.text,
        attachments: content.attachments.length ? jsonValue(content.attachments) : undefined,
        status: "RECEIVED",
        receivedAt: occurredAt,
      },
    })
    await tx.emailThread.update({ where: { id: thread.id }, data: { unreadCount: { increment: 1 }, lastMessageAt: occurredAt, status: "OPEN" } })
    await tx.emailSequenceEnrollment.updateMany({
      where: {
        status: "ACTIVE",
        OR: [
          ...(party.contactId ? [{ contactId: party.contactId }] : []),
          ...(party.leadCaptureId ? [{ leadCaptureId: party.leadCaptureId }] : []),
        ],
      },
      data: { status: "STOPPED", stopReason: "CUSTOMER_REPLIED", nextSendAt: null, completedAt: occurredAt },
    })
  })
  const stored = await prisma.emailMessage.findUniqueOrThrow({ where: { provider_providerId: { provider: "RESEND", providerId: event.data.email_id } }, select: { id: true } })
  await notifyPortalTeam(companyId, "Nouvel e-mail reçu", `${sender} · ${content.subject}`)
  await runAutomationEvent({ companyId, event: "EMAIL_RECEIVED", subjectModel: "EmailMessage", subjectId: stored.id, eventKey: `resend:${event.data.email_id}:received`, leadId: party.leadCaptureId || undefined, clientId: party.clientId || undefined }).catch((error) => console.error("Inbound email automation failed", error))
}

async function handleDeliveryEvent(event: WebhookEventPayload, eventId: string) {
  if (event.type === "email.received" || !("email_id" in event.data)) return
  const providerMessageId = event.data.email_id
  const message = await prisma.emailMessage.findUnique({
    where: { provider_providerId: { provider: "RESEND", providerId: providerMessageId } },
    select: { id: true, companyId: true, deliveryId: true, thread: { select: { leadCaptureId: true, clientId: true } } },
  })
  const delivery = message?.deliveryId ? null : await prisma.emailDelivery.findFirst({ where: { providerId: providerMessageId }, select: { id: true, companyId: true } })
  const companyId = message?.companyId || delivery?.companyId
  if (!companyId) return
  const status = eventStatus(event.type)
  await prisma.$transaction(async (tx) => {
    await tx.emailEvent.upsert({
      where: { providerEventId: eventId },
      update: {},
      create: { companyId, messageId: message?.id || null, provider: "RESEND", providerEventId: eventId, providerMessageId, type: event.type, payload: jsonValue(event.data), occurredAt: new Date(event.created_at) },
    })
    if (message && status) await tx.emailMessage.update({ where: { id: message.id }, data: { status } })
    if (status && (message?.deliveryId || delivery?.id)) await tx.emailDelivery.update({ where: { id: message?.deliveryId || delivery!.id }, data: { status } })
  })
  const trigger = event.type === "email.opened" ? "EMAIL_OPENED" : event.type === "email.clicked" ? "EMAIL_CLICKED" : null
  if (trigger && message) await runAutomationEvent({ companyId, event: trigger, subjectModel: "EmailMessage", subjectId: message.id, eventKey: `resend:${eventId}`, leadId: message.thread.leadCaptureId || undefined, clientId: message.thread.clientId || undefined }).catch((error) => console.error("Email engagement automation failed", error))
}

export async function POST(request: Request) {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim()
  if (!apiKey || !secret) return Response.json({ error: "Webhook non configuré" }, { status: 503 })
  const payload = await request.text()
  const id = request.headers.get("svix-id")
  const timestamp = request.headers.get("svix-timestamp")
  const signature = request.headers.get("svix-signature")
  if (!id || !timestamp || !signature) return Response.json({ error: "Signature absente" }, { status: 400 })
  try {
    const resend = new Resend(apiKey)
    const event = resend.webhooks.verify({ payload, headers: { id, timestamp, signature }, webhookSecret: secret })
    if (event.type === "email.received") await handleInbound(event, resend)
    else await handleDeliveryEvent(event, id)
    return Response.json({ received: true })
  } catch (error) {
    console.error("Resend webhook rejected", error instanceof Error ? error.message : "unknown")
    return Response.json({ error: "Webhook invalide" }, { status: 400 })
  }
}
