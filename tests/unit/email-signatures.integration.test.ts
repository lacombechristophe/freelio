import { afterAll, afterEach, describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
import prisma from "@/lib/prisma"
import { requestContext } from "@/lib/context"
import { getEmailSignature, saveEmailSignature } from "@/lib/communications/signatures"
import { buildBackupPayload, restoreBackupPayload } from "@/lib/backup"

describe.sequential("personal signatures on SQL", () => {
  const companies: string[] = [], users: string[] = []
  afterEach(() => vi.unstubAllEnvs())
  afterAll(async () => {
    await prisma.company.deleteMany({ where: { id: { in: companies } } })
    await prisma.user.deleteMany({ where: { id: { in: users } } })
  })
  async function fixture() {
    const company = await prisma.company.create({ data: { name: "Fictional personal signatures" } }); companies.push(company.id)
    const author = await prisma.user.create({ data: { name: "Fictional author" } }); users.push(author.id)
    const colleague = await prisma.user.create({ data: { name: "Fictional admin" } }); users.push(colleague.id)
    return { companyId: company.id, authorId: author.id, colleagueId: colleague.id }
  }
  it("normalizes line endings, permits empty removal and rejects controls and oversized input before SQL writes", async () => {
    const f = await fixture()
    expect(await getEmailSignature(f.companyId, f.authorId)).toEqual({ text: "", version: null })
    const first = await saveEmailSignature(f.companyId, f.authorId, { text: "  Équipe\r\nFiction & <texte>  ", version: null })
    expect(first).toEqual({ text: "Équipe\nFiction & <texte>", version: 1 })
    await expect(saveEmailSignature(f.companyId, f.authorId, { text: "x".repeat(4001), version: 1 })).rejects.toThrow()
    await expect(saveEmailSignature(f.companyId, f.authorId, { text: "bad\u0000text", version: 1 })).rejects.toThrow()
    expect(await getEmailSignature(f.companyId, f.authorId)).toEqual(first)
    expect(await saveEmailSignature(f.companyId, f.authorId, { text: "", version: 1 })).toEqual({ text: "", version: 2 })
  })
  it("keeps guessed records and nested includes/counts private from admins and foreign companies", async () => {
    const f = await fixture(), foreign = await fixture()
    await saveEmailSignature(f.companyId, f.authorId, { text: "Private fixture only", version: null })
    const record = await prisma.emailSignature.findFirstOrThrow({ where: { companyId: f.companyId } })
    for (const [companyId, userId] of [[f.companyId, f.colleagueId], [foreign.companyId, f.authorId]]) {
      expect(await getEmailSignature(companyId, userId)).toEqual({ text: "", version: null })
      await requestContext.run({ companyId, userId, role: "ADMIN", membershipId: "fiction", agencyIds: null, actionPermission: "automation.write" }, async () => {
        expect(await prisma.emailSignature.findUnique({ where: { id: record.id } })).toBeNull()
        expect((await prisma.emailSignature.updateMany({ where: { id: record.id }, data: { text: "Forbidden" } })).count).toBe(0)
        expect((await prisma.emailSignature.deleteMany({ where: { id: record.id } })).count).toBe(0)
        const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId }, include: { emailSignatures: true, _count: { select: { emailSignatures: true } } } })
        expect(company.emailSignatures).toEqual([]); expect(company._count.emailSignatures).toBe(0)
        const user = await prisma.user.findUniqueOrThrow({ where: { id: f.authorId }, select: { emailSignatures: true } })
        expect(user.emailSignatures).toEqual([])
        if (userId !== f.authorId) await expect(prisma.emailSignature.create({ data: { companyId, authorUserId: f.authorId, text: "Forbidden" } })).rejects.toThrow("DRAFT_ACCESS_DENIED")
      })
    }
    expect((await getEmailSignature(f.companyId, f.authorId)).text).toBe("Private fixture only")
  })
  it("prevents stale updates and makes only one concurrent revision win", async () => {
    const f = await fixture()
    const first = await saveEmailSignature(f.companyId, f.authorId, { text: "First", version: null })
    await expect(saveEmailSignature(f.companyId, f.authorId, { text: "Stale creation", version: null })).rejects.toThrow("autre onglet")
    const writes = await Promise.allSettled(["A", "B"].map(text => saveEmailSignature(f.companyId, f.authorId, { text, version: first.version })))
    expect(writes.filter(item => item.status === "fulfilled")).toHaveLength(1)
    expect(writes.filter(item => item.status === "rejected")).toHaveLength(1)
    const current = await getEmailSignature(f.companyId, f.authorId)
    expect(current.version).toBe(2)
    await expect(saveEmailSignature(f.companyId, f.authorId, { text: "Stale", version: 1 })).rejects.toThrow("autre onglet")
    expect(await getEmailSignature(f.companyId, f.authorId)).toEqual(current)
  })
  it("does not let concurrent first saves replace each other's signature", async () => {
    const f = await fixture()
    const results = await Promise.allSettled(["First A", "First B"].map(text => saveEmailSignature(f.companyId, f.authorId, { text, version: null })))
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1)
    const winner = results.find(result => result.status === "fulfilled")
    if (!winner || winner.status !== "fulfilled") throw new Error("Fixture creation failed")
    expect(await getEmailSignature(f.companyId, f.authorId)).toEqual(winner.value)
    expect(await prisma.emailSignature.count({ where: { companyId: f.companyId } })).toBe(1)
  })
  it("excludes signature content from company export and refuses a legacy restore that would erase it", async () => {
    const f = await fixture()
    await saveEmailSignature(f.companyId, f.authorId, { text: "Private signature sentinel", version: null })
    const backup = await buildBackupPayload(f.authorId, f.companyId)
    expect(JSON.stringify(backup)).not.toContain("Private signature sentinel")
    expect(backup.tables.some(table => table.model === "EmailSignature")).toBe(false)
    expect(backup.manifest.excludedModels.some(model => model.model === "EmailSignature")).toBe(true)
    await expect(restoreBackupPayload({ schema: "freelio.local-backup.v2", company: { id: f.companyId }, localFiles: [] }, f.authorId, f.companyId)).rejects.toThrow("signatures personnelles")
  })
  it("allows reading but refuses signature writes in the public demo", async () => {
    const f = await fixture(), saved = await saveEmailSignature(f.companyId, f.authorId, { text: "Fictitious signature", version: null })
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    await expect(saveEmailSignature(f.companyId, f.authorId, { text: "Forbidden", version: 1 })).rejects.toThrow("lecture seule")
    expect(await getEmailSignature(f.companyId, f.authorId)).toEqual(saved)
  })
})
