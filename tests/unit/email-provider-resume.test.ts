import { beforeEach, describe, expect, it, vi } from "vitest"

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

const credentials = JSON.stringify({
  mode: "OAUTH",
  accessToken: "access-token-long-enough",
  refreshToken: "refresh-token-long-enough",
  tokenType: "Bearer",
  scope: "Mail.Send https://www.googleapis.com/auth/gmail.modify",
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
})
