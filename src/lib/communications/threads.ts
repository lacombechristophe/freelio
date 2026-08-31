import { Prisma } from "@prisma/client"

import prisma from "@/lib/prisma"

export function canonicalEmailSubject(subject: string) {
  return subject.replace(/^\s*((re|fw|fwd|tr)\s*:\s*)+/i, "").trim().slice(0, 250) || "Sans objet"
}

export async function resolveEmailParty(companyId: string, email: string) {
  const normalized = email.trim().toLowerCase()
  const contact = await prisma.contact.findFirst({
    where: { email: { equals: normalized }, client: { companyId } },
    select: { id: true, clientId: true },
  })
  if (contact) return { contactId: contact.id, clientId: contact.clientId, leadCaptureId: null }
  const lead = await prisma.leadCapture.findFirst({
    where: { companyId, email: { equals: normalized } },
    select: { id: true, contactId: true, clientId: true },
    orderBy: { createdAt: "desc" },
  })
  return { contactId: lead?.contactId ?? null, clientId: lead?.clientId ?? null, leadCaptureId: lead?.id ?? null }
}

export async function getOrCreateEmailThread(input: {
  companyId: string
  subject: string
  clientId?: string | null
  contactId?: string | null
  leadCaptureId?: string | null
  inReplyTo?: string | null
  occurredAt?: Date
}) {
  if (input.inReplyTo) {
    const repliedMessage = await prisma.emailMessage.findFirst({
      where: { companyId: input.companyId, internetMessageId: input.inReplyTo },
      select: { threadId: true },
    })
    if (repliedMessage) return prisma.emailThread.findUniqueOrThrow({ where: { id: repliedMessage.threadId } })
  }
  const subject = canonicalEmailSubject(input.subject)
  const existing = await prisma.emailThread.findFirst({
    where: {
      companyId: input.companyId,
      status: { not: "ARCHIVED" },
      subject,
      ...(input.contactId ? { contactId: input.contactId } : input.leadCaptureId ? { leadCaptureId: input.leadCaptureId } : input.clientId ? { clientId: input.clientId } : {}),
    },
    orderBy: { lastMessageAt: "desc" },
  })
  if (existing) return existing
  return prisma.emailThread.create({
    data: {
      companyId: input.companyId,
      subject,
      clientId: input.clientId || null,
      contactId: input.contactId || null,
      leadCaptureId: input.leadCaptureId || null,
      lastMessageAt: input.occurredAt || new Date(),
    },
  })
}

export async function recordOutgoingEmail(input: {
  companyId: string
  threadId?: string | null
  clientId?: string | null
  contactId?: string | null
  leadCaptureId?: string | null
  deliveryId?: string | null
  providerId: string
  provider?: string
  from: string
  to: string[]
  cc?: string[]
  bcc?: string[]
  subject: string
  bodyHtml?: string | null
  bodyText?: string | null
  sentAt?: Date
}) {
  const sentAt = input.sentAt || new Date()
  const thread = input.threadId
    ? await prisma.emailThread.findFirstOrThrow({ where: { id: input.threadId, companyId: input.companyId } })
    : await getOrCreateEmailThread({ ...input, occurredAt: sentAt })
  const provider = input.provider || "RESEND"
  const message = await prisma.emailMessage.upsert({
    where: { provider_providerId: { provider, providerId: input.providerId } },
    update: { status: "SENT" },
    create: {
      companyId: input.companyId,
      threadId: thread.id,
      deliveryId: input.deliveryId || null,
      direction: "OUTBOUND",
      provider,
      providerId: input.providerId,
      fromAddress: input.from,
      toAddresses: input.to,
      ccAddresses: input.cc?.length ? input.cc : undefined,
      bccAddresses: input.bcc?.length ? input.bcc : undefined,
      subject: input.subject,
      bodyHtml: input.bodyHtml || null,
      bodyText: input.bodyText || null,
      status: "SENT",
      sentAt,
    },
  })
  await prisma.emailThread.update({ where: { id: thread.id }, data: { lastMessageAt: sentAt } })
  return message
}

export function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}
