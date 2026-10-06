import { afterAll, afterEach, describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
import prisma from "@/lib/prisma"
import { encrypt } from "@/lib/crypto"
import { sendManualEmail } from "@/lib/communications/manual-send"

describe.sequential("native reply commands through SQL and isolated provider HTTP", () => {
  const companies: string[] = []
  afterEach(() => vi.unstubAllGlobals())
  afterAll(async () => {
    for (const companyId of companies) {
      await prisma.emailThread.deleteMany({ where: { companyId } })
      await prisma.contact.deleteMany({ where: { client: { companyId } } })
      await prisma.client.deleteMany({ where: { companyId } })
      await prisma.company.delete({ where: { id: companyId } })
    }
  })

  async function fixture(provider: "GOOGLE" | "MICROSOFT" | "RESEND") {
    const company = await prisma.company.create({ data: { name: "Fictitious native reply" } })
    companies.push(company.id)
    const client = await prisma.client.create({ data: { companyId: company.id, name: "Fictitious client" } })
    const contact = await prisma.contact.create({ data: { clientId: client.id, firstName: "Fiction", lastName: "Native", email: "recipient@example.test" } })
    const channel = await prisma.communicationChannel.create({ data: { companyId: company.id, provider, emailAddress: "sender@example.test", status: "ACTIVE", credentialsEncrypted: encrypt(JSON.stringify(provider === "RESEND" ? { mode: "BYOK", apiKey: "fiction-resend-key-only", webhookSecret: "fiction-webhook-key-only" } : { mode: "OAUTH", accessToken: "fiction-access-token-only", refreshToken: "fiction-refresh-token-only", tokenType: "Bearer", scope: "Mail.Send Mail.ReadWrite https://www.googleapis.com/auth/gmail.modify", expiresAt: "2099-01-01T00:00:00.000Z" })) } })
    const thread = await prisma.emailThread.create({ data: { companyId: company.id, channelId: channel.id, clientId: client.id, contactId: contact.id, subject: "Fictitious native conversation" } })
    await prisma.emailMessage.create({ data: { companyId: company.id, threadId: thread.id, direction: "INBOUND", provider, providerId: `${channel.id}:parent`, internetMessageId: "<parent@example.test>", fromAddress: contact.email!, toAddresses: [channel.emailAddress], subject: thread.subject } })
    const command = { companyId: company.id, userId: "fiction-owner", companyName: company.name, purpose: "SERVICE" as const, clientId: client.id, contactId: contact.id, channelId: channel.id, requestKey: crypto.randomUUID(), threadId: thread.id, serviceTicketId: null, to: contact.email!, cc: ["cc@example.test"], bcc: ["hidden@example.test"], replyTo: null, subject: `Re: ${thread.subject}`, html: "<p>Fictitious reply only</p>" }
    return { company, channel, thread, command }
  }

  it.each(["GOOGLE", "MICROSOFT", "RESEND"] as const)("persists the %s reply identity before sending and repairs acceptance after an HTTP timeout", async provider => {
    const { company, channel, thread, command } = await fixture(provider)
    let accepted = false
    let sentCount = 0
    let resendBody: string | undefined
    const http = vi.fn(async (url: string | URL | Request, options?: RequestInit) => {
      const target = String(url)
      if (target === "https://api.resend.com/emails" && options?.method === "POST") {
        const prepared = await prisma.emailDelivery.findFirstOrThrow({ where: { companyId: company.id } })
        expect(options.headers).toMatchObject({ "Idempotency-Key": prepared.id })
        expect(JSON.parse(String(options.body)).headers).toMatchObject({ "In-Reply-To": "<parent@example.test>", References: "<parent@example.test>" })
        expect(JSON.parse(String(options.body))).toMatchObject({ cc: command.cc, bcc: command.bcc })
        if (accepted) {
          expect(String(options.body)).toBe(resendBody)
          return Response.json({ id: "native-resend" })
        }
        resendBody = String(options.body)
        accepted = true
        sentCount++
        throw new Error("Injected HTTP timeout after provider acceptance")
      }
      if (options?.method === "POST" && (target.endsWith("/drafts/send") || target.endsWith("/native-draft/send"))) {
        const prepared = await prisma.emailDelivery.findFirstOrThrow({ where: { companyId: company.id } })
        expect(prepared.providerDraftId).toBe("native-draft")
        expect(prepared.payload).toMatchObject({ reply: { internetMessageId: "<parent@example.test>" } })
        expect(prepared.providerMessageId).toMatch(/^<.+@.+>$/)
        accepted = true
        sentCount++
        throw new Error("Injected HTTP timeout after provider acceptance")
      }
      if (target.includes("/drafts/native-draft") || target.includes("/messages/native-draft?")) {
        return provider === "GOOGLE" ? new Response(null, { status: 404 }) : Response.json({ id: "native-draft", isDraft: false })
      }
      if (target.includes("/messages/parent?")) return Response.json(provider === "GOOGLE"
        ? { id: "parent", threadId: "native-thread", payload: { headers: [{ name: "Message-ID", value: "<parent@example.test>" }, { name: "Subject", value: thread.subject }, { name: "From", value: command.to }] } }
        : { id: "parent", internetMessageId: "<parent@example.test>", subject: thread.subject, from: { emailAddress: { address: command.to } } })
      if (options?.method === "POST" && (target.endsWith("/drafts") || target.endsWith("/parent/createReply"))) {
        const raw = provider === "GOOGLE" ? JSON.parse(String(options.body)).message.raw : String(options.body)
        const mime = Buffer.from(raw, provider === "GOOGLE" ? "base64url" : "base64").toString("utf8")
        expect(mime).toContain("In-Reply-To: <parent@example.test>")
        expect(mime).toContain("\r\nCc: cc@example.test\r\n")
        expect(mime).toContain("\r\nBcc: hidden@example.test\r\n")
        if (provider === "GOOGLE") expect(JSON.parse(String(options.body)).message.threadId).toBe("native-thread")
        return Response.json({ id: "native-draft", internetMessageId: "<graph-native@example.test>" }, { status: 201 })
      }
      if (target.includes("/messages?")) return Response.json(provider === "GOOGLE" ? { messages: accepted ? [{ id: "already-sent" }] : [] } : { value: [] })
      throw new Error(`Unexpected isolated HTTP request: ${target}`)
    })
    vi.stubGlobal("fetch", http)
    await expect(sendManualEmail(command)).rejects.toThrow("HTTP timeout")
    const message = await sendManualEmail(command)
    expect(message.threadId).toBe(thread.id)
    expect(message.inReplyTo).toBe("<parent@example.test>")
    expect(message.ccAddresses).toEqual(command.cc)
    expect(message.bccAddresses).toEqual(command.bcc)
    expect(message.internetMessageId).toBe(provider === "RESEND" ? null : provider === "GOOGLE" ? `<${(await prisma.emailDelivery.findFirstOrThrow({ where: { companyId: company.id } })).id}@mail.freelio.app>` : "<graph-native@example.test>")
    expect(message.providerId).toBe(provider === "RESEND" ? "native-resend" : `${channel.id}:${provider === "GOOGLE" ? "already-sent" : "native-draft"}`)
    expect(sentCount).toBe(1)
    const calls = http.mock.calls.length
    await sendManualEmail(command)
    expect(http).toHaveBeenCalledTimes(calls)
    expect(await prisma.emailMessage.count({ where: { companyId: company.id, direction: "OUTBOUND" } })).toBe(1)
  })
})
