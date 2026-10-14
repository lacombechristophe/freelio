import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"

const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
const reads = vi.hoisted(() => ({ active: 0, maximum: 0, started: [] as string[] }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/communications/inbox-reader", async original => {
  const actual = await original<typeof import("@/lib/communications/inbox-reader")>()
  return { ...actual, readInboxPage: async (...args: Parameters<typeof actual.readInboxPage>) => {
    reads.started.push("inbox")
    reads.maximum = Math.max(reads.maximum, ++reads.active)
    try { return await actual.readInboxPage(...args) } finally { reads.active-- }
  } }
})
vi.mock("@/lib/communications/recipient-reader", async original => {
  const actual = await original<typeof import("@/lib/communications/recipient-reader")>()
  return { ...actual, readRecipientPage: async (...args: Parameters<typeof actual.readRecipientPage>) => {
    reads.started.push("recipients")
    reads.maximum = Math.max(reads.maximum, ++reads.active)
    try { return await actual.readRecipientPage(...args) } finally { reads.active-- }
  } }
})
import prisma from "@/lib/prisma"
import { getCommunicationDashboard } from "@/actions/communications"

describe.sequential("Communications dashboard on real SQL", () => {
  let foreignCompanyId: string, membershipId: string, contactId: string, threadId: string
  beforeAll(async () => {
    session.companyId = (await prisma.company.create({ data: { name: "Fictional dashboard", email: "fiction@example.test" } })).id
    foreignCompanyId = (await prisma.company.create({ data: { name: "Foreign fictional dashboard" } })).id
    session.userId = (await prisma.user.create({ data: { email: "dashboard-" + randomUUID() + "@example.test" } })).id
    membershipId = (await prisma.membership.create({ data: { companyId: session.companyId, userId: session.userId, role: "OWNER", status: "ACTIVE" } })).id
    for (const companyId of [session.companyId, foreignCompanyId]) {
      const own = companyId === session.companyId
      const client = await prisma.client.create({ data: { companyId, name: own ? "Fictional recipient client" : "FOREIGN-DASHBOARD-CLIENT" } })
      const contact = await prisma.contact.create({ data: { clientId: client.id, firstName: "Fiction", lastName: own ? "Recipient" : "Foreign", email: own ? "recipient@example.test" : "foreign@example.test" } })
      const thread = await prisma.emailThread.create({ data: { companyId, clientId: client.id, contactId: contact.id, subject: own ? "Fictional incoming" : "FOREIGN-DASHBOARD-THREAD", unreadCount: 1,
        messages: { create: { companyId, direction: "INBOUND", provider: "RESEND", fromAddress: contact.email!, toAddresses: ["fiction@example.test"], subject: "Fictional incoming", bodyText: "Fictional message" } },
      } })
      if (own) { contactId = contact.id; threadId = thread.id }
    }
  })
  afterEach(async () => {
    reads.active = 0; reads.maximum = 0; reads.started = []
    vi.unstubAllEnvs()
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "OWNER" } })
  })
  afterAll(async () => {
    const ids = [session.companyId, foreignCompanyId].filter(Boolean)
    await prisma.emailThread.deleteMany({ where: { companyId: { in: ids } } })
    await prisma.contact.deleteMany({ where: { client: { companyId: { in: ids } } } })
    await prisma.client.deleteMany({ where: { companyId: { in: ids } } })
    await prisma.company.deleteMany({ where: { id: { in: ids } } })
    await prisma.user.delete({ where: { id: session.userId } })
  })
  it("returns both owned directories, signature and statistics without foreign records", async () => {
    const data = await getCommunicationDashboard()
    expect(data.company).toEqual({ id: session.companyId, name: "Fictional dashboard", email: "fiction@example.test" })
    expect(data.inbox.total).toBe(1)
    expect(data.threads.map(row => row.id)).toEqual([threadId])
    expect(data.recipients.contacts.map(row => row.id)).toEqual([contactId])
    expect(data.signature).toEqual({ text: "", version: null })
    expect(data.signatureOwnerId).toBe(session.userId)
    expect(data.stats).toEqual({ sent: 0, received: 1, unread: 1, events: {} })
    expect(JSON.stringify(data)).not.toContain("FOREIGN-DASHBOARD")
  })
  it("avoids overlapping SQLite transactional readers while retaining PostgreSQL parallelism", async () => {
    await getCommunicationDashboard()
    expect(reads.started).toEqual(["inbox", "recipients"])
    expect(reads.maximum).toBe(process.env.DATABASE_URL?.startsWith("file:") ? 1 : 2)
  })
  it("refuses the domain before either directory starts", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "TECHNICIAN" } })
    await expect(getCommunicationDashboard()).rejects.toThrow()
    expect(reads.started).toEqual([])
  })
  it("reads in the public demo without changing drafts, messages or audits", async () => {
    const snapshot = async () => ({ drafts: await prisma.emailDraft.count({ where: { companyId: session.companyId } }), messages: await prisma.emailMessage.count({ where: { companyId: session.companyId } }), audits: await prisma.auditLog.count({ where: { userId: session.userId } }) })
    const before = await snapshot()
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    expect((await getCommunicationDashboard()).recipients.total).toBe(1)
    expect(await snapshot()).toEqual(before)
  })
})
