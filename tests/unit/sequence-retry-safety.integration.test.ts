import { randomUUID } from "node:crypto"
import { afterAll, afterEach, describe, expect, it, vi } from "vitest"
import type { Prisma } from "@prisma/client"
vi.mock("server-only", () => ({}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/automations/email", () => ({ renderEmailVariables: vi.fn(), prepareSequenceEmail: vi.fn(), sendSequenceEmail: vi.fn(() => { throw new Error("Unexpected fictional transport") }) }))
vi.mock("@/lib/auth-wrapper", () => ({ withAuth: async (task: (actor: unknown) => Promise<unknown>, permission: string) => {
  const { getContext } = await import("@/lib/context")
  const { assertDemoMutationAllowed } = await import("@/lib/demo-policy")
  if (!permission.endsWith(".read")) assertDemoMutationAllowed()
  return task(getContext())
} }))
import prisma from "@/lib/prisma"
import { requestContext } from "@/lib/context"
import { retryEmailDelivery } from "@/actions/automations"
import { processDueSequenceEmails } from "@/lib/automations/sequences"
import { sendSequenceEmail } from "@/lib/automations/email"
import { withProcessorLease } from "@/lib/processing/lease"
import { sequenceRetryNeedsReview, SEQUENCE_RETRY_REVIEW_MESSAGE } from "@/lib/automations/sequence-retry-safety"

describe.sequential("sequence retry cannot erase provider evidence or an expired safety window", () => {
  const companies: string[] = [], users: string[] = []
  afterEach(async () => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.clearAllMocks(); await prisma.processorLease.deleteMany({ where: { name: "email-sequences" } }) })
  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { userId: { in: users } } })
    for (const id of companies) await prisma.company.delete({ where: { id } })
    await prisma.user.deleteMany({ where: { id: { in: users } } })
  })
  async function fixture(data: Prisma.EmailDeliveryUncheckedUpdateInput = {}) {
    const company = await prisma.company.create({ data: { name: "Fictional expired retry" } }); companies.push(company.id)
    const user = await prisma.user.create({ data: { email: `fictional-retry-${randomUUID()}@example.test` } }); users.push(user.id)
    const member = await prisma.membership.create({ data: { companyId: company.id, userId: user.id, role: "OWNER", status: "ACTIVE" } })
    const lead = await prisma.leadCapture.create({ data: { companyId: company.id, firstName: "Fiction", lastName: "Expired", email: "recipient@example.test", marketingOptIn: true, privacyAccepted: true, fingerprint: randomUUID() } })
    const sequence = await prisma.emailSequence.create({ data: { companyId: company.id, name: "Fictional paused", status: "ACTIVE", steps: { create: { position: 0, subject: "Fiction", bodyHtml: "<p>Fiction</p>" } } }, include: { steps: true } })
    const enrollment = await prisma.emailSequenceEnrollment.create({ data: { sequenceId: sequence.id, leadCaptureId: lead.id, status: "PAUSED", stopReason: "DELIVERY_RESULT_UNCERTAIN" } })
    let delivery = await prisma.emailDelivery.create({ data: { companyId: company.id, sequenceId: sequence.id, enrollmentId: enrollment.id, stepId: sequence.steps[0].id, leadCaptureId: lead.id, recipientEmail: lead.email!, subject: "Fiction", provider: "RESEND", status: "DEAD_LETTER", attempts: 2, firstAttemptAt: new Date(Date.now() - 24 * 3_600_000), scheduledAt: new Date(), payload: { kind: "FICTIONAL_FROZEN_COMMAND" } } })
    delivery = await prisma.emailDelivery.update({ where: { id: delivery.id }, data })
    const asAuthor = <T>(task: () => Promise<T>) => requestContext.run({ companyId: company.id, userId: user.id, membershipId: member.id, role: "OWNER", agencyIds: null, actionPermission: "automation.write" }, task)
    return { company, user, lead, sequence, enrollment, delivery, asAuthor, retry: () => asAuthor(() => retryEmailDelivery(delivery.id)) }
  }
  async function unchanged(f: Awaited<ReturnType<typeof fixture>>) {
    expect(await f.retry()).toEqual({ success: false, error: SEQUENCE_RETRY_REVIEW_MESSAGE })
    expect(await prisma.emailDelivery.findUniqueOrThrow({ where: { id: f.delivery.id } })).toEqual(f.delivery)
    expect(await prisma.emailSequenceEnrollment.findUniqueOrThrow({ where: { id: f.enrollment.id } })).toEqual(f.enrollment)
    expect(await prisma.auditLog.count({ where: { userId: f.user.id } })).toBe(0)
  }
  it("refuses an uncertain 24-hour-old Resend delivery without changing its traces or paused enrollment", async () => { await unchanged(await fixture()) })
  it.each([{ attempts: 0 }, { attempts: 0, firstAttemptAt: null }, { firstAttemptAt: null }, { firstAttemptAt: new Date(Date.now() + 3_600_000) }])("protects legacy/reset counters and missing or future first attempt dates: %j", async data => { await unchanged(await fixture(data)) })
  it("uses the original first attempt and the exact conservative 23-hour boundary", async () => {
    const f = await fixture(), now = new Date("2035-01-02T08:00:00Z")
    expect(sequenceRetryNeedsReview({ ...f.delivery, firstAttemptAt: new Date(now.getTime() - 23 * 3_600_000 + 1) }, now)).toBe(false)
    expect(sequenceRetryNeedsReview({ ...f.delivery, firstAttemptAt: new Date(now.getTime() - 23 * 3_600_000) }, now)).toBe(true)
  })
  it.each([{ providerId: "fictional-accepted" }, { sentAt: new Date() }, { recoveryOutcome: "ACCEPTED" }, { closedAt: new Date(), closureReason: "Fictional terminal decision" }])("retains known acceptance or terminal classification for every provider: %j", async data => { await unchanged(await fixture({ ...data, provider: "GOOGLE" })) })
  it("rejects foreign IDs without mutating either company's command", async () => {
    const own = await fixture(), foreign = await fixture()
    expect(await own.asAuthor(() => retryEmailDelivery(foreign.delivery.id))).toMatchObject({ success: false })
    expect(await prisma.emailDelivery.findUniqueOrThrow({ where: { id: foreign.delivery.id } })).toEqual(foreign.delivery)
  })
  it("allows a still-safe retry, preserves its original clock/content/references, and records the former attempt count atomically", async () => {
    const firstAttemptAt = new Date(Date.now() - 60_000), lastAttemptAt = new Date(Date.now() - 30_000)
    const f = await fixture({ firstAttemptAt, lastAttemptAt, providerMessageId: "fictional-message-reference" })
    expect(await f.retry()).toEqual({ success: true })
    expect(await prisma.emailDelivery.findUniqueOrThrow({ where: { id: f.delivery.id } })).toMatchObject({ firstAttemptAt, lastAttemptAt, providerMessageId: f.delivery.providerMessageId, payload: f.delivery.payload, status: "FAILED", attempts: 0, recoveryVersion: 2 })
    expect(await prisma.emailSequenceEnrollment.findUniqueOrThrow({ where: { id: f.enrollment.id } })).toMatchObject({ status: "ACTIVE", stopReason: null })
    expect(await prisma.auditLog.findFirstOrThrow({ where: { userId: f.user.id, action: "RETRY_EMAIL_DELIVERY" } })).toMatchObject({ payload: { previousAttempts: 2, firstAttemptAt: firstAttemptAt.toISOString(), previousStatus: "DEAD_LETTER", companyId: f.company.id } })
    expect(sendSequenceEmail).not.toHaveBeenCalled()
  })

  it("keeps active suppressions authoritative even during a still-safe retry window", async () => {
    const f = await fixture({ firstAttemptAt: new Date() })
    await prisma.emailSuppression.create({ data: { companyId: f.company.id, email: f.delivery.recipientEmail, reason: "MANUAL" } })
    expect(await f.retry()).toMatchObject({ success: false, error: expect.stringContaining("bloquée") })
    expect(await prisma.emailDelivery.findUniqueOrThrow({ where: { id: f.delivery.id } })).toEqual(f.delivery)
    expect(await prisma.emailSequenceEnrollment.findUniqueOrThrow({ where: { id: f.enrollment.id } })).toEqual(f.enrollment)
  })
  it("rolls back both retry mutations when their audit cannot commit, then permits an intact retry", async () => {
    const f = await fixture({ firstAttemptAt: new Date() })
    const name = `fictional_retry_fault_${randomUUID().replaceAll("-", "")}`, pg = process.env.DATABASE_URL?.startsWith("postgres")
    const condition = `NEW."resourceId" = '${f.delivery.id}' AND NEW."action" = 'RETRY_EMAIL_DELIVERY'`
    if (pg) {
      await prisma.$executeRawUnsafe(`CREATE FUNCTION "${name}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF ${condition} THEN RAISE EXCEPTION 'fictional retry audit fault'; END IF; RETURN NEW; END; $$`)
      await prisma.$executeRawUnsafe(`CREATE TRIGGER "${name}" BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION "${name}"()`)
    } else await prisma.$executeRawUnsafe(`CREATE TRIGGER "${name}" BEFORE INSERT ON "AuditLog" WHEN ${condition} BEGIN SELECT RAISE(ABORT, 'fictional retry audit fault'); END`)
    try { await expect(f.retry()).rejects.toThrow() } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER "${name}"${pg ? ' ON "AuditLog"' : ""}`)
      if (pg) await prisma.$executeRawUnsafe(`DROP FUNCTION "${name}"()`)
    }
    expect(await prisma.emailDelivery.findUniqueOrThrow({ where: { id: f.delivery.id } })).toEqual(f.delivery)
    expect(await prisma.emailSequenceEnrollment.findUniqueOrThrow({ where: { id: f.enrollment.id } })).toEqual(f.enrollment)
    expect(await prisma.auditLog.count({ where: { userId: f.user.id } })).toBe(0)
    expect(await f.retry()).toEqual({ success: true })
  })
  it("refuses while a sequence processor owns the lease without changing either row", async () => {
    const f = await fixture({ firstAttemptAt: new Date() })
    await withProcessorLease("email-sequences", async () => { await unchanged(f) })
  })
  it("does not reactivate a stopped occurrence even when its provider window is still safe", async () => {
    const f = await fixture({ firstAttemptAt: new Date() })
    f.enrollment = await prisma.emailSequenceEnrollment.update({ where: { id: f.enrollment.id }, data: { status: "STOPPED", stopReason: "CONSENT_WITHDRAWN" } })
    await unchanged(f)
  })
  it("holds an expired command in the processor even after a historical counter reset, without transport", async () => {
    const f = await fixture({ attempts: 0, status: "FAILED" })
    await prisma.emailSequenceEnrollment.update({ where: { id: f.enrollment.id }, data: { status: "ACTIVE", nextSendAt: new Date(0) } })
    expect(await processDueSequenceEmails(10, f.company.id)).toMatchObject({ sent: 0, deadLettered: 1 })
    expect(await prisma.emailDelivery.findUniqueOrThrow({ where: { id: f.delivery.id } })).toMatchObject({ status: "DEAD_LETTER", attempts: 0, firstAttemptAt: f.delivery.firstAttemptAt })
    expect(await prisma.emailSequenceEnrollment.findUniqueOrThrow({ where: { id: f.enrollment.id } })).toMatchObject({ status: "PAUSED", stopReason: "DELIVERY_RESULT_UNCERTAIN", nextSendAt: null })
    expect(sendSequenceEmail).not.toHaveBeenCalled()
  })
  it("refuses every mutation in the public demo", async () => {
    const f = await fixture({ firstAttemptAt: new Date() }); vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    await expect(f.retry()).rejects.toThrow("lecture seule")
    vi.unstubAllEnvs()
    expect(await prisma.emailDelivery.findUniqueOrThrow({ where: { id: f.delivery.id } })).toEqual(f.delivery)
  })
})
