import { createHash, randomUUID } from "node:crypto"
import { decodeJwt } from "jose"
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
vi.mock("@/lib/audit", () => ({ logAction: vi.fn() }))
vi.mock("@/lib/rate-limit", () => ({ consentRateLimit: { limit: vi.fn(async () => ({ success: true, limit: 10, remaining: 9, reset: Date.now() + 60_000 })) } }))
vi.mock("@/lib/communications/threads", async original => {
  const actual = await original<typeof import("@/lib/communications/threads")>()
  return { ...actual, recordOutgoingEmail: vi.fn(actual.recordOutgoingEmail) }
})
import prisma from "@/lib/prisma"
import { encrypt } from "@/lib/crypto"
import { requestContext } from "@/lib/context"
import { sendManualEmail, prepareManualEmailCommand } from "@/lib/communications/manual-send"
import { assertManualMarketingConsent, withdrawManualMarketingConsent } from "@/lib/communications/marketing-consent"
import { prepareManualEmailContent } from "@/lib/communications/email-content"
import { getEmailDraft, saveEmailDraft } from "@/lib/communications/drafts"
import { scheduleEmailDraft, cancelScheduledEmail, processDueScheduledEmails } from "@/lib/communications/scheduled-emails"
import { recordOutgoingEmail } from "@/lib/communications/threads"
import { verifyManualMarketingWithdrawalToken, verifyConsentWithdrawalToken } from "@/lib/leads/consent-token"
import { buildBackupPayload } from "@/lib/backup"
import { capturePublicLead } from "@/lib/leads/capture"
import { POST as withdrawPost } from "@/app/api/public/consent/withdraw/route"
import { POST as oneClickPost } from "@/app/api/public/consent/one-click/[token]/route"

const digest = (value: string) => createHash("sha256").update(value).digest("hex")
const evidence = { tokenHash: digest("fictional token"), ipHash: digest("198.51.100.10"), userAgentHash: digest("fictional client") }
describe.sequential("explicit email purposes and address-bound marketing authorization", () => {
  const companies: string[] = [], users: string[] = []
  const http = vi.fn(async (url: string | URL | Request, options?: RequestInit) => {
    if (String(url) !== "https://api.resend.com/emails" || options?.method !== "POST") throw new Error("Unexpected isolated provider HTTP")
    return Response.json({ id: `fiction-${randomUUID()}` })
  })
  beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("fetch", http); vi.stubEnv("PUBLIC_APP_URL", "https://example.test") })
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks() })
  afterAll(async () => {
    for (const companyId of companies) {
      await prisma.opportunity.deleteMany({ where: { pipeline: { companyId } } })
      await prisma.pipeline.deleteMany({ where: { companyId } })
      await prisma.leadCapture.deleteMany({ where: { companyId } })
      await prisma.contact.deleteMany({ where: { client: { companyId } } })
      await prisma.client.deleteMany({ where: { companyId } })
      await prisma.company.delete({ where: { id: companyId } })
    }
    await prisma.notification.deleteMany({ where: { userId: { in: users } } })
    await prisma.auditLog.deleteMany({ where: { userId: { in: users } } })
    await prisma.user.deleteMany({ where: { id: { in: users } } })
  })
  async function fixture(provider: "RESEND" | "GOOGLE" = "RESEND") {
    const company = await prisma.company.create({ data: { name: "Fictional purpose company" } }); companies.push(company.id)
    const user = await prisma.user.create({ data: { name: "Fictional purpose author" } }); users.push(user.id)
    const member = await prisma.membership.create({ data: { companyId: company.id, userId: user.id, role: "OWNER", status: "ACTIVE" } })
    const client = await prisma.client.create({ data: { companyId: company.id, name: "Fictional recipient" } })
    const contact = await prisma.contact.create({ data: { clientId: client.id, firstName: "Fiction", lastName: "Consent", email: "recipient@example.test", marketingStatus: "OPTED_IN" } })
    const channel = await prisma.communicationChannel.create({ data: { companyId: company.id, ownerUserId: user.id, status: "ACTIVE", provider, emailAddress: "sender@example.test",
      credentialsEncrypted: encrypt(JSON.stringify(provider === "RESEND" ? { mode: "BYOK", apiKey: "fiction-resend-key-only", webhookSecret: "fiction-webhook-key-only" } : { mode: "OAUTH", accessToken: "fiction-access-token-only", refreshToken: "fiction-refresh-token-only", tokenType: "Bearer", scope: "https://www.googleapis.com/auth/gmail.modify", expiresAt: "2099-01-01T00:00:00.000Z" })) } })
    const input = { companyId: company.id, userId: user.id, companyName: company.name, purpose: "MARKETING" as "MARKETING" | "SERVICE", contactId: contact.id, clientId: client.id, channelId: channel.id,
      to: contact.email!, requestKey: randomUUID(), threadId: null, serviceTicketId: null, replyTo: null, subject: "Fictional consent mail", html: prepareManualEmailContent("<p>Fictional content only</p>").html, cc: [] as string[], bcc: [] as string[] }
    const asAuthor = <T>(task: () => Promise<T>) => requestContext.run({ companyId: company.id, userId: user.id, membershipId: member.id, role: "OWNER", agencyIds: null, actionPermission: "automation.write" }, task)
    const grant = () => prisma.marketingConsent.create({ data: { companyId: company.id, clientId: client.id, contactId: contact.id, recipientEmail: contact.email!, channel: "EMAIL", purpose: "MARKETING", status: "GRANTED", legalBasis: "CONSENT", source: "FICTIONAL_RECIPE", noticeUrl: "https://example.test/privacy", proofHash: digest(randomUUID()) } })
    return { company, user, client, contact, channel, input, asAuthor, grant }
  }
  async function withdrawal(prepared: Awaited<ReturnType<typeof prepareManualEmailCommand>>) {
    const token = prepared.payload.marketingHeaders!["List-Unsubscribe"].slice(1, -1).split("/").at(-1)!
    const payload = await verifyManualMarketingWithdrawalToken(token)
    expect(payload).not.toBeNull()
    return { token, payload: payload! }
  }

  it("keeps Service copies and blocks suppressed addresses for both purposes", async () => {
    const f = await fixture()
    const message = await sendManualEmail({ ...f.input, purpose: "SERVICE", cc: ["copy@example.test"], bcc: ["hidden@example.test"] })
    expect(message.purpose).toBe("SERVICE")
    const body = JSON.parse(String(http.mock.calls[0][1]!.body))
    expect(body).toMatchObject({ cc: ["copy@example.test"], bcc: ["hidden@example.test"] })
    expect(body.headers?.["List-Unsubscribe"]).toBeUndefined()
    expect(body.html).not.toContain("Se désinscrire")
    const blocked = await fixture(); await blocked.grant()
    await prisma.emailSuppression.create({ data: { companyId: blocked.company.id, email: blocked.input.to, reason: "HARD_BOUNCE" } })
    http.mockClear()
    for (const purpose of ["SERVICE", "MARKETING"] as const) await expect(sendManualEmail({ ...blocked.input, requestKey: randomUUID(), purpose })).rejects.toThrow("adresse supprimée")
    expect(http).not.toHaveBeenCalled()
  })

  it("requires address-bound proof, refuses hidden copies and never transfers consent to an edited address", async () => {
    const f = await fixture()
    await expect(sendManualEmail(f.input)).rejects.toThrow("preuve de consentement")
    const proof = await f.grant()
    await prisma.marketingConsent.update({ where: { id: proof.id }, data: { recipientEmail: null } })
    await expect(sendManualEmail(f.input)).rejects.toThrow("preuve de consentement")
    await prisma.marketingConsent.update({ where: { id: proof.id }, data: { recipientEmail: f.input.to } })
    await expect(sendManualEmail({ ...f.input, bcc: ["hidden@example.test"] })).rejects.toThrow("sans CC ni CCI")
    await prisma.contact.update({ where: { id: f.contact.id }, data: { email: "changed@example.test" } })
    await expect(sendManualEmail({ ...f.input, to: "changed@example.test" })).rejects.toThrow("preuve de consentement")
    const foreign = await fixture(); await foreign.grant()
    await expect(assertManualMarketingConsent(foreign.company.id, f.contact.id, f.input.to)).rejects.toThrow("preuve de consentement")
    expect(http).not.toHaveBeenCalled()
    expect(await prisma.emailDelivery.count({ where: { companyId: f.company.id } })).toBe(0)
  })

  it("freezes the personal footer and repairs accepted history after withdrawal without another HTTP send", async () => {
    const f = await fixture(), proof = await f.grant()
    const prepared = await prepareManualEmailCommand(f.input), repeated = await prepareManualEmailCommand(f.input)
    expect(repeated.payload.renderedHtml).toBe(prepared.payload.renderedHtml)
    const { token, payload } = await withdrawal(prepared)
    expect(JSON.stringify(decodeJwt(token))).not.toContain(f.input.to)
    expect(payload).toMatchObject({ companyId: f.company.id, consentId: proof.id, addressHash: digest(f.input.to) })
    expect(await verifyConsentWithdrawalToken(token)).toBeNull()
    expect(await verifyManualMarketingWithdrawalToken(`${token}x`)).toBeNull()
    vi.mocked(recordOutgoingEmail).mockRejectedValueOnce(new Error("Injected history incident"))
    await expect(sendManualEmail(f.input)).rejects.toThrow("history incident")
    const body = JSON.parse(String(http.mock.calls[0][1]!.body))
    expect(body.html).toBe(prepared.payload.renderedHtml)
    expect(body.text).toContain("Se désinscrire")
    expect(body.headers).toMatchObject(prepared.payload.marketingHeaders!)
    await withdrawManualMarketingConsent(payload, evidence)
    const message = await sendManualEmail(f.input)
    expect(message.purpose).toBe("MARKETING")
    expect(message.bodyHtml).toBe(body.html)
    expect(http).toHaveBeenCalledTimes(1)
    await expect(sendManualEmail({ ...f.input, purpose: "SERVICE" })).rejects.toThrow("finalité")
    const backup = await buildBackupPayload(f.user.id, f.company.id)
    expect(backup.tables.find(table => table.model === "EmailMessage")!.rows[0].purpose).toBe("MARKETING")
    expect(backup.tables.find(table => table.model === "MarketingConsent")!.rows.some(row => row.recipientEmail === f.input.to)).toBe(true)
  })

  it("rejects replacement of a prepared authorization before transport", async () => {
    const f = await fixture(), proof = await f.grant()
    const preparedCommand = await prepareManualEmailCommand(f.input)
    await prisma.marketingConsent.update({ where: { id: proof.id }, data: { proofHash: digest("changed proof") } })
    await expect(sendManualEmail({ ...f.input, preparedCommand })).rejects.toThrow("preuve de consentement a changé")
    expect(http).not.toHaveBeenCalled()
  })

  it("rechecks withdrawal after Gmail draft preparation and never calls its send endpoint", async () => {
    const f = await fixture("GOOGLE"); await f.grant()
    const prepared = await prepareManualEmailCommand(f.input), { payload } = await withdrawal(prepared)
    const gmailHttp = vi.fn(async (url: string | URL | Request, options?: RequestInit) => {
      const target = String(url)
      if (target.includes("/messages?")) return Response.json({ messages: [] })
      if (target.endsWith("/drafts") && options?.method === "POST") {
        const mime = Buffer.from(JSON.parse(String(options.body)).message.raw, "base64url").toString()
        expect(mime).toContain("List-Unsubscribe-Post: List-Unsubscribe=One-Click")
        expect(mime).not.toContain("Bcc:")
        await withdrawManualMarketingConsent(payload, evidence)
        return Response.json({ id: "fiction-purpose-draft" })
      }
      throw new Error("Unexpected isolated Gmail request")
    })
    vi.stubGlobal("fetch", gmailHttp)
    await expect(sendManualEmail(f.input)).rejects.toThrow("preuve de consentement")
    expect(gmailHttp.mock.calls.some(([url]) => String(url).endsWith("/drafts/send"))).toBe(false)
    expect((await prisma.emailDelivery.findFirstOrThrow({ where: { companyId: f.company.id } })).providerDraftId).toBe("fiction-purpose-draft")
    expect(await prisma.emailMessage.count({ where: { companyId: f.company.id } })).toBe(0)
  })

  it("preserves draft purpose, freezes scheduling and stops permanently after withdrawal", async () => {
    const f = await fixture(); await f.grant()
    const fields = { purpose: "MARKETING", createKey: randomUUID(), channelId: f.channel.id, contactId: f.contact.id, subject: f.input.subject, bodyHtml: "<p>Fictional marketing schedule</p>", cc: [], bcc: [] }
    const draft = await f.asAuthor(() => saveEmailDraft(f.company.id, f.user.id, fields))
    const time = { localDateTime: new Date(Date.now() + 3_600_000).toISOString().slice(0, 16), timezone: "UTC" }
    const queued = await f.asAuthor(() => scheduleEmailDraft(f.company.id, f.user.id, { id: draft.id, version: draft.version, ...time }))
    expect(queued.purpose).toBe("MARKETING")
    await expect(f.asAuthor(() => saveEmailDraft(f.company.id, f.user.id, { ...fields, id: queued.id, version: queued.version, purpose: "SERVICE" }))).rejects.toThrow("programmé")
    const canceled = await f.asAuthor(() => cancelScheduledEmail(f.company.id, f.user.id, queued))
    expect(canceled.purpose).toBe("MARKETING")
    const requeued = await f.asAuthor(() => scheduleEmailDraft(f.company.id, f.user.id, { id: canceled.id, version: canceled.version, ...time }))
    const frozen = (await prisma.emailDraft.findUniqueOrThrow({ where: { id: draft.id } })).scheduledPayload as unknown as Awaited<ReturnType<typeof prepareManualEmailCommand>>
    await withdrawManualMarketingConsent((await withdrawal(frozen)).payload, evidence)
    expect(await processDueScheduledEmails({ companyId: f.company.id, now: new Date(requeued.scheduledAt!) })).toMatchObject({ failed: 1, sent: 0 })
    const failed = await f.asAuthor(() => getEmailDraft(f.company.id, f.user.id, draft.id))
    expect(failed).toMatchObject({ purpose: "MARKETING", scheduleStatus: "FAILED", scheduleNextAttemptAt: null })
    expect(http).not.toHaveBeenCalled()
  })

  it("keeps historical drafts and accepted commands unclassified and refuses a new unknown intent", async () => {
    const f = await fixture()
    await expect(sendManualEmail({ ...f.input, purpose: undefined })).rejects.toThrow("Choisissez Service")
    const legacy = await prisma.emailDraft.create({ data: { companyId: f.company.id, authorUserId: f.user.id, createKey: randomUUID(), requestKey: randomUUID(), channelId: f.channel.id, contactId: f.contact.id, subject: f.input.subject, bodyHtml: "<p>Historical fictional draft</p>", cc: [], bcc: [] } })
    const saved = await f.asAuthor(() => saveEmailDraft(f.company.id, f.user.id, { ...legacy, subject: "Preserved legacy draft" }))
    expect(saved.purpose).toBeNull()
    await expect(f.asAuthor(() => scheduleEmailDraft(f.company.id, f.user.id, { id: saved.id, version: saved.version, localDateTime: new Date(Date.now() + 3_600_000).toISOString().slice(0, 16), timezone: "UTC" }))).rejects.toThrow("Choisissez Service")
    const { purpose: _purpose, companyId: _company, requestKey: _key, ...oldFields } = f.input; void _purpose; void _company; void _key
    await prisma.emailDelivery.create({ data: { companyId: f.company.id, contactId: f.contact.id, requestKey: f.input.requestKey, channelId: f.channel.id, recipientEmail: f.input.to, subject: f.input.subject, scheduledAt: new Date(), status: "SENT", provider: "RESEND", providerId: "fiction-old-accepted", payload: { ...oldFields, from: "sender@example.test" } } })
    expect((await sendManualEmail({ ...f.input, purpose: undefined })).purpose).toBeNull()
    expect(http).not.toHaveBeenCalled()
  })

  it("withdraws idempotently under concurrency and an old link never opts out an edited address", async () => {
    const f = await fixture(); await f.grant()
    const { payload } = await withdrawal(await prepareManualEmailCommand(f.input))
    const results = await Promise.all([withdrawManualMarketingConsent(payload, evidence), withdrawManualMarketingConsent(payload, evidence)])
    expect(results.filter(Boolean)).toHaveLength(1)
    expect(await prisma.marketingConsent.count({ where: { companyId: f.company.id, status: "WITHDRAWN" } })).toBe(1)
    expect(await withdrawManualMarketingConsent(payload, evidence)).toBe(false)
    await prisma.contact.update({ where: { id: f.contact.id }, data: { email: "new-address@example.test", marketingStatus: "OPTED_IN" } })
    const latest = await f.grant()
    await prisma.marketingConsent.update({ where: { id: latest.id }, data: { capturedAt: new Date(Date.now() + 100) } })
    expect(await withdrawManualMarketingConsent(payload, evidence)).toBe(true)
    expect((await prisma.contact.findUniqueOrThrow({ where: { id: f.contact.id } })).marketingStatus).toBe("OPTED_IN")
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    const before = await prisma.marketingConsent.count({ where: { companyId: f.company.id } })
    await expect(withdrawManualMarketingConsent(payload, evidence)).rejects.toThrow("lecture seule")
    expect(await prisma.marketingConsent.count({ where: { companyId: f.company.id } })).toBe(before)
  })

  it("records the actual captured address in new public opt-in evidence without inventing old proofs", async () => {
    const f = await fixture()
    vi.stubEnv("PUBLIC_LEAD_COMPANY_ID", f.company.id); vi.stubEnv("PUBLIC_PRIVACY_NOTICE_URL", "https://example.test/privacy")
    const result = await capturePublicLead({ firstName: "Fiction", lastName: "Capture", email: "captured@example.test", privacyAccepted: true, marketingOptIn: true, source: "FICTIONAL_RECIPE" }, { ipHash: digest("fiction") })
    const proof = await prisma.marketingConsent.findFirstOrThrow({ where: { companyId: f.company.id, leadCaptureId: result.reference, purpose: "MARKETING" } })
    expect(proof).toMatchObject({ recipientEmail: "captured@example.test", status: "GRANTED" })
    expect(await assertManualMarketingConsent(f.company.id, proof.contactId!, "captured@example.test")).toMatchObject({ consentId: proof.id, proofHash: proof.proofHash })
    expect(http).not.toHaveBeenCalled()
  })

  it("accepts only the signed withdrawal capability over HTTP and refuses demo writes", async () => {
    const f = await fixture(); await f.grant()
    const { token } = await withdrawal(await prepareManualEmailCommand(f.input))
    const request = (body: string) => new Request("https://example.test/api/public/consent/withdraw", { method: "POST", headers: { "content-type": "application/json" }, body })
    const first = await withdrawPost(request(JSON.stringify({ token })))
    expect(first.status).toBe(200)
    expect(first.headers.get("Cache-Control")).toContain("no-store")
    expect(await first.json()).toEqual({ success: true, alreadyWithdrawn: false })
    const oneClick = await oneClickPost(new Request(`https://example.test/api/public/consent/one-click/${token}`, { method: "POST", body: "List-Unsubscribe=One-Click" }), { params: Promise.resolve({ token }) })
    expect(oneClick.status).toBe(200)
    expect(await oneClick.json()).toEqual({ success: true, alreadyWithdrawn: true })
    expect(await (await withdrawPost(request(JSON.stringify({ token })))).json()).toEqual({ success: true, alreadyWithdrawn: true })
    expect((await withdrawPost(request(JSON.stringify({ token: `${token}x` })))).status).toBe(400)
    expect((await withdrawPost(request(JSON.stringify({ token: "x".repeat(9_000) })))).status).toBe(413)
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    expect((await withdrawPost(request(JSON.stringify({ token })))).status).toBe(403)
    expect(await prisma.marketingConsent.count({ where: { companyId: f.company.id, status: "WITHDRAWN" } })).toBe(1)
    expect(http).not.toHaveBeenCalled()
  })
})
