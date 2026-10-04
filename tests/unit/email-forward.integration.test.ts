import { afterAll, describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
import prisma from "@/lib/prisma"
import { requestContext } from "@/lib/context"
import { readForwardMessage } from "@/lib/communications/forward"
import { saveEmailDraft } from "@/lib/communications/drafts"

describe.sequential("scoped forwarding of an exact message into an independent draft", () => {
  const companies: string[] = [], users: string[] = []
  afterAll(async () => {
    for (const id of companies) await prisma.company.delete({ where: { id } })
    await prisma.user.deleteMany({ where: { id: { in: users } } })
  })
  async function fixture() {
    const company = await prisma.company.create({ data: { name: "Fictional forwarding" } }); companies.push(company.id)
    const owner = await prisma.user.create({ data: { name: "Fictional mailbox owner" } }); users.push(owner.id)
    const channel = await prisma.communicationChannel.create({ data: { companyId: company.id, ownerUserId: owner.id, provider: "GOOGLE", status: "ACTIVE", visibility: "PRIVATE", emailAddress: "sender@example.test" } })
    const thread = await prisma.emailThread.create({ data: { companyId: company.id, channelId: channel.id, subject: "Thread differs from message" } })
    const message = await prisma.emailMessage.create({ data: { companyId: company.id, threadId: thread.id, direction: "INBOUND", provider: "GOOGLE", fromAddress: "Fiction <original@example.test>",
      toAddresses: ["sender@example.test"], ccAddresses: ["copy@example.test"], bccAddresses: ["hidden@example.test"], subject: "Selected original", bodyText: "Literal <script>alert(1)</script> & text\nSecond line",
      bodyHtml: "<p>Never prefer this alternative</p>", receivedAt: new Date("2020-01-02T03:04:05Z"), createdAt: new Date("2020-01-03"), attachments: [{ private: "never copied" }], providerId: "private-provider-id" } })
    const asOwner = <T>(task: () => Promise<T>) => requestContext.run({ companyId: company.id, userId: owner.id, role: "SALES", agencyIds: null, membershipId: "fiction", actionPermission: "automation.read" }, task)
    return { company, owner, channel, thread, message, asOwner }
  }

  it("quotes the exact older message's subject, literal text, sender and date without exposing other metadata or writing", async () => {
    const f = await fixture()
    await prisma.emailMessage.create({ data: { companyId: f.company.id, threadId: f.thread.id, direction: "OUTBOUND", provider: "GOOGLE", fromAddress: "sender@example.test", toAddresses: ["other@example.test"], subject: "Newer unrelated", bodyText: "Do not forward this", sentAt: new Date("2026-01-01") } })
    await f.asOwner(async () => {
      const forward = await readForwardMessage(f.company.id, f.message.id)
      expect(forward).toEqual({ subject: "Tr: Selected original", channelId: f.channel.id,
        bodyHtml: "<p>Bonjour,</p><p></p><blockquote><p>De : Fiction &lt;original@example.test&gt;<br>Date : 2020-01-02T03:04:05.000Z</p><p>Literal &lt;script&gt;alert(1)&lt;/script&gt; &amp; text<br>Second line</p></blockquote>" })
      expect(JSON.stringify(forward)).not.toMatch(/hidden@example|copy@example|private-provider|never copied|Do not forward this/)
      expect(await prisma.emailDraft.count({ where: { companyId: f.company.id } })).toBe(0)
      expect(await prisma.emailDelivery.count({ where: { companyId: f.company.id } })).toBe(0)
    })
  })

  it("converts HTML-only messages to safe quoted text, escaping sender injection and using an outgoing sent date", async () => {
    const f = await fixture()
    await prisma.emailMessage.update({ where: { id: f.message.id }, data: { direction: "OUTBOUND", bodyText: null, bodyHtml: '<p>Hello &amp; fiction</p><script>steal()</script><img src="https://tracking.example.test/pixel"><a href="https://example.test">Link</a>', fromAddress: '<img src=x onerror=steal()>', sentAt: new Date("2021-02-03T04:05:06Z") } })
    await f.asOwner(async () => {
      const result = await readForwardMessage(f.company.id, f.message.id)
      expect(result.bodyHtml).toContain("Date : 2021-02-03T04:05:06.000Z")
      expect(result.bodyHtml).toContain("De : &lt;img src=x onerror=steal()&gt;")
      expect(result.bodyHtml).toContain("Hello &amp; fiction")
      expect(result.bodyHtml).toContain("Link [https://example.test]")
      expect(result.bodyHtml).not.toMatch(/<img|<script|tracking.example/)
    })
  })

  it("allows readable disconnected, calendar-only and legacy messages but requires choosing another sender", async () => {
    const f = await fixture()
    await prisma.communicationChannel.update({ where: { id: f.channel.id }, data: { status: "DISCONNECTED" } })
    await f.asOwner(async () => expect((await readForwardMessage(f.company.id, f.message.id)).channelId).toBeNull())
    await prisma.communicationChannel.update({ where: { id: f.channel.id }, data: { status: "ACTIVE", config: { mailEnabled: false } } })
    await f.asOwner(async () => expect((await readForwardMessage(f.company.id, f.message.id)).channelId).toBeNull())
    await prisma.emailThread.update({ where: { id: f.thread.id }, data: { channelId: null } })
    await requestContext.run({ companyId: f.company.id, userId: f.owner.id, role: "OWNER", agencyIds: null, membershipId: "fiction", actionPermission: "automation.read" }, async () => {
      expect((await readForwardMessage(f.company.id, f.message.id)).channelId).toBeNull()
    })
  })

  it("refuses guessed private, foreign or invalid IDs and oversized subjects/bodies without silently cutting the message", async () => {
    const f = await fixture(), foreign = await fixture()
    await requestContext.run({ companyId: f.company.id, userId: foreign.owner.id, role: "SALES", agencyIds: null, membershipId: "fiction", actionPermission: "automation.read" }, async () => {
      for (const [companyId, messageId] of [[f.company.id, f.message.id], [f.company.id, foreign.message.id], [foreign.company.id, foreign.message.id], [f.company.id, "invalid"]]) {
        await expect(readForwardMessage(companyId, messageId)).rejects.toThrow("Message introuvable")
      }
    })
    for (const subject of ["x".repeat(177), "Valid\r\nBcc: injected@example.test"]) {
      await prisma.emailMessage.update({ where: { id: f.message.id }, data: { subject } })
      await f.asOwner(async () => await expect(readForwardMessage(f.company.id, f.message.id)).rejects.toThrow("objet"))
    }
    await prisma.emailMessage.update({ where: { id: f.message.id }, data: { subject: "x".repeat(176), bodyText: "&".repeat(20_000) } })
    await f.asOwner(async () => await expect(readForwardMessage(f.company.id, f.message.id)).rejects.toThrow("taille"))
    await prisma.emailMessage.update({ where: { id: f.message.id }, data: { bodyText: "Valid", sentAt: null, receivedAt: null } })
    await f.asOwner(async () => {
      const result = await readForwardMessage(f.company.id, f.message.id)
      expect(result.subject).toHaveLength(180)
      expect(result.bodyHtml).toContain("2020-01-03T00:00:00.000Z")
    })
  })

  it("persists an incomplete independent draft without native reply context, hidden copies or attachments", async () => {
    const f = await fixture()
    const forward = await f.asOwner(() => readForwardMessage(f.company.id, f.message.id))
    await requestContext.run({ companyId: f.company.id, userId: f.owner.id, role: "SALES", agencyIds: null, membershipId: "fiction", actionPermission: "automation.write" }, async () => {
      const draft = await saveEmailDraft(f.company.id, f.owner.id, { ...forward, createKey: crypto.randomUUID(), contactId: "", threadId: "", cc: [], bcc: [], attachmentIds: [] })
      expect(draft).toMatchObject({ subject: forward.subject, bodyHtml: forward.bodyHtml, contactId: null, threadId: null, cc: [], bcc: [], attachments: [], sentAt: null })
      expect(await prisma.emailDelivery.count({ where: { companyId: f.company.id } })).toBe(0)
    })
  })
})
