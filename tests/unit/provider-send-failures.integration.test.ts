import { afterAll, afterEach, describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
vi.mock("@/lib/audit", () => ({ logAction: vi.fn() }))
import prisma from "@/lib/prisma"
import { encrypt } from "@/lib/crypto"
import { requestContext } from "@/lib/context"
import { sendManualEmail } from "@/lib/communications/manual-send"
import { saveEmailDraft } from "@/lib/communications/drafts"
import { scheduleEmailDraft, processDueScheduledEmails } from "@/lib/communications/scheduled-emails"
import { processDueSequenceEmails } from "@/lib/automations/sequences"
import { EmailProviderWaitError } from "@/lib/communications/provider-errors"

describe.sequential("provider rejections through durable SQL commands", () => {
  const companies: string[] = [], users: string[] = []
  afterEach(async () => {
    // This fixture runs in 2035. A released global lease keeps that timestamp
    // and would otherwise block later suites using the real clock.
    await prisma.processorLease.deleteMany({ where: { name: "email-sequences" } })
    vi.unstubAllGlobals(); vi.useRealTimers()
  })
  afterAll(async () => {
    for (const companyId of companies) {
      await prisma.emailSendQuotaCharge.deleteMany({ where: { companyId } })
      await prisma.emailSendQuotaState.deleteMany({ where: { companyId } })
      await prisma.emailSendQuotaPolicy.deleteMany({ where: { companyId } })
      await prisma.leadCapture.deleteMany({ where: { companyId } })
      await prisma.contact.deleteMany({ where: { client: { companyId } } })
      await prisma.client.deleteMany({ where: { companyId } })
      await prisma.company.delete({ where: { id: companyId } })
    }
    await prisma.user.deleteMany({ where: { id: { in: users } } })
  })
  async function fixture(status: number) {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2035-01-02T12:00:00Z"))
    const company = await prisma.company.create({ data: { name: "Fictional provider failures" } }); companies.push(company.id)
    const user = await prisma.user.create({ data: { name: "Fictional sender" } }); users.push(user.id)
    const member = await prisma.membership.create({ data: { companyId: company.id, userId: user.id, role: "OWNER", status: "ACTIVE" } })
    const client = await prisma.client.create({ data: { companyId: company.id, name: "Fictional client" } })
    const contact = await prisma.contact.create({ data: { clientId: client.id, firstName: "Fiction", lastName: "Recipient", email: "recipient@example.test" } })
    const channel = await prisma.communicationChannel.create({ data: { companyId: company.id, provider: "RESEND", emailAddress: "sender@example.test", status: "ACTIVE", visibility: "SHARED", ownerUserId: user.id,
      credentialsEncrypted: encrypt(JSON.stringify({ mode: "BYOK", apiKey: "re_fictional_only", webhookSecret: "whsec_fictional_only" })) } })
    await prisma.emailSendQuotaPolicy.create({ data: { companyId: company.id, channelKey: channel.id, channelId: channel.id, enabled: true, dailyRecipientLimit: 100, minuteRecipientLimit: 10 } })
    const http = vi.fn<(url: string | URL, init?: RequestInit) => Promise<Response>>(async () => Response.json({ name: status === 429 ? "rate_limit_exceeded" : "validation_error", message: "Fictional refusal" }, { status, headers: { "retry-after": "3600" } })); vi.stubGlobal("fetch", http)
    const input = { companyId: company.id, userId: user.id, companyName: company.name, purpose: "SERVICE" as const, contactId: contact.id, clientId: client.id, channelId: channel.id, requestKey: crypto.randomUUID(), threadId: null, serviceTicketId: null, replyTo: null, to: contact.email!, subject: "Fictional message", html: "<p>Fiction only</p>" }
    const asAuthor = <T>(task: () => Promise<T>) => requestContext.run({ companyId: company.id, userId: user.id, membershipId: member.id, role: "OWNER", agencyIds: null, actionPermission: "automation.write" }, task)
    const queue = async () => {
      const draft = await asAuthor(() => saveEmailDraft(company.id, user.id, { createKey: crypto.randomUUID(), purpose: "SERVICE", channelId: channel.id, contactId: contact.id, threadId: "", subject: "Fictional schedule", bodyHtml: "<p>Fiction only</p>", cc: [], bcc: [], attachmentIds: [] }))
      return asAuthor(() => scheduleEmailDraft(company.id, user.id, { id: draft.id, version: draft.version, localDateTime: "2035-01-02T12:01", timezone: "UTC" }))
    }
    return { company, user, channel, contact, input, http, asAuthor, queue }
  }
  it("persists Retry-After and refuses a manual retry before its deadline without another HTTP request", async () => {
    const f = await fixture(429)
    await expect(sendManualEmail(f.input)).rejects.toThrow()
    await expect(sendManualEmail(f.input)).rejects.toThrow()
    expect(f.http).toHaveBeenCalledTimes(1)
    expect(await prisma.emailDelivery.findFirstOrThrow({ where: { companyId: f.company.id } })).toMatchObject({ status: "FAILED", attempts: 1, nextAttemptAt: new Date("2035-01-02T13:00:00Z") })
  })
  it("stops repeating an invalid frozen request after a permanent provider refusal", async () => {
    const f = await fixture(422)
    await expect(sendManualEmail(f.input)).rejects.toThrow()
    await expect(sendManualEmail(f.input)).rejects.toThrow()
    expect(f.http).toHaveBeenCalledTimes(1)
    expect(await prisma.emailDelivery.findFirstOrThrow({ where: { companyId: f.company.id } })).toMatchObject({ status: "DEAD_LETTER", attempts: 1, nextAttemptAt: null })
  })
  it("ends a scheduled permanent refusal after the first attempt instead of queuing the same payload again", async () => {
    const f = await fixture(422)
    const queued = await f.queue()
    vi.setSystemTime(new Date("2035-01-02T12:01:00Z"))
    expect(await processDueScheduledEmails({ companyId: f.company.id, now: new Date() })).toMatchObject({ sent: 0, failed: 1 })
    expect(await prisma.emailDraft.findUniqueOrThrow({ where: { id: queued.id } })).toMatchObject({ scheduleStatus: "FAILED", scheduleAttempts: 1, scheduleNextAttemptAt: null })
    expect(f.http).toHaveBeenCalledTimes(1)
  })
  it("honors a persisted deadline after reopening the command and uses the same idempotency key on resume", async () => {
    const f = await fixture(429)
    await expect(sendManualEmail(f.input)).rejects.toThrow()
    const before = await prisma.emailDelivery.findFirstOrThrow({ where: { companyId: f.company.id } })
    expect(before.providerFailureKind).toBe("THROTTLED")
    vi.setSystemTime(new Date("2035-01-02T12:59:59Z"))
    await expect(sendManualEmail({ ...f.input })).rejects.toBeInstanceOf(EmailProviderWaitError)
    expect(await prisma.emailDelivery.findUniqueOrThrow({ where: { id: before.id } })).toEqual(before)
    f.http.mockImplementation(async () => Response.json({ id: "fictional-accepted" }))
    vi.setSystemTime(new Date("2035-01-02T13:00:00Z"))
    await sendManualEmail({ ...f.input })
    expect(f.http).toHaveBeenCalledTimes(2)
    for (const call of f.http.mock.calls) expect((call[1]?.headers as Record<string, string>)["Idempotency-Key"]).toBe(before.id)
    expect(await prisma.emailDelivery.findUniqueOrThrow({ where: { id: before.id } })).toMatchObject({ status: "SENT", attempts: 2, firstAttemptAt: before.firstAttemptAt, providerFailureKind: null, nextAttemptAt: null })
    expect(await prisma.emailSendQuotaCharge.count({ where: { companyId: f.company.id } })).toBe(3)
  })
  it.each([401, 403])("retains one %i authorization refusal without repeated sending", async status => {
    const f = await fixture(status)
    const input = { ...f.input, bcc: ["hidden@example.test"] }
    f.http.mockImplementation(async () => Response.json({ message: "hidden@example.test credential_token" }, { status }))
    await expect(sendManualEmail(input)).rejects.toThrow("Autorisation")
    await expect(sendManualEmail(input)).rejects.toThrow()
    const delivery = await prisma.emailDelivery.findFirstOrThrow({ where: { companyId: f.company.id } })
    expect(delivery).toMatchObject({ status: "DEAD_LETTER", providerFailureKind: "AUTH", attempts: 1 })
    expect(delivery.error).not.toMatch(/hidden@example|credential_token/)
    expect(f.http).toHaveBeenCalledTimes(1)
    expect(await prisma.emailSendQuotaCharge.count({ where: { companyId: f.company.id } })).toBe(2)
  })
  it("does not bypass the original uncertainty window after a later explicit throttle", async () => {
    const f = await fixture(429)
    f.http.mockRejectedValueOnce(new Error("Fictional lost response"))
    await expect(sendManualEmail(f.input)).rejects.toThrow("lost response")
    const before = await prisma.emailDelivery.findFirstOrThrow({ where: { companyId: f.company.id } })
    await expect(sendManualEmail(f.input)).rejects.toThrow()
    expect(await prisma.emailDelivery.findUniqueOrThrow({ where: { id: before.id } })).toMatchObject({ firstAttemptAt: before.firstAttemptAt, attempts: 2, providerFailureKind: "THROTTLED" })
    vi.setSystemTime(new Date("2035-01-03T12:00:00Z"))
    await expect(sendManualEmail(f.input)).rejects.toThrow("Vérifiez le résultat")
    expect(f.http).toHaveBeenCalledTimes(2)
    expect(await prisma.emailMessage.count({ where: { companyId: f.company.id } })).toBe(0)
  })
  it("bounds explicit transient retries without resetting the first attempt", async () => {
    const f = await fixture(503)
    let firstAttemptAt: Date | null = null
    for (let attempt = 1; attempt <= 5; attempt++) {
      await expect(sendManualEmail(f.input)).rejects.toThrow()
      const command = await prisma.emailDelivery.findFirstOrThrow({ where: { companyId: f.company.id } })
      firstAttemptAt ||= command.firstAttemptAt
      expect(command).toMatchObject({ attempts: attempt, firstAttemptAt, providerFailureKind: "TRANSIENT", status: attempt < 5 ? "FAILED" : "DEAD_LETTER" })
      if (attempt < 5) vi.setSystemTime(command.nextAttemptAt!)
      else expect(command.nextAttemptAt).toBeNull()
    }
    await expect(sendManualEmail(f.input)).rejects.toThrow()
    expect(f.http).toHaveBeenCalledTimes(5)
  })
  it("defers a scheduled server failure without consuming attempts while the persisted command still waits", async () => {
    const f = await fixture(503), queued = await f.queue()
    vi.setSystemTime(new Date("2035-01-02T12:01:00Z"))
    expect(await processDueScheduledEmails({ companyId: f.company.id, now: new Date() })).toMatchObject({ failed: 1 })
    expect(await prisma.emailDraft.findUniqueOrThrow({ where: { id: queued.id } })).toMatchObject({ scheduleStatus: "RETRY", scheduleNextAttemptAt: new Date("2035-01-02T13:01:00Z"), scheduleAttempts: 1 })
    // A stale/older scheduler date cannot override the command's authoritative wait.
    await prisma.emailDraft.update({ where: { id: queued.id }, data: { scheduleNextAttemptAt: new Date("2035-01-02T12:02:00Z") } })
    vi.setSystemTime(new Date("2035-01-02T12:02:00Z"))
    expect(await processDueScheduledEmails({ companyId: f.company.id, now: new Date() })).toMatchObject({ failed: 0, skipped: 1 })
    expect(await prisma.emailDraft.findUniqueOrThrow({ where: { id: queued.id } })).toMatchObject({ scheduleAttempts: 1, scheduleNextAttemptAt: new Date("2035-01-02T13:01:00Z") })
    expect(f.http).toHaveBeenCalledTimes(1)
  })
  it.each(["GOOGLE", "MICROSOFT"])("retains the %s draft and checks it before the eventual retry", async provider => {
    const f = await fixture(429)
    await prisma.communicationChannel.update({ where: { id: f.channel.id }, data: { provider, credentialsEncrypted: encrypt(JSON.stringify({ mode: "OAUTH", accessToken: "fictional_access", refreshToken: "fictional_refresh", scope: "https://www.googleapis.com/auth/gmail.modify Mail.Send Mail.ReadWrite", expiresAt: "2099-01-01T00:00:00Z" })) } })
    const sends: string[] = [], creations: string[] = []
    f.http.mockImplementation(async (target, init) => {
      const url = String(target)
      if (url.endsWith("/send") || url.endsWith("/drafts/send")) { sends.push(url); return sends.length === 1 ? Response.json({}, { status: 429, headers: { "retry-after": "3600" } }) : provider === "GOOGLE" ? Response.json({ id: "fictional-sent" }) : new Response(null, { status: 202 }) }
      if (init?.method === "POST") { creations.push(url); return Response.json({ id: "fictional-draft" }) }
      if (url.includes("fictional-draft")) return Response.json(provider === "GOOGLE" ? { id: "fictional-draft" } : { id: "fictional-draft", isDraft: true })
      return Response.json(provider === "GOOGLE" ? { messages: [] } : { value: [] })
    })
    await expect(sendManualEmail(f.input)).rejects.toThrow()
    expect(await prisma.emailDelivery.findFirstOrThrow({ where: { companyId: f.company.id } })).toMatchObject({ providerDraftId: "fictional-draft", providerFailureKind: "THROTTLED" })
    await expect(sendManualEmail(f.input)).rejects.toBeInstanceOf(EmailProviderWaitError)
    expect(f.http).toHaveBeenCalledTimes(3)
    vi.setSystemTime(new Date("2035-01-02T13:00:00Z"))
    await sendManualEmail(f.input)
    expect(creations).toHaveLength(1); expect(sends).toHaveLength(2); expect(f.http).toHaveBeenCalledTimes(5)
  })
  it.each([422, 401, 429, 503])("applies provider %i to real sequence dispatch and preserves its enrollment", async status => {
    const f = await fixture(status)
    await prisma.contact.update({ where: { id: f.contact.id }, data: { marketingStatus: "OPTED_IN" } })
    const lead = await prisma.leadCapture.create({ data: { companyId: f.company.id, clientId: f.input.clientId, contactId: f.contact.id, email: f.input.to, firstName: "Fiction", lastName: "Sequence", marketingOptIn: true, privacyAccepted: true, fingerprint: crypto.randomUUID() } })
    await prisma.marketingConsent.create({ data: { companyId: f.company.id, clientId: f.input.clientId, contactId: f.contact.id, leadCaptureId: lead.id, recipientEmail: f.input.to, channel: "EMAIL", purpose: "MARKETING", status: "GRANTED", legalBasis: "CONSENT", source: "ISOLATED_FICTIONAL_RECIPE", noticeUrl: "https://example.test/privacy", proofHash: "f".repeat(64) } })
    const sequence = await prisma.emailSequence.create({ data: { companyId: f.company.id, name: "Fictional failures", senderChannelId: f.channel.id, status: "ACTIVE", businessDaysOnly: false, timezone: "UTC", steps: { create: { position: 0, subject: "Fiction only", bodyHtml: "<p>Fiction only</p>" } } } })
    const enrollment = await prisma.emailSequenceEnrollment.create({ data: { sequenceId: sequence.id, leadCaptureId: lead.id, contactId: f.contact.id, nextSendAt: new Date() } })
    expect(await processDueSequenceEmails(10, f.company.id)).toMatchObject({ sent: 0, failed: 1 })
    const terminal = status === 422 || status === 401
    expect(await prisma.emailDelivery.findFirstOrThrow({ where: { companyId: f.company.id } })).toMatchObject({ status: terminal ? "DEAD_LETTER" : "FAILED", attempts: 1, providerFailureKind: status === 422 ? "PERMANENT" : status === 401 ? "AUTH" : status === 429 ? "THROTTLED" : "TRANSIENT", nextAttemptAt: terminal ? null : new Date("2035-01-02T13:00:00Z") })
    expect(await prisma.emailSequenceEnrollment.findUniqueOrThrow({ where: { id: enrollment.id } })).toMatchObject({ status: terminal ? "PAUSED" : "ACTIVE", nextSendAt: terminal ? null : new Date("2035-01-02T13:00:00Z"), nextStepPosition: 0 })
    expect(await processDueSequenceEmails(10, f.company.id)).toMatchObject({ examined: 0 })
    expect(f.http).toHaveBeenCalledTimes(1)
  })
})
