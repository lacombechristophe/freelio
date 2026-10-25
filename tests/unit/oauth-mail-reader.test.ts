import { afterEach, describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
import { graphAttachmentMetadata, mailResourceId, microsoftMailContinuation, parseGmailMessage, readMailJson, readRemoteMail } from "@/lib/communications/oauth-mail-reader"
import type { ActiveChannel } from "@/lib/communications/email-provider"
const channel: ActiveChannel = { id: "fictional-box", provider: "GOOGLE", emailAddress: "owner@example.test", displayName: null, credentialsEncrypted: null, lastSyncAt: null }
afterEach(() => vi.unstubAllGlobals())
describe("provider mail parsers keep cursor and content bounds explicit", () => {
  it("accepts both Graph path forms for exactly the expected mail folder", () => {
    for (const path of ["mailFolders/inbox", "mailFolders('inbox')"]) expect(microsoftMailContinuation(`https://graph.microsoft.com/v1.0/me/${path}/messages/delta?$skiptoken=fictional`, "inbox")).toContain("fictional")
  })
  it.each(["https://foreign.example.test/v1.0/me/mailFolders/inbox/messages/delta", "https://graph.microsoft.com/v1.0/me/mailFolders/sentitems/messages/delta", "https://graph.microsoft.com/v1.0/me/calendarView/delta"])("rejects an unrelated continuation %s", value => {
    expect(() => microsoftMailContinuation(value, "inbox")).toThrow("Curseur")
  })
  it.each(["", ".", "..", "bad\nidentifier"])("refuses ambiguous resource segment %j", id => expect(() => mailResourceId(id)).toThrow("Identifiant"))
  it("encodes Graph opaque IDs as a single resource locator", () => expect(mailResourceId("a/b+c==")).toBe("a%2Fb%2Bc%3D%3D"))
  it("does not use an attached text file as the main message body", () => {
    const message = parseGmailMessage(channel, { id: "fake", internalDate: "1000", payload: { parts: [
      { filename: "attached.txt", partId: "1", mimeType: "text/plain", body: { data: Buffer.from("Attachment body").toString("base64url"), size: 15 } },
      { mimeType: "text/plain", body: { data: Buffer.from("Actual body").toString("base64url") } },
    ] } })
    expect(message.bodyText).toBe("Actual body"); expect(message.observation.attachments).toMatchObject([{ name: "attached.txt", kind: "GMAIL_PART" }])
  })
  it("rejects a malformed source date instead of inventing a new receipt time", () => expect(() => parseGmailMessage(channel, { id: "fake", internalDate: "invalid" })).toThrow("Date fournisseur"))
  it("resolves a custom Gmail label once per observation batch", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => String(input).endsWith("/labels") ? Response.json({ labels: [{ id: "Label_17", name: "Clients suivis" }] })
      : Response.json({ id: "fake", internalDate: "1000", labelIds: ["Label_17"] })))
    const folders = new Map<string, string>()
    expect((await readRemoteMail(channel, "fake", "fictional-token", { folders }))?.observation.folderNames).toEqual(["Clients suivis"])
    await readRemoteMail(channel, "fake", "fictional-token", { folders })
    expect(vi.mocked(fetch).mock.calls.filter(call => String(call[0]).endsWith("/labels"))).toHaveLength(1)
  })
  it("reads every Graph attachment metadata page while retaining unsupported kinds", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
      const url = new URL(String(input)), page = Number(url.searchParams.get("page") || 0)
      return Response.json({ value: [{ id: `file-${page}`, name: `fiction-${page}`, size: 12, contentType: "application/pdf", "@odata.type": page ? "#microsoft.graph.referenceAttachment" : "#microsoft.graph.fileAttachment" }],
        ...(page === 0 ? { "@odata.nextLink": "https://graph.microsoft.com/v1.0/me/messages/fake/attachments?page=1" } : {}) })
    }))
    expect(await graphAttachmentMetadata("fake", "fictional-token")).toMatchObject([{ kind: "GRAPH_FILE" }, { kind: "UNSUPPORTED" }])
    expect(fetch).toHaveBeenCalledTimes(2)
  })
  it("rejects a metadata continuation for another message", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ value: [], "@odata.nextLink": "https://graph.microsoft.com/v1.0/me/messages/other/attachments" })))
    await expect(graphAttachmentMetadata("fake", "fictional-token")).rejects.toThrow("Curseur")
  })
  it("rejects a looping metadata cursor even when it contains no files", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ value: [], "@odata.nextLink": "https://graph.microsoft.com/v1.0/me/messages/fake/attachments?page=1" })))
    await expect(graphAttachmentMetadata("fake", "fictional-token")).rejects.toThrow("Curseur"); expect(fetch).toHaveBeenCalledTimes(2)
  })
  it("bounds provider JSON while consuming its body", async () => {
    await expect(readMailJson(new Response('"' + "x".repeat(100) + '"'), 30)).rejects.toThrow("PAYLOAD_TOO_LARGE")
  })
})
