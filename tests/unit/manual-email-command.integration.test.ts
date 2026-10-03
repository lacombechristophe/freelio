import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/communications/email-provider", async (original) => {
  const actual = await original<typeof import("@/lib/communications/email-provider")>()
  return { ...actual, sendEmailThroughChannel: vi.fn() }
})
vi.mock("@/lib/communications/threads", async (original) => {
  const actual = await original<typeof import("@/lib/communications/threads")>()
  return { ...actual, recordOutgoingEmail: vi.fn(actual.recordOutgoingEmail) }
})

import prisma from "@/lib/prisma"
import { sendManualEmail } from "@/lib/communications/manual-send"
import { sendEmailThroughChannel } from "@/lib/communications/email-provider"
import { recordOutgoingEmail } from "@/lib/communications/threads"

describe.sequential("manual email durable command on SQL", () => {
  const companyIds: string[] = []
  beforeEach(() => vi.clearAllMocks())
  afterAll(async () => {
    for (const id of companyIds) {
      await prisma.contact.deleteMany({ where: { client: { companyId: id } } })
      await prisma.client.deleteMany({ where: { companyId: id } })
      await prisma.company.delete({ where: { id } })
    }
    await prisma.processorLease.deleteMany({ where: { name: { startsWith: "manual-email:" } } })
  })

  async function fixture() {
    const company = await prisma.company.create({ data: { name: "Fictitious manual send" } })
    companyIds.push(company.id)
    const client = await prisma.client.create({ data: { companyId: company.id, name: "Fictitious recipient" } })
    const contact = await prisma.contact.create({ data: { clientId: client.id, firstName: "Fiction", lastName: "Recipient", email: "recipient@example.test" } })
    const channel = await prisma.communicationChannel.create({ data: { companyId: company.id, provider: "RESEND", emailAddress: "sender@example.test", status: "ACTIVE" } })
    const input = { companyId: company.id, userId: "recipe-user", companyName: company.name, contactId: contact.id, clientId: client.id, channelId: channel.id, requestKey: crypto.randomUUID(), threadId: null, serviceTicketId: null, replyTo: null, to: contact.email!, subject: "Fictitious message", html: "<p>Fictitious data only</p>" }
    vi.mocked(sendEmailThroughChannel).mockImplementation(async (command) => {
      const stored = await prisma.emailDelivery.findUniqueOrThrow({ where: { id: command.idempotencyKey } })
      expect(stored.payload).toMatchObject({ to: input.to, html: input.html, channelId: channel.id })
      expect(stored.status).toBe("SENDING")
      await command.beforeDispatch?.()
      await command.onPrepared?.({ provider: "RESEND", channelId: channel.id, providerDraftId: null, providerMessageId: null })
      return { provider: "RESEND", channelId: channel.id, from: "sender@example.test", providerId: `fiction-${stored.id}`, providerDraftId: null, providerMessageId: `fiction-${stored.id}` }
    })
    return { input, channel }
  }

  async function replyThread(input: Awaited<ReturnType<typeof fixture>>["input"]) {
    const thread = await prisma.emailThread.create({ data: { companyId: input.companyId, clientId: input.clientId, contactId: input.contactId, channelId: input.channelId, subject: input.subject } })
    const original = await prisma.emailMessage.create({ data: { companyId: input.companyId, threadId: thread.id, direction: "INBOUND", provider: "RESEND", providerId: `original-${thread.id}`,
      internetMessageId: `<${thread.id}@example.test>`, fromAddress: input.to, toAddresses: ["sender@example.test"], subject: input.subject } })
    return { ...thread, original }
  }

  it("repairs a failed SQL history write after acceptance without another transport call", async () => {
    const { input } = await fixture()
    vi.mocked(recordOutgoingEmail).mockRejectedValueOnce(new Error("Injected history failure"))
    await expect(sendManualEmail(input)).rejects.toThrow("Injected history failure")
    expect((await prisma.emailDelivery.findUniqueOrThrow({ where: { companyId_requestKey: { companyId: input.companyId, requestKey: input.requestKey } } })).status).toBe("SENT")
    const message = await sendManualEmail(input)
    expect(message.toAddresses).toEqual([input.to])
    expect(sendEmailThroughChannel).toHaveBeenCalledTimes(1)
    await sendManualEmail(input)
    expect(await prisma.emailMessage.count({ where: { companyId: input.companyId } })).toBe(1)
    expect(sendEmailThroughChannel).toHaveBeenCalledTimes(1)
  })

  it("refuses to replace the frozen payload or sender with another intent", async () => {
    const { input } = await fixture()
    await sendManualEmail(input)
    await expect(sendManualEmail({ ...input, html: "<p>Changed</p>" })).rejects.toThrow("autre contenu")
    await expect(sendManualEmail({ ...input, channelId: "another-channel" })).rejects.toThrow("déjà fixée")
    expect(sendEmailThroughChannel).toHaveBeenCalledTimes(1)
  })

  it("freezes copy recipients across retries and stores them separately in history", async () => {
    const { input } = await fixture()
    const copies = { cc: ["cc@example.test"], bcc: ["hidden@example.test"] }
    const message = await sendManualEmail({ ...input, ...copies })
    expect(message.ccAddresses).toEqual(copies.cc)
    expect(message.bccAddresses).toEqual(copies.bcc)
    expect(vi.mocked(sendEmailThroughChannel).mock.calls[0][0]).toMatchObject(copies)
    await expect(sendManualEmail({ ...input, ...copies, bcc: ["another@example.test"] })).rejects.toThrow("déjà fixés")
    await sendManualEmail({ ...input, ...copies })
    expect(sendEmailThroughChannel).toHaveBeenCalledTimes(1)
  })

  it("keeps a provider error quoting a Bcc address out of the shared delivery journal", async () => {
    const { input } = await fixture()
    vi.mocked(sendEmailThroughChannel).mockRejectedValueOnce(new Error("Rejected hidden@example.test"))
    await expect(sendManualEmail({ ...input, bcc: ["hidden@example.test"] })).rejects.toThrow("Rejected")
    const delivery = await prisma.emailDelivery.findUniqueOrThrow({ where: { companyId_requestKey: { companyId: input.companyId, requestKey: input.requestKey } } })
    expect(delivery.error).not.toContain("hidden@example.test")
  })

  it("refuses a reply from another mailbox before preparing or contacting transport", async () => {
    const { input } = await fixture()
    const other = await prisma.communicationChannel.create({ data: { companyId: input.companyId, provider: "RESEND", emailAddress: "other@example.test", status: "ACTIVE" } })
    const thread = await prisma.emailThread.create({ data: { companyId: input.companyId, clientId: input.clientId, contactId: input.contactId, channelId: other.id, subject: input.subject } })
    await expect(sendManualEmail({ ...input, threadId: thread.id })).rejects.toThrow("boîte")
    expect(sendEmailThroughChannel).not.toHaveBeenCalled()
    expect(await prisma.emailDelivery.count({ where: { companyId: input.companyId } })).toBe(0)
  })

  it("refuses reply references from another company or client before transport", async () => {
    const { input, channel } = await fixture()
    const foreign = await fixture()
    const foreignThread = await prisma.emailThread.create({ data: { companyId: foreign.input.companyId, clientId: foreign.input.clientId, channelId: foreign.channel.id, subject: input.subject } })
    const otherClient = await prisma.client.create({ data: { companyId: input.companyId, name: "Other fictitious recipient" } })
    const otherThread = await prisma.emailThread.create({ data: { companyId: input.companyId, clientId: otherClient.id, channelId: channel.id, subject: input.subject } })
    for (const threadId of [foreignThread.id, otherThread.id]) {
      await expect(sendManualEmail({ ...input, threadId })).rejects.toThrow("conversation")
    }
    expect(sendEmailThroughChannel).not.toHaveBeenCalled()
    expect(await prisma.emailDelivery.count({ where: { companyId: input.companyId } })).toBe(0)
  })

  it("checks the frozen reply mailbox again immediately before remote dispatch", async () => {
    const { input, channel } = await fixture()
    const thread = await replyThread(input)
    const other = await prisma.communicationChannel.create({ data: { companyId: input.companyId, provider: "RESEND", emailAddress: "changed@example.test", status: "ACTIVE" } })
    const transport = vi.mocked(sendEmailThroughChannel).getMockImplementation()!
    vi.mocked(sendEmailThroughChannel).mockImplementationOnce(async (command) => {
      await prisma.emailThread.update({ where: { id: thread.id }, data: { channelId: other.id } })
      return transport(command)
    })
    await expect(sendManualEmail({ ...input, threadId: thread.id })).rejects.toThrow("boîte")
    expect(recordOutgoingEmail).not.toHaveBeenCalled()
    expect(await prisma.emailDelivery.findFirstOrThrow({ where: { companyId: input.companyId } })).toMatchObject({ status: "FAILED", providerId: null, providerDraftId: null })
    await prisma.emailThread.update({ where: { id: thread.id }, data: { channelId: channel.id } })
    const sent = await sendManualEmail({ ...input, threadId: thread.id })
    expect(sent.threadId).toBe(thread.id)
    expect(await prisma.emailMessage.count({ where: { companyId: input.companyId, direction: "OUTBOUND" } })).toBe(1)
  })

  it("records a reply in its original mailbox without creating a new thread", async () => {
    const { input } = await fixture()
    const thread = await replyThread(input)
    const sent = await sendManualEmail({ ...input, threadId: thread.id })
    expect(sent.threadId).toBe(thread.id)
    expect(sent.inReplyTo).toBe(thread.original.internetMessageId)
    expect(await prisma.emailThread.count({ where: { companyId: input.companyId } })).toBe(1)
    expect(sendEmailThroughChannel).toHaveBeenCalledTimes(1)
    expect(vi.mocked(sendEmailThroughChannel).mock.calls[0][0].reply).toMatchObject({ messageId: thread.original.id, internetMessageId: thread.original.internetMessageId })
  })

  it("retains the frozen parent when another message arrives before retry", async () => {
    const { input } = await fixture()
    const thread = await replyThread(input)
    vi.mocked(sendEmailThroughChannel).mockRejectedValueOnce(new Error("Injected preparation failure"))
    const command = { ...input, threadId: thread.id }
    await expect(sendManualEmail(command)).rejects.toThrow("preparation failure")
    await prisma.emailMessage.create({ data: { companyId: input.companyId, threadId: thread.id, direction: "INBOUND", provider: "RESEND", providerId: "new-arrival", internetMessageId: "<new-arrival@example.test>", fromAddress: input.to, toAddresses: [], subject: input.subject } })
    await sendManualEmail(command)
    expect(vi.mocked(sendEmailThroughChannel).mock.calls[1][0].reply?.messageId).toBe(thread.original.id)
  })

  it("refuses missing parents and refuses a changed parent before dispatch", async () => {
    const { input } = await fixture()
    const empty = await prisma.emailThread.create({ data: { companyId: input.companyId, clientId: input.clientId, channelId: input.channelId, subject: input.subject } })
    await expect(sendManualEmail({ ...input, threadId: empty.id })).rejects.toThrow("référence")
    expect(sendEmailThroughChannel).not.toHaveBeenCalled()
    const thread = await replyThread(input)
    const transport = vi.mocked(sendEmailThroughChannel).getMockImplementation()!
    vi.mocked(sendEmailThroughChannel).mockImplementationOnce(async command => {
      await prisma.emailMessage.update({ where: { id: thread.original.id }, data: { internetMessageId: "<changed@example.test>" } })
      return transport(command)
    })
    await expect(sendManualEmail({ ...input, threadId: thread.id })).rejects.toThrow("message d’origine a changé")
    expect(recordOutgoingEmail).not.toHaveBeenCalled()
  })

  it("repairs accepted legacy replies but refuses an unaccepted legacy retry", async () => {
    const { input } = await fixture()
    const thread = await replyThread(input)
    const command = { ...input, threadId: thread.id }
    vi.mocked(recordOutgoingEmail).mockRejectedValueOnce(new Error("Injected legacy history failure"))
    await expect(sendManualEmail(command)).rejects.toThrow("legacy history")
    const delivery = await prisma.emailDelivery.findFirstOrThrow({ where: { companyId: input.companyId } })
    const payload = { ...(delivery.payload as Record<string, string | null>) }
    delete payload.reply
    await prisma.emailDelivery.update({ where: { id: delivery.id }, data: { payload } })
    await sendManualEmail(command)
    expect(sendEmailThroughChannel).toHaveBeenCalledTimes(1)
    await prisma.emailDelivery.update({ where: { id: delivery.id }, data: { status: "FAILED", providerId: null } })
    await expect(sendManualEmail(command)).rejects.toThrow("Ancienne réponse")
    expect(sendEmailThroughChannel).toHaveBeenCalledTimes(1)
  })

  it("blocks blind retries after the provider idempotency window", async () => {
    const { input } = await fixture()
    vi.mocked(sendEmailThroughChannel).mockRejectedValueOnce(new Error("Timeout after remote acceptance"))
    await expect(sendManualEmail(input)).rejects.toThrow("Timeout")
    await prisma.emailDelivery.updateMany({ where: { companyId: input.companyId }, data: { firstAttemptAt: new Date(Date.now() - 25 * 60 * 60_000) } })
    await expect(sendManualEmail(input)).rejects.toThrow("Vérifiez le résultat")
    expect(sendEmailThroughChannel).toHaveBeenCalledTimes(1)
    expect((await prisma.emailDelivery.findFirstOrThrow({ where: { companyId: input.companyId } })).status).toBe("DEAD_LETTER")
  })

  it("allows only one worker to dispatch a concurrent double click", async () => {
    const { input } = await fixture()
    const transport = vi.mocked(sendEmailThroughChannel).getMockImplementation()!
    let release!: () => void
    let started!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const dispatched = new Promise<void>((resolve) => { started = resolve })
    vi.mocked(sendEmailThroughChannel).mockImplementationOnce(async (command) => { started(); await gate; return transport(command) })
    const first = sendManualEmail(input)
    await dispatched
    try {
      await expect(sendManualEmail(input)).rejects.toThrow("déjà en cours")
    } finally { release() }
    await first
    expect(sendEmailThroughChannel).toHaveBeenCalledTimes(1)
  })
})
