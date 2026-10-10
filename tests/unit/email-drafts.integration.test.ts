import { afterAll, afterEach, describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))

import prisma from "@/lib/prisma"
import { requestContext } from "@/lib/context"
import { deleteEmailDraft, getEmailDraft, listEmailDrafts, saveEmailDraft, sendEmailDraft } from "@/lib/communications/drafts"
import { readInboxPage } from "@/lib/communications/inbox-reader"
import { sanitizeSequenceEmailHtml } from "@/lib/automations/email"

describe.sequential("personal draft storage, optimistic concurrency and send recovery on SQL", () => {
  const companies: string[] = [], users: string[] = []
  afterEach(() => vi.unstubAllEnvs())
  afterAll(async () => {
    await prisma.company.deleteMany({ where: { id: { in: companies } } })
    await prisma.user.deleteMany({ where: { id: { in: users } } })
  })
  async function fixture() {
    const company = await prisma.company.create({ data: { name: "Fictional drafts only" } }); companies.push(company.id)
    const author = await prisma.user.create({ data: { name: "Fictional author" } }); users.push(author.id)
    const colleague = await prisma.user.create({ data: { name: "Fictional admin" } }); users.push(colleague.id)
    const data = { createKey: crypto.randomUUID(), purpose: "SERVICE" as const, subject: "", bodyHtml: "", cc: [], bcc: [] }
    return { companyId: company.id, authorId: author.id, colleagueId: colleague.id, data }
  }

  it("saves incomplete drafts idempotently and preserves safe links across reopen/save", async () => {
    const f = await fixture()
    const bodyHtml = '<p onclick="bad()">Fiction</p><a href="https://example.test/?a=1&b=2">Lien</a><script>bad()</script>'
    const draft = await saveEmailDraft(f.companyId, f.authorId, { ...f.data, bodyHtml })
    expect(draft.bodyHtml).not.toContain("bad")
    expect(sanitizeSequenceEmailHtml(draft.bodyHtml)).toBe(draft.bodyHtml)
    expect((await saveEmailDraft(f.companyId, f.authorId, { ...f.data, bodyHtml })).id).toBe(draft.id)
    const saved = await saveEmailDraft(f.companyId, f.authorId, { ...draft, bodyHtml: draft.bodyHtml })
    expect(saved.version).toBe(2)
    expect(saved.bodyHtml).toBe(draft.bodyHtml)
    expect(saved.requestKey).not.toBe(draft.requestKey)
  })

  it("denies guessed IDs to colleagues, admins and foreign tenants at both reader and SQL boundaries", async () => {
    const f = await fixture(), other = await fixture()
    const draft = await saveEmailDraft(f.companyId, f.authorId, { ...f.data, bcc: ["secret@example.test"] })
    for (const [companyId, userId] of [[f.companyId, f.colleagueId], [other.companyId, f.authorId]]) {
      await expect(getEmailDraft(companyId, userId, draft.id)).rejects.toThrow("introuvable")
      expect((await listEmailDrafts(companyId, userId)).total).toBe(0)
      await expect(deleteEmailDraft(companyId, userId, draft)).rejects.toThrow("introuvable")
    }
    await requestContext.run({ companyId: f.companyId, userId: f.colleagueId, role: "ADMIN", membershipId: "fixture", agencyIds: null, actionPermission: "automation.write" }, async () => {
      expect(await prisma.emailDraft.findUnique({ where: { id: draft.id } })).toBeNull()
      expect((await prisma.emailDraft.deleteMany({ where: { id: draft.id } })).count).toBe(0)
      const company = await prisma.company.findUniqueOrThrow({ where: { id: f.companyId }, include: { emailDrafts: true } })
      expect(company.emailDrafts).toEqual([])
      await expect(prisma.emailDraft.create({ data: { companyId: f.companyId, authorUserId: f.authorId, createKey: crypto.randomUUID(), requestKey: crypto.randomUUID(), cc: [], bcc: [] } })).rejects.toThrow("DRAFT_ACCESS_DENIED")
    })
    expect((await getEmailDraft(f.companyId, f.authorId, draft.id)).bcc).toEqual(["secret@example.test"])
  })

  it("rejects stale saves/deletes and retains the newer version", async () => {
    const f = await fixture(), draft = await saveEmailDraft(f.companyId, f.authorId, f.data)
    const current = await saveEmailDraft(f.companyId, f.authorId, { ...draft, subject: "Updated version" })
    await expect(saveEmailDraft(f.companyId, f.authorId, { ...draft, subject: "Stale overwrite" })).rejects.toThrow("Conflit")
    await expect(deleteEmailDraft(f.companyId, f.authorId, draft)).rejects.toThrow("Conflit")
    expect((await getEmailDraft(f.companyId, f.authorId, draft.id)).subject).toBe(current.subject)
    await deleteEmailDraft(f.companyId, f.authorId, current)
    expect((await listEmailDrafts(f.companyId, f.authorId)).total).toBe(0)
  })

  it("rejects edits and deletion of an ambiguous send, keeping the same recovery key across reopen", async () => {
    const f = await fixture(), draft = await saveEmailDraft(f.companyId, f.authorId, { ...f.data, subject: "Fictional send", bodyHtml: "<p>Fiction</p>" })
    const keys: string[] = []
    await expect(sendEmailDraft(f.companyId, f.authorId, draft, async key => {
      keys.push(key)
      await prisma.emailDelivery.create({ data: { companyId: f.companyId, requestKey: key, status: "FAILED", subject: draft.subject, recipientEmail: "fiction@example.test", scheduledAt: new Date() } })
      throw new Error("Ambiguous provider acceptance")
    })).rejects.toThrow("Ambiguous")
    await expect(saveEmailDraft(f.companyId, f.authorId, { ...draft, subject: "Changed intent" })).rejects.toThrow("déjà préparé")
    await expect(deleteEmailDraft(f.companyId, f.authorId, draft)).rejects.toThrow("Résultat")
    const reopened = await getEmailDraft(f.companyId, f.authorId, draft.id)
    await sendEmailDraft(f.companyId, f.authorId, reopened, async key => {
      keys.push(key)
      await prisma.emailDelivery.update({ where: { companyId_requestKey: { companyId: f.companyId, requestKey: key } }, data: { status: "SENT" } })
      return "confirmed"
    })
    expect(keys).toEqual([draft.requestKey, draft.requestKey])
    expect((await listEmailDrafts(f.companyId, f.authorId)).total).toBe(0)
    await deleteEmailDraft(f.companyId, f.authorId, reopened)
  })

  it("refuses unsaved or stale content before calling transport", async () => {
    const f = await fixture(), draft = await saveEmailDraft(f.companyId, f.authorId, f.data), send = vi.fn()
    await expect(sendEmailDraft(f.companyId, f.authorId, { ...draft, bcc: ["new@example.test"] }, send)).rejects.toThrow("Conflit")
    await expect(sendEmailDraft(f.companyId, f.authorId, { ...draft, version: 55 }, send)).rejects.toThrow("Conflit")
    expect(send).not.toHaveBeenCalled()
  })

  it("serializes sending against another tab's save", async () => {
    const f = await fixture(), draft = await saveEmailDraft(f.companyId, f.authorId, f.data)
    let release!: () => void
    let started!: () => void
    const ready = new Promise<void>(resolve => { started = resolve })
    const hold = new Promise<void>(resolve => { release = resolve })
    const sending = sendEmailDraft(f.companyId, f.authorId, draft, async () => { started(); await hold; return true })
    await ready
    await expect(saveEmailDraft(f.companyId, f.authorId, { ...draft, subject: "Concurrent" })).rejects.toThrow("autre onglet")
    release(); await sending
  })

  it("paginates every personal draft without exposing its body or hidden recipients", async () => {
    const f = await fixture()
    await prisma.emailDraft.createMany({ data: Array.from({ length: 28 }, (_, index) => ({ companyId: f.companyId, authorUserId: f.authorId, createKey: crypto.randomUUID(), requestKey: crypto.randomUUID(), subject: `Fiction ${index}`, bodyHtml: "Private body", cc: [], bcc: ["hidden@example.test"] })) })
    const first = await listEmailDrafts(f.companyId, f.authorId), second = await listEmailDrafts(f.companyId, f.authorId, { page: 2 })
    expect(first.total).toBe(28); expect(first.drafts).toHaveLength(25); expect(second.drafts).toHaveLength(3)
    expect(new Set([...first.drafts, ...second.drafts].map(row => row.id)).size).toBe(28)
    expect(JSON.stringify(first)).not.toContain("hidden@example.test")
    expect(JSON.stringify(first)).not.toContain("Private body")
  })

  it("does not expose Bcc or raw events in conversation reading", async () => {
    const f = await fixture()
    await prisma.emailThread.create({ data: { companyId: f.companyId, subject: "Fictional privacy", messages: { create: { companyId: f.companyId, direction: "OUTBOUND", provider: "RESEND", fromAddress: "sender@example.test", toAddresses: ["to@example.test"], ccAddresses: ["cc@example.test"], bccAddresses: ["hidden@example.test"], subject: "Fictional privacy", events: { create: { companyId: f.companyId, provider: "RESEND", providerEventId: crypto.randomUUID(), type: "email.sent", payload: { bcc: ["hidden@example.test"] }, occurredAt: new Date() } } } } } })
    const page = await readInboxPage(f.companyId)
    expect(page.threads[0].messages[0].ccAddresses).toEqual(["cc@example.test"])
    expect(JSON.stringify(page)).not.toContain("hidden@example.test")
    expect(page.threads[0].messages[0]).not.toHaveProperty("bccAddresses")
  })

  it("blocks draft writes in the public demo", async () => {
    const f = await fixture(), draft = await saveEmailDraft(f.companyId, f.authorId, f.data)
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    for (const task of [() => saveEmailDraft(f.companyId, f.authorId, draft), () => deleteEmailDraft(f.companyId, f.authorId, draft), () => sendEmailDraft(f.companyId, f.authorId, draft, vi.fn())]) await expect(task()).rejects.toThrow("lecture seule")
    expect((await getEmailDraft(f.companyId, f.authorId, draft.id)).version).toBe(1)
  })
})
