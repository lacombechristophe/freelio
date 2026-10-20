import { describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
import prisma from "@/lib/prisma"
import { readRemoteMail } from "@/lib/communications/oauth-mail-reader"
import { persistRemoteMail } from "@/lib/communications/remote-mail-persistence"
import { getOrCreateEmailThread, recordOutgoingEmail } from "@/lib/communications/threads"
import { providerConversationId } from "@/lib/communications/conversation-identity"
import { freezeReplyContext, assertReplyContext } from "@/lib/communications/reply-context"

describe("native conversation identity audit on real SQL", () => {
  it.each(["GOOGLE", "MICROSOFT"])("keeps two native %s conversations distinct for the same known contact and subject", async provider => {
    const company = await prisma.company.create({ data: { name: "Fictional native conversation audit" } })
    const client = await prisma.client.create({ data: { companyId: company.id, name: "Fictional contact client" } })
    await prisma.contact.create({ data: { clientId: client.id, firstName: "Fictional", lastName: "Sender", email: "known@example.test" } })
    const channel = await prisma.communicationChannel.create({ data: { companyId: company.id, provider, emailAddress: "mailbox@example.test", status: "ACTIVE" } })
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith("/mailFolders/inbox")) return Response.json({ id: "inbox", displayName: "Fictional reception" })
      if (url.pathname.endsWith("/attachments")) return Response.json({ value: [] })
      const id = url.pathname.split("/").at(-1)!, native = `native-${id}`, date = new Date(Date.now() - 1000).toISOString()
      return provider === "GOOGLE" ? Response.json({ id, threadId: native, internalDate: String(Date.parse(date)), labelIds: ["INBOX"], payload: { mimeType: "text/plain", body: { data: Buffer.from("Fictional body").toString("base64url") },
        headers: [{ name: "From", value: "known@example.test" }, { name: "To", value: channel.emailAddress }, { name: "Subject", value: "Same fictional subject" }, { name: "Message-ID", value: `<${id}@example.test>` }] } })
        : Response.json({ id, conversationId: native, internetMessageId: `<${id}@example.test>`, subject: "Same fictional subject", parentFolderId: "inbox", from: { emailAddress: { address: "known@example.test" } },
          toRecipients: [{ emailAddress: { address: channel.emailAddress } }], receivedDateTime: date, isRead: true, body: { contentType: "text", content: "Fictional body" } })
    }))
    try {
      for (const id of ["message-a", "message-b"]) {
        const message = await readRemoteMail(channel, id, "fictional-access-token")
        expect(message).not.toBeNull()
        await persistRemoteMail(company.id, channel, message!, false)
      }
      const rows = await prisma.emailMessage.findMany({ where: { companyId: company.id } })
      expect(rows).toHaveLength(2)
      expect(new Set(rows.map(row => row.threadId)).size).toBe(2)
      expect(await prisma.emailThread.count({ where: { companyId: company.id } })).toBe(2)
    } finally {
      vi.unstubAllGlobals()
      await prisma.emailThread.deleteMany({ where: { companyId: company.id } })
      await prisma.contact.deleteMany({ where: { clientId: client.id } })
      await prisma.client.delete({ where: { id: client.id } })
      await prisma.company.delete({ where: { id: company.id } })
    }
  })
})

describe("mailbox-scoped conversation persistence", () => {
  async function fixture() {
    const company = await prisma.company.create({ data: { name: "Fictional thread integrity" } })
    const client = await prisma.client.create({ data: { companyId: company.id, name: "Fictional client" } })
    const channel = await prisma.communicationChannel.create({ data: { companyId: company.id, provider: "GOOGLE", emailAddress: "box@example.test" } })
    const input = { companyId: company.id, clientId: client.id, channelId: channel.id, subject: "Fictional original", providerConversationId: "native-a" }
    return { company, client, channel, input }
  }
  it("joins native identity across changed subjects and participants, including an archived local thread", async () => {
    const f = await fixture(), first = await getOrCreateEmailThread(f.input)
    await prisma.emailThread.update({ where: { id: first.id }, data: { status: "ARCHIVED", unreadCount: 3 } })
    const second = await getOrCreateEmailThread({ ...f.input, clientId: null, subject: "Changed remote subject" })
    expect(second).toMatchObject({ id: first.id, subject: first.subject, status: "ARCHIVED", unreadCount: 3, clientId: f.client.id })
  })
  it("keeps a native conversation distinct even when In-Reply-To names another local thread", async () => {
    const f = await fixture(), first = await recordOutgoingEmail({ ...f.input, provider: "GOOGLE", providerId: `${f.channel.id}:sent`, internetMessageId: "<parent@example.test>", from: "box@example.test", to: ["recipient@example.test"] })
    const second = await getOrCreateEmailThread({ ...f.input, providerConversationId: "native-b", inReplyTo: "<parent@example.test>" })
    expect(second.id).not.toBe(first.threadId)
  })
  it("isolates the same native identifier between mailboxes and companies", async () => {
    const a = await fixture(), b = await fixture(), first = await getOrCreateEmailThread(a.input)
    const secondChannel = await prisma.communicationChannel.create({ data: { companyId: a.company.id, provider: "GOOGLE", emailAddress: "second@example.test" } })
    const second = await getOrCreateEmailThread({ ...a.input, channelId: secondChannel.id })
    const third = await getOrCreateEmailThread(b.input)
    expect(new Set([first.id, second.id, third.id]).size).toBe(3)
  })
  it("does not infer or reassign a historical mixed thread from its subject", async () => {
    const f = await fixture(), historical = await getOrCreateEmailThread({ ...f.input, providerConversationId: undefined })
    const before = await prisma.emailThread.findUniqueOrThrow({ where: { id: historical.id } })
    const current = await getOrCreateEmailThread(f.input)
    expect(current.id).not.toBe(historical.id)
    expect(await prisma.emailThread.findUniqueOrThrow({ where: { id: historical.id } })).toEqual(before)
    const unknownA = await getOrCreateEmailThread({ ...f.input, providerConversationId: null })
    const unknownB = await getOrCreateEmailThread({ ...f.input, providerConversationId: null })
    expect(new Set([historical.id, current.id, unknownA.id, unknownB.id]).size).toBe(4)
  })
  it("records a first send and its reply under the provider identity without changing the historical thread", async () => {
    const f = await fixture(), old = await getOrCreateEmailThread({ ...f.input, providerConversationId: undefined })
    const first = await recordOutgoingEmail({ ...f.input, threadId: old.id, provider: "GOOGLE", providerId: `${f.channel.id}:first`, from: "box@example.test", to: ["recipient@example.test"] })
    const reply = await recordOutgoingEmail({ ...f.input, threadId: first.threadId, provider: "GOOGLE", providerId: `${f.channel.id}:reply`, from: "box@example.test", to: ["recipient@example.test"] })
    expect(reply.threadId).toBe(first.threadId); expect(first.threadId).not.toBe(old.id)
    expect(await prisma.emailThread.findUniqueOrThrow({ where: { id: old.id } })).toMatchObject({ providerConversationId: null })
    await expect(recordOutgoingEmail({ ...f.input, providerConversationId: "native-other", threadId: first.threadId, provider: "GOOGLE", providerId: `${f.channel.id}:wrong`, from: "box@example.test", to: ["recipient@example.test"] })).rejects.toThrow("conversation distante")
    expect(await prisma.emailMessage.count({ where: { companyId: f.company.id } })).toBe(2)
  })
  it("adopts a synchronized outbound message during history repair without moving it or duplicating it", async () => {
    const f = await fixture(), command = await prisma.emailDelivery.create({ data: { companyId: f.company.id, channelId: f.channel.id, subject: f.input.subject, recipientEmail: "recipient@example.test", scheduledAt: new Date(), provider: "GOOGLE", providerConversationId: f.input.providerConversationId } })
    const outgoing = { ...f.input, provider: "GOOGLE", providerId: `${f.channel.id}:accepted`, from: "box@example.test", to: ["recipient@example.test"], bodyHtml: "<p>Fictional original</p>" }
    const imported = await recordOutgoingEmail(outgoing)
    const repaired = await recordOutgoingEmail({ ...outgoing, deliveryId: command.id })
    expect(repaired).toMatchObject({ id: imported.id, threadId: imported.threadId, deliveryId: command.id })
    expect(await recordOutgoingEmail({ ...outgoing, deliveryId: command.id })).toEqual(repaired)
    expect(await prisma.emailMessage.count({ where: { companyId: f.company.id } })).toBe(1)
  })
  it("uses the database constraint to share one native thread across concurrent creations", async () => {
    const f = await fixture()
    const rows = await Promise.all(Array.from({ length: 5 }, () => getOrCreateEmailThread(f.input)))
    expect(new Set(rows.map(row => row.id)).size).toBe(1)
  })
  it("freezes and rechecks native identity in a prepared reply", async () => {
    const f = await fixture(), original = await recordOutgoingEmail({ ...f.input, provider: "GOOGLE", providerId: `${f.channel.id}:parent`, internetMessageId: "<native-parent@example.test>", from: "box@example.test", to: ["recipient@example.test"] })
    const reply = await freezeReplyContext(f.company.id, original.threadId, "GOOGLE", f.input.subject)
    expect(reply).toMatchObject({ messageId: original.id, providerConversationId: "native-a" })
    await expect(assertReplyContext(f.company.id, original.threadId, reply!)).resolves.toBeUndefined()
    await prisma.emailThread.update({ where: { id: original.threadId }, data: { providerConversationId: "native-changed" } })
    await expect(assertReplyContext(f.company.id, original.threadId, reply!)).rejects.toThrow("changé depuis la préparation")
  })
  it.each([false, true])("preserves the original assignment during a remote replay (native identity already known: %s)", async known => {
    const f = await fixture(), sentAt = new Date()
    const original = await recordOutgoingEmail({ ...f.input, providerConversationId: known ? "native-a" : undefined, provider: "GOOGLE", providerId: `${f.channel.id}:old`, from: "box@example.test", to: ["recipient@example.test"], sentAt })
    const observation = { presence: "PRESENT" as const, read: true, folderIds: ["SENT"], folderNames: ["Envoyés"], checkedAt: sentAt.toISOString(), attachments: [], attachmentsComplete: true }
    const remote = { providerId: `${f.channel.id}:old`, providerConversationId: "native-a", direction: "OUTBOUND" as const, internetMessageId: null, inReplyTo: null, from: "box@example.test", to: ["recipient@example.test"], cc: [], bcc: [], subject: "Changed subject", bodyHtml: null, bodyText: "Changed body", occurredAt: sentAt, unread: false, draft: false, observation }
    expect(await persistRemoteMail(f.company.id, f.channel, remote, false)).toBe(false)
    expect(await prisma.emailMessage.findUniqueOrThrow({ where: { id: original.id } })).toMatchObject({ threadId: original.threadId, subject: original.subject, bodyText: original.bodyText })
    expect(await prisma.emailThread.findUniqueOrThrow({ where: { id: original.threadId } })).toMatchObject({ providerConversationId: known ? "native-a" : null })
    if (known) await expect(persistRemoteMail(f.company.id, f.channel, { ...remote, providerConversationId: "different-native" }, false)).rejects.toThrow("changé de conversation")
    expect(await prisma.emailThread.count({ where: { companyId: f.company.id } })).toBe(1)
  })
  it.each(["", "bad\nidentifier", "native identity", "é", "a".repeat(2049)])("rejects invalid native identity %j", value => {
    expect(() => providerConversationId(value)).toThrow()
  })
  it("keeps absent identity unknown and accepts opaque Graph characters", () => {
    expect(providerConversationId(undefined)).toBeNull(); expect(providerConversationId(null)).toBeNull()
    expect(providerConversationId("opaque/Graph+ID==")).toBe("opaque/Graph+ID==")
  })
})
