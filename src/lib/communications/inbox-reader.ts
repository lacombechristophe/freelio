import "server-only"
import { Prisma } from "@prisma/client"
import { z } from "zod"
import prisma from "@/lib/prisma"

export const inboxQuerySchema = z.object({
  page: z.number().int().min(1).max(100_000).default(1),
  filter: z.enum(["ALL", "UNREAD", "ARCHIVED"]).default("ALL"),
  search: z.string().trim().max(200).default(""),
})
export type InboxQuery = z.input<typeof inboxQuerySchema>
const PAGE_SIZE = 50
const MESSAGE_PAGE_SIZE = 25
export const messageReadSelect = {
  id: true, direction: true, provider: true, fromAddress: true, toAddresses: true, ccAddresses: true,
  subject: true, bodyHtml: true, bodyText: true, attachments: true, status: true, sentAt: true, receivedAt: true, createdAt: true,
  events: { select: { id: true, type: true, occurredAt: true }, orderBy: [{ occurredAt: "desc" }, { id: "desc" }] },
} satisfies Prisma.EmailMessageSelect
type SelectedMessage = Prisma.EmailMessageGetPayload<{ select: typeof messageReadSelect }>

function messageDto(message: SelectedMessage) {
  return { ...message, sentAt: message.sentAt?.toISOString() ?? null, receivedAt: message.receivedAt?.toISOString() ?? null,
    createdAt: message.createdAt.toISOString(), events: message.events.toReversed().map((event) => ({ ...event, occurredAt: event.occurredAt.toISOString() })) }
}

export async function readInboxPage(companyId: string, input: InboxQuery = {}) {
  const query = inboxQuerySchema.parse(input)
  const where: Prisma.EmailThreadWhereInput = {
    companyId, status: query.filter === "ARCHIVED" ? "ARCHIVED" : { not: "ARCHIVED" },
    ...(query.filter === "UNREAD" ? { unreadCount: { gt: 0 } } : {}),
    ...(query.search ? { OR: [
      { subject: { contains: query.search } }, { client: { name: { contains: query.search } } },
      { contact: { OR: [{ firstName: { contains: query.search } }, { lastName: { contains: query.search } }, { email: { contains: query.search } }] } },
      { leadCapture: { OR: [{ firstName: { contains: query.search } }, { lastName: { contains: query.search } }, { email: { contains: query.search } }] } },
      { messages: { some: { OR: [{ fromAddress: { contains: query.search } }, { bodyText: { contains: query.search } }] } } },
    ] } : {}),
  }
  return prisma.$transaction(async (tx) => {
    const total = await tx.emailThread.count({ where })
    const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
    const page = Math.min(query.page, pageCount)
    const rows = await tx.emailThread.findMany({ where, orderBy: [{ lastMessageAt: "desc" }, { id: "desc" }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE,
      select: { id: true, channelId: true, subject: true, status: true, unreadCount: true, lastMessageAt: true,
        client: { select: { id: true, name: true } },
        contact: { select: { id: true, firstName: true, lastName: true, email: true } },
        leadCapture: { select: { id: true, firstName: true, lastName: true, email: true } },
        messages: { select: messageReadSelect, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: MESSAGE_PAGE_SIZE + 1 },
      },
    })
    return { page, pageCount, total, filter: query.filter, search: query.search,
      threads: rows.map((row) => ({ ...row, lastMessageAt: row.lastMessageAt.toISOString(), hasPreviousMessages: row.messages.length > MESSAGE_PAGE_SIZE,
        messages: row.messages.slice(0, MESSAGE_PAGE_SIZE).toReversed().map(messageDto) })),
    }
  })
}

export async function readPreviousThreadMessages(companyId: string, input: unknown) {
  const { threadId, beforeMessageId } = z.object({ threadId: z.string().cuid(), beforeMessageId: z.string().cuid() }).parse(input)
  // Both lookups pass through tenant and mailbox scopes, including the cursor.
  const thread = await prisma.emailThread.findFirst({ where: { companyId, id: threadId }, select: { id: true } })
  if (!thread) throw new Error("Conversation introuvable")
  const cursor = await prisma.emailMessage.findFirst({ where: { companyId, threadId, id: beforeMessageId }, select: { createdAt: true, id: true } })
  if (!cursor) throw new Error("Message de pagination introuvable")
  const messages = await prisma.emailMessage.findMany({ where: { companyId, threadId,
    OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }],
  }, select: messageReadSelect, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: MESSAGE_PAGE_SIZE + 1 })
  return { threadId, hasPreviousMessages: messages.length > MESSAGE_PAGE_SIZE, messages: messages.slice(0, MESSAGE_PAGE_SIZE).toReversed().map(messageDto) }
}

export type InboxPage = Awaited<ReturnType<typeof readInboxPage>>
