import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { randomUUID, createHash } from "node:crypto"
vi.mock("server-only", () => ({}))
const mocks = vi.hoisted(() => ({ generate: vi.fn() }))
vi.mock("@/lib/pdf/generator", () => ({ generatePdfFromHtml: mocks.generate }))
import prisma from "@/lib/prisma"
import { requestContext } from "@/lib/context"
import { saveEmailDraft, readEmailDraft } from "@/lib/communications/drafts"
import { listCrmEmailDocuments, attachCrmEmailDocument } from "@/lib/communications/crm-documents"
import { emailAttachmentsSchema, MAX_EMAIL_FILE_BYTES } from "@/lib/communications/attachment-types"
import { readEmailAttachmentBytes } from "@/lib/communications/attachment-content"
import { storeFileBytes, removeLocalFile } from "@/lib/local-files"
import { addEmailDraftAttachment } from "@/lib/communications/draft-attachments"
import * as images from "@/lib/pdf/images"

describe.sequential("current quote revision copies in private drafts", () => {
  const companies: string[] = [], users: string[] = [], paths: string[] = []
  beforeEach(() => { mocks.generate.mockReset().mockResolvedValue(Buffer.from("%PDF-fictional generated current quote")) })
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })
  afterAll(async () => {
    for (const path of paths) await removeLocalFile(path)
    for (const companyId of companies) {
      await prisma.quote.deleteMany({ where: { companyId } })
      await prisma.contact.deleteMany({ where: { client: { companyId } } })
      await prisma.client.deleteMany({ where: { companyId } })
      await prisma.company.delete({ where: { id: companyId } })
    }
    await prisma.user.deleteMany({ where: { id: { in: users } } })
  })
  async function fixture() {
    vi.stubEnv("FILE_STORAGE_DRIVER", "local")
    const company = await prisma.company.create({ data: { name: "Fictional current issuer", email: "private-issuer@example.test" } }); companies.push(company.id)
    const user = await prisma.user.create({ data: { name: "Fictional quote copy author" } }); users.push(user.id)
    const member = await prisma.membership.create({ data: { companyId: company.id, userId: user.id, role: "OWNER" } })
    const client = await prisma.client.create({ data: { companyId: company.id, name: "Fictional recipient company" } })
    const contact = await prisma.contact.create({ data: { clientId: client.id, firstName: "Fiction", lastName: "Contact", email: "fiction@example.test" } })
    const quote = await prisma.quote.create({ data: { companyId: company.id, clientId: client.id, number: "FICTION-QUOTE-001", object: "Fictional current copy", versions: { create: {
      version: 1, totalHtCents: 10000, totalTvaCents: 2000, totalTtcCents: 12000, sections: { create: { order: 0, lines: { create: { label: "Fictional installation", quantity: 1, unitPriceCents: 10000, tvaRate: 20 } } } },
    } } }, include: { versions: { include: { sections: { include: { lines: true } } } } } })
    const context = { companyId: company.id, userId: user.id, membershipId: member.id, role: "OWNER" as const, agencyIds: null, actionPermission: "automation.write" as const }
    const asActor = <T>(task: () => Promise<T>) => requestContext.run(context, task)
    const fields = { createKey: randomUUID(), contactId: contact.id, subject: "Fictional quote copy", bodyHtml: "<p>Preserved composer text</p>" }
    const draft = await asActor(() => saveEmailDraft(company.id, user.id, fields))
    const list = () => asActor(() => listCrmEmailDocuments(company.id, user.id, { draftId: draft.id, kind: "QUOTE_COPY" }))
    const selected = (await list()).documents[0]
    const input = { draftId: draft.id, version: draft.version, kind: "QUOTE_COPY" as const, sourceId: quote.id, sourceHash: selected.sourceHash, attachmentId: randomUUID() }
    const attach = (data = input) => asActor(() => attachCrmEmailDocument(company.id, user.id, data))
    const files = async () => {
      const raw = await asActor(() => readEmailDraft(company.id, user.id, draft.id))
      const files = emailAttachmentsSchema.parse(raw.attachments); paths.push(...files.map(file => file.relativePath)); return files
    }
    return { company, user, member, client, contact, quote, draft, fields, context, asActor, list, input, attach, files, line: quote.versions[0].sections[0].lines[0] }
  }

  it("paginates 551 quotes, searches without exposing rendering data and excludes records without a version", async () => {
    const f = await fixture()
    await prisma.$transaction(async tx => {
      for (let index = 0; index < 550; index++) await tx.quote.create({ data: { companyId: f.company.id, clientId: f.client.id, number: `VOLUME-${String(index).padStart(3, "0")}`, object: "Fictional volume", versions: { create: { version: 1, totalHtCents: 0, totalTvaCents: 0, totalTtcCents: 0 } } } })
      await tx.quote.create({ data: { companyId: f.company.id, clientId: f.client.id, number: "NO-VERSION", object: "Not available" } })
    }, { timeout: 20_000 })
    await f.asActor(async () => {
      const first = await listCrmEmailDocuments(f.company.id, f.user.id, { draftId: f.draft.id, kind: "QUOTE_COPY" })
      const last = await listCrmEmailDocuments(f.company.id, f.user.id, { draftId: f.draft.id, kind: "QUOTE_COPY", page: 999 })
      expect(first).toMatchObject({ total: 551, pageCount: 23 }); expect(first.documents).toHaveLength(25); expect(last.documents).toHaveLength(1)
      const found = await listCrmEmailDocuments(f.company.id, f.user.id, { draftId: f.draft.id, kind: "QUOTE_COPY", search: "volume-549" })
      expect(found.documents[0]).toMatchObject({ name: "VOLUME-549-v1-copie.pdf", quoteVersion: 1 })
      expect(JSON.stringify(first)).not.toContain(f.company.email); expect(first.documents[0]).not.toHaveProperty("html")
    })
    expect(mocks.generate).not.toHaveBeenCalled()
  })

  it("persists distinct revision/PDF hashes privately and retries after source deletion without regenerating", async () => {
    const f = await fixture(), added = await f.attach()
    const file = (await f.files())[0]
    expect(file.source).toMatchObject({ kind: "QUOTE_COPY", id: f.quote.id, version: 1, fingerprint: f.input.sourceHash })
    expect(file.sha256).not.toBe(f.input.sourceHash); expect(file.relativePath).toContain(`private/${f.company.id}/email-draft/${f.draft.id}/`)
    expect(added.attachments[0]).not.toHaveProperty("source"); expect(added.attachments[0]).not.toHaveProperty("relativePath")
    expect(mocks.generate.mock.calls[0][0]).toContain("Fictional installation"); expect(mocks.generate.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal)
    await f.asActor(() => saveEmailDraft(f.company.id, f.user.id, { ...f.fields, id: f.draft.id, version: added.version, subject: "Later private draft" }))
    expect((await f.files())[0].source).toEqual(file.source)
    await prisma.quote.delete({ where: { id: f.quote.id } })
    expect((await f.attach()).version).toBe(3)
    expect(mocks.generate).toHaveBeenCalledTimes(1)
    expect((await readEmailAttachmentBytes(f.company.id, file)).bytes).toEqual(Buffer.from("%PDF-fictional generated current quote"))
    await expect(f.attach({ ...f.input, sourceHash: "a".repeat(64) })).rejects.toThrow("autre contenu")
  })

  it("refuses edits to lines without a version/date increment, identities, options and image bytes behind an unchanged URL", async () => {
    const f = await fixture(), updatedAt = f.quote.updatedAt
    await prisma.quoteLine.update({ where: { id: f.line.id }, data: { label: "Revised line at the same v1" } })
    await expect(f.attach()).rejects.toThrow("modifiés")
    expect((await prisma.quote.findUniqueOrThrow({ where: { id: f.quote.id } })).updatedAt).toEqual(updatedAt)
    for (const mutate of [
      () => prisma.company.update({ where: { id: f.company.id }, data: { fullName: "Changed current issuer" } }),
      () => prisma.client.update({ where: { id: f.client.id }, data: { address: "Changed current recipient" } }),
      () => prisma.company.update({ where: { id: f.company.id }, data: { pdfTemplate: f.company.pdfTemplate === "MINIMAL" ? "PROFESSIONAL" : "MINIMAL" } }),
    ]) {
      const input = { ...f.input, sourceHash: (await f.list()).documents[0].sourceHash }
      await mutate(); await expect(f.attach(input)).rejects.toThrow("modifiés")
    }
    await prisma.company.update({ where: { id: f.company.id }, data: { logo: "https://logo.example.test/current.png" } })
    let image = "first-fictitious-image"
    vi.spyOn(images, "inlineSafePdfImages").mockImplementation(async html => html.replace("https://logo.example.test/current.png", `data:image/png;base64,${Buffer.from(image).toString("base64")}`))
    const input = { ...f.input, sourceHash: (await f.list()).documents[0].sourceHash }
    image = "changed-fictitious-image"
    await expect(f.attach(input)).rejects.toThrow("modifiés")
    expect(mocks.generate).not.toHaveBeenCalled(); expect(await f.files()).toEqual([])
  })

  it("refuses a change or revoked author during generation before storing any copy", async () => {
    const f = await fixture()
    mocks.generate.mockImplementationOnce(async () => { await prisma.quoteLine.update({ where: { id: f.line.id }, data: { label: "Changed during rendering" } }); return Buffer.from("%PDF-fictional stale output") })
    await expect(f.attach()).rejects.toThrow("pendant la génération")
    const input = { ...f.input, sourceHash: (await f.list()).documents[0].sourceHash }
    mocks.generate.mockImplementationOnce(async () => { await prisma.membership.update({ where: { id: f.member.id }, data: { status: "SUSPENDED" } }); return Buffer.from("%PDF-fictional revoked output") })
    await expect(f.attach(input)).rejects.toThrow("droits")
    expect(await f.files()).toEqual([])
  })

  it("denies other authors, clients, companies and a role without Sales access", async () => {
    const f = await fixture(), other = await fixture()
    await other.asActor(async () => await expect(attachCrmEmailDocument(other.company.id, other.user.id, f.input)).rejects.toThrow("Brouillon"))
    const colleague = await prisma.user.create({ data: { name: "Fictional colleague" } }); users.push(colleague.id)
    await requestContext.run({ ...f.context, userId: colleague.id }, async () => await expect(attachCrmEmailDocument(f.company.id, colleague.id, f.input)).rejects.toThrow("Brouillon"))
    await expect(f.attach({ ...f.input, sourceId: other.quote.id })).rejects.toThrow("indisponible")
    const client = await prisma.client.create({ data: { companyId: f.company.id, name: "Wrong fictional client" } })
    const wrong = await prisma.quote.create({ data: { companyId: f.company.id, clientId: client.id, number: "WRONG-CLIENT", object: "Wrong", versions: { create: { version: 1, totalHtCents: 0, totalTvaCents: 0, totalTtcCents: 0 } } } })
    await expect(f.attach({ ...f.input, sourceId: wrong.id })).rejects.toThrow("indisponible")
    await requestContext.run({ ...f.context, role: "SERVICE" }, async () => {
      await expect(listCrmEmailDocuments(f.company.id, f.user.id, { draftId: f.draft.id, kind: "QUOTE_COPY" })).rejects.toThrow("droits")
      await expect(attachCrmEmailDocument(f.company.id, f.user.id, f.input)).rejects.toThrow("droits")
    })
    expect(mocks.generate).not.toHaveBeenCalled(); expect(await f.files()).toEqual([])
  })

  it("keeps existing files intact on stale, scheduled, public-demo and quota refusals", async () => {
    const f = await fixture()
    const edited = await f.asActor(() => saveEmailDraft(f.company.id, f.user.id, { ...f.fields, id: f.draft.id, version: 1, subject: "Newer draft" }))
    await expect(f.attach()).rejects.toThrow("Conflit")
    await prisma.emailDraft.update({ where: { id: f.draft.id }, data: { scheduledAt: new Date(Date.now() + 100_000) } })
    await expect(f.attach({ ...f.input, version: edited.version })).rejects.toThrow("programmé")
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    expect((await f.list()).total).toBe(1)
    await expect(f.attach()).rejects.toThrow("lecture seule")
    vi.unstubAllEnvs(); vi.stubEnv("FILE_STORAGE_DRIVER", "local")
    await prisma.emailDraft.update({ where: { id: f.draft.id }, data: { scheduledAt: null } })
    let draft = edited
    for (let index = 0; index < 5; index++) {
      const bytes = Buffer.from(`%PDF-existing private file ${index}`), name = `file-${index}.pdf`
      const metadata = { id: randomUUID(), name, type: "application/pdf", size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") }
      draft = await f.asActor(() => addEmailDraftAttachment(f.company.id, f.user.id, f.draft.id, draft.version, metadata, async () => {
        const stored = await storeFileBytes({ companyId: f.company.id, kind: "email-draft", resourceId: f.draft.id, originalName: name, type: metadata.type, bytes }); paths.push(stored.relativePath); return stored
      }))
    }
    await expect(f.attach({ ...f.input, version: draft.version })).rejects.toThrow("Limites")
    expect((await f.files()).map(file => file.sha256)).toEqual(draft.attachments.map(file => file.sha256))
    expect(mocks.generate).not.toHaveBeenCalled()
  })

  it("refuses generator failures, invalid or oversized outputs and oversized source data without writing", async () => {
    const f = await fixture()
    mocks.generate.mockRejectedValueOnce(new Error("Fictional renderer incident"))
    await expect(f.attach()).rejects.toThrow("Génération")
    const big = Buffer.alloc(MAX_EMAIL_FILE_BYTES + 1, 32); big.write("%PDF-oversized")
    mocks.generate.mockResolvedValueOnce(big)
    await expect(f.attach()).rejects.toThrow("5 Mo")
    mocks.generate.mockResolvedValueOnce(Buffer.from("not a PDF"))
    await expect(f.attach()).rejects.toThrow("invalide")
    await prisma.quoteLine.update({ where: { id: f.line.id }, data: { description: "x".repeat(1024 * 1024) } })
    await expect(f.list()).rejects.toThrow("1 Mo")
    await prisma.quoteLine.update({ where: { id: f.line.id }, data: { description: null } })
    await prisma.quoteLine.createMany({ data: Array.from({ length: 500 }, () => ({ sectionId: f.line.sectionId, label: "Fictional bounded line", quantity: 1, unitPriceCents: 100, tvaRate: 20 })) })
    await expect(f.list()).rejects.toThrow("500 lignes")
    expect(await f.files()).toEqual([])
  })

  it("excludes a second generation and refuses a draft changed while the first render is pending", async () => {
    const f = await fixture()
    let release!: () => void
    const pending = new Promise<void>(resolve => { release = resolve })
    mocks.generate.mockImplementationOnce(async () => { await pending; return Buffer.from("%PDF-fictional pending render") })
    const first = f.attach(), assertion = expect(first).rejects.toThrow("Conflit")
    await vi.waitFor(() => expect(mocks.generate).toHaveBeenCalledTimes(1))
    await expect(f.attach({ ...f.input, attachmentId: randomUUID() })).rejects.toThrow("déjà en cours")
    await f.asActor(() => saveEmailDraft(f.company.id, f.user.id, { ...f.fields, id: f.draft.id, version: 1, subject: "Edited during render" }))
    release(); await assertion
    expect(await f.files()).toEqual([]); expect(mocks.generate).toHaveBeenCalledTimes(1)
  })
  it("strips upload-supplied provenance so an uploaded file cannot impersonate a server-generated quote", async () => {
    const f = await fixture(), bytes = Buffer.from("%PDF-fictional uploaded file")
    const metadata = { id: f.input.attachmentId, name: "uploaded.pdf", type: "application/pdf", size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"),
      source: { kind: "QUOTE_COPY", id: f.quote.id, version: 1, fingerprint: f.input.sourceHash, copiedAt: new Date().toISOString() } }
    await f.asActor(() => addEmailDraftAttachment(f.company.id, f.user.id, f.draft.id, 1, metadata, async () => {
      const file = await storeFileBytes({ companyId: f.company.id, kind: "email-draft", resourceId: f.draft.id, originalName: metadata.name, type: metadata.type, bytes }); paths.push(file.relativePath); return file
    }))
    expect((await f.files())[0]).not.toHaveProperty("source")
    await expect(f.attach()).rejects.toThrow("autre contenu")
    expect(mocks.generate).not.toHaveBeenCalled()
  })
})
