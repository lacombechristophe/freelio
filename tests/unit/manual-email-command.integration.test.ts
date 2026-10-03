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
