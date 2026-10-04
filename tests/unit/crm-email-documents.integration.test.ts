import { afterAll, afterEach, describe, expect, it, vi } from "vitest"
import { createHash, randomUUID } from "node:crypto"
vi.mock("server-only", () => ({}))
import prisma from "@/lib/prisma"
import { requestContext } from "@/lib/context"
import type { CompanyRole } from "@/lib/permissions"
import { encrypt } from "@/lib/crypto"
import { storeFileBytes, removeLocalFile } from "@/lib/local-files"
import { saveEmailDraft, readEmailDraft } from "@/lib/communications/drafts"
import { listCrmEmailDocuments, attachCrmEmailDocument } from "@/lib/communications/crm-documents"
import { emailAttachmentsSchema, MAX_EMAIL_FILE_BYTES } from "@/lib/communications/attachment-types"
import { readEmailAttachmentBytes } from "@/lib/communications/attachment-content"
import { addEmailDraftAttachment } from "@/lib/communications/draft-attachments"

describe.sequential("CRM document snapshots in private email drafts", () => {
  const companies: string[] = [], users: string[] = [], paths: string[] = []
  afterEach(() => vi.unstubAllEnvs())
  afterAll(async () => {
    for (const file of paths) await removeLocalFile(file)
    for (const companyId of companies) {
      await prisma.invoice.deleteMany({ where: { companyId } })
      await prisma.contact.deleteMany({ where: { client: { companyId } } })
      await prisma.client.deleteMany({ where: { companyId } })
      await prisma.company.delete({ where: { id: companyId } })
    }
    await prisma.user.deleteMany({ where: { id: { in: users } } })
  })
  async function fixture() {
    vi.stubEnv("FILE_STORAGE_DRIVER", "local")
    const company = await prisma.company.create({ data: { name: "Fictional CRM files" } }); companies.push(company.id)
    const user = await prisma.user.create({ data: { name: "Fictional author" } }); users.push(user.id)
    const member = await prisma.membership.create({ data: { companyId: company.id, userId: user.id, role: "OWNER" } })
    const client = await prisma.client.create({ data: { companyId: company.id, name: "Fictional client" } })
    const contact = await prisma.contact.create({ data: { clientId: client.id, firstName: "Fiction", lastName: "Contact", email: "fiction@example.test" } })
    const asActor = <T>(task: () => Promise<T>, role: CompanyRole = "OWNER", actorId = user.id) => requestContext.run({ companyId: company.id, userId: actorId, membershipId: member.id, role, agencyIds: role === "OWNER" ? null : [], actionPermission: "automation.write" }, task)
    const fields = { createKey: randomUUID(), contactId: contact.id, subject: "Fictional document mail", bodyHtml: "<p>Private frozen document copy</p>" }
    const draft = await asActor(() => saveEmailDraft(company.id, user.id, fields))
    const bytes = Buffer.from("%PDF-fictional original CRM file")
    const stored = await storeFileBytes({ companyId: company.id, kind: "client", resourceId: client.id, originalName: "original.pdf", type: "application/pdf", bytes }); paths.push(stored.relativePath)
    const source = await prisma.clientFile.create({ data: { clientId: client.id, name: "original.pdf", url: stored.relativePath, type: stored.type, size: stored.size, sha256: stored.sha256 } })
    const input = { draftId: draft.id, version: draft.version, kind: "CLIENT_FILE" as const, sourceId: source.id, sourceHash: stored.sha256, attachmentId: randomUUID() }
    return { company, user, client, contact, draft, fields, bytes, stored, source, asActor, input }
  }
  async function rememberCopy(f: Awaited<ReturnType<typeof fixture>>) {
    const raw = await f.asActor(() => readEmailDraft(f.company.id, f.user.id, f.draft.id))
    const copies = emailAttachmentsSchema.parse(raw.attachments)
    paths.push(...copies.map(file => file.relativePath))
    return copies
  }

  it("paginates all 551 eligible files, searches case-insensitively and exposes no storage path", async () => {
    const f = await fixture()
    await prisma.clientFile.createMany({ data: Array.from({ length: 550 }, (_, index) => ({ clientId: f.client.id, name: `Fictional document ${String(index).padStart(3, "0")}.pdf`, url: f.stored.relativePath, size: f.stored.size, type: "application/pdf", sha256: f.stored.sha256 })) })
    await f.asActor(async () => {
      const first = await listCrmEmailDocuments(f.company.id, f.user.id, { draftId: f.draft.id, kind: "CLIENT_FILE" })
      const last = await listCrmEmailDocuments(f.company.id, f.user.id, { draftId: f.draft.id, kind: "CLIENT_FILE", page: 999 })
      expect(first).toMatchObject({ total: 551, page: 1, pageCount: 23 }); expect(first.documents).toHaveLength(25)
      expect(last).toMatchObject({ total: 551, page: 23 }); expect(last.documents).toHaveLength(1)
      const found = await listCrmEmailDocuments(f.company.id, f.user.id, { draftId: f.draft.id, kind: "CLIENT_FILE", search: "DOCUMENT 549" })
      expect(found.documents.map(file => file.name)).toEqual(["Fictional document 549.pdf"])
      expect(JSON.stringify(first)).not.toContain(f.stored.relativePath)
      expect(first.documents[0]).not.toHaveProperty("url")
    })
  })

  it("copies exact bytes privately, survives original deletion and retries without another revision or file", async () => {
    const f = await fixture()
    const added = await f.asActor(() => attachCrmEmailDocument(f.company.id, f.user.id, f.input))
    expect(added.version).toBe(2); expect(added.attachments[0]).not.toHaveProperty("relativePath")
    const copy = (await rememberCopy(f))[0]
    expect(copy.relativePath).toContain(`private/${f.company.id}/email-draft/${f.draft.id}/`)
    expect(copy.relativePath).not.toBe(f.stored.relativePath)
    expect(await f.asActor(() => attachCrmEmailDocument(f.company.id, f.user.id, f.input))).toEqual(added)
    await prisma.clientFile.delete({ where: { id: f.source.id } }); await removeLocalFile(f.stored.relativePath)
    expect((await readEmailAttachmentBytes(f.company.id, copy)).bytes).toEqual(f.bytes)
  })

  it("denies a colleague, another client/company and finance documents without finance permission", async () => {
    const f = await fixture(), other = await fixture()
    const colleague = await prisma.user.create({ data: { name: "Fictional colleague" } }); users.push(colleague.id)
    await f.asActor(async () => await expect(listCrmEmailDocuments(f.company.id, colleague.id, { draftId: f.draft.id, kind: "CLIENT_FILE" })).rejects.toThrow("Brouillon"), "OWNER", colleague.id)
    await other.asActor(async () => await expect(attachCrmEmailDocument(other.company.id, other.user.id, f.input)).rejects.toThrow("Brouillon"))
    const secondClient = await prisma.client.create({ data: { companyId: f.company.id, name: "Another fictional client" } })
    const wrong = await prisma.clientFile.create({ data: { clientId: secondClient.id, name: "wrong.pdf", url: f.stored.relativePath, size: f.stored.size, type: f.stored.type, sha256: f.stored.sha256 } })
    await f.asActor(async () => {
      await expect(attachCrmEmailDocument(f.company.id, f.user.id, { ...f.input, sourceId: wrong.id })).rejects.toThrow("indisponible")
      await expect(attachCrmEmailDocument(f.company.id, f.user.id, { ...f.input, sourceId: other.source.id })).rejects.toThrow("indisponible")
    })
    await f.asActor(async () => {
      expect((await listCrmEmailDocuments(f.company.id, f.user.id, { draftId: f.draft.id, kind: "CLIENT_FILE" })).canReadInvoices).toBe(false)
      await expect(listCrmEmailDocuments(f.company.id, f.user.id, { draftId: f.draft.id, kind: "ISSUED_INVOICE" })).rejects.toThrow("droits")
      await expect(attachCrmEmailDocument(f.company.id, f.user.id, { ...f.input, kind: "ISSUED_INVOICE" })).rejects.toThrow("droits")
    }, "SALES")
    expect((await rememberCopy(f))).toEqual([])
  })

  it("refuses stale source hashes, altered bytes, external URLs and traversal without storing a copy", async () => {
    const f = await fixture()
    await f.asActor(async () => await expect(attachCrmEmailDocument(f.company.id, f.user.id, { ...f.input, sourceHash: "a".repeat(64) })).rejects.toThrow("modifié"))
    for (const url of ["https://example.test/private.pdf", `local:${f.company.id}/client/${f.client.id}/../foreign.pdf`]) {
      await prisma.clientFile.update({ where: { id: f.source.id }, data: { url } })
      await f.asActor(async () => await expect(attachCrmEmailDocument(f.company.id, f.user.id, f.input)).rejects.toThrow("Référence"))
    }
    const changedBytes = Buffer.from(f.bytes); changedBytes[10] ^= 1
    const tampered = await storeFileBytes({ companyId: f.company.id, kind: "client", resourceId: f.client.id, originalName: "changed.pdf", type: "application/pdf", bytes: changedBytes }); paths.push(tampered.relativePath)
    await prisma.clientFile.update({ where: { id: f.source.id }, data: { url: tampered.relativePath, size: tampered.size } })
    await f.asActor(async () => await expect(attachCrmEmailDocument(f.company.id, f.user.id, f.input)).rejects.toThrow("altéré"))
    expect(await rememberCopy(f)).toEqual([])
  })

  it("copies an issued invoice archive without regeneration and excludes drafts or missing archives", async () => {
    const f = await fixture()
    const invoice = await prisma.invoice.create({ data: { companyId: f.company.id, clientId: f.client.id, number: "FICTION-ISSUED-001", object: "Fictional archived invoice", status: "SENT", lockedAt: new Date(), dueDate: new Date(), totalHtCents: 10000, totalTvaCents: 0, totalTtcCents: 10000 } })
    const bytes = Buffer.from("%PDF-fictional immutable invoice")
    const archive = await storeFileBytes({ companyId: f.company.id, kind: "generated", resourceId: invoice.id, originalName: "archive.pdf", type: "application/pdf", bytes }); paths.push(archive.relativePath)
    await prisma.invoice.update({ where: { id: invoice.id }, data: { pdfUrl: archive.relativePath, pdfHash: archive.sha256, issuedDocument: encrypt(JSON.stringify({ version: 1, html: "<p>Frozen original issuer</p>", xml: "<fiction />" })) } })
    await prisma.invoice.createMany({ data: ["DRAFT", "SENT"].map((status, index) => ({ companyId: f.company.id, clientId: f.client.id, number: `FICTION-MISSING-${index}`, object: "No qualified archive", status, dueDate: new Date(), totalHtCents: 0, totalTvaCents: 0, totalTtcCents: 0 })) })
    await f.asActor(async () => {
      const page = await listCrmEmailDocuments(f.company.id, f.user.id, { draftId: f.draft.id, kind: "ISSUED_INVOICE", search: "fiction-issued" })
      expect(page.total).toBe(1); expect(page.documents[0]).toMatchObject({ id: invoice.id, sourceHash: archive.sha256, size: null })
      const added = await attachCrmEmailDocument(f.company.id, f.user.id, { ...f.input, kind: "ISSUED_INVOICE", sourceId: invoice.id, sourceHash: archive.sha256 })
      expect(added.attachments[0].name).toBe("FICTION-ISSUED-001.pdf")
    })
    const copy = (await rememberCopy(f))[0]
    await prisma.company.update({ where: { id: f.company.id }, data: { name: "Changed fictional issuer" } })
    expect((await readEmailAttachmentBytes(f.company.id, copy)).bytes).toEqual(bytes)
    const oversizedBytes = Buffer.alloc(MAX_EMAIL_FILE_BYTES + 1, 32)
    oversizedBytes.write("%PDF-fictional oversized invoice")
    const oversized = await storeFileBytes({ companyId: f.company.id, kind: "generated", resourceId: invoice.id, originalName: "large.pdf", type: "application/pdf", bytes: oversizedBytes }); paths.push(oversized.relativePath)
    await prisma.invoice.update({ where: { id: invoice.id }, data: { pdfUrl: oversized.relativePath, pdfHash: oversized.sha256 } })
    await f.asActor(async () => await expect(attachCrmEmailDocument(f.company.id, f.user.id, { ...f.input, version: 2, kind: "ISSUED_INVOICE", sourceId: invoice.id, sourceHash: oversized.sha256, attachmentId: randomUUID() })).rejects.toThrow("5 Mo"))
    expect((await rememberCopy(f))).toHaveLength(1)
    expect((await readEmailAttachmentBytes(f.company.id, copy)).bytes).toEqual(bytes)
  })

  it("refuses stale draft versions, scheduled drafts and public demo writes", async () => {
    const f = await fixture()
    const edited = await f.asActor(() => saveEmailDraft(f.company.id, f.user.id, { ...f.fields, id: f.draft.id, version: f.draft.version, subject: "Newer version" }))
    await f.asActor(async () => await expect(attachCrmEmailDocument(f.company.id, f.user.id, f.input)).rejects.toThrow("Conflit"))
    await prisma.emailDraft.update({ where: { id: f.draft.id }, data: { scheduledAt: new Date(Date.now() + 100_000) } })
    await f.asActor(async () => await expect(attachCrmEmailDocument(f.company.id, f.user.id, { ...f.input, version: edited.version })).rejects.toThrow("programmé"))
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    await f.asActor(async () => {
      expect((await listCrmEmailDocuments(f.company.id, f.user.id, { draftId: f.draft.id, kind: "CLIENT_FILE" })).total).toBe(1)
      await expect(attachCrmEmailDocument(f.company.id, f.user.id, f.input)).rejects.toThrow("lecture seule")
    })
    expect(await rememberCopy(f)).toEqual([])
  })

  it("preserves the five existing private files when a CRM addition would exceed the quota", async () => {
    const f = await fixture()
    let draft = f.draft
    for (let index = 0; index < 5; index++) {
      const bytes = Buffer.from(`%PDF-fictional existing attachment ${index}`)
      const metadata = { id: randomUUID(), name: `existing-${index}.pdf`, type: "application/pdf", size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") }
      draft = await f.asActor(() => addEmailDraftAttachment(f.company.id, f.user.id, f.draft.id, draft.version, metadata, async () => {
        const stored = await storeFileBytes({ companyId: f.company.id, kind: "email-draft", resourceId: f.draft.id, originalName: metadata.name, type: metadata.type, bytes }); paths.push(stored.relativePath); return stored
      }))
    }
    await f.asActor(async () => await expect(attachCrmEmailDocument(f.company.id, f.user.id, { ...f.input, version: draft.version })).rejects.toThrow("Limites"))
    expect((await rememberCopy(f)).map(file => file.sha256)).toEqual(draft.attachments.map(file => file.sha256))
  })
})
