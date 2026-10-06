import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
vi.mock("@/lib/audit", () => ({ logAction: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/auth-wrapper", () => ({ withAuth: async (task: (actor: unknown) => Promise<unknown>, permission: string) => {
  const { getContext } = await import("@/lib/context")
  const { assertDemoMutationAllowed } = await import("@/lib/demo-policy")
  if (!permission.endsWith(".read")) assertDemoMutationAllowed()
  return task(getContext())
} }))
import prisma from "@/lib/prisma"
import { requestContext } from "@/lib/context"
import { encrypt } from "@/lib/crypto"
import { recoverManualEmail, listManualEmailRecovery, normalizeLegacyManualAuthors } from "@/lib/communications/manual-recovery"
import { prepareManualEmailCommand, sendManualEmail } from "@/lib/communications/manual-send"
import { saveEmailDraft, deleteEmailDraft, getEmailDraft } from "@/lib/communications/drafts"
import { scheduleEmailDraft, processDueScheduledEmails } from "@/lib/communications/scheduled-emails"
import { assertEditableDraft } from "@/lib/communications/draft-attachments"
import { withProcessorLease } from "@/lib/processing/lease"
import { getCommunicationRecovery, closeCommunicationWithoutRetry, repairCommunicationHistory } from "@/actions/communications"

describe.sequential("human recovery of frozen manual email commands on real SQL", () => {
  const companies: string[] = [], users: string[] = []
  const http = vi.fn<(url: string | URL | Request, init?: RequestInit) => Promise<Response>>(async () => { throw new Error("Unexpected isolated provider request") })
  beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("fetch", http) })
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })
  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { userId: { in: users } } })
    for (const companyId of companies) {
      await prisma.contact.deleteMany({ where: { client: { companyId } } }); await prisma.client.deleteMany({ where: { companyId } }); await prisma.company.delete({ where: { id: companyId } })
    }
    await prisma.user.deleteMany({ where: { id: { in: users } } })
  })
  async function fixture(provider: "RESEND" | "GOOGLE" | "MICROSOFT" = "RESEND") {
    const company = await prisma.company.create({ data: { name: "Fictional recovery company" } }); companies.push(company.id)
    const user = await prisma.user.create({ data: { name: "Fictional private author" } }); users.push(user.id)
    const member = await prisma.membership.create({ data: { companyId: company.id, userId: user.id, role: "OWNER" } })
    const client = await prisma.client.create({ data: { companyId: company.id, name: "Fictional recipient" } })
    const contact = await prisma.contact.create({ data: { clientId: client.id, firstName: "Fiction", lastName: "Recovery", email: "recipient@example.test" } })
    const channel = await prisma.communicationChannel.create({ data: { companyId: company.id, ownerUserId: user.id, provider, status: "ACTIVE", emailAddress: "sender@example.test", visibility: "PRIVATE", credentialsEncrypted: encrypt(JSON.stringify(provider === "RESEND" ? { mode: "BYOK", apiKey: "fiction-resend-key-only", webhookSecret: "fiction-webhook-key-only" } : { mode: "OAUTH", accessToken: "fiction-access-token-only", refreshToken: "fiction-refresh-token-only", expiresAt: "2099-01-01T00:00:00.000Z", scope: provider === "GOOGLE" ? "https://www.googleapis.com/auth/gmail.modify" : "Mail.ReadWrite Mail.Send" })) } })
    const draft = await saveEmailDraft(company.id, user.id, { createKey: randomUUID(), channelId: channel.id, contactId: contact.id, subject: "Fictional recovery mail", bodyHtml: "<p>Frozen fictional content</p>", purpose: "SERVICE", cc: ["copy@example.test"], bcc: ["hidden@example.test"] })
    const input = { companyId: company.id, userId: user.id, companyName: company.name, channelId: channel.id, contactId: contact.id, clientId: client.id, threadId: null, serviceTicketId: null, requestKey: draft.requestKey, replyTo: null, purpose: "SERVICE" as const, to: contact.email!, subject: draft.subject, html: draft.bodyHtml, cc: draft.cc, bcc: draft.bcc }
    const prepared = await prepareManualEmailCommand(input)
    const delivery = await prisma.emailDelivery.create({ data: { companyId: company.id, manualAuthorUserId: user.id, requestKey: input.requestKey, contactId: contact.id, channelId: channel.id, provider, payload: prepared.payload, recipientEmail: input.to, subject: input.subject, purpose: "SERVICE", status: "FAILED", attempts: 1, scheduledAt: new Date(), providerMessageId: provider === "RESEND" ? null : "<fiction-command@example.test>", providerDraftId: provider === "MICROSOFT" ? "immutable-fiction-draft" : null } })
    const asAuthor = <T>(task: () => Promise<T>) => requestContext.run({ companyId: company.id, userId: user.id, membershipId: member.id, role: "OWNER", agencyIds: null, actionPermission: "automation.write" }, task)
    const recover = async (operation: "CHECK" | "REPAIR" | "CLOSE", extra = {}) => asAuthor(() => recoverManualEmail(company.id, user.id, { id: delivery.id, version: 1, ...extra }, operation))
    return { company, user, member, client, contact, channel, draft, input, prepared, delivery, asAuthor, recover }
  }
  it("closes an unknown Resend result without sending, keeps the private original and blocks every draft mutation/retry", async () => {
    const f = await fixture()
    await expect(f.recover("REPAIR")).rejects.toThrow("Aucune preuve")
    await expect(f.recover("CLOSE")).rejects.toThrow("motif")
    expect(await f.recover("CHECK")).toMatchObject({ outcome: "UNKNOWN" })
    await f.recover("CLOSE", { version: 2, reason: "Fictional operator decision", confirmed: true })
    const row = await prisma.emailDelivery.findUniqueOrThrow({ where: { id: f.delivery.id } })
    expect(row).toMatchObject({ status: "FAILED", recoveryOutcome: "UNKNOWN", closureReason: "Fictional operator decision", closedByUserId: f.user.id, nextAttemptAt: null })
    expect(row.closedAt).not.toBeNull()
    const draft = await getEmailDraft(f.company.id, f.user.id, f.draft.id)
    expect(draft).toMatchObject({ bodyHtml: f.draft.bodyHtml, bcc: f.draft.bcc, archivedAt: expect.any(String) })
    for (const action of [() => sendManualEmail(f.input), () => saveEmailDraft(f.company.id, f.user.id, { ...draft, createKey: f.draft.createKey }), () => deleteEmailDraft(f.company.id, f.user.id, draft), () => assertEditableDraft(f.company.id, f.user.id, draft.id, draft.version), () => scheduleEmailDraft(f.company.id, f.user.id, { id: draft.id, version: draft.version, localDateTime: new Date(Date.now() + 86_400_000).toISOString().slice(0, 16), timezone: "UTC" })]) await expect(action()).rejects.toThrow(/classé|classement/)
    expect((await f.asAuthor(() => listManualEmailRecovery(f.company.id, f.user.id))).total).toBe(0)
    expect((await processDueScheduledEmails({ companyId: f.company.id })).examined).toBe(0)
    expect(await prisma.emailMessage.count({ where: { companyId: f.company.id } })).toBe(0)
    expect(http).not.toHaveBeenCalled()
  })
  it("repairs an accepted historical command without provider requests, keeps copies/null purpose and a subsequent bounce", async () => {
    const f = await fixture()
    const payload = { ...f.prepared.payload }; delete payload.purpose
    await prisma.emailDelivery.update({ where: { id: f.delivery.id }, data: { payload, purpose: null, providerId: "fiction-accepted", sentAt: new Date(), status: "BOUNCED" } })
    await expect(f.recover("CLOSE", { reason: "Must retain acceptance", confirmed: true })).rejects.toThrow("acceptation")
    await f.recover("REPAIR")
    await f.recover("REPAIR", { version: 2 })
    expect(await prisma.emailMessage.count({ where: { deliveryId: f.delivery.id } })).toBe(1)
    expect(await prisma.emailMessage.findUniqueOrThrow({ where: { deliveryId: f.delivery.id } })).toMatchObject({ purpose: null, ccAddresses: f.input.cc, bccAddresses: f.input.bcc, bodyHtml: f.input.html, status: "BOUNCED" })
    expect(await prisma.emailDelivery.findUniqueOrThrow({ where: { id: f.delivery.id } })).toMatchObject({ status: "BOUNCED" })
    expect(http).not.toHaveBeenCalled()
  })
  it("correlates a unique Gmail SENT message and repairs its journal with no second transport", async () => {
    const f = await fixture("GOOGLE")
    http.mockImplementation(async (url?: string | URL | Request, init?: RequestInit) => {
      expect(init?.method).toBe("GET")
      const target = new URL(String(url))
      if (target.pathname.endsWith("/messages")) { expect(target.searchParams.get("labelIds")).toBe("SENT"); return Response.json({ messages: [{ id: "fiction-sent" }] }) }
      return Response.json({ id: "fiction-sent", labelIds: ["SENT"], payload: { headers: [{ name: "Message-ID", value: f.delivery.providerMessageId }, { name: "From", value: f.prepared.payload.from }] } })
    })
    await f.recover("CHECK")
    expect(http).toHaveBeenCalledTimes(2)
    await f.recover("REPAIR", { version: 2 })
    expect(http).toHaveBeenCalledTimes(2)
    expect(await prisma.emailMessage.findUniqueOrThrow({ where: { deliveryId: f.delivery.id } })).toMatchObject({ providerId: `${f.channel.id}:fiction-sent`, purpose: "SERVICE", bccAddresses: f.input.bcc })
  })
  it("distinguishes a Microsoft draft from a sent immutable reference", async () => {
    const f = await fixture("MICROSOFT")
    const message = { id: f.delivery.providerDraftId, internetMessageId: f.delivery.providerMessageId, from: { emailAddress: { address: "sender@example.test" } }, isDraft: true }
    http.mockImplementation(async (_url?: string | URL | Request, init?: RequestInit) => { expect(init?.method).toBe("GET"); return Response.json(message) })
    expect(await f.recover("CHECK")).toMatchObject({ outcome: "DRAFT" })
    await expect(f.recover("REPAIR", { version: 2 })).rejects.toThrow("Aucune preuve")
    http.mockResolvedValue(Response.json({ ...message, isDraft: false, sentDateTime: "2026-01-01T12:00:00Z" }))
    expect(await f.recover("CHECK", { version: 2 })).toMatchObject({ outcome: "ACCEPTED" })
    await f.recover("REPAIR", { version: 3 })
    expect(http).toHaveBeenCalledTimes(2)
  })
  it.each([403, 404, 429])("keeps HTTP %i unavailable and never exposes the provider error containing hidden addresses", async status => {
    const f = await fixture("GOOGLE")
    http.mockImplementation(async () => new Response("hidden@example.test credential-fiction", { status }))
    const result = await f.recover("CHECK")
    expect(result).toMatchObject({ outcome: "UNAVAILABLE" }); expect(JSON.stringify(result)).not.toContain("hidden@example.test")
    expect((await prisma.emailDelivery.findUniqueOrThrow({ where: { id: f.delivery.id } })).recoveryProof).toBeNull()
  })
  it("refuses ambiguous, mismatched or unlabelled Google results and handles a deadline failure", async () => {
    const f = await fixture("GOOGLE")
    http.mockResolvedValue(Response.json({ messages: [{ id: "one" }, { id: "two" }] }))
    expect(await f.recover("CHECK")).toMatchObject({ outcome: "UNKNOWN" })
    http.mockRejectedValue(new DOMException("Fictional deadline", "TimeoutError"))
    expect(await f.recover("CHECK", { version: 2 })).toMatchObject({ outcome: "UNAVAILABLE" })
    http.mockResolvedValueOnce(Response.json({ messages: [{ id: "one" }] })).mockResolvedValueOnce(Response.json({ id: "one", labelIds: ["DRAFT"], payload: { headers: [] } }))
    expect(await f.recover("CHECK", { version: 3 })).toMatchObject({ outcome: "UNKNOWN" })
    expect(await prisma.emailMessage.count({ where: { deliveryId: f.delivery.id } })).toBe(0)
  })
  it("checks personal ownership, box ACL and current membership again after remote reads", async () => {
    const f = await fixture("GOOGLE"), foreign = await fixture()
    await expect(foreign.asAuthor(() => recoverManualEmail(f.company.id, f.user.id, { id: f.delivery.id, version: 1 }, "CHECK"))).rejects.toThrow("inaccessible")
    await prisma.communicationChannel.update({ where: { id: f.channel.id }, data: { ownerUserId: foreign.user.id } })
    await prisma.membership.update({ where: { id: f.member.id }, data: { role: "SALES" } })
    await expect(f.recover("CHECK")).rejects.toThrow("inaccessible")
    await prisma.membership.update({ where: { id: f.member.id }, data: { role: "OWNER" } })
    http.mockImplementation(async () => { await prisma.membership.update({ where: { id: f.member.id }, data: { status: "SUSPENDED" } }); return Response.json({ messages: [] }) })
    await expect(f.recover("CHECK")).rejects.toThrow("inaccessible")
    expect((await prisma.emailDelivery.findUniqueOrThrow({ where: { id: f.delivery.id } })).recoveryVersion).toBe(1)
  })
  it("blocks concurrent processing and protects a provider acceptance arriving between check and commit", async () => {
    const f = await fixture("GOOGLE")
    await withProcessorLease(`manual-email:${f.delivery.id}`, async () => { await expect(f.recover("CLOSE", { reason: "Fictional close", confirmed: true })).rejects.toThrow("tâche") })
    expect(http).not.toHaveBeenCalled()
    http.mockImplementation(async () => {
      await prisma.emailDelivery.update({ where: { id: f.delivery.id }, data: { providerId: `${f.channel.id}:late-acceptance`, sentAt: new Date(), status: "SENT" } })
      return Response.json({ messages: [] })
    })
    await expect(f.recover("CHECK")).rejects.toThrow("résultat a changé")
    expect(await prisma.emailDelivery.findUniqueOrThrow({ where: { id: f.delivery.id } })).toMatchObject({ recoveryVersion: 1, providerId: `${f.channel.id}:late-acceptance`, status: "SENT", closedAt: null })
  })
  it("normalizes validated historical authors beyond 500 and paginates the full private portfolio", async () => {
    const f = await fixture()
    await prisma.emailDelivery.createMany({ data: Array.from({ length: 501 }, (_, index) => ({ companyId: f.company.id, requestKey: randomUUID(), payload: f.prepared.payload, recipientEmail: f.input.to, subject: f.input.subject, provider: "RESEND", channelId: f.channel.id, status: "FAILED", attempts: 1, scheduledAt: new Date(), createdAt: new Date(2020, 0, 1, 0, index) })) })
    const invalid = await prisma.emailDelivery.create({ data: { companyId: f.company.id, requestKey: randomUUID(), payload: { userId: f.user.id }, recipientEmail: f.input.to, subject: "Invalid historical command", provider: "RESEND", status: "FAILED", attempts: 1, scheduledAt: new Date() } })
    expect(await normalizeLegacyManualAuthors(f.company.id)).toEqual({ examined: 502, normalized: 501 })
    expect(await normalizeLegacyManualAuthors(f.company.id)).toEqual({ examined: 1, normalized: 0 })
    const last = await f.asAuthor(() => listManualEmailRecovery(f.company.id, f.user.id, { page: 21 }))
    expect(last).toMatchObject({ total: 502, page: 21, pageCount: 21 }); expect(last.deliveries).toHaveLength(2)
    expect(JSON.stringify(last)).not.toMatch(/hidden@example|credentials|payload|relativePath/)
    expect((await prisma.emailDelivery.findUniqueOrThrow({ where: { id: invalid.id } })).manualAuthorUserId).toBeNull()
    await expect(f.asAuthor(() => recoverManualEmail(f.company.id, f.user.id, { id: invalid.id, version: 1 }, "CHECK"))).rejects.toThrow("inaccessible")
    const foreign = await fixture()
    const wrongClient = await prisma.emailDelivery.create({ data: { companyId: f.company.id, requestKey: randomUUID(), payload: { ...f.prepared.payload, clientId: foreign.client.id }, recipientEmail: f.input.to, subject: f.input.subject, provider: "RESEND", channelId: f.channel.id, status: "FAILED", attempts: 1, scheduledAt: new Date() } })
    expect(await normalizeLegacyManualAuthors(f.company.id)).toEqual({ examined: 2, normalized: 0 })
    expect((await prisma.emailDelivery.findUniqueOrThrow({ where: { id: wrongClient.id } })).manualAuthorUserId).toBeNull()
  })
  it("rejects all recovery mutations and normalization in the public demo before any HTTP", async () => {
    const f = await fixture()
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    expect((await f.asAuthor(() => listManualEmailRecovery(f.company.id, f.user.id))).total).toBe(1)
    for (const operation of ["CHECK", "REPAIR", "CLOSE"] as const) await expect(f.recover(operation, { reason: "Fictional reason", confirmed: true })).rejects.toThrow("lecture seule")
    await expect(normalizeLegacyManualAuthors()).rejects.toThrow("lecture seule")
    expect(await f.asAuthor(() => closeCommunicationWithoutRetry({ id: f.delivery.id, version: 1, reason: "Fictional refusal", confirmed: true }))).toMatchObject({ success: false, error: expect.stringContaining("lecture seule") })
    expect(http).not.toHaveBeenCalled()
  })
  it("returns expected action refusals as structured results rather than masked production exceptions", async () => {
    const f = await fixture()
    expect(await f.asAuthor(() => getCommunicationRecovery({ page: -1 }))).toMatchObject({ success: false, error: "Page invalide" })
    expect(await f.asAuthor(() => closeCommunicationWithoutRetry({ id: f.delivery.id, version: 1 }))).toMatchObject({ success: false, error: expect.stringContaining("confirmation") })
    expect(await f.asAuthor(() => repairCommunicationHistory({ id: f.delivery.id, version: 1 }))).toMatchObject({ success: false, error: expect.stringContaining("Aucune preuve") })
    expect(http).not.toHaveBeenCalled()
  })
  it("rolls back repair when the provider reference is already linked to another command", async () => {
    const f = await fixture()
    await prisma.emailDelivery.update({ where: { id: f.delivery.id }, data: { providerId: "fiction-collision", sentAt: new Date(), status: "SENT" } })
    const other = await prisma.emailDelivery.create({ data: { companyId: f.company.id, recipientEmail: f.input.to, subject: "Other fictional command", scheduledAt: new Date() } })
    const thread = await prisma.emailThread.create({ data: { companyId: f.company.id, channelId: f.channel.id, clientId: f.client.id, subject: f.input.subject } })
    await prisma.emailMessage.create({ data: { companyId: f.company.id, threadId: thread.id, deliveryId: other.id, provider: "RESEND", providerId: "fiction-collision", direction: "OUTBOUND", fromAddress: "sender@example.test", toAddresses: [f.input.to], subject: f.input.subject } })
    await expect(f.recover("REPAIR")).rejects.toThrow("non rapprochable")
    expect(await prisma.emailDelivery.findUniqueOrThrow({ where: { id: f.delivery.id } })).toMatchObject({ recoveryVersion: 1 })
    expect(await prisma.emailMessage.count({ where: { deliveryId: f.delivery.id } })).toBe(0)
    expect(await prisma.auditLog.count({ where: { resourceId: f.delivery.id } })).toBe(0)
    expect(http).not.toHaveBeenCalled()
  })
  it("retains a late acceptance after classification without reactivating diffusion", async () => {
    const f = await fixture()
    await f.recover("CLOSE", { reason: "Fictional unknown decision", confirmed: true })
    await prisma.emailDelivery.update({ where: { id: f.delivery.id }, data: { providerId: "fiction-late-proof", sentAt: new Date(), status: "SENT" } })
    expect(await f.recover("CHECK", { version: 2 })).toMatchObject({ outcome: "ACCEPTED" })
    await expect(f.recover("REPAIR", { version: 3 })).rejects.toThrow("déjà classée")
    expect((await prisma.emailDelivery.findUniqueOrThrow({ where: { id: f.delivery.id } })).closedAt).not.toBeNull()
    await expect(sendManualEmail(f.input)).rejects.toThrow("classée")
    expect((await f.asAuthor(() => listManualEmailRecovery(f.company.id, f.user.id))).total).toBe(0)
    expect(http).not.toHaveBeenCalled()
  })
  it("adopts an exact outbound message synchronized before repair, without duplicating it or losing frozen hidden copies", async () => {
    const f = await fixture()
    await prisma.emailDelivery.update({ where: { id: f.delivery.id }, data: { providerId: "fiction-synced-first", sentAt: new Date(), status: "SENT" } })
    const thread = await prisma.emailThread.create({ data: { companyId: f.company.id, channelId: f.channel.id, clientId: f.client.id, contactId: f.contact.id, subject: f.input.subject } })
    const synced = await prisma.emailMessage.create({ data: { companyId: f.company.id, threadId: thread.id, provider: "RESEND", providerId: "fiction-synced-first", direction: "OUTBOUND", fromAddress: "sender@example.test", toAddresses: [f.input.to], subject: f.input.subject, bodyHtml: f.input.html, status: "BOUNCED", lastEventAt: new Date() } })
    await f.recover("REPAIR")
    expect(await prisma.emailMessage.findUniqueOrThrow({ where: { id: synced.id } })).toMatchObject({ deliveryId: f.delivery.id, purpose: "SERVICE", bccAddresses: f.input.bcc, status: "BOUNCED" })
    expect(await prisma.emailDelivery.findUniqueOrThrow({ where: { id: f.delivery.id } })).toMatchObject({ status: "BOUNCED" })
    expect(await prisma.emailMessage.count({ where: { companyId: f.company.id } })).toBe(1)
    expect(http).not.toHaveBeenCalled()
  })
})
