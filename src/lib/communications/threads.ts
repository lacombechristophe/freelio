import { Prisma } from "@prisma/client"

import prisma, { type TransactionClient } from "@/lib/prisma"

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
  channelId?: string | null
  subject: string
  clientId?: string | null
  contactId?: string | null
  leadCaptureId?: string | null
  inReplyTo?: string | null
  occurredAt?: Date
}, database: Pick<TransactionClient, "emailThread" | "emailMessage"> = prisma) {
  if (input.inReplyTo) {
    const repliedMessage = await database.emailMessage.findFirst({
      where: { companyId: input.companyId, internetMessageId: input.inReplyTo, thread: { channelId: input.channelId || null } },
      select: { threadId: true },
    })
    if (repliedMessage) return database.emailThread.findUniqueOrThrow({ where: { id: repliedMessage.threadId } })
  }
  const subject = canonicalEmailSubject(input.subject)
  // A subject alone does not identify a conversation between unknown parties.
  const existing = input.contactId || input.leadCaptureId || input.clientId ? await database.emailThread.findFirst({
    where: {
      companyId: input.companyId,
      channelId: input.channelId || null,
      status: { not: "ARCHIVED" },
      subject,
      ...(input.contactId ? { contactId: input.contactId } : input.leadCaptureId ? { leadCaptureId: input.leadCaptureId } : input.clientId ? { clientId: input.clientId } : {}),
    },
    orderBy: { lastMessageAt: "desc" },
  }) : null
  if (existing) return existing
  return database.emailThread.create({
    data: {
      companyId: input.companyId,
      channelId: input.channelId || null,
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
  channelId?: string | null
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
  if (input.deliveryId) {
    const recorded = await prisma.emailMessage.findUnique({ where: { deliveryId: input.deliveryId } })
    if (recorded) {
      if (recorded.companyId !== input.companyId) throw new Error("Historique d’envoi hors société")
      return recorded
    }
  }
  return prisma.$transaction(async (tx) => {
  const thread = input.threadId
    ? await tx.emailThread.findFirstOrThrow({ where: { id: input.threadId, companyId: input.companyId, channelId: input.channelId || null } })
    : await getOrCreateEmailThread({ ...input, occurredAt: sentAt }, tx)
  const provider = input.provider || "RESEND"
  const message = await tx.emailMessage.upsert({
    where: { companyId_provider_providerId: { companyId: input.companyId, provider, providerId: input.providerId } },
    update: {},
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
  await tx.emailThread.update({ where: { id: thread.id }, data: { lastMessageAt: sentAt } })
  return message
  })
}

export function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}
