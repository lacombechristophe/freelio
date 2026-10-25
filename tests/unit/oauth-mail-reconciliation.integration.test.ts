import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
vi.mock("@/lib/communications/email-provider", async () => {
  const { default: db } = await import("@/lib/prisma")
  return { activeCommunicationChannel: (companyId: string, id: string) => db.communicationChannel.findFirstOrThrow({ where: { id, companyId, status: "ACTIVE" } }),
    validOAuthCredentials: async () => ({ accessToken: "fictional-token", scope: "https://www.googleapis.com/auth/gmail.readonly Mail.Read" }) }
})
import prisma from "@/lib/prisma"
import { syncOAuthEmailChannel } from "@/lib/communications/email-sync"
import { channelConfig } from "@/lib/communications/sync-state"
import { syncOAuthCommunicationChannel } from "@/lib/communications/communication-sync"
import * as emailProvider from "@/lib/communications/email-provider"

type Remote = { id: string; date: string; read: boolean; folder: string; listed: boolean; draft?: boolean }
describe.sequential("OAuth message history and delta reconcile copies without replaying receptions", () => {
  const companies: string[] = []
  let remote: Map<string, Remote>, failingStatus: number, failId: string, expire: boolean, invalidContinuation: boolean, noCheckpoint: boolean
  let onRead: (() => Promise<void>) | undefined
  let channel: Awaited<ReturnType<typeof fixture>>
  beforeEach(() => {
    remote = new Map(); failingStatus = 0; failId = ""; expire = false; invalidContinuation = false; noCheckpoint = false; onRead = undefined
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL, init: RequestInit = {}) => {
      const url = new URL(String(input)); expect(init.method || "GET").toBe("GET"); expect(init.redirect).toBe("error")
      if (url.pathname.endsWith("/profile")) return Response.json({ historyId: "100" })
      if (url.pathname.endsWith("/history")) {
        if (expire) { expire = false; return Response.json({}, { status: 404 }) }
        return Response.json({ history: [{ id: "101", messagesAdded: [...remote.values()].map(row => ({ message: { id: row.id } })) }], ...(noCheckpoint ? {} : { historyId: "101" }) })
      }
      if (/\/mailFolders\/[^/]+$/.test(url.pathname)) return Response.json({ id: url.pathname.split("/").at(-1), displayName: "Fictional remote folder" })
      if (url.pathname.endsWith("/delta")) {
        if (expire) { expire = false; return Response.json({}, { status: 410 }) }
        const folder = url.pathname.includes("sentitems") ? "sentitems" : "inbox"
        return Response.json({ value: [...remote.values()].filter(row => row.listed && (folder === "inbox" || row.folder === "sentitems")).map(row => ({ id: row.id, ...(row.folder !== folder ? { "@removed": { reason: "deleted" } } : {}) })),
          ...(invalidContinuation ? { "@odata.nextLink": "https://foreign.example.test/v1.0/me/mailFolders/inbox/messages/delta?token=fictional" } : noCheckpoint ? {} : { "@odata.deltaLink": `${url.origin}${url.pathname}?$deltatoken=fictional` }) })
      }
      if (url.pathname.endsWith("/messages")) return Response.json({ messages: url.searchParams.get("labelIds") === "SENT" ? [] : [...remote.values()].filter(row => row.listed && row.folder === "inbox" && Date.parse(row.date) > Date.now() - 30 * 86_400_000).map(row => ({ id: row.id })) })
      if (url.pathname.endsWith("/attachments")) return Response.json({ value: [] })
      const id = decodeURIComponent(url.pathname.split("/").at(-1)!)
      if (failingStatus && (!failId || failId === id)) return Response.json({}, { status: failingStatus })
      const row = remote.get(id)
      if (!row) return Response.json({}, { status: 404 })
      await onRead?.(); onRead = undefined
      return channel.provider === "GOOGLE" ? Response.json({ id, internalDate: String(Date.parse(row.date)), labelIds: [row.draft ? "DRAFT" : row.folder === "inbox" ? "INBOX" : "STARRED", ...(row.read ? [] : ["UNREAD"])],
        payload: { mimeType: "text/plain", body: { data: Buffer.from(`Fictional ${id}`).toString("base64url") }, headers: [{ name: "From", value: "sender@example.test" }, { name: "Subject", value: `Fictional ${id}` }] } })
        : Response.json({ id, receivedDateTime: row.date, sentDateTime: row.date, isRead: row.read, isDraft: row.draft || false, parentFolderId: row.folder, from: { emailAddress: { address: "sender@example.test" } },
          subject: `Fictional ${id}`, body: { contentType: "text", content: `Fictional ${id}` } })
    }))
  })
  afterEach(() => vi.unstubAllGlobals())
  afterAll(async () => {
    for (const id of companies) await prisma.company.delete({ where: { id } })
    await prisma.processorLease.deleteMany({ where: { OR: [{ name: { startsWith: "email-sync:" } }, { name: { startsWith: "calendar-sync:" } }] } })
  })
  async function fixture(provider: string) {
    const company = await prisma.company.create({ data: { name: "Fictional mail reconciliation" } }); companies.push(company.id)
    return prisma.communicationChannel.create({ data: { companyId: company.id, provider, status: "ACTIVE", calendarEnabled: false, emailAddress: "mailbox@example.test", visibility: "PRIVATE" } })
  }
  const row = (id = "message", days = 0): Remote => ({ id, date: new Date(Date.now() - days * 86_400_000 - 60_000).toISOString(), read: false, folder: "inbox", listed: true })
  async function sync() {
    for (let attempt = 0; attempt < 15; attempt++) { const result = await syncOAuthEmailChannel(channel.companyId, channel.id); if (result.complete) return }
    throw new Error("Fictional reconciliation did not complete")
  }
  const message = (id = "message") => prisma.emailMessage.findFirstOrThrow({ where: { companyId: channel.companyId, providerId: `${channel.id}:${id}` } })
  async function start(provider: string) { channel = await fixture(provider); remote.set("message", row()); await sync(); return message() }

  it.each(["GOOGLE", "MICROSOFT"])("refreshes read and move state for %s while preserving the closed CRM dossier", async provider => {
    const before = await start(provider)
    await prisma.emailThread.update({ where: { id: before.threadId }, data: { status: "CLOSED", unreadCount: 0 } })
    Object.assign(remote.get("message")!, { read: true, folder: "archive" }); await sync()
    expect(await message()).toMatchObject({ id: before.id, bodyText: before.bodyText, remoteObservation: { presence: "PRESENT", read: true } })
    expect(await prisma.emailThread.findUniqueOrThrow({ where: { id: before.threadId } })).toMatchObject({ status: "CLOSED", unreadCount: 0 })
    expect(await prisma.automationEventOutbox.count({ where: { companyId: channel.companyId } })).toBe(0)
  })
  it.each(["GOOGLE", "MICROSOFT"])("marks an authorized 404 as absent for %s without deleting the local copy", async provider => {
    const before = await start(provider); failingStatus = 404; await sync()
    expect(await message()).toMatchObject({ id: before.id, threadId: before.threadId, bodyText: before.bodyText, status: before.status, remoteObservation: { presence: "MISSING", read: null } })
  })
  it.each([403, 429, 503])("does not infer deletion or advance a Gmail checkpoint from status %i", async status => {
    const before = await start("GOOGLE"), connection = await prisma.communicationChannel.findUniqueOrThrow({ where: { id: channel.id } })
    failingStatus = status; await expect(sync()).rejects.toThrow(`(${status})`)
    expect(await message()).toEqual(before)
    expect((await prisma.communicationChannel.findUniqueOrThrow({ where: { id: channel.id } })).lastSyncAt).toEqual(connection.lastSyncAt)
  })
  it.each(["GOOGLE", "MICROSOFT"])("rebuilds an expired %s checkpoint without inventing message deletions", async provider => {
    const before = await start(provider); expire = true; const result = await syncOAuthEmailChannel(channel.companyId, channel.id)
    expect(result.complete).toBe(false); expect(await message()).toEqual(before)
    remote.get("message")!.read = true; await sync(); expect(await message()).toMatchObject({ id: before.id, remoteObservation: { presence: "PRESENT", read: true } })
  })
  it.each(["GOOGLE", "MICROSOFT"])("reconciles existing 90-day-old %s copies even outside the bootstrap folders", async provider => {
    channel = await fixture(provider)
    const old = { ...row("old", 90), listed: false, folder: "archive", read: true }; remote.set(old.id, old)
    const thread = await prisma.emailThread.create({ data: { companyId: channel.companyId, channelId: channel.id, subject: "Fictional old dossier", status: "CLOSED", unreadCount: 0 } })
    const stored = await prisma.emailMessage.create({ data: { companyId: channel.companyId, threadId: thread.id, provider, providerId: `${channel.id}:old`, direction: "INBOUND", fromAddress: "sender@example.test",
      toAddresses: [channel.emailAddress], subject: "Fictional old dossier", bodyText: "Original retained copy", receivedAt: new Date(old.date) } })
    await sync(); expect(await message("old")).toMatchObject({ id: stored.id, bodyText: "Original retained copy", remoteObservation: { presence: "PRESENT", read: true } })
    if (provider === "MICROSOFT") { old.read = false; await sync(); expect(await message("old")).toMatchObject({ remoteObservation: { read: false } }) }
    expect(await prisma.automationEventOutbox.count({ where: { companyId: channel.companyId } })).toBe(0)
  })
  it.each(["GOOGLE", "MICROSOFT"])("does not emit a new reception when an older unseen message moves into %s", async provider => {
    await start(provider); remote.set("moved", row("moved", 2)); await sync()
    expect(await message("moved")).toMatchObject({ bodyText: "Fictional moved" })
    expect(await prisma.automationEventOutbox.count({ where: { companyId: channel.companyId } })).toBe(0)
  })
  it.each(["GOOGLE", "MICROSOFT"])("emits a genuinely new %s reception once and associates its private mailbox", async provider => {
    await start(provider); remote.set("fresh", { ...row("fresh"), date: new Date(Date.now() + 1000).toISOString() }); await sync(); await sync()
    const fresh = await message("fresh"), events = await prisma.automationEventOutbox.findMany({ where: { companyId: channel.companyId } })
    expect(events).toHaveLength(1); expect(events[0]).toMatchObject({ channelId: channel.id, subjectId: fresh.id, event: "EMAIL_RECEIVED" })
  })
  it.each(["GOOGLE", "MICROSOFT"])("does not label a remote %s draft as a sent message", async provider => {
    await start(provider); remote.set("draft", { ...row("draft"), draft: true }); await sync()
    expect(await prisma.emailMessage.count({ where: { companyId: channel.companyId, providerId: `${channel.id}:draft` } })).toBe(0)
  })
  it("keeps an old Gmail history page replayable after a message read fails", async () => {
    await start("GOOGLE"); remote.set("second", row("second")); failingStatus = 503; failId = "second"
    await expect(sync()).rejects.toThrow("503"); expect(await prisma.emailMessage.count({ where: { companyId: channel.companyId } })).toBe(1)
    failingStatus = 0; await sync(); expect(await prisma.emailMessage.count({ where: { companyId: channel.companyId } })).toBe(2)
  })
  it("persists progress through one large Gmail history record before acknowledging its checkpoint", async () => {
    await start("GOOGLE")
    for (let index = 0; index < 251; index++) remote.set(`bulk-${index}`, row(`bulk-${index}`))
    const before = vi.mocked(fetch).mock.calls.filter(call => String(call[0]).includes("/history")).length
    const partial = await syncOAuthEmailChannel(channel.companyId, channel.id)
    expect(partial.complete).toBe(false); expect(partial.examined).toBe(200)
    const saved = channelConfig((await prisma.communicationChannel.findUniqueOrThrow({ where: { id: channel.id } })).config).emailSync as { pendingPage: { position: number }; googleHistoryId: string }
    expect(saved.pendingPage.position).toBe(200)
    const finished = await syncOAuthEmailChannel(channel.companyId, channel.id)
    expect(finished.complete).toBe(true)
    expect(await prisma.emailMessage.count({ where: { companyId: channel.companyId } })).toBe(252)
    expect(vi.mocked(fetch).mock.calls.filter(call => String(call[0]).includes("/history")).length - before).toBe(1)
    expect(await prisma.automationEventOutbox.count({ where: { companyId: channel.companyId } })).toBe(0)
  }, 60_000)
  it("rejects a Microsoft continuation outside the expected provider before using it", async () => {
    await start("MICROSOFT"); invalidContinuation = true; await expect(sync()).rejects.toThrow("Curseur")
    const calls = vi.mocked(fetch).mock.calls.map(call => String(call[0])); expect(calls.some(url => url.startsWith("https://foreign.example.test"))).toBe(false)
  })
  it.each(["GOOGLE", "MICROSOFT"])("refuses a missing final %s checkpoint", async provider => {
    await start(provider); noCheckpoint = true; await expect(sync()).rejects.toThrow("Checkpoint final")
  })
  it("does not commit an old observation or status after a mailbox reconnects", async () => {
    const before = await start("GOOGLE")
    onRead = async () => { await prisma.communicationChannel.update({ where: { id: channel.id }, data: { config: { mode: "OAUTH", mailSyncGeneration: "new-connection" }, lastError: null } }) }
    await expect(syncOAuthCommunicationChannel(channel.companyId, channel.id)).rejects.toThrow("connexion a changé")
    expect(await message()).toEqual(before)
    const current = await prisma.communicationChannel.findUniqueOrThrow({ where: { id: channel.id } })
    expect(channelConfig(current.config)).toEqual({ mode: "OAUTH", mailSyncGeneration: "new-connection" }); expect(current.lastError).toBeNull()
  })
  it.each(["GOOGLE", "MICROSOFT"])("refuses old %s credentials if reconnection finishes before the initial checkpoint", async provider => {
    channel = await fixture(provider); remote.set("message", row())
    const original = emailProvider.validOAuthCredentials
    const credentials = vi.spyOn(emailProvider, "validOAuthCredentials").mockImplementationOnce(async selected => {
      const old = await original(selected)
      await prisma.communicationChannel.update({ where: { id: channel.id }, data: { config: { mode: "OAUTH", mailSyncGeneration: "new-connection" }, lastError: null } })
      return old
    })
    try {
      await expect(syncOAuthEmailChannel(channel.companyId, channel.id)).rejects.toThrow("connexion a changé")
      expect(fetch).not.toHaveBeenCalled()
      expect(await prisma.emailMessage.count({ where: { companyId: channel.companyId } })).toBe(0)
      const current = await prisma.communicationChannel.findUniqueOrThrow({ where: { id: channel.id } })
      expect(channelConfig(current.config)).toEqual({ mode: "OAUTH", mailSyncGeneration: "new-connection" })
      expect(current.lastError).toBeNull()
    } finally { credentials.mockRestore() }
  })
  it("keeps a new connection's error state when it reconnects immediately before the old failure is written", async () => {
    const before = await start("GOOGLE"); failingStatus = 503
    const original = prisma.communicationChannel.updateMany.bind(prisma.communicationChannel)
    let interleaved = false
    // Both writes use real SQL. Insert the reconnect immediately before the
    // old worker's error statement, after its last successful access check.
    const write = vi.spyOn(prisma.communicationChannel, "updateMany").mockImplementation(input => {
      const operation = async () => {
        if (!interleaved && typeof input.data.lastError === "string" && input.data.lastError) {
          interleaved = true
          await prisma.communicationChannel.update({ where: { id: channel.id }, data: { config: { mode: "OAUTH", mailSyncGeneration: "new-connection" }, lastError: null } })
        }
        return original(input)
      }
      return operation() as ReturnType<typeof original>
    })
    try {
      await expect(syncOAuthEmailChannel(channel.companyId, channel.id)).rejects.toThrow()
      expect(interleaved).toBe(true)
      expect(await message()).toEqual(before)
      const current = await prisma.communicationChannel.findUniqueOrThrow({ where: { id: channel.id } })
      expect(channelConfig(current.config)).toEqual({ mode: "OAUTH", mailSyncGeneration: "new-connection" })
      expect(current.lastError).toBeNull()
    } finally { write.mockRestore() }
  })
})
