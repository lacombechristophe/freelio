import { afterAll, afterEach, describe, expect, it, vi } from "vitest"
const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
import prisma from "@/lib/prisma"
import { requestContext } from "@/lib/context"
import { getCommunicationInboxPage, updateEmailThread, updateCommunicationThreadAssignment } from "@/actions/communications"
import { changeThreadAssignment } from "@/lib/communications/thread-assignment"
import { seedInboxManagement } from "../../scripts/seed-inbox-management.mjs"

const companies: string[] = [], users: string[] = []
afterEach(() => vi.unstubAllEnvs())
afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { userId: { in: users } } })
  await prisma.company.deleteMany({ where: { id: { in: companies } } })
  await prisma.user.deleteMany({ where: { id: { in: users } } })
})
async function fixture() {
  const company = await prisma.company.create({ data: { name: "Fictional inbox management" } }); companies.push(company.id)
  const foreign = await prisma.company.create({ data: { name: "Foreign inbox management" } }); companies.push(foreign.id)
  async function member(role: string) {
    const user = await prisma.user.create({ data: { name: `Fictional ${role}` } }); users.push(user.id)
    const membership = await prisma.membership.create({ data: { companyId: company.id, userId: user.id, role, status: "ACTIVE" } })
    return { ...user, membershipId: membership.id }
  }
  const owner = await member("OWNER"), a = await member("SALES"), b = await member("SALES"), reader = await member("OPERATIONS")
  const first = await prisma.communicationChannel.create({ data: { companyId: company.id, provider: "RESEND", emailAddress: "first@example.test", visibility: "SHARED" } })
  const second = await prisma.communicationChannel.create({ data: { companyId: company.id, provider: "GOOGLE", emailAddress: "second@example.test", visibility: "SHARED" } })
  const hidden = await prisma.communicationChannel.create({ data: { companyId: company.id, provider: "GOOGLE", emailAddress: "private@example.test", visibility: "PRIVATE", ownerUserId: b.id } })
  const own = await prisma.emailThread.create({ data: { companyId: company.id, channelId: first.id, subject: "Case own", assignedUserId: a.id } })
  const free = await prisma.emailThread.create({ data: { companyId: company.id, channelId: first.id, subject: "Case free", unreadCount: 2 } })
  const closed = await prisma.emailThread.create({ data: { companyId: company.id, channelId: second.id, subject: "Case closed", status: "CLOSED", assignedUserId: b.id } })
  const secret = await prisma.emailThread.create({ data: { companyId: company.id, channelId: hidden.id, subject: "Case hidden", assignedUserId: a.id } })
  const legacy = await prisma.emailThread.create({ data: { companyId: company.id, subject: "Case legacy" } })
  const foreignThread = await prisma.emailThread.create({ data: { companyId: foreign.id, subject: "Case foreign" } })
  function as<T>(user: { id: string }, task: () => Promise<T>) { session.userId = user.id; session.companyId = company.id; return task() }
  return { company, foreign, owner, a, b, reader, first, second, hidden, own, free, closed, secret, legacy, foreignThread, as }
}
describe.sequential("inbox filters, local archives and ownership on real SQL", () => {
  it("combines mailbox, state, assignment and search without exposing private or foreign matches", async () => {
    const f = await fixture()
    const page = await f.as(f.a, () => getCommunicationInboxPage({ channelId: f.first.id, assignment: "ME", filter: "OPEN", search: "Case" }))
    expect(page.total).toBe(1); expect(page.threads.map(row => row.id)).toEqual([f.own.id])
    expect(page.threads[0]).toMatchObject({ assignedToMe: true, hasAssignment: true })
    expect(JSON.stringify(page)).not.toContain("assignedUserId"); expect(JSON.stringify(page)).not.toContain(f.b.id)
    expect((await f.as(f.a, () => getCommunicationInboxPage({ assignment: "ME" }))).total).toBe(1)
    const closed = await f.as(f.a, () => getCommunicationInboxPage({ filter: "CLOSED" }))
    expect(closed.threads.map(row => row.id)).toEqual([f.closed.id])
    expect(closed.threads[0]).toMatchObject({ hasAssignment: true, assignedToMe: false })
    expect(JSON.stringify(closed)).not.toContain(f.b.id)
    expect((await f.as(f.a, () => getCommunicationInboxPage({ channelId: f.hidden.id }))).total).toBe(0)
    expect((await f.as(f.a, () => getCommunicationInboxPage({ channelId: "UNLINKED" }))).total).toBe(0)
    expect((await f.as(f.owner, () => getCommunicationInboxPage({ channelId: "UNLINKED" }))).threads.map(row => row.id)).toEqual([f.legacy.id])
  })
  it("paginates the full filtered mailbox beyond fifty conversations with stable counts", async () => {
    const f = await fixture()
    await prisma.emailThread.createMany({ data: Array.from({ length: 51 }, (_, index) => ({ companyId: f.company.id, channelId: f.second.id, subject: `Paged case ${index}` })) })
    const pages = []
    for (const page of [1, 2]) pages.push(await f.as(f.a, () => getCommunicationInboxPage({ channelId: f.second.id, assignment: "UNASSIGNED", page })))
    expect(pages.map(page => page.total)).toEqual([51, 51])
    expect(new Set(pages.flatMap(page => page.threads.map(row => row.id))).size).toBe(51)
    expect(pages.every(page => page.channelId === f.second.id && page.assignment === "UNASSIGNED")).toBe(true)
  })
  it("archives and restores the original local dossier without changing message observations or ownership", async () => {
    const f = await fixture()
    const message = await prisma.emailMessage.create({ data: { companyId: f.company.id, threadId: f.free.id, direction: "INBOUND", provider: "RESEND", fromAddress: "sender@example.test", toAddresses: [], subject: "Original", bodyText: "Retained original", remoteObservation: { presence: "PRESENT", read: false } } })
    await f.as(f.a, () => updateEmailThread(f.free.id, { status: "ARCHIVED" }))
    expect((await f.as(f.a, () => getCommunicationInboxPage({ channelId: f.first.id }))).threads.some(row => row.id === f.free.id)).toBe(false)
    expect((await f.as(f.a, () => getCommunicationInboxPage({ channelId: f.first.id, filter: "ARCHIVED" }))).threads.map(row => row.id)).toEqual([f.free.id])
    await f.as(f.a, () => updateEmailThread(f.free.id, { status: "OPEN" }))
    expect((await f.as(f.a, () => getCommunicationInboxPage({ filter: "ARCHIVED" }))).total).toBe(0)
    expect(await prisma.emailMessage.findUniqueOrThrow({ where: { id: message.id } })).toEqual(message)
    expect(await prisma.emailThread.findUniqueOrThrow({ where: { id: f.free.id } })).toMatchObject({ assignedUserId: null, unreadCount: 2, status: "OPEN" })
  })
  it("claims and releases personally with an atomic audit and without granting any mailbox access", async () => {
    const f = await fixture()
    expect(await f.as(f.a, () => updateCommunicationThreadAssignment(f.free.id, "CLAIM"))).toEqual({ success: true })
    expect((await f.as(f.a, () => getCommunicationInboxPage({ assignment: "ME" }))).total).toBe(2)
    expect(await f.as(f.b, () => updateCommunicationThreadAssignment(f.free.id, "CLAIM"))).toMatchObject({ success: false })
    expect(await f.as(f.b, () => updateCommunicationThreadAssignment(f.free.id, "RELEASE"))).toMatchObject({ success: false })
    expect((await prisma.emailThread.findUniqueOrThrow({ where: { id: f.free.id } })).assignedUserId).toBe(f.a.id)
    expect(await f.as(f.a, () => updateCommunicationThreadAssignment(f.secret.id, "CLAIM"))).toMatchObject({ success: false, error: "Conversation introuvable" })
    expect(await f.as(f.a, () => updateCommunicationThreadAssignment(f.free.id, "RELEASE"))).toEqual({ success: true })
    const audits = await prisma.auditLog.findMany({ where: { resourceId: f.free.id }, orderBy: { createdAt: "asc" } })
    expect(audits).toHaveLength(2); expect(audits.map(row => (row.payload as { operation: string }).operation)).toEqual(["CLAIM", "RELEASE"])
  })
  it("lets an administrator release an unavailable member's assignment without transferring it silently", async () => {
    const f = await fixture()
    await prisma.membership.update({ where: { id: f.b.membershipId }, data: { status: "SUSPENDED" } })
    expect(await f.as(f.owner, () => updateCommunicationThreadAssignment(f.closed.id, "RELEASE"))).toEqual({ success: true })
    expect((await prisma.emailThread.findUniqueOrThrow({ where: { id: f.closed.id } })).assignedUserId).toBeNull()
    expect(await f.as(f.a, () => updateCommunicationThreadAssignment(f.closed.id, "CLAIM"))).toEqual({ success: true })
  })
  it("admits only one claimant when two members act concurrently", async () => {
    const f = await fixture()
    const results = await Promise.all([f.as(f.a, () => updateCommunicationThreadAssignment(f.free.id, "CLAIM")), f.as(f.b, () => updateCommunicationThreadAssignment(f.free.id, "CLAIM"))])
    expect(results.filter(result => result.success)).toHaveLength(1)
    expect(results.filter(result => !result.success)).toHaveLength(1)
    const row = await prisma.emailThread.findUniqueOrThrow({ where: { id: f.free.id } })
    expect([f.a.id, f.b.id]).toContain(row.assignedUserId)
    expect(await prisma.auditLog.count({ where: { resourceId: f.free.id } })).toBe(1)
  })
  it("rereads membership and private access inside the write transaction", async () => {
    const f = await fixture()
    const stale = { userId: f.a.id, companyId: f.company.id, membershipId: f.a.membershipId, role: "ADMIN" as const, agencyIds: null, actionPermission: "automation.write" as const }
    expect(await requestContext.run(stale, () => changeThreadAssignment(f.company.id, f.a.id, { threadId: f.secret.id, operation: "CLAIM" }))).toMatchObject({ success: false })
    await prisma.membership.update({ where: { id: f.a.membershipId }, data: { status: "SUSPENDED" } })
    await expect(requestContext.run(stale, () => changeThreadAssignment(f.company.id, f.a.id, { threadId: f.free.id, operation: "CLAIM" }))).rejects.toThrow("écriture")
    expect(await prisma.auditLog.count({ where: { resourceId: f.free.id } })).toBe(0)
  })
  it("refuses foreign and malformed references, read-only roles and public demo writes", async () => {
    const f = await fixture()
    expect(await f.as(f.a, () => updateCommunicationThreadAssignment(f.foreignThread.id, "CLAIM"))).toMatchObject({ success: false })
    await expect(f.as(f.a, () => updateCommunicationThreadAssignment("invalid", "CLAIM"))).rejects.toThrow()
    await expect(f.as(f.reader, () => updateCommunicationThreadAssignment(f.free.id, "CLAIM"))).rejects.toThrow()
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    expect((await f.as(f.a, () => getCommunicationInboxPage({ assignment: "UNASSIGNED" }))).total).toBe(1)
    await expect(f.as(f.a, () => updateCommunicationThreadAssignment(f.free.id, "CLAIM"))).rejects.toThrow("lecture seule")
    await expect(f.as(f.a, () => updateEmailThread(f.free.id, { status: "ARCHIVED" }))).rejects.toThrow("lecture seule")
  })
  it("provides separate browser fixtures per surface without credentials or unrelated role data", async () => {
    await seedInboxManagement(prisma, "fictional-password-hash-only")
    const seededCompanies = await prisma.company.findMany({ where: { name: { startsWith: "Fictional inbox management " } } })
    const seededUsers = await prisma.user.findMany({ where: { email: { startsWith: "inbox-management-" } } })
    companies.push(...seededCompanies.map(row => row.id)); users.push(...seededUsers.map(row => row.id))
    expect(seededCompanies).toHaveLength(2); expect(seededUsers).toHaveLength(2)
    for (const user of seededUsers) {
      session.userId = user.id; session.companyId = user.companyId!
      const page = await getCommunicationInboxPage({})
      expect(page.total).toBe(1); expect(page.threads[0]).toMatchObject({ subject: "UIQA Inbox management", hasAssignment: false })
      const channel = await prisma.communicationChannel.findFirstOrThrow({ where: { companyId: user.companyId! } })
      expect(channel.credentialsEncrypted).toBeNull(); expect(channel.status).toBe("DISCONNECTED")
    }
  })
})
