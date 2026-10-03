import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
import prisma from "@/lib/prisma"
import { requestContext } from "@/lib/context"
import { readInboxPage, readPreviousThreadMessages } from "@/lib/communications/inbox-reader"

describe.sequential("paginated inbox SQL and mailbox privacy", () => {
  let companyId: string, foreignCompanyId: string, ownerId: string, colleagueId: string
  let longThreadId: string, privateThreadId: string, privateCursorId: string, foreignThreadId: string
  beforeAll(async () => {
    const company = await prisma.company.create({ data: { name: "Fictitious inbox pagination" } }); companyId = company.id
    const foreign = await prisma.company.create({ data: { name: "Fictitious foreign inbox" } }); foreignCompanyId = foreign.id
    ownerId = (await prisma.user.create({ data: { name: "Fixture owner" } })).id
    colleagueId = (await prisma.user.create({ data: { name: "Fixture colleague" } })).id
    const shared = await prisma.communicationChannel.create({ data: { companyId, provider: "RESEND", emailAddress: "shared@example.test", visibility: "SHARED" } })
    const privateBox = await prisma.communicationChannel.create({ data: { companyId, ownerUserId: ownerId, provider: "GOOGLE", emailAddress: "private@example.test", visibility: "PRIVATE" } })
    const now = new Date()
    await prisma.emailThread.createMany({ data: Array.from({ length: 125 }, (_, index) => ({ companyId, channelId: shared.id, subject: `Fiction ${index.toString().padStart(3, "0")}`, unreadCount: index % 2, lastMessageAt: now })) })
    await prisma.emailThread.create({ data: { companyId, channelId: shared.id, subject: "Archived fiction", status: "ARCHIVED", unreadCount: 4 } })
    const thread = await prisma.emailThread.create({ data: { companyId, channelId: shared.id, subject: "Long fiction", lastMessageAt: new Date(now.getTime() + 1_000) } }); longThreadId = thread.id
    await prisma.emailMessage.createMany({ data: Array.from({ length: 101 }, (_, index) => ({ companyId, threadId: thread.id, direction: "INBOUND", provider: "RESEND", fromAddress: "fiction@example.test", toAddresses: [shared.emailAddress], subject: `Message ${index}`, bodyText: index === 0 ? "Ancient searchable text" : `Fiction ${index}`, createdAt: now })) })
    const privateThread = await prisma.emailThread.create({ data: { companyId, channelId: privateBox.id, subject: "Private secret", messages: { create: { companyId, direction: "INBOUND", provider: "GOOGLE", fromAddress: "secret@example.test", toAddresses: [], subject: "Private secret", bodyText: "Ancient searchable text" } } } }); privateThreadId = privateThread.id
    privateCursorId = (await prisma.emailMessage.findFirstOrThrow({ where: { threadId: privateThread.id } })).id
    foreignThreadId = (await prisma.emailThread.create({ data: { companyId: foreignCompanyId, subject: "Foreign secret" } })).id
  })
  afterAll(async () => {
    await prisma.company.deleteMany({ where: { id: { in: [companyId, foreignCompanyId] } } })
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, colleagueId] } } })
  })
  function asColleague<T>(task: () => Promise<T>) {
    return requestContext.run({ companyId, userId: colleagueId, role: "SALES", membershipId: "fixture", agencyIds: null, actionPermission: "automation.read" }, task)
  }
  it("reads every visible thread beyond the previous 100-row cap without duplicates", async () => {
    await asColleague(async () => {
      const pages = await Promise.all([1, 2, 3].map((page) => readInboxPage(companyId, { page })))
      expect(pages.map((page) => page.total)).toEqual([126, 126, 126])
      const ids = pages.flatMap((page) => page.threads.map((thread) => thread.id))
      expect(new Set(ids).size).toBe(126)
      expect(ids).not.toContain(privateThreadId)
      expect(ids).not.toContain(foreignThreadId)
      expect((await readInboxPage(companyId, { page: 999 })).page).toBe(3)
    })
  })
  it("searches older bodies and filters unread/archive counts without revealing private matches", async () => {
    await asColleague(async () => {
      const found = await readInboxPage(companyId, { search: "Ancient searchable text" })
      expect(found.total).toBe(1)
      expect(found.threads[0].id).toBe(longThreadId)
      expect((await readInboxPage(companyId, { filter: "UNREAD" })).total).toBe(62)
      const archives = await readInboxPage(companyId, { filter: "ARCHIVED" })
      expect(archives.total).toBe(1)
      expect(archives.threads[0].status).toBe("ARCHIVED")
      expect((await readInboxPage(companyId, { search: "Private secret" })).total).toBe(0)
    })
  })
  it("starts with the newest 25 and retrieves all 101 messages with a stable tie-breaker", async () => {
    await asColleague(async () => {
      const thread = (await readInboxPage(companyId, { search: "Long fiction" })).threads[0]
      const ordered = await prisma.emailMessage.findMany({ where: { companyId, threadId: longThreadId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true } })
      expect(thread.messages.map((message) => message.id)).toEqual(ordered.slice(-25).map((message) => message.id))
      let hasPrevious = thread.hasPreviousMessages
      let messages = thread.messages
      while (hasPrevious) {
        const previous = await readPreviousThreadMessages(companyId, { threadId: longThreadId, beforeMessageId: messages[0].id })
        messages = [...previous.messages, ...messages]
        hasPrevious = previous.hasPreviousMessages
      }
      expect(messages.map((message) => message.id)).toEqual(ordered.map((message) => message.id))
      expect("providerId" in messages[0]).toBe(false)
      expect("bccAddresses" in messages[0]).toBe(false)
    })
  })
  it("rejects guessed threads and cursors from other mailboxes or companies", async () => {
    await asColleague(async () => {
      await expect(readPreviousThreadMessages(companyId, { threadId: privateThreadId, beforeMessageId: privateCursorId })).rejects.toThrow("Conversation introuvable")
      await expect(readPreviousThreadMessages(companyId, { threadId: foreignThreadId, beforeMessageId: privateCursorId })).rejects.toThrow("Conversation introuvable")
      await expect(readPreviousThreadMessages(companyId, { threadId: longThreadId, beforeMessageId: privateCursorId })).rejects.toThrow("Message de pagination introuvable")
      expect((await readInboxPage(foreignCompanyId)).total).toBe(0)
    })
  })
})
