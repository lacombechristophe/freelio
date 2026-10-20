import { randomUUID } from "node:crypto"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"

const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
const reads = vi.hoisted(() => ({ active: 0, maximum: 0, started: [] as string[] }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }) }))
vi.mock("@/components/shared/confirm-provider", () => ({ useConfirm: () => async () => false }))
// SSR checks initial controls only. Effect events are never executed here;
// hydration and automatic mark-read have a separate prepared browser recipe.
vi.mock("react", async original => ({ ...await original<typeof import("react")>(), useEffectEvent: (callback: unknown) => callback }))
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
import { updateEmailThread } from "@/actions/communications"
import { CommunicationCenter } from "@/app/dashboard/communications/communication-center"
import { seedCommunicationsAccess } from "../../scripts/seed-communications-access.mjs"
import { getCommunicationDrafts } from "@/actions/communications"

describe.sequential("Communications dashboard on real SQL", () => {
  let foreignCompanyId: string, membershipId: string, contactId: string, threadId: string
  beforeAll(async () => {
    vi.stubGlobal("React", React)
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
  it.each([
    ["OWNER", true, true], ["ADMIN", true, true], ["SALES", true, false],
    ["OPERATIONS", false, false], ["SERVICE", false, false],
  ] as const)("projects the current %s capabilities without changing the role matrix", async (role, write, manage) => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    expect(await getCommunicationDashboard()).toHaveProperty("access", { write, manage })
    if (!write) {
      await expect(updateEmailThread(threadId, { markRead: true })).rejects.toThrow()
      expect(await prisma.emailThread.findUniqueOrThrow({ where: { id: threadId } })).toMatchObject({ unreadCount: 1 })
    }
  })
  it("recomputes the exposed controls after a membership downgrade", async () => {
    expect(await getCommunicationDashboard()).toHaveProperty("access", { write: true, manage: true })
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "OPERATIONS" } })
    expect(await getCommunicationDashboard()).toHaveProperty("access", { write: false, manage: false })
  })
  async function render(tab: string, empty = false) {
    let channel = await prisma.communicationChannel.findFirst({ where: { companyId: session.companyId } })
    channel ??= await prisma.communicationChannel.create({ data: { companyId: session.companyId, provider: "RESEND", emailAddress: "fiction@example.test", visibility: "SHARED", status: "DISCONNECTED" } })
    await prisma.emailThread.update({ where: { id: threadId }, data: { channelId: channel.id } })
    const data = await getCommunicationDashboard()
    if (empty) { data.threads = []; data.inbox = { ...data.inbox, threads: [], total: 0 } }
    return renderToStaticMarkup(React.createElement(CommunicationCenter, { initialTab: tab, initialData: {
      ...data, channels: data.channels.map(channel => ({ ...channel, lastSyncAt: channel.lastSyncAt?.toISOString() || null })),
    } }))
  }
  function control(html: string, label: string) {
    const result = [...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].map(match => match[0]).find(tag => tag.replace(/<[^>]+>/g, "").trim() === label)
    expect(result, label).toBeDefined()
    return result!
  }
  it.each(["OPERATIONS", "SERVICE"])("renders %s inbox mutation commands disabled while keeping reading available", async role => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    const html = await render("inbox")
    expect(html).toContain("Consultation seule")
    for (const label of ["Clore", "Répondre", "Répondre à tous", "Transférer"]) expect(control(html, label)).toMatch(/\sdisabled(?:=|\s|>)/)
    for (const label of ["Rechercher", "Aperçu HTML"]) expect(control(html, label)).not.toMatch(/\sdisabled(?:=|\s|>)/)
    expect(await render("compose")).toMatch(/<fieldset\b[^>]*\sdisabled[^>]*>[\s\S]*id="email-html"/)
  })
  it("keeps Sales composition available without offering company integration writes", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "SALES" } })
    expect(control(await render("inbox"), "Répondre")).not.toMatch(/\sdisabled(?:=|\s|>)/)
    const html = await render("integrations")
    expect(html).toContain("Droits de gestion de la société requis")
    for (const tag of [...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].map(match => match[0]).filter(tag => ["Connecter", "Ajouter mes clés"].includes(tag.replace(/<[^>]+>/g, "").trim()))) expect(tag).toMatch(/\sdisabled(?:=|\s|>)/)
    expect(control(html, "Ajouter mes clés")).toMatch(/\sdisabled(?:=|\s|>)/)
  })
  it("keeps integration commands available for the current Owner", async () => {
    expect(control(await render("integrations"), "Ajouter mes clés")).not.toMatch(/\sdisabled(?:=|\s|>)/)
  })
  it("renders a genuinely empty inbox without dereferencing a missing selection", async () => {
    const html = await render("inbox", true)
    expect(html).toContain("Aucune conversation")
    expect(html).toContain("Sélectionnez une conversation.")
  })
  it("provides isolated browser roles with private historical drafts and no live credentials", async () => {
    const previous = { ...session }
    await seedCommunicationsAccess(prisma, "fictional-hash-not-used-for-authentication")
    const companies = await prisma.company.findMany({ where: { name: { startsWith: "Fictional Communications access " } }, select: { id: true } })
    const ids = companies.map(company => company.id)
    const users = await prisma.user.findMany({ where: { companyId: { in: ids } }, select: { id: true, companyId: true, email: true } })
    try {
      expect(companies).toHaveLength(2); expect(users).toHaveLength(6)
      for (const user of users) {
        expect(user.email).not.toBeNull()
        const email = user.email!
        session.userId = user.id; session.companyId = user.companyId!
        const data = await getCommunicationDashboard()
        expect(data.access).toEqual({ write: email.includes("-sales-"), manage: false })
        expect(data.inbox.total).toBe(1); expect(data.stats.unread).toBe(1)
        expect(data.channels).toHaveLength(1); expect(data.channels[0]).toMatchObject({ status: "DISCONNECTED", hasCredentials: false })
        const drafts = await getCommunicationDrafts()
        expect(drafts.total).toBe(1)
        expect(drafts.drafts[0].subject).toContain(email.split("-")[1].toUpperCase())
      }
    } finally {
      Object.assign(session, previous)
      await prisma.emailDraft.deleteMany({ where: { companyId: { in: ids } } })
      await prisma.emailThread.deleteMany({ where: { companyId: { in: ids } } })
      await prisma.contact.deleteMany({ where: { client: { companyId: { in: ids } } } })
      await prisma.client.deleteMany({ where: { companyId: { in: ids } } })
      await prisma.company.deleteMany({ where: { id: { in: ids } } })
      await prisma.user.deleteMany({ where: { id: { in: users.map(user => user.id) } } })
    }
  })
})
