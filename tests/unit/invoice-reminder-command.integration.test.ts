import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
vi.mock("@/lib/communications/email-provider", async original => {
  const actual = await original<typeof import("@/lib/communications/email-provider")>()
  return { ...actual, sendEmailThroughChannel: vi.fn() }
})
vi.mock("@/lib/communications/threads", async original => {
  const actual = await original<typeof import("@/lib/communications/threads")>()
  return { ...actual, recordOutgoingEmail: vi.fn(actual.recordOutgoingEmail) }
})
import prisma from "@/lib/prisma"
import { sendEmailThroughChannel } from "@/lib/communications/email-provider"
import { recordOutgoingEmail } from "@/lib/communications/threads"
import { sendInvoiceReminderRecord } from "@/lib/finance/invoice-reminder-sender"
import { requestContext } from "@/lib/context"

describe.sequential("invoice reminder transport identity and acceptance recovery on SQL", () => {
  const companies: string[] = [], users: string[] = []
  beforeEach(() => vi.clearAllMocks())
  afterAll(async () => {
    for (const companyId of companies) {
      await prisma.invoice.deleteMany({ where: { companyId } })
      await prisma.contact.deleteMany({ where: { client: { companyId } } })
      await prisma.client.deleteMany({ where: { companyId } })
      await prisma.company.delete({ where: { id: companyId } })
    }
    await prisma.user.deleteMany({ where: { id: { in: users } } })
  })
  async function fixture() {
    const company = await prisma.company.create({ data: { name: "Fictional invoice reminder" } }); companies.push(company.id)
    const user = await prisma.user.create({ data: { name: "Fictional accountant" } }); users.push(user.id)
    const client = await prisma.client.create({ data: { companyId: company.id, name: "Fictional client" } })
    await prisma.contact.create({ data: { clientId: client.id, firstName: "Fiction", lastName: "Recipient", email: "recipient@example.test" } })
    const invoice = await prisma.invoice.create({ data: { companyId: company.id, clientId: client.id, number: "FICTION-001", object: "Fiction", status: "OVERDUE", dueDate: new Date("2026-09-01"), totalHtCents: 10000, totalTvaCents: 2000, totalTtcCents: 12000 } })
    const reminder = await prisma.invoiceReminder.create({ data: { companyId: company.id, invoiceId: invoice.id, subject: "Fictional reminder", message: "Fictional outstanding payment only", remainingCents: 12000 } })
    const channel = await prisma.communicationChannel.create({ data: { companyId: company.id, ownerUserId: user.id, visibility: "PRIVATE", provider: "GOOGLE", status: "ACTIVE", emailAddress: "sender@example.test" } })
    vi.mocked(sendEmailThroughChannel).mockImplementation(async input => {
      await input.beforeDispatch?.()
      await input.onPrepared?.({ provider: "GOOGLE", channelId: channel.id, providerDraftId: "fiction-draft", providerMessageId: "<fiction@example.test>" })
      return { provider: "GOOGLE", channelId: channel.id, providerId: `${channel.id}:fiction-accepted`, providerDraftId: "fiction-draft", providerMessageId: "<fiction@example.test>", from: input.from! }
    })
    return { companyId: company.id, userId: user.id, invoice, reminder, channel, input: { companyId: company.id, reminderId: reminder.id, channelId: channel.id } }
  }

  it("journals the original private mailbox and native Message-ID for an accountant", async () => {
    const f = await fixture()
    await requestContext.run({ companyId: f.companyId, userId: f.userId, role: "ACCOUNTING", membershipId: "fixture", agencyIds: null, actionPermission: "finance.write" }, async () => {
      const result = await sendInvoiceReminderRecord(f.input)
      expect(result.alreadySent).toBe(false)
      const message = await prisma.emailMessage.findFirstOrThrow({ where: { companyId: f.companyId } })
      expect(message.internetMessageId).toBe("<fiction@example.test>")
      expect((await prisma.emailThread.findUniqueOrThrow({ where: { id: message.threadId } })).channelId).toBe(f.channel.id)
    })
    await sendInvoiceReminderRecord(f.input)
    expect(sendEmailThroughChannel).toHaveBeenCalledTimes(1)
  })

  it("repairs accepted history after payment without another remote send", async () => {
    const f = await fixture()
    vi.mocked(recordOutgoingEmail).mockRejectedValueOnce(new Error("Injected history write failure"))
    await expect(sendInvoiceReminderRecord(f.input)).rejects.toThrow("history write failure")
    expect((await prisma.emailDelivery.findFirstOrThrow({ where: { companyId: f.companyId } })).status).toBe("SENT")
    await prisma.invoice.update({ where: { id: f.invoice.id }, data: { status: "PAID", paidAmountCents: 12000 } })
    const repaired = await sendInvoiceReminderRecord(f.input)
    expect(repaired.reminder.status).toBe("SENT")
    expect(sendEmailThroughChannel).toHaveBeenCalledTimes(1)
    expect(await prisma.emailMessage.count({ where: { companyId: f.companyId } })).toBe(1)
  })

  it("retains the prepared draft and custom content across a timeout, rejecting changed intent", async () => {
    const f = await fixture(), input = { ...f.input, subject: "Custom fictional subject", message: "Custom fictional payment reminder" }
    vi.mocked(sendEmailThroughChannel).mockImplementationOnce(async command => {
      await command.onPrepared?.({ provider: "GOOGLE", channelId: f.channel.id, providerDraftId: "prepared-before-timeout", providerMessageId: "<prepared@example.test>" })
      throw new Error("Ambiguous HTTP timeout")
    })
    await expect(sendInvoiceReminderRecord(input)).rejects.toThrow("timeout")
    await expect(sendInvoiceReminderRecord({ ...input, message: "Changed message" })).rejects.toThrow("déjà figé")
    expect((await prisma.invoiceReminder.findUniqueOrThrow({ where: { id: f.reminder.id } })).message).toBe(input.message)
    await sendInvoiceReminderRecord(input)
    expect(vi.mocked(sendEmailThroughChannel).mock.calls[1][0].resume?.providerDraftId).toBe("prepared-before-timeout")
    expect(vi.mocked(sendEmailThroughChannel).mock.calls[0][0].idempotencyKey).toBe(vi.mocked(sendEmailThroughChannel).mock.calls[1][0].idempotencyKey)
  })

  it("blocks a paid invoice both initially and immediately before remote dispatch", async () => {
    const f = await fixture()
    await prisma.invoice.update({ where: { id: f.invoice.id }, data: { status: "PAID", paidAmountCents: 12000 } })
    await expect(sendInvoiceReminderRecord(f.input)).rejects.toThrow("éligible")
    expect(sendEmailThroughChannel).not.toHaveBeenCalled()
    await prisma.invoice.update({ where: { id: f.invoice.id }, data: { status: "OVERDUE", paidAmountCents: 0 } })
    let dispatched = false
    vi.mocked(sendEmailThroughChannel).mockImplementationOnce(async command => {
      await prisma.invoice.update({ where: { id: f.invoice.id }, data: { paidAmountCents: 12000 } })
      await command.beforeDispatch?.()
      dispatched = true
      throw new Error("Should never dispatch")
    })
    await expect(sendInvoiceReminderRecord(f.input)).rejects.toThrow("éligible")
    expect(dispatched).toBe(false)
  })

  it("refuses ambiguous legacy attempts while allowing a failed preflight to be corrected", async () => {
    const f = await fixture()
    await prisma.invoiceReminder.update({ where: { id: f.reminder.id }, data: { status: "FAILED" } })
    await expect(sendInvoiceReminderRecord(f.input)).rejects.toThrow("Ancienne relance")
    expect(sendEmailThroughChannel).not.toHaveBeenCalled()
    await prisma.invoiceReminder.update({ where: { id: f.reminder.id }, data: { status: "PREPARED" } })
    await prisma.communicationChannel.update({ where: { id: f.channel.id }, data: { status: "PENDING" } })
    await expect(sendInvoiceReminderRecord(f.input)).rejects.toThrow("Aucune messagerie")
    expect((await prisma.invoiceReminder.findUniqueOrThrow({ where: { id: f.reminder.id } })).status).toBe("PREPARED")
    await prisma.communicationChannel.update({ where: { id: f.channel.id }, data: { status: "ACTIVE" } })
    await sendInvoiceReminderRecord(f.input)
    expect(sendEmailThroughChannel).toHaveBeenCalledTimes(1)
  })

  it("refuses a frozen amount after a partial payment instead of sending an outdated balance", async () => {
    const f = await fixture()
    vi.mocked(sendEmailThroughChannel).mockRejectedValueOnce(new Error("Ambiguous timeout"))
    await expect(sendInvoiceReminderRecord(f.input)).rejects.toThrow("timeout")
    await prisma.invoice.update({ where: { id: f.invoice.id }, data: { paidAmountCents: 6000 } })
    await expect(sendInvoiceReminderRecord(f.input)).rejects.toThrow("solde a changé")
    expect(sendEmailThroughChannel).toHaveBeenCalledTimes(1)
    expect((await prisma.emailDelivery.findFirstOrThrow({ where: { companyId: f.companyId } })).payload).toMatchObject({ invoiceSnapshot: { invoiceId: f.invoice.id, remainingCents: 12000 } })
  })

  it("refuses an outdated preview before the first attempt and refuses unknown legacy balances", async () => {
    const f = await fixture()
    await prisma.invoice.update({ where: { id: f.invoice.id }, data: { paidAmountCents: 6000 } })
    await expect(sendInvoiceReminderRecord(f.input)).rejects.toThrow("solde a changé")
    expect(sendEmailThroughChannel).not.toHaveBeenCalled()
    expect(await prisma.emailDelivery.count({ where: { companyId: f.companyId } })).toBe(0)
    await prisma.invoiceReminder.update({ where: { id: f.reminder.id }, data: { remainingCents: null } })
    await expect(sendInvoiceReminderRecord(f.input)).rejects.toThrow("sans solde figé")
    expect(sendEmailThroughChannel).not.toHaveBeenCalled()
  })

  it("rejects a reminder with a foreign client before preparing a delivery", async () => {
    const f = await fixture()
    const foreign = await prisma.company.create({ data: { name: "Fictional foreign reminder company" } }); companies.push(foreign.id)
    await prisma.client.update({ where: { id: f.invoice.clientId }, data: { companyId: foreign.id } })
    await expect(sendInvoiceReminderRecord(f.input)).rejects.toThrow("Relance introuvable")
    expect(sendEmailThroughChannel).not.toHaveBeenCalled()
    expect(await prisma.emailDelivery.count({ where: { companyId: f.companyId } })).toBe(0)
    expect(await prisma.invoiceReminder.findUniqueOrThrow({ where: { id: f.reminder.id } })).toMatchObject({ status: "PREPARED" })
  })

  it("rechecks client company immediately before dispatch", async () => {
    const f = await fixture()
    const foreign = await prisma.company.create({ data: { name: "Fictional changed reminder company" } }); companies.push(foreign.id)
    let dispatched = false
    vi.mocked(sendEmailThroughChannel).mockImplementationOnce(async command => {
      await prisma.client.update({ where: { id: f.invoice.clientId }, data: { companyId: foreign.id } })
      await command.beforeDispatch?.()
      dispatched = true
      throw new Error("Should never dispatch")
    })
    await expect(sendInvoiceReminderRecord(f.input)).rejects.toThrow("éligible")
    expect(dispatched).toBe(false)
    expect(await prisma.emailMessage.count({ where: { companyId: f.companyId } })).toBe(0)
  })
})
