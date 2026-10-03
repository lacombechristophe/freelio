import { beforeEach, describe, expect, it, vi } from "vitest"
import { createHash, randomUUID } from "node:crypto"

const prismaMock = vi.hoisted(() => ({
  emailSuppression: { findUnique: vi.fn() },
  communicationChannel: {
    findFirst: vi.fn(),
    findMany: vi.fn(async (...args: unknown[]) => [await prismaMock.communicationChannel.findFirst(...args)]),
    findFirstOrThrow: vi.fn(async (...args: unknown[]) => prismaMock.communicationChannel.findFirst(...args)),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
}))

vi.mock("server-only", () => ({}))
vi.mock("@/lib/prisma", () => ({ default: prismaMock }))
vi.mock("@/lib/crypto", () => ({ decrypt: (value: string) => value, encrypt: (value: string) => value }))
vi.mock("@/lib/communications/provider-credentials", () => ({
  formatMailboxSender: (name: string, address: string) => `${name} <${address}>`,
  getResendTransport: vi.fn(),
}))
vi.mock("@/lib/integrations/email-oauth", () => ({
  EMAIL_OAUTH_PROVIDERS: ["GOOGLE", "MICROSOFT"],
  refreshEmailOAuthAccessToken: vi.fn(),
}))

import { sendEmailThroughChannel } from "@/lib/communications/email-provider"
import { getResendTransport } from "@/lib/communications/provider-credentials"
import type { ReplyContext } from "@/lib/communications/reply-context"

const credentials = JSON.stringify({
  mode: "OAUTH",
  accessToken: "access-token-long-enough",
  refreshToken: "refresh-token-long-enough",
  tokenType: "Bearer",
  scope: "Mail.Send Mail.ReadWrite https://www.googleapis.com/auth/gmail.modify",
  expiresAt: "2099-01-01T00:00:00.000Z",
})

function channel(provider: "GOOGLE" | "MICROSOFT") {
  return { id: `channel-${provider.toLowerCase()}`, provider, emailAddress: "equipe@example.fr", displayName: "Équipe", credentialsEncrypted: credentials, lastSyncAt: null }
}

const baseInput = {
  companyId: "company-1",
  companyName: "Entreprise",
  to: "client@example.fr",
  subject: "Votre projet",
  html: "<p>Bonjour</p>",
  idempotencyKey: "delivery-1",
}

describe("OAuth email crash recovery", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    prismaMock.emailSuppression.findUnique.mockResolvedValue(null)
    prismaMock.communicationChannel.update.mockResolvedValue({})
  })

  function attachment() {
    const bytes = Buffer.from("%PDF-fictitious attachment only")
    return { id: randomUUID(), name: "facture fictive.pdf", size: bytes.length, type: "application/pdf" as const, sha256: createHash("sha256").update(bytes).digest("hex"), relativePath: "local:private/fiction/email-draft/fiction/file.pdf", bytes }
  }

  it.each(["GOOGLE", "RESEND"] as const)("submits verified attachment bytes using the %s envelope", async provider => {
    const file = attachment()
    prismaMock.communicationChannel.findFirst.mockResolvedValue({ ...channel("GOOGLE"), provider })
    vi.mocked(getResendTransport).mockResolvedValue({ apiKey: "re_fiction_only" } as Awaited<ReturnType<typeof getResendTransport>>)
    const fetchMock = provider === "GOOGLE" ? vi.fn().mockResolvedValueOnce(Response.json({ messages: [] })).mockResolvedValueOnce(Response.json({ id: "attachment-draft" })).mockResolvedValueOnce(Response.json({ id: "attachment-sent" })) : vi.fn().mockResolvedValue(Response.json({ id: "attachment-sent" }))
    vi.stubGlobal("fetch", fetchMock)
    await sendEmailThroughChannel({ ...baseInput, attachments: [file] })
    if (provider === "GOOGLE") {
      const mime = Buffer.from(JSON.parse(fetchMock.mock.calls[1][1].body).message.raw, "base64url").toString()
      expect(mime).toContain("Content-Type: multipart/mixed;")
      expect(mime).toContain("filename*=UTF-8''facture%20fictive.pdf")
      expect(mime).toContain(file.bytes.toString("base64"))
    } else expect(JSON.parse(fetchMock.mock.calls[0][1].body).attachments).toMatchObject([{ filename: file.name, content: file.bytes.toString("base64") }])
    fetchMock.mockClear()
    await expect(sendEmailThroughChannel({ ...baseInput, attachments: [{ ...file, sha256: "0".repeat(64) }] })).rejects.toThrow("altérée")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("persists the Microsoft draft before attaching and resumes accepted attachments without creating a new draft", async () => {
    const file = attachment(); let persisted = false, attached = false, sent = false, creations = 0, sends = 0, additions = 0
    prismaMock.communicationChannel.findFirst.mockResolvedValue(channel("MICROSOFT"))
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL, input?: RequestInit) => {
      const value = String(url)
      if (value.includes("/attachments?")) return Response.json({ value: attached ? [{ id: "remote-attachment", name: file.name, size: file.size, contentId: `freelio-${file.id}` }] : [] })
      if (value.endsWith("/$value")) return new Response(new Uint8Array(file.bytes))
      if (value.endsWith("/attachments") && input?.method === "POST") { expect(persisted).toBe(true); attached = true; additions++; throw new Error("Attachment acceptance timeout") }
      if (value.includes("/me/messages?")) return Response.json({ value: [] })
      if (value.endsWith("/me/messages") && input?.method === "POST") { creations++; return Response.json({ id: "prepared-with-files", internetMessageId: "<with-files@example.test>" }) }
      if (value.includes("/prepared-with-files?$select=")) return Response.json({ id: "prepared-with-files", isDraft: !sent })
      if (value.endsWith("/prepared-with-files/send")) { sends++; sent = true; return new Response(null, { status: 202 }) }
      throw new Error(`Unexpected fictional request: ${value}`)
    }))
    const onPrepared = vi.fn(async () => { persisted = true })
    await expect(sendEmailThroughChannel({ ...baseInput, attachments: [file], onPrepared })).rejects.toThrow("timeout")
    const resume = { provider: "MICROSOFT", channelId: channel("MICROSOFT").id, providerDraftId: "prepared-with-files", providerMessageId: "<with-files@example.test>" }
    await sendEmailThroughChannel({ ...baseInput, attachments: [file], resume })
    await sendEmailThroughChannel({ ...baseInput, attachments: [file], resume })
    expect([creations, additions, sends]).toEqual([1, 1, 1])
  })

  it.each(["GOOGLE", "MICROSOFT"] as const)("submits explicit CC and Bcc recipients in the %s draft envelope", async provider => {
    prismaMock.communicationChannel.findFirst.mockResolvedValue(channel(provider))
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json(provider === "GOOGLE" ? { messages: [] } : { value: [] }))
      .mockResolvedValueOnce(Response.json({ id: "draft-copies" })).mockResolvedValueOnce(provider === "GOOGLE" ? Response.json({ id: "sent-copies" }) : new Response(null, { status: 202 }))
    vi.stubGlobal("fetch", fetchMock)
    await sendEmailThroughChannel({ ...baseInput, cc: ["CC@example.test"], bcc: ["hidden@example.test"] })
    const submitted = fetchMock.mock.calls[1][1].body as string
    const mime = provider === "GOOGLE" ? Buffer.from(JSON.parse(submitted).message.raw, "base64url").toString() : Buffer.from(submitted, "base64").toString()
    expect(mime).toContain("\r\nCc: cc@example.test\r\n")
    expect(mime).toContain("\r\nBcc: hidden@example.test\r\n")
    expect(mime).toContain("\r\nTo: client@example.fr\r\n")
  })

  it("submits Resend copy recipients as separate envelope arrays", async () => {
    prismaMock.communicationChannel.findFirst.mockResolvedValue({ ...channel("GOOGLE"), provider: "RESEND" })
    vi.mocked(getResendTransport).mockResolvedValue({ apiKey: "re_fiction_only" } as Awaited<ReturnType<typeof getResendTransport>>)
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ id: "fictional-resend-copies" }))
    vi.stubGlobal("fetch", fetchMock)
    await sendEmailThroughChannel({ ...baseInput, cc: ["cc@example.test"], bcc: ["hidden@example.test"] })
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ to: [baseInput.to], cc: ["cc@example.test"], bcc: ["hidden@example.test"] })
  })

  it("blocks a suppressed hidden recipient initially and if suppression changes before dispatch", async () => {
    prismaMock.communicationChannel.findFirst.mockResolvedValue(channel("GOOGLE"))
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    prismaMock.emailSuppression.findUnique.mockImplementation(async ({ where }) => where.companyId_email.email === "hidden@example.test" ? { active: true, reason: "COMPLAINT" } : null)
    await expect(sendEmailThroughChannel({ ...baseInput, bcc: ["hidden@example.test"] })).rejects.toThrow("bloqué")
    expect(fetchMock).not.toHaveBeenCalled()
    prismaMock.emailSuppression.findUnique.mockResolvedValue(null)
    fetchMock.mockResolvedValueOnce(Response.json({ messages: [] }))
    await expect(sendEmailThroughChannel({ ...baseInput, bcc: ["hidden@example.test"], beforeDispatch: async () => {
      prismaMock.emailSuppression.findUnique.mockImplementation(async ({ where }) => where.companyId_email.email === "hidden@example.test" ? { active: true, reason: "MANUAL" } : null)
    } })).rejects.toThrow("bloqué")
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("refuses duplicate or injected copy recipients before any provider HTTP request", async () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock)
    for (const copies of [{ cc: [baseInput.to] }, { bcc: ["hidden@example.test\r\nCc: exposed@example.test"] }, { cc: ["same@example.test"], bcc: ["SAME@example.test"] }]) await expect(sendEmailThroughChannel({ ...baseInput, ...copies })).rejects.toThrow()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("preserves the prepared sender even after its display name changes", async () => {
    prismaMock.communicationChannel.findFirst.mockResolvedValue({ ...channel("GOOGLE"), displayName: "Renamed mailbox" })
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ messages: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "draft-frozen" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "sent-frozen" }), { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)
    const from = "Original sender <equipe@example.fr>"
    const result = await sendEmailThroughChannel({ ...baseInput, from })
    expect(result.from).toBe(from)
    const created = JSON.parse(String(fetchMock.mock.calls[1][1]?.body))
    expect(Buffer.from(created.message.raw, "base64url").toString("utf8")).toContain(`From: ${from}\r\n`)
  })

  it("refuses a frozen address mismatch or injected header before any remote request", async () => {
    prismaMock.communicationChannel.findFirst.mockResolvedValue(channel("GOOGLE"))
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    for (const from of ["Original <other@example.fr>", "Injected\r\nX-Test: header <equipe@example.fr>"]) {
      await expect(sendEmailThroughChannel({ ...baseInput, from })).rejects.toThrow("expéditeur préparé")
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("persists a Google draft before sending it", async () => {
    prismaMock.communicationChannel.findFirst.mockResolvedValue(channel("GOOGLE"))
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ messages: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "draft-1" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "sent-1" }), { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)
    const onPrepared = vi.fn().mockResolvedValue(undefined)

    const result = await sendEmailThroughChannel({ ...baseInput, onPrepared })

    expect(onPrepared).toHaveBeenCalledWith(expect.objectContaining({ provider: "GOOGLE", providerDraftId: "draft-1", channelId: "channel-google" }))
    expect(result).toMatchObject({ providerId: "channel-google:sent-1", providerDraftId: "draft-1" })
    const createdBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body))
    expect(Buffer.from(createdBody.message.raw, "base64url").toString("utf8")).toContain("Message-ID: <delivery-1@mail.freelio.app>")
  })

  it("recovers a Google send after the persisted draft disappeared", async () => {
    prismaMock.communicationChannel.findFirst.mockResolvedValue(channel("GOOGLE"))
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ messages: [{ id: "already-sent" }] }), { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    const result = await sendEmailThroughChannel({ ...baseInput, resume: { provider: "GOOGLE", channelId: "channel-google", providerDraftId: "draft-1", providerMessageId: "<delivery-1@mail.freelio.app>" } })

    expect(result.providerId).toBe("channel-google:already-sent")
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("does not recreate a Google message while the prior send is still uncertain", async () => {
    prismaMock.communicationChannel.findFirst.mockResolvedValue(channel("GOOGLE"))
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ messages: [] }), { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    await expect(sendEmailThroughChannel({ ...baseInput, resume: { provider: "GOOGLE", channelId: "channel-google", providerDraftId: "draft-1", providerMessageId: "<delivery-1@mail.freelio.app>" } }))
      .rejects.toThrow("État d’envoi Google incertain")
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("persists an immutable Microsoft draft before sending it", async () => {
    prismaMock.communicationChannel.findFirst.mockResolvedValue(channel("MICROSOFT"))
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ value: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "immutable-draft" }), { status: 201 }))
      .mockResolvedValueOnce(new Response(null, { status: 202 }))
    vi.stubGlobal("fetch", fetchMock)
    const onPrepared = vi.fn().mockResolvedValue(undefined)

    const result = await sendEmailThroughChannel({ ...baseInput, onPrepared })

    expect(onPrepared).toHaveBeenCalledWith(expect.objectContaining({ provider: "MICROSOFT", providerDraftId: "immutable-draft" }))
    expect(result.providerId).toBe("channel-microsoft:immutable-draft")
    expect(fetchMock.mock.calls[1][1]?.headers).toMatchObject({ "content-type": "text/plain" })
  })

  it("does not recreate a Microsoft message while the prior send is still uncertain", async () => {
    prismaMock.communicationChannel.findFirst.mockResolvedValue(channel("MICROSOFT"))
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ value: [] }), { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    await expect(sendEmailThroughChannel({ ...baseInput, resume: { provider: "MICROSOFT", channelId: "channel-microsoft", providerDraftId: "draft-1", providerMessageId: "<delivery-1@mail.freelio.app>" } }))
      .rejects.toThrow("État d’envoi Microsoft incertain")
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  function reply(provider: "GOOGLE" | "MICROSOFT"): ReplyContext {
    return { messageId: "cfixturemessage000000000001", provider, providerId: `channel-${provider.toLowerCase()}:original-id`, internetMessageId: "<original@example.test>", subject: baseInput.subject, direction: "INBOUND" }
  }
  function metadata(provider: "GOOGLE" | "MICROSOFT", replyTo = baseInput.to) {
    return provider === "GOOGLE" ? { id: "original-id", threadId: "native-thread", payload: { headers: [
      { name: "Message-ID", value: "<original@example.test>" }, { name: "Subject", value: baseInput.subject },
      { name: "References", value: "<root@example.test>" }, { name: "From", value: `"Client, Fiction" <${replyTo}>` },
    ] } } : { id: "original-id", internetMessageId: "<original@example.test>", subject: baseInput.subject, from: { emailAddress: { address: replyTo } } }
  }

  it.each(["GOOGLE", "MICROSOFT"] as const)("creates a native %s reply, preserving its MIME references and prepared identity", async provider => {
    prismaMock.communicationChannel.findFirst.mockResolvedValue(channel(provider))
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json(provider === "GOOGLE" ? { messages: [] } : { value: [] }))
      .mockResolvedValueOnce(Response.json(metadata(provider)))
      .mockResolvedValueOnce(Response.json({ id: "native-draft", internetMessageId: "<graph-assigned@example.test>" }, { status: 201 }))
      .mockResolvedValueOnce(provider === "GOOGLE" ? Response.json({ id: "native-sent" }) : new Response(null, { status: 202 }))
    vi.stubGlobal("fetch", fetchMock)
    const prepared = vi.fn().mockResolvedValue(undefined)
    const result = await sendEmailThroughChannel({ ...baseInput, subject: `Re: ${baseInput.subject}`, reply: reply(provider), onPrepared: prepared })
    const creation = fetchMock.mock.calls[2]
    const mime = provider === "GOOGLE" ? Buffer.from(JSON.parse(String(creation[1]?.body)).message.raw, "base64url").toString("utf8") : Buffer.from(String(creation[1]?.body), "base64").toString("utf8")
    expect(mime).toContain("In-Reply-To: <original@example.test>\r\n")
    expect(mime).toContain(`To: ${baseInput.to}\r\n`)
    if (provider === "GOOGLE") {
      expect(JSON.parse(String(creation[1]?.body)).message.threadId).toBe("native-thread")
      expect(mime).toContain("References: <root@example.test> <original@example.test>")
    } else {
      expect(String(creation[0])).toMatch(/\/original-id\/createReply$/)
      expect(result.providerMessageId).toBe("<graph-assigned@example.test>")
      expect(creation[1]?.headers).toMatchObject({ Prefer: 'IdType="ImmutableId"', "content-type": "text/plain" })
    }
    expect(prepared).toHaveBeenCalledWith(expect.objectContaining({ providerDraftId: "native-draft", providerMessageId: result.providerMessageId }))
    expect(prepared.mock.invocationCallOrder[0]).toBeLessThan(fetchMock.mock.invocationCallOrder[3])
  })

  it.each(["GOOGLE", "MICROSOFT"] as const)("rejects a %s parent from another mailbox or with injected headers before HTTP", async provider => {
    prismaMock.communicationChannel.findFirst.mockResolvedValue(channel(provider))
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    await expect(sendEmailThroughChannel({ ...baseInput, reply: { ...reply(provider), providerId: "foreign:original-id" } })).rejects.toThrow("boîte")
    await expect(sendEmailThroughChannel({ ...baseInput, reply: { ...reply(provider), internetMessageId: "<original@example.test>\r\nBcc: foreign@example.test" } })).rejects.toThrow()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each(["GOOGLE", "MICROSOFT"] as const)("does not create a %s draft when the original or reply destination is incompatible", async provider => {
    prismaMock.communicationChannel.findFirst.mockResolvedValue(channel(provider))
    for (const invalid of [new Response(null, { status: 404 }), Response.json(metadata(provider, "different@example.test")), Response.json({ ...metadata(provider), id: "other-message" })]) {
      const fetchMock = vi.fn().mockResolvedValueOnce(Response.json(provider === "GOOGLE" ? { messages: [] } : { value: [] })).mockResolvedValueOnce(invalid)
      vi.stubGlobal("fetch", fetchMock)
      await expect(sendEmailThroughChannel({ ...baseInput, reply: reply(provider) })).rejects.toThrow()
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(fetchMock.mock.calls.every(call => call[1]?.method !== "POST")).toBe(true)
    }
  })

  it.each(["GOOGLE", "MICROSOFT"] as const)("resumes a prepared %s reply without re-reading or replacing the parent", async provider => {
    prismaMock.communicationChannel.findFirst.mockResolvedValue(channel(provider))
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ id: "native-draft", isDraft: true }))
      .mockResolvedValueOnce(provider === "GOOGLE" ? Response.json({ id: "native-sent" }) : new Response(null, { status: 202 }))
    vi.stubGlobal("fetch", fetchMock)
    await sendEmailThroughChannel({ ...baseInput, reply: reply(provider), resume: { provider, channelId: channel(provider).id, providerDraftId: "native-draft", providerMessageId: "<prepared@example.test>" } })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls.filter(call => call[1]?.method === "POST")).toHaveLength(1)
    expect(String(fetchMock.mock.calls[1][0])).toContain("/send")
  })

  it.each(["GOOGLE", "MICROSOFT"] as const)("requires %s draft/read rights before HTTP", async provider => {
    prismaMock.communicationChannel.findFirst.mockResolvedValue({ ...channel(provider), credentialsEncrypted: JSON.stringify({ ...JSON.parse(credentials), scope: provider === "GOOGLE" ? "https://www.googleapis.com/auth/gmail.send" : "Mail.Send" }) })
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    await expect(sendEmailThroughChannel({ ...baseInput, reply: reply(provider) })).rejects.toThrow("brouillons")
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
