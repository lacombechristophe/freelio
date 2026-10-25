import { createHmac } from "node:crypto"
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
vi.mock("@/lib/portal/notifications", () => ({ notifyPortalTeam: vi.fn() }))
import prisma from "@/lib/prisma"
import { encrypt } from "@/lib/crypto"
import { POST } from "@/app/api/webhooks/resend/route"

describe.sequential("signed Resend webhooks and tenant identity", () => {
  const companies: string[] = []
  beforeEach(() => vi.unstubAllGlobals())
  afterAll(async () => {
    vi.unstubAllGlobals()
    for (const companyId of companies) {
      await prisma.automationEventOutbox.deleteMany({ where: { companyId } })
      await prisma.emailThread.deleteMany({ where: { companyId } })
      await prisma.company.delete({ where: { id: companyId } })
    }
  })
  const secretA = Buffer.from("a".repeat(32)), secretB = Buffer.from("b".repeat(32))
  const credentials = (secret: Buffer) => encrypt(JSON.stringify({ mode: "BYOK", apiKey: "re_fictional_key", webhookSecret: `whsec_${secret.toString("base64")}` }))
  async function fixture(secret: Buffer) {
    const company = await prisma.company.create({ data: { name: "Fictitious webhook tenant" } }); companies.push(company.id)
    const channel = await prisma.communicationChannel.create({ data: { companyId: company.id, provider: "RESEND", visibility: "SHARED", emailAddress: `${company.id}@example.test`, status: "ACTIVE", credentialsEncrypted: credentials(secret) } })
    const thread = await prisma.emailThread.create({ data: { companyId: company.id, channelId: channel.id, subject: "Fixture", messages: { create: { companyId: company.id, direction: "OUTBOUND", provider: "RESEND", providerId: "same-remote-id", fromAddress: channel.emailAddress, toAddresses: ["fiction@example.test"], subject: "Fixture", status: "SENT" } } } })
    return { company, channel, thread }
  }
  function request(event: object, secret: Buffer, id = "fixture-event", channelId?: string) {
    const payload = JSON.stringify(event), timestamp = Math.floor(Date.now() / 1000).toString()
    const signature = createHmac("sha256", secret).update(`${id}.${timestamp}.${payload}`).digest("base64")
    return new Request(`https://example.test/api/webhooks/resend${channelId ? `?channelId=${channelId}` : ""}`, { method: "POST", body: payload, headers: { "svix-id": id, "svix-timestamp": timestamp, "svix-signature": `v1,${signature}` } })
  }
  const delivered = () => ({ type: "email.delivered", created_at: new Date().toISOString(), data: { email_id: "same-remote-id", from: "fixture@example.test", to: ["fiction@example.test"], subject: "Fixture", created_at: new Date().toISOString() } })

  it("allows the same remote identifier in two companies and changes only the signature's tenant", async () => {
    const first = await fixture(secretA), second = await fixture(secretB)
    const event = delivered(), eventId = `${first.company.id}:event`
    expect((await POST(request(event, secretA, eventId))).status).toBe(200)
    expect((await prisma.emailMessage.findFirstOrThrow({ where: { threadId: first.thread.id } })).status).toBe("DELIVERED")
    expect((await prisma.emailMessage.findFirstOrThrow({ where: { threadId: second.thread.id } })).status).toBe("SENT")
    expect((await POST(request(event, secretA, eventId))).status).toBe(200)
    expect(await prisma.emailEvent.count({ where: { companyId: first.company.id } })).toBe(1)
    expect(await prisma.emailEvent.count({ where: { companyId: second.company.id } })).toBe(0)
  })
  it("rejects ambiguous shared secrets until the connection URL is explicit", async () => {
    const first = await fixture(secretA), second = await fixture(secretA)
    // Other fixtures have the same remote ID, but their signatures differ.
    const event = delivered(), id = `${first.company.id}:ambiguous`
    expect((await POST(request(event, secretA, id))).status).toBe(400)
    expect(await prisma.emailEvent.count({ where: { companyId: { in: [first.company.id, second.company.id] } } })).toBe(0)
    expect((await POST(request(event, secretA, id, first.channel.id))).status).toBe(200)
    expect(await prisma.emailEvent.count({ where: { companyId: second.company.id } })).toBe(0)
  })
  it("persists inbound mail and its event once before acknowledgement", async () => {
    const { company, channel } = await fixture(secretB)
    const id = `${company.id}:inbound`
    const event = { type: "email.received", created_at: new Date().toISOString(), data: { email_id: "inbound-fixture", from: "sender@example.test", to: [channel.emailAddress], received_for: [channel.emailAddress], subject: "Inbound", created_at: new Date().toISOString() } }
    const fetch = vi.fn(async () => Response.json({ from: "sender@example.test", to: [channel.emailAddress], subject: "Inbound", message_id: "<inbound@example.test>", html: "<p>Fictitious</p>", text: "Fictitious", headers: {}, attachments: [] }))
    vi.stubGlobal("fetch", fetch)
    expect((await POST(request(event, secretB, id, channel.id))).status).toBe(200)
    expect(await prisma.automationEventOutbox.count({ where: { companyId: company.id, event: "EMAIL_RECEIVED" } })).toBe(1)
    expect((await POST(request(event, secretB, id, channel.id))).status).toBe(200)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(await prisma.emailThread.count({ where: { companyId: company.id } })).toBe(2)
  })
})
