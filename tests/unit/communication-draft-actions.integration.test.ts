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
import { getCommunicationDraft, saveCommunicationDraft, sendCrmEmail, saveCommunicationSignature, previewCommunicationEmail } from "@/actions/communications"
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
    await expect(sendCrmEmail({ ...draft, draftId: draft.id, draftVersion: draft.version })).rejects.toThrow("lecture seule")
    expect(sendEmailThroughChannel).not.toHaveBeenCalled()
  })
})
