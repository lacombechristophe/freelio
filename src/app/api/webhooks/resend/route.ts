import type { Resend, EmailReceivedEvent, WebhookEventPayload } from "resend"

import { notifyPortalTeam } from "@/lib/portal/notifications"
import { verifiedResendWebhook, WebhookRoutingPendingError } from "@/lib/communications/resend-webhook-routing"
import { getOrCreateEmailThread, jsonValue, resolveEmailParty } from "@/lib/communications/threads"
import prisma from "@/lib/prisma"
import { dispatchAutomationEvent, enqueueAutomationEvent } from "@/lib/automations/engine"
import { PayloadTooLargeError, readTextBody } from "@/lib/http-body"
import { resendSuppressionReason, suppressEmailAddress } from "@/lib/communications/suppressions"
import { emailDeliveryStatusForEvent, emailEventUpdateGuard } from "@/lib/communications/delivery-events"
import { providerFetch } from "@/lib/integrations/provider-fetch"

export const runtime = "nodejs"

function normalizedAddress(value: string) {
  return (value.match(/<([^>]+)>/)?.[1] || value).trim().toLowerCase()
}

async function handleInbound(event: EmailReceivedEvent, apiKey: string, companyId: string, channelId: string | null) {
  const existing = await prisma.emailMessage.findUnique({ where: { companyId_provider_providerId: { companyId, provider: "RESEND", providerId: event.data.email_id } }, select: { id: true } })
  if (existing) return
  const response = await providerFetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(event.data.email_id)}?html_format=cid`, { headers: { authorization: `Bearer ${apiKey}` } })
  if (!response.ok) throw new Error("E-mail entrant temporairement indisponible")
  const content = await response.json() as NonNullable<Awaited<ReturnType<Resend["emails"]["receiving"]["get"]>>["data"]>
  const sender = normalizedAddress(content.from)
  const party = await resolveEmailParty(companyId, sender)
  const headers = Object.fromEntries(Object.entries(content.headers || {}).map(([key, value]) => [key.toLowerCase(), value]))
  const inReplyTo = headers["in-reply-to"]?.split(/\s+/)[0] || null
  const occurredAt = new Date(event.data.created_at)

  const eventId = await prisma.$transaction(async (tx) => {
    const existing = await tx.emailMessage.findUnique({ where: { companyId_provider_providerId: { companyId, provider: "RESEND", providerId: event.data.email_id } }, select: { id: true } })
    if (existing) return null
    const thread = await getOrCreateEmailThread({ companyId, channelId, subject: content.subject, ...party, inReplyTo, occurredAt }, tx)
    const stored = await tx.emailMessage.create({
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
        sequence: { companyId, senderChannelId: channelId },
        status: "ACTIVE",
        OR: [...(party.contactId ? [{ contactId: party.contactId }] : []), ...(party.leadCaptureId ? [{ leadCaptureId: party.leadCaptureId }] : [])],
      },
      data: { status: "STOPPED", stopReason: "CUSTOMER_REPLIED", nextSendAt: null, completedAt: occurredAt },
    })
    return enqueueAutomationEvent(tx, {
    companyId,
    event: "EMAIL_RECEIVED",
    subjectModel: "EmailMessage",
    subjectId: stored.id,
    eventKey: `resend:${event.data.email_id}:received`,
    leadId: party.leadCaptureId || undefined,
    clientId: party.clientId || undefined,
    })
  })
  if (eventId) {
    await dispatchAutomationEvent(eventId).catch((error) => console.error("Inbound email automation deferred", error))
    const channel = channelId ? await prisma.communicationChannel.findUnique({ where: { id: channelId }, select: { visibility: true } }) : null
    if (channel?.visibility === "SHARED") await notifyPortalTeam(companyId, "Nouvel e-mail reçu", `${sender} · ${content.subject}`)
  }
}

async function handleDeliveryEvent(event: WebhookEventPayload, eventId: string, companyId: string, channelId: string | null) {
  if (event.type === "email.received" || !("email_id" in event.data)) return
  const previousEvent = await prisma.emailEvent.findUnique({ where: { companyId_providerEventId: { companyId, providerEventId: eventId } }, select: { id: true } })
  if (previousEvent) return
  const providerMessageId = event.data.email_id
  const message = await prisma.emailMessage.findFirst({
    where: { companyId, provider: "RESEND", providerId: providerMessageId, thread: { channelId } },
    select: { id: true, companyId: true, deliveryId: true, toAddresses: true, thread: { select: { leadCaptureId: true, contactId: true, clientId: true } } },
  })
  const delivery = message?.deliveryId ? null : await prisma.emailDelivery.findFirst({ where: { companyId, channelId, provider: "RESEND", providerId: providerMessageId }, select: { id: true, companyId: true, recipientEmail: true, leadCaptureId: true, contactId: true } })
  if (!message && !delivery) throw new WebhookRoutingPendingError("Référence d’envoi pas encore persistée")
  const status = emailDeliveryStatusForEvent(event.type)
  const occurredAt = new Date(event.created_at)
  const automationId = await prisma.$transaction(async (tx) => {
    await tx.emailEvent.upsert({
      where: { companyId_providerEventId: { companyId, providerEventId: eventId } },
      update: {},
      create: {
        companyId,
        messageId: message?.id || null,
        provider: "RESEND",
        providerEventId: eventId,
        providerMessageId,
        type: event.type,
        payload: jsonValue(event.data),
        occurredAt,
      },
    })
    if (message && status) await tx.emailMessage.updateMany({
      where: { id: message.id, ...emailEventUpdateGuard(status, occurredAt) },
      data: { status, lastEventAt: occurredAt },
    })
    if (status && (message?.deliveryId || delivery?.id)) await tx.emailDelivery.updateMany({
      where: { id: message?.deliveryId || delivery!.id, ...emailEventUpdateGuard(status, occurredAt) },
      data: { status, lastEventAt: occurredAt },
    })
  const suppressionReason = resendSuppressionReason(event as Parameters<typeof resendSuppressionReason>[0])
  if (suppressionReason) {
    const rawRecipients = delivery?.recipientEmail
      ? [delivery.recipientEmail]
      : Array.isArray(message?.toAddresses)
        ? message.toAddresses.filter((value): value is string => typeof value === "string")
        : []
    await Promise.all([...new Set(rawRecipients.map(normalizedAddress))].map((email) => suppressEmailAddress({
      companyId,
      email,
      reason: suppressionReason,
      provider: "RESEND",
      providerEventId: eventId,
      details: jsonValue(event.data),
      leadCaptureId: message?.thread.leadCaptureId || delivery?.leadCaptureId,
      contactId: message?.thread.contactId || delivery?.contactId,
      occurredAt,
    }, tx)))
  }
  const trigger = event.type === "email.opened" ? "EMAIL_OPENED" : event.type === "email.clicked" ? "EMAIL_CLICKED" : null
  if (trigger && message)
    return enqueueAutomationEvent(tx, {
      companyId,
      event: trigger,
      subjectModel: "EmailMessage",
      subjectId: message.id,
      eventKey: `resend:${eventId}`,
      leadId: message.thread.leadCaptureId || undefined,
      clientId: message.thread.clientId || undefined,
    })
    return null
  })
  if (automationId) await dispatchAutomationEvent(automationId).catch((error) => console.error("Email engagement automation deferred", error))
}

export async function POST(request: Request) {
  let payload: string
  try {
    payload = await readTextBody(request, 1024 * 1024)
  } catch (error) {
    if (error instanceof PayloadTooLargeError) return Response.json({ error: "Webhook trop volumineux" }, { status: 413 })
    throw error
  }
  const id = request.headers.get("svix-id")
  const timestamp = request.headers.get("svix-timestamp")
  const signature = request.headers.get("svix-signature")
  if (!id || !timestamp || !signature) return Response.json({ error: "Signature absente" }, { status: 400 })
  let authenticated = false
  try {
    const scope = await verifiedResendWebhook(payload, { id, timestamp, signature }, new URL(request.url).searchParams.get("channelId"))
    authenticated = true
    if (scope.event.type === "email.received") await handleInbound(scope.event, scope.apiKey, scope.companyId, scope.channelId)
    else await handleDeliveryEvent(scope.event, id, scope.companyId, scope.channelId)
    return Response.json({ received: true })
  } catch (error) {
    if (error instanceof WebhookRoutingPendingError) return Response.json({ error: "Rattachement à reprendre" }, { status: 503 })
    console.error("Resend webhook rejected", error instanceof Error ? error.message : "unknown")
    return Response.json({ error: authenticated ? "Traitement à reprendre" : "Webhook invalide" }, { status: authenticated ? 503 : 400 })
  }
}
