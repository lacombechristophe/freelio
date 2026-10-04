import { afterAll, describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
import prisma from "@/lib/prisma"
import { requestContext } from "@/lib/context"
import { readReplyAllRecipients } from "@/lib/communications/reply-all"

describe.sequential("reply-all recipients from the authoritative incoming parent", () => {
  const companies: string[] = [], users: string[] = []
  afterAll(async () => {
    for (const companyId of companies) {
      await prisma.contact.deleteMany({ where: { client: { companyId } } })
      await prisma.client.deleteMany({ where: { companyId } })
      await prisma.company.delete({ where: { id: companyId } })
    }
    await prisma.user.deleteMany({ where: { id: { in: users } } })
  })
  async function fixture() {
    const company = await prisma.company.create({ data: { name: "Fictional reply-all" } }); companies.push(company.id)
    const owner = await prisma.user.create({ data: { name: "Fictional mailbox owner" } }); users.push(owner.id)
    const client = await prisma.client.create({ data: { companyId: company.id, name: "Fictional client" } })
    const contact = await prisma.contact.create({ data: { clientId: client.id, firstName: "Fiction", lastName: "Contact", email: "primary@example.test" } })
    const channel = await prisma.communicationChannel.create({ data: { companyId: company.id, ownerUserId: owner.id, provider: "GOOGLE", status: "ACTIVE", visibility: "PRIVATE", emailAddress: "sender@example.test" } })
    const thread = await prisma.emailThread.create({ data: { companyId: company.id, clientId: client.id, contactId: contact.id, channelId: channel.id, subject: "Fictional copies" } })
    const message = await prisma.emailMessage.create({ data: { companyId: company.id, threadId: thread.id, direction: "INBOUND", provider: "GOOGLE", fromAddress: "Primary <PRIMARY@example.test>",
      toAddresses: ["Sender <SENDER@example.test>", '"Fiction, Other" <Other@example.test>'], ccAddresses: ["other@example.test", "primary@example.test", "third@example.test", "sender@example.test"],
      bccAddresses: ["hidden@example.test", "invalid hidden header\r\n"], subject: thread.subject, createdAt: new Date("2026-01-01") } })
    const asOwner = <T>(task: () => Promise<T>) => requestContext.run({ companyId: company.id, userId: owner.id, role: "SALES", agencyIds: null, membershipId: "fiction", actionPermission: "automation.read" }, task)
    return { company, owner, contact, channel, thread, message, asOwner }
  }

  it("deduplicates visible headers case-insensitively, excludes sender/primary and never reads or returns hidden copies", async () => {
    const f = await fixture()
    await f.asOwner(async () => {
      expect(await readReplyAllRecipients(f.company.id, f.thread.id)).toEqual({ threadId: f.thread.id, channelId: f.channel.id, contactId: f.contact.id, cc: ["other@example.test", "third@example.test"] })
      expect(await prisma.emailDraft.count()).toBe(0)
      expect(await prisma.emailDelivery.count()).toBe(0)
    })
  })

  it("selects the latest incoming parent beyond 25 newer outgoing messages and includes a different original sender", async () => {
    const f = await fixture()
    await prisma.emailMessage.update({ where: { id: f.message.id }, data: { fromAddress: "another@example.test" } })
    await prisma.emailMessage.createMany({ data: Array.from({ length: 30 }, (_, index) => ({ companyId: f.company.id, threadId: f.thread.id, direction: "OUTBOUND", provider: "GOOGLE", fromAddress: f.channel.emailAddress, toAddresses: [f.contact.email!], ccAddresses: ["outgoing-only@example.test"], subject: f.thread.subject, createdAt: new Date(Date.UTC(2026, 1, 1, 0, index)) })) })
    await f.asOwner(async () => {
      expect((await readReplyAllRecipients(f.company.id, f.thread.id)).cc).toEqual(["another@example.test", "other@example.test", "third@example.test"])
    })
    await prisma.emailMessage.create({ data: { companyId: f.company.id, threadId: f.thread.id, direction: "INBOUND", provider: "GOOGLE", fromAddress: f.contact.email!, toAddresses: [f.channel.emailAddress], ccAddresses: ["latest@example.test"], subject: f.thread.subject, createdAt: new Date("2026-03-01") } })
    await f.asOwner(async () => expect((await readReplyAllRecipients(f.company.id, f.thread.id)).cc).toEqual(["latest@example.test"]))
  })

  it("rejects invalid headers and more than 20 unique copies without silently discarding recipients", async () => {
    const f = await fixture()
    await prisma.emailMessage.update({ where: { id: f.message.id }, data: { ccAddresses: ["valid@example.test", "injected@example.test\r\nBcc: leak@example.test"] } })
    await f.asOwner(async () => {
      await expect(readReplyAllRecipients(f.company.id, f.thread.id)).rejects.toThrow("destinataires du message sont invalides")
    })
    await prisma.emailMessage.update({ where: { id: f.message.id }, data: { toAddresses: [f.channel.emailAddress], ccAddresses: Array.from({ length: 21 }, (_, index) => `copy${index}@example.test`) } })
    await f.asOwner(async () => await expect(readReplyAllRecipients(f.company.id, f.thread.id)).rejects.toThrow("20 adresses CC"))
    await prisma.emailMessage.update({ where: { id: f.message.id }, data: { ccAddresses: Array.from({ length: 20 }, (_, index) => `copy${index}@example.test`) } })
    await f.asOwner(async () => expect((await readReplyAllRecipients(f.company.id, f.thread.id)).cc).toHaveLength(20))
    await prisma.emailMessage.update({ where: { id: f.message.id }, data: { ccAddresses: { invalid: "malformed" } } })
    await f.asOwner(async () => await expect(readReplyAllRecipients(f.company.id, f.thread.id)).rejects.toThrow("destinataires du message sont invalides"))
  })

  it("rejects outgoing-only threads, a missing contact, disconnected or calendar-only mailboxes", async () => {
    const f = await fixture()
    await prisma.emailMessage.update({ where: { id: f.message.id }, data: { direction: "OUTBOUND" } })
    await f.asOwner(async () => await expect(readReplyAllRecipients(f.company.id, f.thread.id)).rejects.toThrow("Aucun message reçu"))
    await prisma.emailMessage.update({ where: { id: f.message.id }, data: { direction: "INBOUND" } })
    await prisma.emailThread.update({ where: { id: f.thread.id }, data: { contactId: null } })
    await f.asOwner(async () => await expect(readReplyAllRecipients(f.company.id, f.thread.id)).rejects.toThrow("contact avec une adresse valide"))
    await prisma.emailThread.update({ where: { id: f.thread.id }, data: { contactId: f.contact.id } })
    await prisma.communicationChannel.update({ where: { id: f.channel.id }, data: { status: "DISCONNECTED" } })
    await f.asOwner(async () => await expect(readReplyAllRecipients(f.company.id, f.thread.id)).rejects.toThrow("déconnectée"))
    await prisma.communicationChannel.update({ where: { id: f.channel.id }, data: { status: "ACTIVE", config: { mailEnabled: false } } })
    await f.asOwner(async () => await expect(readReplyAllRecipients(f.company.id, f.thread.id)).rejects.toThrow("ne permet plus l’envoi"))
  })

  it("does not reveal private mailbox or foreign-company recipients from guessed thread IDs", async () => {
    const f = await fixture(), foreign = await fixture()
    const colleague = await prisma.user.create({ data: { name: "Fictional colleague" } }); users.push(colleague.id)
    await requestContext.run({ companyId: f.company.id, userId: colleague.id, role: "SALES", agencyIds: null, membershipId: "fiction", actionPermission: "automation.read" }, async () => {
      await expect(readReplyAllRecipients(f.company.id, f.thread.id)).rejects.toThrow("Conversation introuvable")
      await expect(readReplyAllRecipients(f.company.id, foreign.thread.id)).rejects.toThrow("Conversation introuvable")
      await expect(readReplyAllRecipients(foreign.company.id, foreign.thread.id)).rejects.toThrow("Conversation introuvable")
    })
  })
})
