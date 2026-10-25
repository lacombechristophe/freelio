import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))

import prisma from "@/lib/prisma"
import { requestContext } from "@/lib/context"

describe.sequential("mailbox privacy at the SQL boundary", () => {
  let companyId: string, ownerId: string, colleagueId: string, privateId: string, sharedId: string, privateThreadId: string, contactId: string
  beforeAll(async () => {
    const company = await prisma.company.create({ data: { name: "Fictitious mailbox ACL" } })
    companyId = company.id
    const owner = await prisma.user.create({ data: { name: "Fixture owner" } }); ownerId = owner.id
    const colleague = await prisma.user.create({ data: { name: "Fixture colleague" } }); colleagueId = colleague.id
    const client = await prisma.client.create({ data: { companyId, name: "Fictitious contact" } })
    const contact = await prisma.contact.create({ data: { clientId: client.id, firstName: "Fiction", lastName: "Contact" } }); contactId = contact.id
    const privateBox = await prisma.communicationChannel.create({ data: { companyId, ownerUserId: ownerId, provider: "GOOGLE", emailAddress: "private@example.test", visibility: "PRIVATE" } }); privateId = privateBox.id
    const sharedBox = await prisma.communicationChannel.create({ data: { companyId, provider: "GOOGLE", emailAddress: "shared@example.test", visibility: "SHARED" } }); sharedId = sharedBox.id
    await prisma.communicationChannel.create({ data: { companyId, provider: "GOOGLE", emailAddress: "legacy@example.test", visibility: "LEGACY" } })
    for (const box of [privateBox, sharedBox]) {
      const thread = await prisma.emailThread.create({ data: { companyId, channelId: box.id, contactId, subject: box.visibility, messages: { create: { companyId, direction: "INBOUND", provider: "GOOGLE", fromAddress: "fiction@example.test", toAddresses: [box.emailAddress], subject: box.visibility, bodyText: `Content ${box.visibility}` } } } })
      if (box.id === privateId) privateThreadId = thread.id
      await prisma.organisationTask.create({ data: { companyId, title: box.visibility, calendarChannelId: box.id } })
      await prisma.emailDelivery.create({ data: { companyId, channelId: box.id, recipientEmail: "fiction@example.test", subject: box.visibility, scheduledAt: new Date() } })
    }
    await prisma.organisationTask.create({ data: { companyId, title: "Ordinary task" } })
    await prisma.organisationTask.create({ data: { companyId, title: "Unmapped legacy calendar", calendarProvider: "GOOGLE", calendarExternalId: "unknown-calendar-event" } })
  })
  afterAll(async () => {
    await prisma.emailThread.deleteMany({ where: { companyId } })
    await prisma.organisationTask.deleteMany({ where: { companyId } })
    await prisma.contact.deleteMany({ where: { client: { companyId } } })
    await prisma.client.deleteMany({ where: { companyId } })
    await prisma.company.delete({ where: { id: companyId } })
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, colleagueId] } } })
  })
  const asMember = (userId: string, task: () => Promise<void>, role: "SALES" | "ADMIN" = "SALES") => requestContext.run({ companyId, userId, role, membershipId: "fixture", agencyIds: null, actionPermission: "automation.write" }, task)

  it("hides other members' private mail on direct IDs, lists and mutations", async () => {
    await asMember(colleagueId, async () => {
      expect((await prisma.communicationChannel.findMany()).map((box) => box.id)).toEqual([sharedId])
      expect(await prisma.emailThread.findUnique({ where: { id: privateThreadId } })).toBeNull()
      expect(await prisma.emailMessage.count()).toBe(1)
      expect(await prisma.emailDelivery.count()).toBe(1)
      expect(await prisma.organisationTask.count()).toBe(2)
      expect((await prisma.emailThread.updateMany({ where: { id: privateThreadId }, data: { unreadCount: 0 } })).count).toBe(0)
      await expect(prisma.emailThread.create({ data: { companyId, channelId: privateId, subject: "Forbidden" } })).rejects.toThrow("MAILBOX_ACCESS_DENIED")
    })
  })
  it("also filters nested CRM histories and relation counts", async () => {
    await asMember(colleagueId, async () => {
      const contact = await prisma.contact.findUniqueOrThrow({ where: { id: contactId }, include: { emailThreads: { include: { messages: true } }, _count: { select: { emailThreads: true } } } })
      expect(contact.emailThreads).toHaveLength(1)
      expect(contact.emailThreads[0].messages[0].bodyText).toBe("Content SHARED")
      expect(contact._count.emailThreads).toBe(1)
    })
  })
  it("allows the owner and administrators while keeping legacy rows admin-only", async () => {
    await asMember(ownerId, async () => { expect(await prisma.communicationChannel.count()).toBe(2); expect(await prisma.emailMessage.count()).toBe(2) })
    await asMember(colleagueId, async () => { expect(await prisma.communicationChannel.count()).toBe(3) }, "ADMIN")
  })
})
