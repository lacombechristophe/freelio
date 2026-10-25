import { afterAll, afterEach, describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
const auth = vi.hoisted(() => ({ context: null as null | { companyId: string; userId: string; role: string; membershipId: string; agencyIds: null } }))
vi.mock("@/lib/auth-wrapper", () => ({ resolveAuthContext: async () => auth.context, AuthorizationError: class extends Error {} }))
import prisma from "@/lib/prisma"
import { POST, GET, DELETE } from "@/app/api/communications/drafts/[id]/attachments/route"
import { saveEmailDraft, deleteEmailDraft, getEmailDraft } from "@/lib/communications/drafts"

describe.sequential("authenticated bounded attachment HTTP endpoints", () => {
  const companies: string[] = [], users: string[] = []
  afterEach(() => vi.unstubAllEnvs())
  afterAll(async () => {
    await prisma.company.deleteMany({ where: { id: { in: companies } } }); await prisma.user.deleteMany({ where: { id: { in: users } } })
  })
  async function fixture() {
    vi.stubEnv("FILE_STORAGE_DRIVER", "local")
    vi.stubEnv("PUBLIC_APP_URL", "http://localhost")
    const company = await prisma.company.create({ data: { name: "Fictional file HTTP" } }); companies.push(company.id)
    const user = await prisma.user.create({ data: { name: "Fictional file owner" } }); users.push(user.id)
    auth.context = { companyId: company.id, userId: user.id, role: "ADMIN", membershipId: "fixture", agencyIds: null }
    const draft = await saveEmailDraft(company.id, user.id, { createKey: crypto.randomUUID(), purpose: "SERVICE", subject: "Fictional HTTP", bodyHtml: "" })
    return { companyId: company.id, userId: user.id, draft, params: { params: Promise.resolve({ id: draft.id }) }, endpoint: `http://localhost/api/communications/drafts/${draft.id}/attachments` }
  }
  function upload(endpoint: string, version: number, bytes = "%PDF-fictional", origin = "http://localhost") {
    const body = new FormData(); body.set("version", String(version)); body.set("uploadId", crypto.randomUUID()); body.set("file", new File([bytes], "fiction.pdf", { type: "application/pdf" }))
    return new Request(endpoint, { method: "POST", headers: { origin }, body })
  }
  it("serves only the owner's verified bytes with private headers and rejects guessed IDs", async () => {
    const f = await fixture(), response = await POST(upload(f.endpoint, 1), f.params)
    expect(response.status).toBe(200)
    const { draft } = await response.json()
    const url = `${f.endpoint}?attachmentId=${draft.attachments[0].id}`
    const downloaded = await GET(new Request(url), f.params)
    expect(await downloaded.text()).toBe("%PDF-fictional")
    expect(downloaded.headers.get("cache-control")).toBe("private, no-store")
    expect(downloaded.headers.get("content-disposition")).toContain("attachment;")
    auth.context!.userId = "guessed-colleague"
    expect((await GET(new Request(url), f.params)).status).toBe(404)
    expect((await POST(upload(f.endpoint, draft.version), f.params)).status).toBe(404)
    auth.context!.userId = f.userId
    const removed = await DELETE(new Request(f.endpoint, { method: "DELETE", headers: { "content-type": "application/json", origin: "http://localhost" }, body: JSON.stringify({ version: draft.version, attachmentId: draft.attachments[0].id }) }), f.params)
    expect(removed.status).toBe(200)
    expect((await GET(new Request(url), f.params)).status).toBe(404)
  })
  it("rejects oversized streams, disguised content, stale versions, cross-site writes and the public demo", async () => {
    const f = await fixture()
    expect((await POST(upload(f.endpoint, 1, "not a PDF"), f.params)).status).toBe(400)
    expect((await POST(upload(f.endpoint, 2), f.params)).status).toBe(409)
    expect((await POST(upload(f.endpoint, 1, "%PDF-fake", "https://foreign.example.test"), f.params)).status).toBe(403)
    const excessive = new Request(f.endpoint, { method: "POST", headers: { "content-type": "multipart/form-data; boundary=x", "content-length": String(6 * 1024 * 1024) }, body: "fiction" })
    expect((await POST(excessive, f.params)).status).toBe(413)
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    expect((await POST(upload(f.endpoint, 1), f.params)).status).toBe(403)
    vi.stubEnv("DEMO_ACCESS_MODE", "")
    expect((await getEmailDraft(f.companyId, f.userId, f.draft.id)).attachments).toEqual([])
    await deleteEmailDraft(f.companyId, f.userId, f.draft)
    auth.context = null
    expect((await GET(new Request(f.endpoint), f.params)).status).toBe(409)
  })

  it("accepts the configured browser origin behind an internal URL and refuses spoofed proxy origins", async () => {
    const f = await fixture()
    vi.stubEnv("PUBLIC_APP_URL", "https://demo.example.test")
    const internal = f.endpoint.replace("http://localhost", "http://internal:3000")
    const response = await POST(upload(internal, 1, "%PDF-fiction", "https://demo.example.test"), f.params)
    expect(response.status).toBe(200)
    const { draft } = await response.json()
    const spoofed = upload(internal, draft.version, "%PDF-foreign", "https://foreign.example.test")
    spoofed.headers.set("host", "foreign.example.test")
    spoofed.headers.set("x-forwarded-host", "foreign.example.test")
    expect((await POST(spoofed, f.params)).status).toBe(403)
    expect((await POST(upload(internal, draft.version, "%PDF-internal", "http://internal:3000"), f.params)).status).toBe(403)
    await deleteEmailDraft(f.companyId, f.userId, draft)
  })
})
