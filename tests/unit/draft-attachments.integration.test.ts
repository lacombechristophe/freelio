import { afterAll, afterEach, describe, expect, it, vi } from "vitest"
import { createHash, randomUUID } from "node:crypto"
vi.mock("server-only", () => ({}))
import prisma from "@/lib/prisma"
import { requestContext } from "@/lib/context"
import { addEmailDraftAttachment, removeEmailDraftAttachment } from "@/lib/communications/draft-attachments"
import { deleteEmailDraft, getEmailDraft, saveEmailDraft, sendEmailDraft } from "@/lib/communications/drafts"
import { readEmailAttachmentBytes } from "@/lib/communications/attachment-content"
import { emailAttachmentsSchema } from "@/lib/communications/attachment-types"
import { removeLocalFile, storeFileBytes } from "@/lib/local-files"
import { buildBackupPayload } from "@/lib/backup"

describe.sequential("private attachment bytes, quotas and frozen draft revisions on SQL", () => {
  const companies: string[] = [], users: string[] = [], paths: string[] = []
  afterEach(() => vi.unstubAllEnvs())
  afterAll(async () => {
    for (const file of paths) await removeLocalFile(file)
    await prisma.company.deleteMany({ where: { id: { in: companies } } }); await prisma.user.deleteMany({ where: { id: { in: users } } })
  })
  async function fixture() {
    vi.stubEnv("FILE_STORAGE_DRIVER", "local")
    const company = await prisma.company.create({ data: { name: "Fictional attachments only" } }); companies.push(company.id)
    const user = await prisma.user.create({ data: { name: "Fictional file author" } }); users.push(user.id)
    const colleague = await prisma.user.create({ data: { name: "Fictional colleague" } }); users.push(colleague.id)
    const fields = { createKey: randomUUID(), subject: "Fictional files", bodyHtml: "<p>Fictional content only</p>" }
    const draft = await saveEmailDraft(company.id, user.id, fields)
    return { companyId: company.id, userId: user.id, colleagueId: colleague.id, draft, fields }
  }
  function upload(f: Awaited<ReturnType<typeof fixture>>, size = 24, suffix = "file", version = f.draft.version) {
    const bytes = Buffer.alloc(size, 32); bytes.write(`%PDF-${suffix}`)
    const metadata = { id: randomUUID(), name: `${suffix}.pdf`, type: "application/pdf", size, sha256: createHash("sha256").update(bytes).digest("hex") }
    const store = vi.fn(async () => { const file = await storeFileBytes({ companyId: f.companyId, kind: "email-draft", resourceId: f.draft.id, originalName: metadata.name, type: metadata.type, bytes }); paths.push(file.relativePath); return file })
    return { metadata, bytes, store, run: () => addEmailDraftAttachment(f.companyId, f.userId, f.draft.id, version, metadata, store) }
  }
  it("reopens private metadata, retains files through text saves, retries upload without duplicating bytes", async () => {
    const f = await fixture(), u = upload(f)
    const added = await u.run()
    expect(added.version).toBe(2); expect(added.attachments[0]).not.toHaveProperty("relativePath")
    expect(await u.run()).toEqual(added); expect(u.store).toHaveBeenCalledTimes(1)
    const saved = await saveEmailDraft(f.companyId, f.userId, { ...added, subject: "Edited fictional subject" })
    expect(saved.attachments).toEqual(added.attachments)
    const raw = await prisma.emailDraft.findUniqueOrThrow({ where: { id: added.id } })
    const file = emailAttachmentsSchema.parse(raw.attachments)[0]
    expect(file.relativePath).toMatch(new RegExp(`^local:private/${f.companyId}/email-draft/`))
    expect((await readEmailAttachmentBytes(f.companyId, file)).bytes).toEqual(u.bytes)
    await expect(readEmailAttachmentBytes("foreign-company", file)).rejects.toThrow("hors")
    const exported = await buildBackupPayload(f.userId, f.companyId)
    expect(exported.tables.some(table => table.model === "EmailDraft")).toBe(false)
    expect(exported.files).toEqual([])
    expect(JSON.stringify(exported)).not.toContain(file.relativePath)
  })
  it("denies colleagues and foreign companies before any storage write, including direct SQL draft reads", async () => {
    const f = await fixture(), other = await fixture(), u = upload(f)
    for (const [companyId, userId] of [[f.companyId, f.colleagueId], [other.companyId, f.userId]]) {
      await expect(addEmailDraftAttachment(companyId, userId, f.draft.id, 1, u.metadata, u.store)).rejects.toThrow("introuvable")
    }
    expect(u.store).not.toHaveBeenCalled()
    await requestContext.run({ companyId: f.companyId, userId: f.colleagueId, role: "ADMIN", membershipId: "fixture", agencyIds: null, actionPermission: "automation.read" }, async () => {
      expect(await prisma.emailDraft.findUnique({ where: { id: f.draft.id } })).toBeNull()
    })
  })
  it("accepts exactly 5 MiB per file / 10 MiB total and refuses a larger file or total before writing", async () => {
    const f = await fixture(), first = upload(f, 5 * 1024 * 1024, "one")
    const a = await first.run(), second = upload(f, 5 * 1024 * 1024, "two", a.version)
    const b = await second.run(), extra = upload(f, 32, "extra", b.version)
    await expect(extra.run()).rejects.toThrow("Limites"); expect(extra.store).not.toHaveBeenCalled()
    const large = upload(f, 5 * 1024 * 1024 + 1, "large", b.version)
    await expect(large.run()).rejects.toThrow(); expect(large.store).not.toHaveBeenCalled()
  })
  it("caps count at five, refuses stale tab changes and freezes the list before sending", async () => {
    const f = await fixture(); let draft = f.draft
    for (let index = 0; index < 5; index++) draft = await upload(f, 32, `file${index}`, draft.version).run()
    const sixth = upload(f, 32, "sixth", draft.version)
    await expect(sixth.run()).rejects.toThrow("Limites"); expect(sixth.store).not.toHaveBeenCalled()
    await expect(removeEmailDraftAttachment(f.companyId, f.userId, draft.id, 1, draft.attachments[0].id)).rejects.toThrow("Conflit")
    const send = vi.fn()
    await expect(sendEmailDraft(f.companyId, f.userId, { ...draft, attachmentIds: [] }, send)).rejects.toThrow("pièces")
    expect(send).not.toHaveBeenCalled()
    await prisma.emailDelivery.create({ data: { companyId: f.companyId, requestKey: draft.requestKey, recipientEmail: "fiction@example.test", subject: "Fiction", payload: {}, status: "FAILED", scheduledAt: new Date() } })
    await expect(removeEmailDraftAttachment(f.companyId, f.userId, draft.id, draft.version, draft.attachments[0].id)).rejects.toThrow("figées")
  })
  it("removes bytes with an unsent draft and denies public demo writes before storage", async () => {
    const f = await fixture(), u = upload(f), draft = await u.run()
    const raw = await prisma.emailDraft.findUniqueOrThrow({ where: { id: draft.id } }), file = emailAttachmentsSchema.parse(raw.attachments)[0]
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    const another = upload(f, 40, "public", draft.version)
    await expect(another.run()).rejects.toThrow("lecture seule"); expect(another.store).not.toHaveBeenCalled()
    vi.stubEnv("DEMO_ACCESS_MODE", "")
    await deleteEmailDraft(f.companyId, f.userId, draft)
    await expect(getEmailDraft(f.companyId, f.userId, draft.id)).rejects.toThrow("introuvable")
    await expect(readEmailAttachmentBytes(f.companyId, file)).rejects.toThrow()
  })
})
