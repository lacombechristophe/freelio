import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
vi.mock("@/lib/communications/email-provider", async () => {
  const { default: db } = await import("@/lib/prisma")
  return { activeCommunicationChannel: (companyId: string, id: string) => db.communicationChannel.findFirstOrThrow({ where: { id, companyId, status: "ACTIVE" } }),
    validOAuthCredentials: async () => ({ accessToken: "fictional-token", scope: "https://www.googleapis.com/auth/gmail.readonly" }) }
})
import prisma from "@/lib/prisma"
import { syncOAuthEmailChannel } from "@/lib/communications/email-sync"

describe.sequential("remote mail observation preserves the local CRM copy", () => {
  const companyIds: string[] = []
  let read = false, archived = false, historical = false
  beforeEach(() => {
    read = false; archived = false; historical = false
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith("/profile")) return Response.json({ historyId: "100" })
      if (url.pathname.endsWith("/history")) return Response.json({ history: [{ id: "101", labelsAdded: [{ message: { id: "same-provider-id" }, labelIds: ["STARRED"] }], messages: [{ id: "same-provider-id" }] }], historyId: "101" })
      if (url.pathname.endsWith("/messages")) return Response.json({ messages: url.searchParams.get("labelIds") === "SENT" || historical ? [] : [{ id: "same-provider-id" }] })
      return Response.json({ id: "same-provider-id", internalDate: String(Date.now() - 60_000), labelIds: [...(archived ? ["STARRED"] : ["INBOX"]), ...(read ? [] : ["UNREAD"])],
        payload: { mimeType: "multipart/mixed", headers: [{ name: "From", value: "fictional-sender@example.test" }, { name: "Subject", value: "Fictional observed mail" }],
          parts: [{ mimeType: "text/plain", body: { data: Buffer.from("Fictional retained text").toString("base64url") } },
            { partId: "1", filename: "document-fictif.pdf", mimeType: "application/pdf", body: { attachmentId: "fictional-attachment", size: 32 } }] } })
    }))
  })
  afterEach(() => vi.unstubAllGlobals())
  afterAll(async () => {
    for (const id of companyIds) await prisma.company.delete({ where: { id } })
    await prisma.processorLease.deleteMany({ where: { name: { startsWith: "email-sync:" } } })
  })
  async function fixture(companyId?: string) {
    const company = companyId ? { id: companyId } : await prisma.company.create({ data: { name: "Fictional remote mail observation" } })
    if (!companyId) companyIds.push(company.id)
    return prisma.communicationChannel.create({ data: { companyId: company.id, provider: "GOOGLE", emailAddress: `mail-${companyIds.length}-${Date.now()}@example.test`, status: "ACTIVE" } })
  }
  async function sync(channel: Awaited<ReturnType<typeof fixture>>) {
    for (let i = 0; i < 4; i++) if ((await syncOAuthEmailChannel(channel.companyId, channel.id)).complete) return
    throw new Error("Fictional sync did not complete within its page budget")
  }
  const message = (companyId: string, channelId: string) => prisma.emailMessage.findFirstOrThrow({ where: { companyId, providerId: `${channelId}:same-provider-id` } })
  it("keeps identical provider IDs distinct for two mailboxes and two companies", async () => {
    const first = await fixture(), second = await fixture(first.companyId), foreign = await fixture()
    for (const channel of [first, second, foreign]) await sync(channel)
    const records = await Promise.all([first, second, foreign].map(channel => message(channel.companyId, channel.id)))
    expect(new Set(records.map(row => row.id)).size).toBe(3)
  })
  it("refreshes read state without reopening a closed local dossier or receiving the message twice", async () => {
    const channel = await fixture(); await sync(channel); const before = await message(channel.companyId, channel.id)
    const events = await prisma.automationEventOutbox.count({ where: { companyId: channel.companyId } })
    await prisma.emailThread.update({ where: { id: before.threadId }, data: { status: "CLOSED", unreadCount: 0 } })
    read = true; await sync(channel)
    expect(await message(channel.companyId, channel.id)).toMatchObject({ id: before.id, bodyText: before.bodyText, remoteObservation: { read: true, presence: "PRESENT" } })
    expect(await prisma.emailThread.findUniqueOrThrow({ where: { id: before.threadId } })).toMatchObject({ status: "CLOSED", unreadCount: 0 })
    expect(await prisma.automationEventOutbox.count({ where: { companyId: channel.companyId } })).toBe(events)
  })
  it("observes an older archived message beyond the bootstrap window", async () => {
    const channel = await fixture(); await sync(channel)
    historical = true; archived = true; await sync(channel)
    expect(await message(channel.companyId, channel.id)).toMatchObject({ remoteObservation: { presence: "PRESENT", folderIds: ["STARRED", "UNREAD"] } })
  })
  it("records incoming attachment metadata without claiming a durable local archive", async () => {
    const channel = await fixture(); await sync(channel)
    const row = await message(channel.companyId, channel.id)
    expect(row).toMatchObject({ attachments: null, remoteObservation: { attachments: [{ name: "document-fictif.pdf", type: "application/pdf", size: 32 }] } })
  })
})
