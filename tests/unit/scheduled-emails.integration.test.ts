import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
vi.mock("@/lib/audit", () => ({ logAction: vi.fn() }))
vi.mock("@/lib/communications/email-provider", async original => {
  const actual = await original<typeof import("@/lib/communications/email-provider")>()
  return { ...actual, sendEmailThroughChannel: vi.fn() }
})
vi.mock("@/lib/communications/threads", async original => {
  const actual = await original<typeof import("@/lib/communications/threads")>()
  return { ...actual, recordOutgoingEmail: vi.fn(actual.recordOutgoingEmail) }
})
import prisma from "@/lib/prisma"
import { requestContext } from "@/lib/context"
import { saveEmailDraft, deleteEmailDraft, sendEmailDraft, getEmailDraft } from "@/lib/communications/drafts"
import { assertEditableDraft } from "@/lib/communications/draft-attachments"
import { scheduleEmailDraft, cancelScheduledEmail, processDueScheduledEmails } from "@/lib/communications/scheduled-emails"
import { sendEmailThroughChannel } from "@/lib/communications/email-provider"
import { sendManualEmail, preparedManualEmailSchema } from "@/lib/communications/manual-send"
import { recordOutgoingEmail } from "@/lib/communications/threads"

describe.sequential("private frozen schedules, cancellation and durable dispatch", () => {
  const companies: string[] = [], users: string[] = []
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(sendEmailThroughChannel).mockImplementation(async input => {
      await input.beforeDispatch?.()
      return { provider: "RESEND", providerId: `fiction-${input.idempotencyKey}`, providerDraftId: null, providerMessageId: `<${input.idempotencyKey}@example.test>`, channelId: input.channelId!, from: input.from! }
    })
  })
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
    const company = await prisma.company.create({ data: { name: "Fictional scheduling", email: "reply@example.test" } }); companies.push(company.id)
    const user = await prisma.user.create({ data: { name: "Fictional author" } }); users.push(user.id)
    const member = await prisma.membership.create({ data: { companyId: company.id, userId: user.id, role: "OWNER", status: "ACTIVE" } })
    const client = await prisma.client.create({ data: { companyId: company.id, name: "Fictional recipient" } })
    const contact = await prisma.contact.create({ data: { clientId: client.id, firstName: "Fiction", lastName: "Contact", email: "recipient@example.test" } })
    const channel = await prisma.communicationChannel.create({ data: { companyId: company.id, provider: "RESEND", status: "ACTIVE", emailAddress: "sender@example.test", visibility: "PRIVATE", ownerUserId: user.id } })
    const asAuthor = <T>(task: () => Promise<T>) => requestContext.run({ companyId: company.id, userId: user.id, membershipId: member.id, role: "OWNER", agencyIds: null, actionPermission: "automation.write" }, task)
    const fields = { createKey: crypto.randomUUID(), purpose: "SERVICE" as const, channelId: channel.id, contactId: contact.id, threadId: "", subject: "Fictional scheduled mail", bodyHtml: "<p>Frozen original body</p>", cc: ["copy@example.test"], bcc: ["hidden@example.test"], attachmentIds: [] }
    const draft = await asAuthor(() => saveEmailDraft(company.id, user.id, fields))
    const localDateTime = new Date(Date.now() + 3_600_000).toISOString().slice(0, 16)
    const queue = () => asAuthor(() => scheduleEmailDraft(company.id, user.id, { id: draft.id, version: draft.version, localDateTime, timezone: "UTC" }))
    return { company, user, member, contact, channel, asAuthor, fields, draft, queue }
  }

  it("queues without transport, freezes fields/files, prevents immediate-send bypass and hides the internal command", async () => {
    const f = await fixture(), queued = await f.queue()
    expect(queued).toMatchObject({ scheduleStatus: "QUEUED", scheduleAttempts: 0, version: 2, scheduledTimezone: "UTC", scheduleStartedAt: null })
    expect(queued).not.toHaveProperty("scheduledPayload")
    expect(sendEmailThroughChannel).not.toHaveBeenCalled()
    expect(await prisma.emailDelivery.count({ where: { companyId: f.company.id } })).toBe(0)
    await f.asAuthor(async () => {
      await expect(saveEmailDraft(f.company.id, f.user.id, { ...f.fields, id: queued.id, version: queued.version, subject: "Do not change" })).rejects.toThrow("programmé")
      await expect(deleteEmailDraft(f.company.id, f.user.id, queued)).rejects.toThrow("programmé")
      await expect(assertEditableDraft(f.company.id, f.user.id, queued.id, queued.version)).rejects.toThrow("programmé")
      const send = vi.fn()
      await expect(sendEmailDraft(f.company.id, f.user.id, { ...f.fields, id: queued.id, version: queued.version }, send)).rejects.toThrow("programmé")
      expect(send).not.toHaveBeenCalled()
      const prepared = preparedManualEmailSchema.parse((await prisma.emailDraft.findFirstOrThrow({ where: { id: queued.id } })).scheduledPayload)
      await expect(sendManualEmail({ ...prepared.payload, companyId: f.company.id, requestKey: queued.requestKey })).rejects.toThrow("programmé")
    })
  })

  it("cancels before dispatch, rotates the command key and permits editing without later automatic delivery", async () => {
    const f = await fixture(), queued = await f.queue()
    const canceled = await f.asAuthor(() => cancelScheduledEmail(f.company.id, f.user.id, queued))
    expect(canceled).toMatchObject({ scheduledAt: null, scheduleStatus: null, scheduleStartedAt: null, version: 3 })
    expect(canceled.requestKey).not.toBe(queued.requestKey)
    await f.asAuthor(async () => expect((await saveEmailDraft(f.company.id, f.user.id, { ...f.fields, id: canceled.id, version: canceled.version, bodyHtml: "<p>Editable again</p>" })).bodyHtml).toBe("<p>Editable again</p>"))
    expect(await processDueScheduledEmails({ companyId: f.company.id, now: new Date(queued.scheduledAt!) })).toMatchObject({ examined: 0, sent: 0 })
    expect(sendEmailThroughChannel).not.toHaveBeenCalled()
  })

  it("dispatches only when due using frozen sender/content/copies and does not resend an accepted delivery during history repair", async () => {
    const f = await fixture(), queued = await f.queue(), due = new Date(queued.scheduledAt!)
    expect(await processDueScheduledEmails({ companyId: f.company.id, now: new Date(due.getTime() - 1) })).toMatchObject({ examined: 0 })
    await prisma.company.update({ where: { id: f.company.id }, data: { name: "Changed after queue", email: "changed@example.test" } })
    vi.mocked(recordOutgoingEmail).mockRejectedValueOnce(new Error("Injected history failure after acceptance"))
    expect(await processDueScheduledEmails({ companyId: f.company.id, now: due })).toMatchObject({ failed: 1, sent: 0 })
    const retry = await prisma.emailDraft.findFirstOrThrow({ where: { id: queued.id } })
    expect(retry.scheduleStatus).toBe("RETRY")
    expect(await processDueScheduledEmails({ companyId: f.company.id, now: retry.scheduleNextAttemptAt! })).toMatchObject({ sent: 1 })
    expect(sendEmailThroughChannel).toHaveBeenCalledTimes(1)
    expect(sendEmailThroughChannel).toHaveBeenCalledWith(expect.objectContaining({ companyName: "Fictional scheduling", replyTo: "reply@example.test", html: expect.stringContaining("Frozen original body"), cc: f.fields.cc, bcc: f.fields.bcc }))
    expect(await f.asAuthor(() => getEmailDraft(f.company.id, f.user.id, queued.id))).toMatchObject({ scheduleStatus: "SENT", sentAt: expect.any(String) })
    expect(await processDueScheduledEmails({ companyId: f.company.id, now: new Date(due.getTime() + 3_600_000) })).toMatchObject({ examined: 0 })
  })

  it("keeps the selected reply parent when a new incoming message arrives after scheduling", async () => {
    const f = await fixture()
    const thread = await prisma.emailThread.create({ data: { companyId: f.company.id, channelId: f.channel.id, contactId: f.contact.id, clientId: f.contact.clientId, subject: f.fields.subject } })
    const original = await prisma.emailMessage.create({ data: { companyId: f.company.id, threadId: thread.id, direction: "INBOUND", provider: "RESEND", providerId: `original-${thread.id}`, internetMessageId: `<original-${thread.id}@example.test>`, fromAddress: f.contact.email!, toAddresses: [f.channel.emailAddress], subject: f.fields.subject, createdAt: new Date("2020-01-01") } })
    const reply = await f.asAuthor(() => saveEmailDraft(f.company.id, f.user.id, { ...f.fields, id: f.draft.id, version: f.draft.version, threadId: thread.id }))
    const queued = await f.asAuthor(() => scheduleEmailDraft(f.company.id, f.user.id, { id: reply.id, version: reply.version, localDateTime: new Date(Date.now() + 3_600_000).toISOString().slice(0, 16), timezone: "UTC" }))
    await prisma.emailMessage.create({ data: { companyId: f.company.id, threadId: thread.id, direction: "INBOUND", provider: "RESEND", providerId: `new-${thread.id}`, internetMessageId: `<new-${thread.id}@example.test>`, fromAddress: f.contact.email!, toAddresses: [f.channel.emailAddress], subject: f.fields.subject } })
    expect(await processDueScheduledEmails({ companyId: f.company.id, now: new Date(queued.scheduledAt!) })).toMatchObject({ sent: 1 })
    expect(sendEmailThroughChannel).toHaveBeenCalledWith(expect.objectContaining({ reply: expect.objectContaining({ messageId: original.id, internetMessageId: original.internetMessageId }) }))
  })

  it("resumes a persisted processing state after interruption before delivery creation using the original key", async () => {
    const f = await fixture(), queued = await f.queue()
    await prisma.emailDraft.update({ where: { id: queued.id }, data: { scheduleStatus: "PROCESSING", scheduleStartedAt: new Date(queued.scheduledAt!), scheduleAttempts: 1 } })
    expect(await processDueScheduledEmails({ companyId: f.company.id, now: new Date(queued.scheduledAt!) })).toMatchObject({ sent: 1 })
    expect(await prisma.emailDelivery.findFirstOrThrow({ where: { companyId: f.company.id } })).toMatchObject({ requestKey: queued.requestKey, status: "SENT" })
    expect(sendEmailThroughChannel).toHaveBeenCalledTimes(1)
  })

  it("refuses foreign authors/company and stale versions, and suspends a revoked author before any transport", async () => {
    const f = await fixture(), foreign = await fixture(), queued = await f.queue()
    await foreign.asAuthor(async () => {
      await expect(cancelScheduledEmail(f.company.id, f.user.id, queued)).rejects.toThrow("introuvable")
      await expect(scheduleEmailDraft(f.company.id, f.user.id, { id: f.draft.id, version: 2, localDateTime: new Date(Date.now() + 3_600_000).toISOString().slice(0, 16), timezone: "UTC" })).rejects.toThrow("introuvable")
    })
    await f.asAuthor(async () => await expect(cancelScheduledEmail(f.company.id, f.user.id, { id: queued.id, version: 1 })).rejects.toThrow("Conflit"))
    await prisma.membership.update({ where: { id: f.member.id }, data: { status: "SUSPENDED" } })
    expect(await processDueScheduledEmails({ companyId: f.company.id, now: new Date(queued.scheduledAt!) })).toMatchObject({ failed: 1 })
    expect(sendEmailThroughChannel).not.toHaveBeenCalled()
    expect(await prisma.emailDraft.findFirstOrThrow({ where: { id: queued.id } })).toMatchObject({ scheduleStatus: "FAILED", scheduleStartedAt: null })
  })

  it("rechecks a downgraded role and lost private mailbox access immediately before final dispatch", async () => {
    const f = await fixture(), queued = await f.queue()
    let accepted = false
    vi.mocked(sendEmailThroughChannel).mockImplementationOnce(async input => {
      // Simulate an administrator changing the actor while the provider is preparing.
      await requestContext.run({ companyId: f.company.id, userId: f.user.id, role: "OWNER", agencyIds: null, membershipId: f.member.id, actionPermission: "company.manage" }, async () => {
        await prisma.membership.update({ where: { id: f.member.id }, data: { role: "SALES" } })
        await prisma.communicationChannel.update({ where: { id: f.channel.id }, data: { ownerUserId: null } })
      })
      await input.beforeDispatch?.()
      accepted = true
      throw new Error("Must not reach acceptance")
    })
    expect(await processDueScheduledEmails({ companyId: f.company.id, now: new Date(queued.scheduledAt!) })).toMatchObject({ failed: 1, sent: 0 })
    expect(accepted).toBe(false)
    expect(await prisma.membership.findUniqueOrThrow({ where: { id: f.member.id } })).toMatchObject({ role: "SALES" })
    expect(await prisma.communicationChannel.findFirstOrThrow({ where: { id: f.channel.id } })).toMatchObject({ ownerUserId: null })
    expect(await prisma.emailMessage.count({ where: { companyId: f.company.id } })).toBe(0)
  })

  it("serializes dispatch/cancel and a second processor through the same draft lease", async () => {
    const f = await fixture(), queued = await f.queue()
    let started!: () => void, release!: () => void
    const began = new Promise<void>(resolve => { started = resolve }), gate = new Promise<void>(resolve => { release = resolve })
    vi.mocked(sendEmailThroughChannel).mockImplementationOnce(async input => {
      started(); await gate; await input.beforeDispatch?.()
      return { provider: "RESEND", providerId: `fiction-${input.idempotencyKey}`, providerDraftId: null, providerMessageId: `<${input.idempotencyKey}@example.test>`, channelId: input.channelId!, from: input.from! }
    })
    const processing = processDueScheduledEmails({ companyId: f.company.id, now: new Date(queued.scheduledAt!) })
    await began
    try {
      await f.asAuthor(async () => await expect(cancelScheduledEmail(f.company.id, f.user.id, queued)).rejects.toThrow("utilisé"))
      expect(await processDueScheduledEmails({ companyId: f.company.id, now: new Date(new Date(queued.scheduledAt!).getTime() + 120_000) })).toMatchObject({ skipped: 1, sent: 0 })
    } finally { release() }
    expect(await processing).toMatchObject({ sent: 1 })
    expect(sendEmailThroughChannel).toHaveBeenCalledTimes(1)
  })

  it("bounds retries without exposing hidden recipient errors and stops after five attempts", async () => {
    const f = await fixture(), queued = await f.queue()
    vi.mocked(sendEmailThroughChannel).mockRejectedValue(new Error("Provider refused hidden@example.test"))
    let due = new Date(queued.scheduledAt!)
    for (let attempt = 1; attempt <= 5; attempt++) {
      expect(await processDueScheduledEmails({ companyId: f.company.id, now: due })).toMatchObject({ failed: 1 })
      const stored = await prisma.emailDraft.findFirstOrThrow({ where: { id: queued.id } })
      expect(stored.scheduleAttempts).toBe(attempt)
      expect(stored.scheduleError).not.toContain("hidden@example.test")
      due = stored.scheduleNextAttemptAt || new Date(due.getTime() + 3_600_000)
    }
    expect(await prisma.emailDraft.findFirstOrThrow({ where: { id: queued.id } })).toMatchObject({ scheduleStatus: "FAILED", scheduleNextAttemptAt: null })
    expect(await processDueScheduledEmails({ companyId: f.company.id, now: due })).toMatchObject({ examined: 0 })
    expect(sendEmailThroughChannel).toHaveBeenCalledTimes(5)
    await f.asAuthor(async () => await expect(cancelScheduledEmail(f.company.id, f.user.id, queued)).rejects.toThrow("commencé"))
  })

  it("fails closed on corrupt commands and disables scheduling/processing in the public demo", async () => {
    const f = await fixture(), queued = await f.queue()
    await prisma.emailDraft.update({ where: { id: queued.id }, data: { scheduledPayload: { invalid: true } } })
    expect(await processDueScheduledEmails({ companyId: f.company.id, now: new Date(queued.scheduledAt!) })).toMatchObject({ failed: 1 })
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    expect(await processDueScheduledEmails({ companyId: f.company.id, now: new Date(queued.scheduledAt!) })).toEqual({ examined: 0, sent: 0, failed: 0, skipped: 0 })
    await f.asAuthor(async () => await expect(cancelScheduledEmail(f.company.id, f.user.id, queued)).rejects.toThrow("lecture seule"))
    await f.asAuthor(async () => await expect(scheduleEmailDraft(f.company.id, f.user.id, { id: queued.id, version: queued.version, localDateTime: new Date(Date.now() + 3_600_000).toISOString().slice(0, 16), timezone: "UTC" })).rejects.toThrow("lecture seule"))
    expect(sendEmailThroughChannel).not.toHaveBeenCalled()
  })
})
