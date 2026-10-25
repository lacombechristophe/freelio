"use server"

import { withAuth } from "@/lib/auth-wrapper"
import prisma from "@/lib/prisma"
import { hasPermission } from "@/lib/permissions"
import { contactEngagementSelection, contactMailScope } from "@/lib/contact-engagement"

export async function getContactsDirectory() {
  return withAuth(async ({ companyId, role }) => {
    const canReadAutomations = hasPermission(role, "automation.read")
    const contacts = await prisma.contact.findMany({
      where: { client: { companyId } },
      include: {
        client: { select: { id: true, name: true, type: true } },
        _count: canReadAutomations ? { select: contactEngagementSelection(companyId) } : false,
      },
      orderBy: [{ isPrimary: "desc" }, { lastName: "asc" }, { firstName: "asc" }],
      take: 1_000,
    })
    return contacts.map((contact) => ({
      ...contact,
      _count: {
        emailDeliveries: canReadAutomations ? contact._count.emailDeliveries : null,
        sequenceEnrollments: canReadAutomations ? contact._count.sequenceEnrollments : null,
      },
      access: { automation: canReadAutomations },
      createdAt: contact.createdAt.toISOString(),
      updatedAt: contact.updatedAt.toISOString(),
    }))
  }, "crm.read")
}

export async function getContactDetail(contactId: string) {
  return withAuth(async ({ companyId, role }) => {
    const canReadAutomations = hasPermission(role, "automation.read")
    const contact = await prisma.contact.findFirst({
      where: { id: contactId, client: { companyId } },
      include: {
        client: {
          select: {
            id: true,
            name: true,
            type: true,
            address: true,
            nextActionAt: true,
            nextActionLabel: true,
          },
        },
        marketingConsents: { where: { companyId }, orderBy: { capturedAt: "desc" }, take: 20 },
        leadCaptures: {
          where: { companyId },
          orderBy: { createdAt: "desc" },
          take: 20,
          select: {
            id: true,
            source: true,
            status: true,
            projectType: true,
            utmSource: true,
            utmCampaign: true,
            createdAt: true,
          },
        },
        portalAccesses: {
          where: {
            companyId,
            client: { companyId },
            revokedAt: null,
            expiresAt: { gt: new Date() },
          },
          select: { id: true, label: true, expiresAt: true, lastUsedAt: true },
        },
      },
    })
    if (!contact) return null
    const [sequenceEnrollments, emailThreads] = canReadAutomations
      ? await Promise.all([
          prisma.emailSequenceEnrollment.findMany({
            where: { contactId, sequence: { companyId }, leadCapture: { companyId } },
            include: {
              sequence: { select: { id: true, name: true, status: true } },
              deliveries: {
                where: contactMailScope(companyId),
                select: { id: true, status: true, subject: true, sentAt: true },
              },
            },
            orderBy: { enrolledAt: "desc" },
            take: 20,
          }),
          prisma.emailThread.findMany({
            where: { contactId, ...contactMailScope(companyId) },
            include: {
              messages: {
                where: { companyId },
                orderBy: { createdAt: "desc" },
                take: 1,
                select: { id: true, direction: true, subject: true, status: true, createdAt: true },
              },
            },
            orderBy: { lastMessageAt: "desc" },
            take: 30,
          }),
        ])
      : ([[], []] as const)
    return {
      ...contact,
      access: { automation: canReadAutomations },
      createdAt: contact.createdAt.toISOString(),
      updatedAt: contact.updatedAt.toISOString(),
      client: {
        ...contact.client,
        nextActionAt: contact.client.nextActionAt?.toISOString() ?? null,
      },
      marketingConsents: contact.marketingConsents.map((item) => ({
        ...item,
        capturedAt: item.capturedAt.toISOString(),
        withdrawnAt: item.withdrawnAt?.toISOString() ?? null,
      })),
      leadCaptures: contact.leadCaptures.map((item) => ({
        ...item,
        createdAt: item.createdAt.toISOString(),
      })),
      sequenceEnrollments: sequenceEnrollments.map((item) => ({
        ...item,
        enrolledAt: item.enrolledAt.toISOString(),
        nextSendAt: item.nextSendAt?.toISOString() ?? null,
        lastSentAt: item.lastSentAt?.toISOString() ?? null,
        completedAt: item.completedAt?.toISOString() ?? null,
        updatedAt: item.updatedAt.toISOString(),
        deliveries: item.deliveries.map((delivery) => ({
          ...delivery,
          sentAt: delivery.sentAt?.toISOString() ?? null,
        })),
      })),
      emailThreads: emailThreads.map((item) => ({
        ...item,
        lastMessageAt: item.lastMessageAt.toISOString(),
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
        messages: item.messages.map((message) => ({
          ...message,
          createdAt: message.createdAt.toISOString(),
        })),
      })),
      portalAccesses: contact.portalAccesses.map((item) => ({
        ...item,
        expiresAt: item.expiresAt.toISOString(),
        lastUsedAt: item.lastUsedAt?.toISOString() ?? null,
      })),
    }
  }, "crm.read")
}
