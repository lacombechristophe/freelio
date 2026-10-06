import { randomUUID, createHash } from "node:crypto"
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest"
const actor = vi.hoisted(() => ({ companyId: "", userId: "", role: "OWNER" as const, agencyIds: null, membershipId: "fiction" }))
const mocks = vi.hoisted(() => ({ pdf: vi.fn(async () => Buffer.from("%PDF-fictional frozen contract archive")) }))
vi.mock("server-only", () => ({}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-real-ip": "198.51.100.20", "user-agent": "Fictional contract recipe" }) }))
vi.mock("@/lib/audit", () => ({ logAction: vi.fn() }))
vi.mock("@/lib/rate-limit", () => ({ signatureRateLimit: { limit: async () => ({ success: true }) } }))
vi.mock("@/lib/auth-wrapper", async () => {
  const { requestContext } = await import("@/lib/context")
  const { assertDemoMutationAllowed } = await import("@/lib/demo-policy")
  const db = (await import("@/lib/prisma")).default
  return { AuthorizationError: class extends Error {},
    withAuth: async (task: (context: typeof actor) => Promise<unknown>, permission = "sales.write") => {
      if (!permission.endsWith(".read")) assertDemoMutationAllowed()
      return requestContext.run({ ...actor, actionPermission: permission as "sales.write" }, () => task(actor))
    }, resolveAuthContext: async () => {
      const member = await db.membership.findUnique({ where: { companyId_userId: { companyId: actor.companyId, userId: actor.userId } } })
      return member?.status === "ACTIVE" ? { ...actor, role: member.role } : null
    } }
})
vi.mock("@/lib/pdf/generator", async original => ({ ...await original<typeof import("@/lib/pdf/generator")>(), generatePdfFromHtml: mocks.pdf }))

import prisma from "@/lib/prisma"
import { requestContext } from "@/lib/context"
import { decrypt, encrypt } from "@/lib/crypto"
import { updateContractStatus, getPublicContractForSigning, signContractPublic, compileContractContent } from "@/actions/contrats"
import { prepareContractSnapshot, readContractSnapshot, sealContractSnapshot, processDueContractArchives, readContractArchive } from "@/lib/contracts/archive"
import { saveEmailDraft } from "@/lib/communications/drafts"
import { listCrmEmailDocuments, attachCrmEmailDocument } from "@/lib/communications/crm-documents"
import { readLocalFile, removeLocalFile } from "@/lib/local-files"
import * as images from "@/lib/pdf/images"
import { buildBackupPayload } from "@/lib/backup"
import { verifyReversibilityExport } from "@/lib/backup-integrity"

const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex")
// Actual PNG bytes, including the signature prefix required by the public action.
const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jskYAAAAASUVORK5CYII="
describe.sequential("frozen contract signing and durable private archives", () => {
  const companies: string[] = [], users: string[] = [], paths: string[] = []
  beforeEach(() => { mocks.pdf.mockReset().mockResolvedValue(Buffer.from("%PDF-fictional frozen contract archive")); vi.stubEnv("FILE_STORAGE_DRIVER", "local") })
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })
  afterAll(async () => {
    for (const companyId of companies) {
      const archives = await prisma.contract.findMany({ where: { companyId }, select: { pdfUrl: true } })
      for (const file of archives) if (file.pdfUrl) paths.push(file.pdfUrl)
      await prisma.contractSigningToken.deleteMany({ where: { contract: { companyId } } })
      await prisma.contractSignature.deleteMany({ where: { contract: { companyId } } })
      await prisma.contract.deleteMany({ where: { companyId } })
      await prisma.contact.deleteMany({ where: { client: { companyId } } })
      await prisma.client.deleteMany({ where: { companyId } })
      await prisma.company.delete({ where: { id: companyId } })
    }
    for (const file of paths) await removeLocalFile(file).catch(() => undefined)
    await prisma.user.deleteMany({ where: { id: { in: users } } })
  })
  async function fixture() {
    const company = await prisma.company.create({ data: { name: "Fictional frozen company", address: "Fictional original company address" } }); companies.push(company.id)
    const user = await prisma.user.create({ data: { name: "Fictional contract author" } }); users.push(user.id)
    const member = await prisma.membership.create({ data: { companyId: company.id, userId: user.id, role: "OWNER", status: "ACTIVE" } })
    actor.companyId = company.id; actor.userId = user.id; actor.membershipId = member.id
    const context = { ...actor }
    const client = await prisma.client.create({ data: { companyId: company.id, name: "Fictional original client", address: "Fictional original client address" } })
    const contact = await prisma.contact.create({ data: { clientId: client.id, firstName: "Fiction", lastName: "Signer", email: "signer@example.test", isPrimary: true } })
    const contract = await prisma.contract.create({ data: { companyId: company.id, clientId: client.id, number: "CONT-FICTION-001", title: "Fictional agreement", content: "<p>{{client.name}} — {{entreprise.name}} — {{client.email}}</p>" } })
    const asActor = <T>(task: () => Promise<T>) => requestContext.run(context, task)
    const sent = async () => {
      actor.companyId = company.id; actor.userId = user.id; actor.membershipId = member.id
      const result = await updateContractStatus(contract.id, "SENT")
      const token = result.signingPath!.split("/").at(-1)!
      const shown = (await getPublicContractForSigning(token))!
      return { token, shown, signature: { documentHash: shown.documentHash, signerName: "Fictional signer", signerEmail: contact.email!, canvasData: png } }
    }
    return { company, user, member, client, contact, contract, context, asActor, sent }
  }

  it("freezes compiled variables, identities and fonts, seals the presented hash and generates once despite later edits", async () => {
    const f = await fixture(), { token, shown, signature } = await f.sent()
    const link = await prisma.contractSigningToken.findFirstOrThrow({ where: { contractId: f.contract.id } })
    expect(link.documentSnapshot).not.toContain("Fictional original client")
    expect(decrypt(link.documentSnapshot!)).toContain("data:font/woff2;base64,")
    await prisma.company.update({ where: { id: f.company.id }, data: { name: "Changed current company", address: "Changed current address" } })
    await prisma.client.update({ where: { id: f.client.id }, data: { name: "Changed current client", address: "Changed current client address" } })
    expect(await getPublicContractForSigning(token)).toEqual(shown)
    const signed = await signContractPublic(token, signature)
    expect(signed).toMatchObject({ ok: true, archiveStatus: "PENDING" })
    expect(await compileContractContent(f.contract.id)).toBe(shown.content)
    expect(await signContractPublic(token, signature)).toMatchObject({ ok: false, error: expect.stringContaining("utilisé") })
    expect(await processDueContractArchives({ companyId: f.company.id })).toEqual({ examined: 1, generated: 1, failed: 0 })
    const stored = await prisma.contract.findUniqueOrThrow({ where: { id: f.contract.id } })
    expect(stored.archiveStatus).toBe("READY")
    const archive = await readContractArchive(stored)
    expect(archive.html).toContain("Fictional original client address")
    expect(archive.html).not.toContain("Changed current")
    expect(archive.html).toContain("Fictional signer")
    expect(archive.html).toContain('data-status="signed"')
    expect(archive.documentHash).toBe(shown.documentHash)
    expect(stored.pdfHash).toBe(hash(archive.pdf))
    expect(await processDueContractArchives({ companyId: f.company.id })).toEqual({ examined: 0, generated: 0, failed: 0 })
    expect(mocks.pdf).toHaveBeenCalledTimes(1)
  })

  it("refuses source edits even at the same updatedAt, unshown hashes and revoked links without consuming a signature", async () => {
    const f = await fixture(), first = await f.sent()
    expect(await signContractPublic(first.token, { ...first.signature, canvasData: "data:image/png;base64," + "A".repeat(100) })).toMatchObject({ ok: false, error: expect.stringContaining("signature invalide") })
    expect(await signContractPublic(first.token, { ...first.signature, documentHash: "a".repeat(64) })).toMatchObject({ ok: false, error: expect.stringContaining("changé") })
    const sent = await prisma.contract.findUniqueOrThrow({ where: { id: f.contract.id } })
    await prisma.contract.update({ where: { id: sent.id }, data: { content: "<p>Changed at identical timestamp</p>", updatedAt: sent.updatedAt } })
    expect(await getPublicContractForSigning(first.token)).toBeNull()
    expect(await signContractPublic(first.token, first.signature)).toMatchObject({ ok: false, error: expect.stringContaining("changé") })
    expect(await prisma.contractSignature.count({ where: { contractId: sent.id } })).toBe(0)
    expect((await prisma.contractSigningToken.findFirstOrThrow({ where: { contractId: sent.id } })).usedAt).toBeNull()
    const second = await f.sent()
    expect(second.token).not.toBe(first.token)
    expect(await getPublicContractForSigning(first.token)).toBeNull()
    expect(await signContractPublic(first.token, first.signature)).toMatchObject({ ok: false, error: expect.stringContaining("expiré") })
    expect(second.shown.content).toContain("Changed at identical timestamp")
    await signContractPublic(second.token, second.signature)
  })

  it("claims only one signature under concurrent submission and rolls back its token when the contract expires", async () => {
    const f = await fixture(), prepared = await f.sent()
    const attempts = await Promise.all([signContractPublic(prepared.token, prepared.signature), signContractPublic(prepared.token, prepared.signature)])
    expect(attempts.filter(attempt => attempt.ok)).toHaveLength(1)
    expect(attempts.filter(attempt => !attempt.ok)).toHaveLength(1)
    expect(await prisma.contractSignature.count({ where: { contractId: f.contract.id } })).toBe(1)
    const expired = await fixture(), stale = await expired.sent()
    await prisma.contract.update({ where: { id: expired.contract.id }, data: { status: "EXPIRED" } })
    expect(await signContractPublic(stale.token, stale.signature)).toMatchObject({ ok: false, error: expect.stringContaining("disponible") })
    expect((await prisma.contractSigningToken.findFirstOrThrow({ where: { contractId: expired.contract.id } })).usedAt).toBeNull()
    expect(await prisma.contractSignature.count({ where: { contractId: expired.contract.id } })).toBe(0)
  })

  it("preserves a signed snapshot after PDF failure, resumes durably and stops after five failures", async () => {
    const f = await fixture(), prepared = await f.sent()
    await signContractPublic(prepared.token, prepared.signature)
    mocks.pdf.mockRejectedValueOnce(new Error("Fictional render incident"))
    expect(await processDueContractArchives({ companyId: f.company.id })).toEqual({ examined: 1, generated: 0, failed: 1 })
    const failed = await prisma.contract.findUniqueOrThrow({ where: { id: f.contract.id } })
    expect(failed).toMatchObject({ status: "SIGNED", archiveStatus: "FAILED", archiveAttempts: 1, pdfUrl: null })
    expect(failed.signedDocument).toBeTruthy()
    await expect(readContractArchive(failed)).rejects.toThrow("préparation")
    await prisma.contract.update({ where: { id: failed.id }, data: { archiveNextAttemptAt: new Date(0) } })
    expect((await processDueContractArchives({ companyId: f.company.id })).generated).toBe(1)
    expect(await prisma.contractSignature.count({ where: { contractId: failed.id } })).toBe(1)
    const terminal = await fixture(), another = await terminal.sent(); await signContractPublic(another.token, another.signature)
    await prisma.contract.update({ where: { id: terminal.contract.id }, data: { archiveAttempts: 4, archiveNextAttemptAt: new Date(0) } })
    mocks.pdf.mockRejectedValueOnce(new Error("Fictional final failure"))
    await processDueContractArchives({ companyId: terminal.company.id })
    expect(await prisma.contract.findUniqueOrThrow({ where: { id: terminal.contract.id } })).toMatchObject({ archiveAttempts: 5, archiveStatus: "FAILED", archiveNextAttemptAt: null })
    expect((await processDueContractArchives({ companyId: terminal.company.id })).examined).toBe(0)
  })

  it("retires an interrupted fifth attempt only after its recovery deadline without regenerating or losing the signature", async () => {
    const f = await fixture(), prepared = await f.sent()
    await signContractPublic(prepared.token, prepared.signature)
    const signed = await prisma.contract.findUniqueOrThrow({ where: { id: f.contract.id } })
    await prisma.contract.update({ where: { id: signed.id }, data: { archiveAttempts: 5, archiveNextAttemptAt: new Date(Date.now() + 60_000) } })
    expect(await processDueContractArchives({ companyId: f.company.id })).toEqual({ examined: 0, generated: 0, failed: 0 })
    await prisma.contract.update({ where: { id: signed.id }, data: { archiveNextAttemptAt: new Date(0) } })
    const foreign = await fixture()
    expect(await processDueContractArchives({ companyId: foreign.company.id })).toEqual({ examined: 0, generated: 0, failed: 0 })
    expect((await prisma.contract.findUniqueOrThrow({ where: { id: signed.id } })).archiveStatus).toBe("PENDING")
    expect(await processDueContractArchives({ companyId: f.company.id })).toEqual({ examined: 1, generated: 0, failed: 1 })
    expect(await prisma.contract.findUniqueOrThrow({ where: { id: signed.id } })).toMatchObject({ status: "SIGNED", signedDocument: signed.signedDocument, archiveAttempts: 5, archiveStatus: "FAILED", archiveNextAttemptAt: null, archiveError: expect.any(String), pdfUrl: null, pdfHash: null })
    expect(await prisma.contractSignature.count({ where: { contractId: signed.id } })).toBe(1)
    expect(await processDueContractArchives({ companyId: f.company.id })).toEqual({ examined: 0, generated: 0, failed: 0 })
    expect(mocks.pdf).not.toHaveBeenCalled()
  })

  it("refuses historical or transplanted snapshots, tampered archives and foreign storage references", async () => {
    const f = await fixture()
    await prisma.contract.update({ where: { id: f.contract.id }, data: { status: "SIGNED" } })
    const historical = await prisma.contract.findUniqueOrThrow({ where: { id: f.contract.id } })
    await expect(readContractArchive(historical)).rejects.toThrow("historique")
    expect((await processDueContractArchives({ companyId: f.company.id })).examined).toBe(0)
    const real = await fixture(), prepared = await real.sent(); await signContractPublic(prepared.token, prepared.signature)
    await processDueContractArchives({ companyId: real.company.id })
    const ready = await prisma.contract.findUniqueOrThrow({ where: { id: real.contract.id } })
    await expect(readContractArchive({ ...ready, signedDocument: encrypt(JSON.stringify({ ...JSON.parse(decrypt(ready.signedDocument!)), companyId: f.company.id })) })).rejects.toThrow("périmètre")
    await expect(readContractArchive({ ...ready, pdfHash: "a".repeat(64) })).rejects.toThrow("altérée")
    await expect(readContractArchive({ ...ready, pdfUrl: `https://example.test/private.pdf` })).rejects.toThrow("périmètre")
    await expect(readContractArchive({ ...ready, pdfUrl: `local:${ready.companyId}/generated/${ready.id}/../other.pdf` })).rejects.toThrow("périmètre")
  })

  it("lists only signed archives for the recipient, copies exact bytes privately and reuses the copy after source deletion", async () => {
    const f = await fixture(), prepared = await f.sent(); await signContractPublic(prepared.token, prepared.signature)
    await processDueContractArchives({ companyId: f.company.id })
    const draft = await f.asActor(() => saveEmailDraft(f.company.id, f.user.id, { createKey: randomUUID(), contactId: f.contact.id, subject: "Fictional archived document", bodyHtml: "<p>Private content</p>", cc: [], bcc: [] }))
    const query = { draftId: draft.id, kind: "SIGNED_CONTRACT" }
    const listed = await f.asActor(() => listCrmEmailDocuments(f.company.id, f.user.id, query))
    expect(listed.total).toBe(1); expect(JSON.stringify(listed)).not.toMatch(/signedDocument|relativePath|contentHtml|data:font/)
    const file = listed.documents[0], selection = { ...query, version: draft.version, sourceId: file.id, sourceHash: file.sourceHash, attachmentId: randomUUID() }
    const copied = await f.asActor(() => attachCrmEmailDocument(f.company.id, f.user.id, selection))
    const privateFile = await prisma.emailDraft.findUniqueOrThrow({ where: { id: draft.id } })
    const files = privateFile.attachments as { relativePath: string }[]; paths.push(files[0].relativePath)
    expect(await readLocalFile(files[0].relativePath)).toEqual(Buffer.from("%PDF-fictional frozen contract archive"))
    await prisma.contractSignature.deleteMany({ where: { contractId: f.contract.id } })
    await prisma.contractSigningToken.deleteMany({ where: { contractId: f.contract.id } })
    const archived = await prisma.contract.delete({ where: { id: f.contract.id } }); paths.push(archived.pdfUrl!)
    expect(await f.asActor(() => attachCrmEmailDocument(f.company.id, f.user.id, selection))).toEqual(copied)
    await requestContext.run({ ...f.context, role: "SERVICE" }, async () => {
      await expect(listCrmEmailDocuments(f.company.id, f.user.id, query)).rejects.toThrow("droits")
    })
    expect(mocks.pdf).toHaveBeenCalledTimes(1)
  })

  it("refuses malformed/oversized output and public-demo writes while preserving the signature", async () => {
    const f = await fixture(), prepared = await f.sent()
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    await expect(signContractPublic(prepared.token, prepared.signature)).rejects.toThrow("lecture seule")
    await expect(processDueContractArchives()).rejects.toThrow("lecture seule")
    vi.unstubAllEnvs(); vi.stubEnv("FILE_STORAGE_DRIVER", "local")
    await signContractPublic(prepared.token, prepared.signature)
    const tooBig = Buffer.alloc(5 * 1024 * 1024 + 1, 32); tooBig.write("%PDF-too large")
    mocks.pdf.mockResolvedValueOnce(tooBig)
    expect((await processDueContractArchives({ companyId: f.company.id })).failed).toBe(1)
    await prisma.contract.update({ where: { id: f.contract.id }, data: { archiveNextAttemptAt: new Date(0) } })
    mocks.pdf.mockResolvedValueOnce(Buffer.from("invalid PDF"))
    expect((await processDueContractArchives({ companyId: f.company.id })).failed).toBe(1)
    expect(await prisma.contract.findUniqueOrThrow({ where: { id: f.contract.id } })).toMatchObject({ status: "SIGNED", pdfUrl: null, pdfHash: null })
    expect(await prisma.contractSignature.count({ where: { contractId: f.contract.id } })).toBe(1)
  })

  it("rejects a disconnected author after capture and a foreign company's archive before private copying", async () => {
    const f = await fixture(), original = images.inlineSafePdfImages
    vi.spyOn(images, "inlineSafePdfImages").mockImplementationOnce(async (...args) => {
      const html = await original(...args)
      await prisma.membership.update({ where: { id: f.member.id }, data: { status: "SUSPENDED" } })
      return html
    })
    await expect(updateContractStatus(f.contract.id, "SENT")).rejects.toThrow()
    expect(await prisma.contract.findUniqueOrThrow({ where: { id: f.contract.id } })).toMatchObject({ status: "DRAFT" })
    expect(await prisma.contractSigningToken.count({ where: { contractId: f.contract.id } })).toBe(0)
    const foreign = await fixture(), prepared = await foreign.sent(); await signContractPublic(prepared.token, prepared.signature)
    await processDueContractArchives({ companyId: foreign.company.id })
    const source = await prisma.contract.findUniqueOrThrow({ where: { id: foreign.contract.id } })
    await prisma.membership.update({ where: { id: f.member.id }, data: { status: "ACTIVE" } })
    const draft = await f.asActor(() => saveEmailDraft(f.company.id, f.user.id, { createKey: randomUUID(), contactId: f.contact.id, subject: "Fictional cross-company refusal", bodyHtml: "<p>Private content</p>", cc: [], bcc: [] }))
    await expect(f.asActor(() => attachCrmEmailDocument(f.company.id, f.user.id, { draftId: draft.id, version: draft.version, kind: "SIGNED_CONTRACT", sourceId: source.id, sourceHash: source.pdfHash!, attachmentId: randomUUID() }))).rejects.toThrow("indisponible")
    expect((await prisma.emailDraft.findUniqueOrThrow({ where: { id: draft.id } })).attachments).toEqual([])
  })

  it("rejects forged capture hashes and scope before sealing, with bounded content", async () => {
    const f = await fixture(), raw = await prisma.contract.findUniqueOrThrow({ where: { id: f.contract.id }, include: { client: { include: { contacts: true } }, company: true } })
    const capture = await prepareContractSnapshot(raw)
    expect(() => readContractSnapshot(capture.documentSnapshot, "a".repeat(64), raw)).toThrow("invalide")
    expect(() => readContractSnapshot(capture.documentSnapshot, capture.documentHash, { ...raw, clientId: "cforeignclient000000000000" })).toThrow("périmètre")
    expect(() => sealContractSnapshot({ ...capture.snapshot, html: "<p>Missing slots</p>" }, capture.documentHash, { signerName: "Fiction", signerEmail: "fiction@example.test", signedAt: new Date(), canvasData: png })).toThrow("incompatible")
    await expect(prepareContractSnapshot({ ...raw, content: "x".repeat(1024 * 1024 + 1) })).rejects.toThrow("1 Mo")
  })

  it("includes the encrypted signed capture and verified PDF in company reversibility without exporting bearer links", async () => {
    const f = await fixture(), prepared = await f.sent(); await signContractPublic(prepared.token, prepared.signature)
    await processDueContractArchives({ companyId: f.company.id })
    const archived = await prisma.contract.findUniqueOrThrow({ where: { id: f.contract.id } })
    const backup = await buildBackupPayload(f.user.id, f.company.id)
    expect(verifyReversibilityExport(backup).ok).toBe(true)
    expect(backup.tables.find(table => table.model === "Contract")!.rows[0].signedDocument).toBe(archived.signedDocument)
    expect(backup.tables.some(table => table.model === "ContractSigningToken")).toBe(false)
    const file = backup.files.find(file => file.references.some(reference => reference.model === "Contract" && reference.recordId === f.contract.id))!
    expect(file.status).toBe("EMBEDDED"); expect(file.sha256).toBe(archived.pdfHash)
    expect(Buffer.from(file.contentBase64!, "base64")).toEqual(Buffer.from("%PDF-fictional frozen contract archive"))
  })
})
