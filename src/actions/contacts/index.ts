"use server"

import { withAuth } from "@/lib/auth-wrapper"
import prisma from "@/lib/prisma"

export async function getContactsDirectory() {
  return withAuth(async ({ companyId }) => {
    const contacts = await prisma.contact.findMany({
      where: { client: { companyId } },
      include: {
        client: { select: { id: true, name: true, type: true } },
        _count: { select: { emailDeliveries: true, sequenceEnrollments: true } },
      },
      orderBy: [{ isPrimary: "desc" }, { lastName: "asc" }, { firstName: "asc" }],
      take: 1_000,
    })
    return contacts.map((contact) => ({ ...contact, createdAt: contact.createdAt.toISOString(), updatedAt: contact.updatedAt.toISOString() }))
  }, "crm.read")
}

export async function getContactDetail(contactId: string) {
  return withAuth(async ({ companyId }) => {
    const contact = await prisma.contact.findFirst({
      where: { id: contactId, client: { companyId } },
      include: {
        client: { select: { id: true, name: true, type: true, address: true, nextActionAt: true, nextActionLabel: true } },
        marketingConsents: { orderBy: { capturedAt: "desc" }, take: 20 },
        leadCaptures: { orderBy: { createdAt: "desc" }, take: 20, select: { id: true, source: true, status: true, projectType: true, utmSource: true, utmCampaign: true, createdAt: true } },
        sequenceEnrollments: { include: { sequence: { select: { id: true, name: true, status: true } }, deliveries: { select: { id: true, status: true, subject: true, sentAt: true } } }, orderBy: { enrolledAt: "desc" }, take: 20 },
        emailThreads: { include: { messages: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true, direction: true, subject: true, status: true, createdAt: true } } }, orderBy: { lastMessageAt: "desc" }, take: 30 },
        portalAccesses: { where: { revokedAt: null, expiresAt: { gt: new Date() } }, select: { id: true, label: true, expiresAt: true, lastUsedAt: true } },
      },
    })
    if (!contact) return null
    return {
      ...contact,
      createdAt: contact.createdAt.toISOString(), updatedAt: contact.updatedAt.toISOString(),
      client: { ...contact.client, nextActionAt: contact.client.nextActionAt?.toISOString() ?? null },
      marketingConsents: contact.marketingConsents.map((item) => ({ ...item, capturedAt: item.capturedAt.toISOString(), withdrawnAt: item.withdrawnAt?.toISOString() ?? null })),
      leadCaptures: contact.leadCaptures.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() })),
      sequenceEnrollments: contact.sequenceEnrollments.map((item) => ({ ...item, enrolledAt: item.enrolledAt.toISOString(), nextSendAt: item.nextSendAt?.toISOString() ?? null, lastSentAt: item.lastSentAt?.toISOString() ?? null, completedAt: item.completedAt?.toISOString() ?? null, updatedAt: item.updatedAt.toISOString(), deliveries: item.deliveries.map((delivery) => ({ ...delivery, sentAt: delivery.sentAt?.toISOString() ?? null })) })),
      emailThreads: contact.emailThreads.map((item) => ({ ...item, lastMessageAt: item.lastMessageAt.toISOString(), createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString(), messages: item.messages.map((message) => ({ ...message, createdAt: message.createdAt.toISOString() })) })),
      portalAccesses: contact.portalAccesses.map((item) => ({ ...item, expiresAt: item.expiresAt.toISOString(), lastUsedAt: item.lastUsedAt?.toISOString() ?? null })),
    }
  }, "crm.read")
}
