import { afterAll, describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
import prisma from "@/lib/prisma"
import { requestContext, type RequestContext } from "@/lib/context"
import { EmailSendQuotaConflict, EmailSendQuotaError, readEmailSendQuota, reserveEmailSendQuota, saveEmailSendQuota } from "@/lib/communications/send-quotas"
import { buildBackupPayload } from "@/lib/backup"

describe.sequential("internal mailbox send quotas on SQL", () => {
  const companies: string[] = [], users: string[] = []
  const at = new Date("2026-10-20T12:34:20Z")
  afterAll(async () => {
    for (const companyId of companies) {
      await prisma.emailSendQuotaCharge.deleteMany({ where: { companyId } })
      await prisma.emailSendQuotaState.deleteMany({ where: { companyId } })
      await prisma.emailSendQuotaPolicy.deleteMany({ where: { companyId } })
      await prisma.company.delete({ where: { id: companyId } })
    }
    await prisma.user.deleteMany({ where: { id: { in: users } } })
  })
  async function fixture(daily = 5, minute = 3, configured = true) {
    const company = await prisma.company.create({ data: { name: "Fictional quota" } }); companies.push(company.id)
    const user = await prisma.user.create({ data: { email: `${crypto.randomUUID()}@example.test` } }); users.push(user.id)
    const membership = await prisma.membership.create({ data: { companyId: company.id, userId: user.id, role: "OWNER", status: "ACTIVE" } })
    const channel = await prisma.communicationChannel.create({ data: { companyId: company.id, ownerUserId: user.id, provider: "RESEND", emailAddress: "sender@example.test", status: "ACTIVE" } })
    const identity = { companyId: company.id, channelKey: channel.id }
    const context: RequestContext = { companyId: company.id, userId: user.id, membershipId: membership.id, role: "OWNER", agencyIds: null, actionPermission: "company.manage" }
    const configure = (overrides = {}) => requestContext.run(context, () => saveEmailSendQuota(company.id, { channelKey: channel.id, version: 0, enabled: true, dailyRecipientLimit: daily, minuteRecipientLimit: minute, ...overrides }))
    if (configured) await configure()
    const command = async (changes = {}) => {
      const delivery = await prisma.emailDelivery.create({ data: { companyId: company.id, channelId: channel.id, recipientEmail: "to@example.test", subject: "Fiction only", scheduledAt: at, status: "SENDING" } })
      return { ...identity, deliveryId: delivery.id, from: "sender@example.test", to: "to@example.test", subject: "Fiction only", html: "<p>Fiction</p>", ...changes }
    }
    return { company, channel, user, membership, identity, context, configure, command }
  }
  it("requires an explicit enabled policy, without creating a charge or counter", async () => {
    const f = await fixture(5, 3, false), command = await f.command()
    await expect(reserveEmailSendQuota(command, at)).rejects.toBeInstanceOf(EmailSendQuotaError)
    expect(await prisma.emailSendQuotaCharge.count({ where: f.identity })).toBe(0)
    expect(await prisma.emailSendQuotaState.count({ where: f.identity })).toBe(0)
    await f.configure({ enabled: false })
    await expect(reserveEmailSendQuota(command, at)).rejects.toThrow("activez")
  })
  it("counts To, CC and BCC, and does not expose recipients or fingerprints in the usage DTO", async () => {
    const f = await fixture(), command = await f.command({ cc: ["copy@example.test"], bcc: ["hidden@example.test"] })
    expect(await reserveEmailSendQuota(command, at)).toEqual({ recipientUnits: 3 })
    const usage = await readEmailSendQuota(f.identity, at)
    expect(usage.windows.map(window => window.used)).toEqual([3, 3])
    expect(JSON.stringify(usage)).not.toMatch(/hidden|example.test|bindingHash|deliveryId/)
    const next = await f.command()
    try { await reserveEmailSendQuota(next, at); expect.fail("The minute is full") }
    catch (error) { expect(error).toBeInstanceOf(EmailSendQuotaError); expect((error as EmailSendQuotaError).retryAt?.toISOString()).toBe("2026-10-20T12:35:00.000Z") }
    expect(await prisma.emailSendQuotaCharge.count({ where: f.identity })).toBe(2)
  })
  it("reserves both periods or neither when only the daily window is exhausted", async () => {
    const f = await fixture(3, 3)
    await reserveEmailSendQuota(await f.command({ cc: ["copy@example.test"], bcc: ["hidden@example.test"] }), at)
    const later = new Date("2026-10-20T12:35:01Z")
    await expect(reserveEmailSendQuota(await f.command(), later)).rejects.toMatchObject({ retryAt: new Date("2026-10-21T00:00:00Z") })
    expect((await readEmailSendQuota(f.identity, later)).windows.map(window => window.used)).toEqual([3, 0])
    expect(await prisma.emailSendQuotaCharge.count({ where: { ...f.identity, period: "MINUTE" } })).toBe(1)
  })
  it("reuses an admission in the same period and charges only new periods on a retry", async () => {
    const f = await fixture(20, 5), command = await f.command()
    await reserveEmailSendQuota(command, at)
    await reserveEmailSendQuota(command, at)
    expect(await prisma.emailSendQuotaCharge.count({ where: f.identity })).toBe(2)
    const nextMinute = new Date(at.getTime() + 60_000)
    await reserveEmailSendQuota(command, nextMinute)
    expect((await readEmailSendQuota(f.identity, nextMinute)).windows.map(window => window.used)).toEqual([1, 1])
    expect(await prisma.emailSendQuotaCharge.count({ where: f.identity })).toBe(3)
    const tomorrow = new Date(at.getTime() + 86_400_000)
    await reserveEmailSendQuota(command, tomorrow)
    expect(await prisma.emailSendQuotaCharge.count({ where: f.identity })).toBe(5)
  })
  it.each(["subject", "html", "from", "text", "replyTo", "bcc", "attachments"] as const)("refuses changed %s on an admitted command", async field => {
    const f = await fixture(), command = await f.command()
    await reserveEmailSendQuota(command, at)
    const changes = { subject: "Changed", html: "<p>Changed</p>", from: "other@example.test", text: "Changed", replyTo: "other@example.test", bcc: ["hidden@example.test"], attachments: [{ id: "file", name: "f.pdf", type: "application/pdf", size: 10, sha256: "f".repeat(64) }] }
    await expect(reserveEmailSendQuota({ ...command, [field]: changes[field] }, at)).rejects.toThrow("incohérente")
    expect(await prisma.emailSendQuotaCharge.count({ where: f.identity })).toBe(2)
  })
  it("keeps the limit under concurrent different commands and identical retries", async () => {
    const f = await fixture(2, 2), commands = await Promise.all(Array.from({ length: 8 }, () => f.command()))
    const results = await Promise.allSettled(commands.map(command => reserveEmailSendQuota(command, at)))
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(2)
    expect(results.filter(result => result.status === "rejected").every(result => result.status === "rejected" && result.reason instanceof EmailSendQuotaError)).toBe(true)
    expect((await readEmailSendQuota(f.identity, at)).windows.map(window => window.used)).toEqual([2, 2])
    const first = results.findIndex(result => result.status === "fulfilled")
    await Promise.all(Array.from({ length: 8 }, () => reserveEmailSendQuota(commands[first], at)))
    expect(await prisma.emailSendQuotaCharge.count({ where: f.identity })).toBe(4)
  })
  it("does not refund uncertain or failed admissions, nor reset counters when limits change", async () => {
    const f = await fixture(), command = await f.command()
    await reserveEmailSendQuota(command, at)
    await prisma.emailDelivery.update({ where: { id: command.deliveryId }, data: { status: "FAILED", error: "Fictional timeout" } })
    await f.configure({ version: 1, dailyRecipientLimit: 10, minuteRecipientLimit: 10 })
    expect((await readEmailSendQuota(f.identity, at)).windows.map(window => window.used)).toEqual([1, 1])
    await expect(f.configure({ version: 1 })).rejects.toBeInstanceOf(EmailSendQuotaConflict)
    await f.configure({ version: 2, enabled: false })
    await expect(reserveEmailSendQuota(await f.command(), at)).rejects.toThrow("activez")
  })
  it("rebuilds missing state from admissions and never resets a later window when the clock goes backwards", async () => {
    const f = await fixture(1, 1), command = await f.command()
    await reserveEmailSendQuota(command, at)
    await prisma.emailSendQuotaState.deleteMany({ where: f.identity })
    const yesterday = new Date(at.getTime() - 86_400_000)
    expect((await readEmailSendQuota(f.identity, yesterday)).windows.map(window => window.used)).toEqual([1, 1])
    await expect(reserveEmailSendQuota(await f.command(), yesterday)).rejects.toBeInstanceOf(EmailSendQuotaError)
    expect(await prisma.emailSendQuotaCharge.count({ where: f.identity })).toBe(2)
  })
  it("isolates boxes and companies, and refuses foreign or completed command anchors", async () => {
    const f = await fixture(), other = await fixture(), command = await other.command()
    await expect(reserveEmailSendQuota({ ...command, ...f.identity }, at)).rejects.toThrow("incohérente")
    const own = await f.command()
    for (const status of ["SCHEDULED", "SENT", "CANCELED"]) {
      await prisma.emailDelivery.update({ where: { id: own.deliveryId }, data: { status } })
      await expect(reserveEmailSendQuota(own, at)).rejects.toThrow("incohérente")
    }
    await requestContext.run(f.context, async () => {
      await expect(readEmailSendQuota(other.identity, at)).rejects.toThrow("inaccessible")
      expect(await prisma.emailSendQuotaPolicy.findMany({ where: { companyId: other.company.id } })).toEqual([])
    })
    expect(await prisma.emailSendQuotaCharge.count({ where: f.identity })).toBe(0)
  })
  it("blocks private-box usage for other members, including nested charges and required command projections", async () => {
    const f = await fixture(), command = await f.command()
    await reserveEmailSendQuota(command, at)
    const stranger = { ...f.context, userId: "different-member", role: "SALES" as const, actionPermission: "automation.write" as const }
    await requestContext.run(stranger, async () => {
      await expect(readEmailSendQuota(f.identity, at)).rejects.toThrow("inaccessible")
      expect(await prisma.emailSendQuotaCharge.findMany({ include: { delivery: true } })).toEqual([])
      expect(await prisma.company.findUnique({ where: { id: f.company.id }, select: { emailSendQuotaCharges: true } })).toEqual({ emailSendQuotaCharges: [] })
    })
    await requestContext.run({ ...stranger, userId: f.user.id }, async () => {
      expect(await prisma.emailSendQuotaCharge.findMany({ where: f.identity, include: { delivery: true } })).toHaveLength(2)
    })
  })
  it("refuses a suspended or non-admin policy editor even when its cached context says owner", async () => {
    const f = await fixture()
    await prisma.membership.update({ where: { id: f.membership.id }, data: { status: "SUSPENDED" } })
    await expect(f.configure({ version: 1 })).rejects.toThrow("administrateur")
    await prisma.membership.update({ where: { id: f.membership.id }, data: { status: "ACTIVE", role: "SALES" } })
    await expect(f.configure({ version: 1 })).rejects.toThrow("administrateur")
  })
  it("supports a company-scoped platform policy without claiming an account-wide provider budget", async () => {
    const f = await fixture(), identity = { companyId: f.company.id, channelKey: "platform" }
    await requestContext.run(f.context, () => saveEmailSendQuota(f.company.id, { channelKey: "platform", version: 0, enabled: true, dailyRecipientLimit: 1, minuteRecipientLimit: 1 }))
    const command = await f.command()
    await prisma.emailDelivery.update({ where: { id: command.deliveryId }, data: { channelId: null } })
    await reserveEmailSendQuota({ ...command, ...identity }, at)
    expect((await readEmailSendQuota(identity, at)).windows.map(window => window.used)).toEqual([1, 1])
    expect((await readEmailSendQuota(f.identity, at)).windows.map(window => window.used)).toEqual([0, 0])
  })
  it("refuses impossible policy values and messages larger than the whole window", async () => {
    const f = await fixture()
    for (const limits of [{ dailyRecipientLimit: 0 }, { minuteRecipientLimit: 6 }, { dailyRecipientLimit: 1.5 }, { minuteRecipientLimit: 1_000_001 }]) {
      await expect(f.configure({ version: 1, ...limits })).rejects.toThrow()
    }
    await expect(reserveEmailSendQuota(await f.command({ cc: ["a@example.test", "b@example.test", "c@example.test"] }), at)).rejects.toMatchObject({ retryAt: null })
    expect(await prisma.emailSendQuotaCharge.count({ where: f.identity })).toBe(0)
  })
  it("preserves policy, counters and admission identities in the logical export", async () => {
    const f = await fixture(), command = await f.command()
    await reserveEmailSendQuota(command, at)
    const backup = await buildBackupPayload(f.user.id, f.company.id)
    expect(backup.manifest.status).toBe("COMPLETE")
    expect(backup.tables.find(table => table.model === "EmailSendQuotaPolicy")?.rows).toMatchObject([{ channelKey: f.channel.id, enabled: true }])
    expect(backup.tables.find(table => table.model === "EmailSendQuotaState")?.rows).toHaveLength(2)
    expect(backup.tables.find(table => table.model === "EmailSendQuotaCharge")?.rows).toMatchObject([{ deliveryId: command.deliveryId, recipientUnits: 1 }, { deliveryId: command.deliveryId, recipientUnits: 1 }])
  })
  it("blocks all quota writes in the public demo", async () => {
    const f = await fixture(), command = await f.command()
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    try {
      await expect(reserveEmailSendQuota(command, at)).rejects.toThrow("lecture seule")
      await expect(f.configure({ version: 1 })).rejects.toThrow("lecture seule")
      expect((await readEmailSendQuota(f.identity, at)).windows.map(window => window.used)).toEqual([0, 0])
    } finally { vi.unstubAllEnvs() }
  })
  it("rejects a foreign admission attached to an owned command without disclosing it through nested projections", async () => {
    const f = await fixture(), foreign = await fixture(), command = await f.command()
    await prisma.emailSendQuotaCharge.create({ data: { companyId: foreign.company.id, channelKey: foreign.channel.id, channelId: foreign.channel.id, deliveryId: command.deliveryId,
      period: "DAY", windowStart: at, recipientUnits: 1, bindingHash: "foreign-proof", policyVersion: 1 } })
    await requestContext.run({ ...f.context, actionPermission: "automation.write" }, async () => {
      expect(await prisma.emailDelivery.findUnique({ where: { id: command.deliveryId }, select: { quotaCharges: true } })).toEqual({ quotaCharges: [] })
      await expect(reserveEmailSendQuota(command, at)).rejects.toThrow("incohérente")
    })
    expect(await prisma.emailSendQuotaState.count({ where: f.identity })).toBe(0)
  })
  it("serializes initial identical admissions and concurrent policy edits", async () => {
    const f = await fixture(), command = await f.command()
    await Promise.all(Array.from({ length: 8 }, () => reserveEmailSendQuota(command, at)))
    expect(await prisma.emailSendQuotaCharge.count({ where: f.identity })).toBe(2)
    const edits = await Promise.allSettled([f.configure({ version: 1, dailyRecipientLimit: 10 }), f.configure({ version: 1, dailyRecipientLimit: 20 })])
    expect(edits.filter(edit => edit.status === "fulfilled")).toHaveLength(1)
    expect(edits.filter(edit => edit.status === "rejected").every(edit => edit.status === "rejected" && edit.reason instanceof EmailSendQuotaConflict)).toBe(true)
    expect((await readEmailSendQuota(f.identity, at)).windows.map(window => window.used)).toEqual([1, 1])
  })
  it("keeps the company cascade usable with quota data attached to its mailbox and command", async () => {
    const f = await fixture()
    await reserveEmailSendQuota(await f.command(), at)
    await expect(prisma.communicationChannel.delete({ where: { id: f.channel.id } })).rejects.toMatchObject({ code: "P2003" })
    await prisma.company.delete({ where: { id: f.company.id } })
    companies.splice(companies.indexOf(f.company.id), 1)
    expect(await prisma.emailSendQuotaCharge.count({ where: { companyId: f.company.id } })).toBe(0)
    expect(await prisma.emailSendQuotaPolicy.count({ where: { companyId: f.company.id } })).toBe(0)
  })
})
