import { createDatabaseClient } from "@/lib/database-client"
import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest"
const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("@/lib/rate-limit", () => ({ apiRateLimit: { limit: async () => ({ success: true }) } }))
vi.mock("@/lib/integrations/email-oauth", async original => ({ ...await original<typeof import("@/lib/integrations/email-oauth")>(),
  refreshEmailOAuthAccessToken: vi.fn(async () => ({ access_token: "fictional-refreshed-access", expires_in: 3600 })) }))
import { GET } from "@/app/api/communications/messages/[messageId]/attachments/[key]/route"
import { encrypt } from "@/lib/crypto"
import { remoteAttachmentKey } from "@/lib/communications/remote-mail-view"
import type { RemoteMailAttachment } from "@/lib/communications/remote-mail-types"
import { withAuth } from "@/lib/auth-wrapper"
import { readIncomingAttachment } from "@/lib/communications/incoming-attachment"
import prisma from "@/lib/prisma"
import { requestContext } from "@/lib/context"

const db = createDatabaseClient(), pdf = Buffer.from("%PDF-1.7\nFictional remote attachment\n")
describe.sequential("incoming OAuth attachments remain private bounded provider reads", () => {
  let memberId: string, colleagueId: string, foreignCompanyId: string
  const users: string[] = []
  let payload = pdf, providerStatus = 200, onBytes: (() => Promise<void>) | undefined
  const credentials = (expired = false) => encrypt(JSON.stringify({ mode: "OAUTH", accessToken: "fictional-incoming-access", refreshToken: "fictional-incoming-refresh",
    expiresAt: new Date(Date.now() + (expired ? -3600_000 : 3600_000)).toISOString(), scope: "https://www.googleapis.com/auth/gmail.readonly Mail.Read", tokenType: "Bearer" }))
  beforeEach(async () => {
    payload = pdf; providerStatus = 200; onBytes = undefined
    session.companyId = (await db.company.create({ data: { name: "Fictional incoming attachment" } })).id
    foreignCompanyId = (await db.company.create({ data: { name: "Fictional other incoming attachment" } })).id
    const user = await db.user.create({ data: { email: `${randomUUID()}@example.test` } }); users.push(user.id); session.userId = user.id
    memberId = (await db.membership.create({ data: { companyId: session.companyId, userId: user.id, role: "OWNER", status: "ACTIVE" } })).id
    const colleague = await db.user.create({ data: { email: `${randomUUID()}@example.test` } }); users.push(colleague.id); colleagueId = colleague.id
    await db.membership.create({ data: { companyId: session.companyId, userId: colleagueId, role: "SALES", status: "ACTIVE" } })
  })
  afterEach(async () => {
    vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks()
    await db.processorLease.deleteMany({ where: { name: { startsWith: "oauth-refresh:" } } })
    await db.company.deleteMany({ where: { id: { in: [session.companyId, foreignCompanyId] } } })
    await db.user.deleteMany({ where: { id: { in: users.splice(0) } } })
  })
  afterAll(async () => { await db.$disconnect() })
  async function fixture(provider = "GOOGLE", companyId = session.companyId, override: Partial<RemoteMailAttachment> = {}) {
    const channel = await db.communicationChannel.create({ data: { companyId, ownerUserId: session.userId, provider, visibility: "PRIVATE", status: "ACTIVE",
      emailAddress: "mailbox@example.test", credentialsEncrypted: credentials() } })
    const file: RemoteMailAttachment = { id: "fictional-file", kind: provider === "GOOGLE" ? "GMAIL_ATTACHMENT" : "GRAPH_FILE", name: "document-fictif.pdf", type: "application/pdf", size: pdf.length, inline: false, ...override }
    const thread = await db.emailThread.create({ data: { companyId, channelId: channel.id, subject: "Fictional private attachment" } })
    const message = await db.emailMessage.create({ data: { companyId, threadId: thread.id, provider, providerId: `${channel.id}:fictional-message`, direction: "INBOUND", subject: "Fictional private attachment",
      fromAddress: "fictional@example.test", toAddresses: [channel.emailAddress], bodyText: "Fictional retained copy", remoteObservation: { presence: "PRESENT", read: false, folderIds: [], folderNames: [],
        checkedAt: new Date().toISOString(), attachments: [file], attachmentsComplete: true } } })
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL, init: RequestInit = {}) => {
      const url = new URL(String(input)); expect(init.method || "GET").toBe("GET"); expect(init.redirect).toBe("error")
      expect(["gmail.googleapis.com", "graph.microsoft.com"]).toContain(url.hostname)
      if (url.pathname.endsWith("/fictional-message")) {
        if (providerStatus !== 200) return Response.json({ error: { message: "Fictional provider failure" } }, { status: providerStatus })
        return provider === "GOOGLE" ? Response.json({ id: "fictional-message", internalDate: String(Date.now()), labelIds: ["INBOX"], payload: { parts: [{ partId: file.kind === "GMAIL_PART" ? file.id : "1", filename: file.name, mimeType: file.type,
          body: file.kind === "GMAIL_PART" ? { data: payload.toString("base64url"), size: file.size } : { attachmentId: file.id, size: file.size } }] } })
          : Response.json({ id: "fictional-message", from: { emailAddress: { address: "fictional@example.test" } }, receivedDateTime: new Date().toISOString(), isRead: false })
      }
      if (url.pathname.endsWith("/attachments")) return Response.json({ value: [{ "@odata.type": "#microsoft.graph.fileAttachment", id: file.id, name: file.name, size: file.size, contentType: file.type, isInline: false }] })
      await onBytes?.()
      return provider === "GOOGLE" ? Response.json({ data: payload.toString("base64url") }) : new Response(new Uint8Array(payload))
    }))
    const get = (key = remoteAttachmentKey(file), id = message.id) => GET(new Request(`https://example.test/api/communications/messages/${id}/attachments/${key}`), { params: Promise.resolve({ messageId: id, key }) })
    return { get, file, channel, message }
  }
  it.each(["GOOGLE", "MICROSOFT"])("downloads verified %s bytes without writing a local file or changing the message", async provider => {
    const data = await fixture(provider), before = await db.emailMessage.findUniqueOrThrow({ where: { id: data.message.id } })
    const response = await data.get(); expect(response.status).toBe(200); expect(Buffer.from(await response.arrayBuffer())).toEqual(pdf)
    expect(response.headers.get("content-type")).toBe("application/pdf"); expect(response.headers.get("cache-control")).toContain("no-store")
    expect(response.headers.get("x-content-type-options")).toBe("nosniff"); expect(response.headers.get("content-disposition")).toContain("attachment;")
    expect(await db.emailMessage.findUniqueOrThrow({ where: { id: before.id } })).toEqual(before)
  })
  it("downloads a small Gmail MIME part without an attachment resource ID", async () => {
    const data = await fixture("GOOGLE", session.companyId, { id: "1", kind: "GMAIL_PART" }); const response = await data.get()
    expect(response.status).toBe(200); expect(Buffer.from(await response.arrayBuffer())).toEqual(pdf)
  })
  it("refuses an old attachment choice when its current provider metadata changed", async () => {
    const data = await fixture(), key = remoteAttachmentKey(data.file); data.file.name = "changed-fiction.pdf"
    expect((await data.get(key)).status).toBe(409)
  })
  it.each(["SALES", "OPERATIONS", "SERVICE"])("allows %s to read its own private mailbox", async role => {
    const data = await fixture(); await db.membership.update({ where: { id: memberId }, data: { role } })
    const loaded = await withAuth(({ companyId }) => readIncomingAttachment(companyId, data.message.id, remoteAttachmentKey(data.file)), "automation.read")
    expect(loaded.bytes).toEqual(pdf)
    expect((await data.get()).status).toBe(200)
  })
  it.each(["TECHNICIAN", "ACCOUNTING", "VIEWER"])("refuses %s before a provider request", async role => {
    const data = await fixture(); await db.membership.update({ where: { id: memberId }, data: { role } }); expect((await data.get()).status).toBe(403); expect(fetch).not.toHaveBeenCalled()
  })
  it("does not expose a colleague's private attachment", async () => {
    const data = await fixture(); session.userId = colleagueId; expect((await data.get()).status).toBe(404); expect(fetch).not.toHaveBeenCalled()
  })
  it("allows a colleague with Automations read to download a shared mailbox attachment", async () => {
    const data = await fixture(); await db.communicationChannel.update({ where: { id: data.channel.id }, data: { visibility: "SHARED" } }); session.userId = colleagueId
    expect((await data.get()).status).toBe(200)
  })
  it("does not expose a foreign-company message even to the current Owner", async () => {
    const data = await fixture("GOOGLE", foreignCompanyId); expect((await data.get()).status).toBe(404); expect(fetch).not.toHaveBeenCalled()
  })
  it("rejects a forged attachment key without contacting the provider", async () => {
    const data = await fixture(); expect((await data.get("b".repeat(64))).status).toBe(404); expect(fetch).not.toHaveBeenCalled()
  })
  it.each([{ type: "application/zip" }, { kind: "UNSUPPORTED" as const }, { size: 5 * 1024 * 1024 + 1 }])("refuses unsupported metadata %j before downloading", async override => {
    const data = await fixture("GOOGLE", session.companyId, override); expect((await data.get()).status).toBe(422); expect(fetch).not.toHaveBeenCalled()
  })
  it.each([403, 429, 503])("preserves the CRM copy when the provider returns %i", async status => {
    const data = await fixture(); providerStatus = status
    const before = await db.emailMessage.findUniqueOrThrow({ where: { id: data.message.id } }); expect((await data.get()).status).toBe(502)
    expect(await db.emailMessage.findUniqueOrThrow({ where: { id: before.id } })).toEqual(before)
  })
  it("reports an absent provider message without deleting its local copy", async () => {
    const data = await fixture(); providerStatus = 404; expect((await data.get()).status).toBe(410)
    expect(await db.emailMessage.findUniqueOrThrow({ where: { id: data.message.id } })).toEqual(data.message)
  })
  it("refuses a file whose bytes fail their declared signature", async () => {
    const data = await fixture(); payload = Buffer.alloc(pdf.length, "x"); expect((await data.get()).status).toBe(422)
  })
  it("bounds the raw Graph body even when metadata declares a small attachment", async () => {
    const data = await fixture("MICROSOFT"); payload = Buffer.alloc(5 * 1024 * 1024 + 1); expect((await data.get()).status).toBe(413)
  })
  it("rechecks membership after fetching the bytes", async () => {
    const data = await fixture(); onBytes = async () => { await db.membership.update({ where: { id: memberId }, data: { status: "SUSPENDED" } }) }
    expect((await data.get()).status).toBe(401)
  })
  it("rechecks mailbox privacy after fetching the bytes", async () => {
    const data = await fixture(); await db.membership.update({ where: { id: memberId }, data: { role: "SALES" } })
    onBytes = async () => { await db.communicationChannel.update({ where: { id: data.channel.id }, data: { ownerUserId: colleagueId } }) }
    expect((await data.get()).status).not.toBe(200)
  })
  it("does not serve bytes after the mailbox disconnected during the provider read", async () => {
    const data = await fixture(); onBytes = async () => { await db.communicationChannel.update({ where: { id: data.channel.id }, data: { status: "DISCONNECTED", credentialsEncrypted: null } }) }
    expect((await data.get()).status).not.toBe(200)
  })
  it("does not contact a provider from the public demo", async () => {
    const data = await fixture(); vi.stubEnv("DEMO_ACCESS_MODE", "readonly"); expect((await data.get()).status).toBe(403); expect(fetch).not.toHaveBeenCalled()
  })
  it.each([
    { credentialsEncrypted: "fictional-new-cipher", lastError: null, mailEnabled: false },
    { credentialsEncrypted: "fictional-new-cipher", lastError: null, visibility: "SHARED" },
    { credentialsEncrypted: "fictional-new-cipher", lastError: null, ownerUserId: "fictional-owner" },
    { credentialsEncrypted: "fictional-new-cipher", lastError: "forged-error" },
  ])("does not let the scoped refresh capability edit connection settings %j", async data => {
    const fixtureData = await fixture(); await db.membership.update({ where: { id: memberId }, data: { role: "SALES" } })
    const before = await db.communicationChannel.findUniqueOrThrow({ where: { id: fixtureData.channel.id } })
    await expect(withAuth(context => requestContext.run({ ...context, actionPermission: "automation.read", oauthCredentialRefreshChannelId: before.id }, async () =>
      await prisma.communicationChannel.updateMany({ where: { id: before.id, status: "ACTIVE", credentialsEncrypted: before.credentialsEncrypted }, data })), "automation.read")).rejects.toThrow("FORBIDDEN:company.manage")
    expect(await db.communicationChannel.findUniqueOrThrow({ where: { id: before.id } })).toEqual(before)
  })
  it("does not grant credential writes to an ordinary read without the provider's capability", async () => {
    const data = await fixture(); await db.membership.update({ where: { id: memberId }, data: { role: "SALES" } })
    await expect(withAuth(async () => await prisma.communicationChannel.updateMany({ where: { id: data.channel.id, status: "ACTIVE", credentialsEncrypted: data.channel.credentialsEncrypted },
      data: { credentialsEncrypted: "fictional-new-cipher", lastError: null } }), "automation.read")).rejects.toThrow("FORBIDDEN:company.manage")
  })
  it("renews an expired token for an authorized reader without granting company administration", async () => {
    const data = await fixture(); await db.membership.update({ where: { id: memberId }, data: { role: "SALES" } })
    await db.communicationChannel.update({ where: { id: data.channel.id }, data: { credentialsEncrypted: credentials(true) } })
    const before = await db.communicationChannel.findUniqueOrThrow({ where: { id: data.channel.id } })
    expect((await data.get()).status).toBe(200)
    const after = await db.communicationChannel.findUniqueOrThrow({ where: { id: data.channel.id } })
    expect(after.credentialsEncrypted).not.toBe(before.credentialsEncrypted)
    expect(after).toEqual({ ...before, credentialsEncrypted: expect.any(String), updatedAt: expect.any(Date), lastError: null })
  })
})
