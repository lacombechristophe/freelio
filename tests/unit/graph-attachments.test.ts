import { afterEach, describe, expect, it, vi } from "vitest"
import { createHash, randomUUID } from "node:crypto"
vi.mock("server-only", () => ({}))
import { prepareGraphAttachments } from "@/lib/communications/graph-attachments"
import type { LoadedEmailAttachment } from "@/lib/communications/attachment-content"

describe("Microsoft attachment completion reconciliation and large uploads", () => {
  afterEach(() => vi.unstubAllGlobals())
  function file(size = 32, name = "fiction.pdf"): LoadedEmailAttachment {
    const bytes = Buffer.alloc(size, 32); bytes.write("%PDF-fiction")
    return { id: randomUUID(), name, size, type: "application/pdf", sha256: createHash("sha256").update(bytes).digest("hex"), relativePath: "local:private/fiction/email-draft/fiction/file.pdf", bytes }
  }
  const headers = { authorization: "Bearer fictitious-only", Prefer: 'IdType="ImmutableId"' }
  it("does not duplicate a small attachment accepted remotely before a timeout", async () => {
    const attachment = file(); let accepted = false, added = 0
    const fetch = vi.fn(async (url: string, input?: RequestInit) => {
      if (url.includes("?$select=")) return Response.json({ value: accepted ? [{ id: "fiction-remote", contentId: `freelio-${attachment.id}`, name: attachment.name, size: attachment.size }] : [] })
      if (url.endsWith("/$value")) return new Response(new Uint8Array(attachment.bytes))
      if (input?.method === "POST") {
        const body = JSON.parse(input.body as string)
        expect(Buffer.from(body.contentBytes, "base64")).toEqual(attachment.bytes)
        added++; accepted = true; throw new Error("Ambiguous acceptance timeout")
      }
      throw new Error(`Unexpected fictional request: ${url}`)
    })
    vi.stubGlobal("fetch", fetch)
    await expect(prepareGraphAttachments("draft-fiction", headers, [attachment], async () => {})).rejects.toThrow("timeout")
    await prepareGraphAttachments("draft-fiction", headers, [attachment], async () => {})
    expect(added).toBe(1)
  })
  it("uploads 5 MiB in sequential bounded chunks without forwarding OAuth credentials to the upload URL", async () => {
    const attachment = file(5 * 1024 * 1024); let accepted = false, received = Buffer.alloc(0)
    const fetch = vi.fn(async (url: string, input?: RequestInit) => {
      if (String(url).includes("?$select=")) return Response.json({ value: accepted ? [{ id: "large-remote", contentId: `freelio-${attachment.id}`, name: attachment.name, size: attachment.size }] : [] })
      if (String(url).endsWith("/$value")) return new Response(new Uint8Array(attachment.bytes))
      if (String(url).endsWith("/createUploadSession")) return Response.json({ uploadUrl: "https://outlook.office.com/api/v2.0/fiction-session?fiction-token=1" })
      if (input?.method === "PUT") {
        expect(input.headers).not.toHaveProperty("authorization")
        const chunk = Buffer.from(input.body as Uint8Array)
        expect(chunk.length).toBeLessThan(4 * 1024 * 1024)
        expect((input.headers as Record<string, string>)["content-range"]).toBe(`bytes ${received.length}-${received.length + chunk.length - 1}/${attachment.size}`)
        received = Buffer.concat([received, chunk]); accepted = received.length === attachment.size
        return new Response(null, { status: accepted ? 201 : 200 })
      }
      throw new Error("Unexpected fictional request")
    })
    vi.stubGlobal("fetch", fetch)
    await prepareGraphAttachments("large-fiction", headers, [attachment], async () => {})
    expect(received.equals(attachment.bytes)).toBe(true)
  })
  it("refuses remote alterations, foreign upload destinations and lost leases", async () => {
    const attachment = file()
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ value: [{ id: "altered", name: attachment.name, size: attachment.size, contentId: `freelio-${attachment.id}` }] })).mockResolvedValueOnce(new Response(new Uint8Array(Buffer.alloc(attachment.size)))))
    await expect(prepareGraphAttachments("fiction", headers, [attachment], async () => {})).rejects.toThrow("altérée")
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ value: [] })).mockResolvedValueOnce(Response.json({ uploadUrl: "https://foreign.example.test/api/v2.0/stolen" }))
    vi.stubGlobal("fetch", fetch)
    await expect(prepareGraphAttachments("fiction", headers, [file(5 * 1024 * 1024)], async () => {})).rejects.toThrow("Destination")
    expect(fetch).toHaveBeenCalledTimes(2)
    fetch.mockClear()
    await expect(prepareGraphAttachments("fiction", headers, [attachment], async () => { throw new Error("Lost lease") })).rejects.toThrow("Lost lease")
    expect(fetch).not.toHaveBeenCalled()
  })
})
