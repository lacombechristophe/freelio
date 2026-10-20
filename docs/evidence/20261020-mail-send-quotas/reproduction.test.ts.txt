import { afterAll, afterEach, describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
import prisma from "@/lib/prisma"
import { encrypt } from "@/lib/crypto"
import { sendEmailThroughChannel } from "@/lib/communications/email-provider"
import { EmailSendQuotaError } from "@/lib/communications/send-quotas"

describe.sequential("mail quota boundary at the real transport with fictional HTTP", () => {
  const companyIds: string[] = []
  afterEach(() => vi.unstubAllGlobals())
  afterAll(async () => {
    for (const companyId of companyIds) {
      await prisma.emailSendQuotaCharge.deleteMany({ where: { companyId } })
      await prisma.emailSendQuotaState.deleteMany({ where: { companyId } })
      await prisma.emailSendQuotaPolicy.deleteMany({ where: { companyId } })
      await prisma.company.delete({ where: { id: companyId } })
    }
  })
  async function fixture(configured = true, provider = "RESEND") {
    const company = await prisma.company.create({ data: { name: "Fictional transport quota" } }); companyIds.push(company.id)
    const channel = await prisma.communicationChannel.create({ data: { companyId: company.id, provider, status: "ACTIVE", emailAddress: "sender@example.test",
      credentialsEncrypted: encrypt(JSON.stringify(provider === "RESEND" ? { mode: "BYOK", apiKey: "re_fictional_only", webhookSecret: "whsec_fictional_only" } : {
        mode: "OAUTH", accessToken: "fictional_access_token", refreshToken: "fictional_refresh_token", tokenType: "Bearer", scope: "https://www.googleapis.com/auth/gmail.modify Mail.Send Mail.ReadWrite", expiresAt: "2099-01-01T00:00:00Z",
      })) } })
    if (configured) await prisma.emailSendQuotaPolicy.create({ data: { companyId: company.id, channelKey: channel.id, channelId: channel.id, enabled: true, dailyRecipientLimit: 1, minuteRecipientLimit: 1 } })
    const delivery = await prisma.emailDelivery.create({ data: { companyId: company.id, channelId: channel.id, provider: "RESEND", recipientEmail: "recipient@example.test", subject: "Fictional quota", status: "SENDING", scheduledAt: new Date() } })
    const input = { companyId: company.id, companyName: company.name, channelId: channel.id, idempotencyKey: delivery.id, to: delivery.recipientEmail, subject: delivery.subject, html: "<p>Fictional content</p>" }
    const http = vi.fn().mockImplementation(async () => Response.json({ id: "fictional-accepted" })); vi.stubGlobal("fetch", http)
    return { company, channel, delivery, input, http }
  }
  it("refuses a new send without an explicit policy before its remote send request", async () => {
    const f = await fixture(false)
    await expect(sendEmailThroughChannel(f.input)).rejects.toBeInstanceOf(EmailSendQuotaError)
    expect(f.http).not.toHaveBeenCalled()
    expect(await prisma.emailSendQuotaCharge.count({ where: { companyId: f.company.id } })).toBe(0)
  })
  it("admits an identical retry once but blocks a different command after the cap", async () => {
    const f = await fixture()
    await sendEmailThroughChannel(f.input)
    await sendEmailThroughChannel(f.input)
    expect(f.http).toHaveBeenCalledTimes(2)
    expect(await prisma.emailSendQuotaCharge.count({ where: { companyId: f.company.id } })).toBe(2)
    const other = await prisma.emailDelivery.create({ data: { companyId: f.company.id, channelId: f.channel.id, provider: "RESEND", recipientEmail: f.delivery.recipientEmail, subject: f.delivery.subject, status: "SENDING", scheduledAt: new Date() } })
    await expect(sendEmailThroughChannel({ ...f.input, idempotencyKey: other.id })).rejects.toBeInstanceOf(EmailSendQuotaError)
    expect(f.http).toHaveBeenCalledTimes(2)
  })
  it("retains admissions after a remote timeout and refuses changed content on that command", async () => {
    const f = await fixture()
    f.http.mockRejectedValueOnce(new Error("Fictional timeout"))
    await expect(sendEmailThroughChannel(f.input)).rejects.toThrow("Fictional timeout")
    expect(await prisma.emailSendQuotaCharge.count({ where: { companyId: f.company.id } })).toBe(2)
    await expect(sendEmailThroughChannel({ ...f.input, html: "<p>Changed</p>" })).rejects.toThrow("incohérente")
    expect(f.http).toHaveBeenCalledTimes(1)
  })
  it("does not charge when the caller's final authorization fails", async () => {
    const f = await fixture()
    await expect(sendEmailThroughChannel({ ...f.input, beforeDispatch: async () => { throw new Error("Fictional lease lost") } })).rejects.toThrow("lease lost")
    expect(f.http).not.toHaveBeenCalled()
    expect(await prisma.emailSendQuotaCharge.count({ where: { companyId: f.company.id } })).toBe(0)
  })
  it.each(["GOOGLE", "MICROSOFT"])("blocks the actual %s send after preparing a durable draft", async provider => {
    const f = await fixture(false, provider)
    f.http.mockImplementation(async (url: string | URL, init?: RequestInit) => {
      const value = String(url)
      if (init?.method !== "POST") return Response.json(provider === "GOOGLE" ? { messages: [] } : { value: [] })
      if (value.endsWith("/drafts") || value.endsWith("/me/messages")) return Response.json({ id: "fictional-draft" })
      throw new Error("An unadmitted send must never reach HTTP")
    })
    await expect(sendEmailThroughChannel({ ...f.input, onPrepared: async state => { await prisma.emailDelivery.update({ where: { id: f.delivery.id }, data: { ...state } }) } })).rejects.toBeInstanceOf(EmailSendQuotaError)
    expect(f.http).toHaveBeenCalledTimes(2)
    expect(await prisma.emailDelivery.findUniqueOrThrow({ where: { id: f.delivery.id } })).toMatchObject({ providerDraftId: "fictional-draft", providerId: null })
    expect(await prisma.emailSendQuotaCharge.count({ where: { companyId: f.company.id } })).toBe(0)
  })
  it.each(["GOOGLE", "MICROSOFT"])("can reconcile an already accepted %s command while the quota is unconfigured", async provider => {
    const f = await fixture(false, provider)
    f.http.mockImplementation(async (url: string | URL, init?: RequestInit) => {
      expect(init?.method || "GET").toBe("GET")
      if (String(url).includes("/drafts/")) return new Response(null, { status: 404 })
      return Response.json(provider === "GOOGLE" ? { messages: [{ id: "already-sent", threadId: "native-thread" }] } : { id: "already-sent", isDraft: false })
    })
    expect(await sendEmailThroughChannel({ ...f.input, resume: { provider, channelId: f.channel.id, providerDraftId: "fictional-draft" } })).toMatchObject({ providerId: `${f.channel.id}:already-sent` })
    expect(await prisma.emailSendQuotaCharge.count({ where: { companyId: f.company.id } })).toBe(0)
  })
  it.each(["GOOGLE", "MICROSOFT"])("admits a %s send only after the prepared draft is persisted", async provider => {
    const f = await fixture(true, provider)
    f.http.mockImplementation(async (url: string | URL, init?: RequestInit) => {
      const value = String(url)
      if (init?.method !== "POST") return Response.json(provider === "GOOGLE" ? { messages: [] } : { value: [] })
      if (value.endsWith("/drafts") || value.endsWith("/me/messages")) {
        expect(await prisma.emailSendQuotaCharge.count({ where: { companyId: f.company.id } })).toBe(0)
        return Response.json({ id: "fictional-draft" })
      }
      expect(await prisma.emailSendQuotaCharge.count({ where: { companyId: f.company.id } })).toBe(2)
      expect(await prisma.emailDelivery.findUniqueOrThrow({ where: { id: f.delivery.id } })).toMatchObject({ providerDraftId: "fictional-draft" })
      return provider === "GOOGLE" ? Response.json({ id: "fictional-sent" }) : new Response(null, { status: 202 })
    })
    await sendEmailThroughChannel({ ...f.input, onPrepared: async state => { await prisma.emailDelivery.update({ where: { id: f.delivery.id }, data: { ...state } }) } })
    expect(f.http).toHaveBeenCalledTimes(3)
  })
})
