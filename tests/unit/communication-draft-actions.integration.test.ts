import { afterAll, afterEach, describe, expect, it, vi } from "vitest"
const actor = vi.hoisted(() => ({ companyId: "", userId: "", role: "OWNER" as const, agencyIds: null, membershipId: "fiction" }))
vi.mock("server-only", () => ({}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/audit", () => ({ logAction: vi.fn() }))
vi.mock("@/lib/auth-wrapper", async () => {
  const { requestContext } = await import("@/lib/context")
  const { assertDemoMutationAllowed } = await import("@/lib/demo-policy")
  return { withAuth: async (task: (context: typeof actor) => Promise<unknown>, permission: string) => {
    if (!permission.endsWith(".read")) assertDemoMutationAllowed()
    return requestContext.run({ ...actor, actionPermission: permission as "automation.write" }, () => task(actor))
  } }
})
vi.mock("@/lib/communications/email-provider", async original => {
  const actual = await original<typeof import("@/lib/communications/email-provider")>()
  return { ...actual, sendEmailThroughChannel: vi.fn(async input => ({ provider: "RESEND", providerId: `fiction-${input.idempotencyKey}`, providerDraftId: null, providerMessageId: null, channelId: input.channelId, from: input.from })) }
})

import prisma from "@/lib/prisma"
import { getCommunicationDraft, saveCommunicationDraft, sendCrmEmail, saveCommunicationSignature, previewCommunicationEmail, getCommunicationReplyAll, getCommunicationForward, scheduleCommunicationDraft, cancelCommunicationDraftSchedule, getCommunicationCrmDocuments, attachCommunicationCrmDocument } from "@/actions/communications"
import { sendEmailThroughChannel } from "@/lib/communications/email-provider"

describe.sequential("composer draft actions through tenant scopes and durable manual delivery", () => {
  const companies: string[] = [], users: string[] = []
  afterEach(() => vi.unstubAllEnvs())
  afterAll(async () => {
    for (const companyId of companies) {
      await prisma.contact.deleteMany({ where: { client: { companyId } } })
      await prisma.client.deleteMany({ where: { companyId } })
      await prisma.company.delete({ where: { id: companyId } })
    }
    await prisma.user.deleteMany({ where: { id: { in: users } } })
  })
  async function fixture() {
    vi.mocked(sendEmailThroughChannel).mockClear()
    const company = await prisma.company.create({ data: { name: "Fictional draft actions" } }); companies.push(company.id)
    const user = await prisma.user.create({ data: { name: "Fictional author" } }); users.push(user.id)
    actor.companyId = company.id; actor.userId = user.id
    const client = await prisma.client.create({ data: { companyId: company.id, name: "Fictional recipient" } })
    const contact = await prisma.contact.create({ data: { clientId: client.id, firstName: "Fiction", lastName: "Recipient", email: "recipient@example.test" } })
    const channel = await prisma.communicationChannel.create({ data: { companyId: company.id, provider: "RESEND", status: "ACTIVE", emailAddress: "sender@example.test" } })
    return { createKey: crypto.randomUUID(), channelId: channel.id, contactId: contact.id, subject: "Fictional mail", bodyHtml: '<p>Safe</p><a href="https://example.test/?a=1&b=2">Lien</a>', cc: ["cc@example.test"], bcc: ["hidden@example.test"] }
  }

  it("uses the saved revision's server key and refuses to send altered copies or another author's draft", async () => {
    const fields = await fixture(), saved = await saveCommunicationDraft(fields)
    if (!saved.success) throw new Error("Fixture save failed")
    const draft = saved.draft
    const command = { ...draft, threadId: draft.threadId || "", draftId: draft.id, draftVersion: draft.version, requestKey: crypto.randomUUID() }
    expect(await sendCrmEmail({ ...command, bcc: ["changed@example.test"] })).toMatchObject({ success: false, error: expect.stringContaining("Conflit") })
    const author = actor.userId
    actor.userId = (await prisma.user.create({ data: { name: "Fictional admin" } })).id; users.push(actor.userId)
    await expect(getCommunicationDraft(draft.id)).rejects.toThrow("introuvable")
    await expect(sendCrmEmail(command)).rejects.toThrow("introuvable")
    actor.userId = author
    await sendCrmEmail(command)
    await sendCrmEmail(command)
    expect(sendEmailThroughChannel).toHaveBeenCalledTimes(1)
    const delivery = await prisma.emailDelivery.findUniqueOrThrow({ where: { companyId_requestKey: { companyId: actor.companyId, requestKey: draft.requestKey } } })
    expect(delivery.payload).toMatchObject({ cc: fields.cc, bcc: fields.bcc })
    expect(await prisma.emailDelivery.count({ where: { companyId: actor.companyId, requestKey: command.requestKey } })).toBe(0)
    const message = await prisma.emailMessage.findUniqueOrThrow({ where: { deliveryId: delivery.id } })
    expect(message.bccAddresses).toEqual(fields.bcc)
    expect(message.bodyHtml).toContain("a=1&amp;b=2")
    expect(message.bodyText).toBe((await previewCommunicationEmail({ bodyHtml: fields.bodyHtml })).text)
    expect((await getCommunicationDraft(draft.id)).sentAt).toBeTruthy()
  })

  it("derives signature ownership from the actor and previews only sanitized text without rewriting old drafts", async () => {
    const fields = await fixture(), saved = await saveCommunicationDraft(fields)
    if (!saved.success) throw new Error("Fixture save failed")
    const signature = await saveCommunicationSignature({ text: "Private & <literal>", version: null, authorUserId: "forged-author", companyId: "forged-company" })
    expect(signature.success).toBe(true)
    expect(await prisma.emailSignature.findFirstOrThrow({ where: { companyId: actor.companyId } })).toMatchObject({ authorUserId: actor.userId, text: "Private & <literal>" })
    expect((await getCommunicationDraft(saved.draft.id)).bodyHtml).toBe(saved.draft.bodyHtml)
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    const preview = await previewCommunicationEmail({ bodyHtml: '<p>Équipe &amp; fiction</p><script>discarded()</script>' })
    expect(preview.text).toBe("Équipe & fiction")
    expect(preview.html).not.toContain("discarded")
    await expect(saveCommunicationSignature({ text: "Forbidden", version: 1 })).rejects.toThrow("lecture seule")
  })

  it("refuses public demo draft mutations before running a send", async () => {
    const fields = await fixture(), saved = await saveCommunicationDraft(fields)
    if (!saved.success) throw new Error("Fixture save failed")
    const draft = saved.draft
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    await expect(saveCommunicationDraft({ ...draft, subject: "Forbidden" })).rejects.toThrow("lecture seule")
    await expect(scheduleCommunicationDraft({ id: draft.id, version: draft.version, localDateTime: new Date(Date.now() + 3_600_000).toISOString().slice(0, 16), timezone: "UTC" })).rejects.toThrow("lecture seule")
    await expect(cancelCommunicationDraftSchedule({ id: draft.id, version: draft.version })).rejects.toThrow("lecture seule")
    await expect(attachCommunicationCrmDocument({ draftId: draft.id, version: draft.version })).rejects.toThrow("lecture seule")
    await expect(sendCrmEmail({ ...draft, draftId: draft.id, draftVersion: draft.version })).rejects.toThrow("lecture seule")
    expect(sendEmailThroughChannel).not.toHaveBeenCalled()
  })

  it("reads CRM document metadata with session identity, structures inaccessible errors and performs no public-demo copy", async () => {
    const fields = await fixture(), saved = await saveCommunicationDraft(fields)
    if (!saved.success) throw new Error("Fixture save failed")
    const contact = await prisma.contact.findUniqueOrThrow({ where: { id: fields.contactId } })
    const source = await prisma.clientFile.create({ data: { clientId: contact.clientId, name: "Fictional approved document.pdf", url: `local:${actor.companyId}/client/${contact.clientId}/fiction.pdf`, size: 25, type: "application/pdf", sha256: "a".repeat(64) } })
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    const result = await getCommunicationCrmDocuments({ draftId: saved.draft.id, kind: "CLIENT_FILE", companyId: "forged-company", userId: "forged-user" })
    expect(result).toMatchObject({ success: true, page: { total: 1, documents: [{ id: source.id, name: source.name }] } })
    expect(JSON.stringify(result)).not.toContain(source.url)
    expect(await getCommunicationCrmDocuments({ draftId: "invalid", kind: "CLIENT_FILE" })).toMatchObject({ success: false })
    await expect(attachCommunicationCrmDocument({ draftId: saved.draft.id, version: saved.draft.version, kind: "CLIENT_FILE", sourceId: source.id, sourceHash: source.sha256, attachmentId: crypto.randomUUID() })).rejects.toThrow("lecture seule")
    expect((await getCommunicationDraft(saved.draft.id)).attachments).toEqual([])
    expect(sendEmailThroughChannel).not.toHaveBeenCalled()
  })

  it("refuses a queued save after an account or workspace switch before creating or updating a draft", async () => {
    const fields = await fixture()
    const expected = { expectedCompanyId: actor.companyId, expectedAuthorId: actor.userId }
    const saved = await saveCommunicationDraft({ ...fields, ...expected })
    if (!saved.success) throw new Error("Fixture save failed")
    const otherCompany = await prisma.company.create({ data: { name: "Fictional other space" } }); companies.push(otherCompany.id)
    const otherUser = await prisma.user.create({ data: { name: "Fictional other author" } }); users.push(otherUser.id)
    for (const changed of [{ expectedCompanyId: otherCompany.id }, { expectedAuthorId: otherUser.id }]) {
      const result = await saveCommunicationDraft({ ...fields, ...expected, ...changed, createKey: crypto.randomUUID() })
      expect(result).toMatchObject({ success: false, error: expect.stringContaining("a changé") })
      expect(await saveCommunicationDraft({ ...fields, ...expected, ...changed, id: saved.draft.id, version: 1, subject: "Do not overwrite" })).toMatchObject({ success: false })
    }
    expect(await prisma.emailDraft.count({ where: { companyId: actor.companyId } })).toBe(1)
    expect(await getCommunicationDraft(saved.draft.id)).toMatchObject({ subject: fields.subject, version: 1 })
  })

  it("prepares a forward as a scoped read in the public demo without copying recipients or sending", async () => {
    const fields = await fixture()
    const thread = await prisma.emailThread.create({ data: { companyId: actor.companyId, channelId: fields.channelId, subject: "Fictional forward" } })
    const message = await prisma.emailMessage.create({ data: { companyId: actor.companyId, threadId: thread.id, direction: "INBOUND", provider: "RESEND", fromAddress: "original@example.test", toAddresses: ["sender@example.test"], bccAddresses: ["hidden@example.test"], subject: thread.subject, bodyText: "Fictional quoted text" } })
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    const result = await getCommunicationForward(message.id)
    expect(result).toMatchObject({ success: true, forward: { subject: "Tr: Fictional forward", channelId: fields.channelId, bodyHtml: expect.stringContaining("Fictional quoted text") } })
    expect(JSON.stringify(result)).not.toContain("hidden@example.test")
    expect(await getCommunicationForward("invalid")).toEqual({ success: false, error: "Message introuvable" })
    expect(await prisma.emailDraft.count({ where: { companyId: actor.companyId } })).toBe(0)
    expect(await prisma.emailDelivery.count({ where: { companyId: actor.companyId } })).toBe(0)
    expect(sendEmailThroughChannel).not.toHaveBeenCalled()
  })

  it("prepares reply-all copies as a scoped read in the public demo without creating a draft or delivery", async () => {
    const fields = await fixture()
    const thread = await prisma.emailThread.create({ data: { companyId: actor.companyId, channelId: fields.channelId, contactId: fields.contactId, subject: "Fictional incoming", messages: { create: {
      companyId: actor.companyId, direction: "INBOUND", provider: "RESEND", fromAddress: "recipient@example.test", toAddresses: ["sender@example.test"], ccAddresses: ["copy@example.test"], bccAddresses: ["hidden@example.test"], subject: "Fictional incoming",
    } } } })
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    expect(await getCommunicationReplyAll(thread.id)).toEqual({ success: true, reply: { threadId: thread.id, channelId: fields.channelId, contactId: fields.contactId, cc: ["copy@example.test"] } })
    expect(await prisma.emailDraft.count({ where: { companyId: actor.companyId } })).toBe(0)
    expect(await prisma.emailDelivery.count({ where: { companyId: actor.companyId } })).toBe(0)
    expect(sendEmailThroughChannel).not.toHaveBeenCalled()
    vi.unstubAllEnvs()
    await prisma.emailMessage.updateMany({ where: { threadId: thread.id }, data: { direction: "OUTBOUND" } })
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    expect(await getCommunicationReplyAll(thread.id)).toMatchObject({ success: false, error: expect.stringContaining("Aucun message reçu") })
  })
})
