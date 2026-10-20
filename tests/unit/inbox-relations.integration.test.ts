import { afterAll, describe, expect, it, vi } from "vitest"
const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
import prisma from "@/lib/prisma"
import { getCommunicationInboxPage, getPreviousCommunicationMessages, updateEmailThread, updateCommunicationThreadAssignment } from "@/actions/communications"

const companies: string[] = [], users: string[] = []
afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { userId: { in: users } } })
  // Corrupt channel links deliberately cross companies; remove their threads first.
  await prisma.emailThread.deleteMany({ where: { companyId: { in: companies } } })
  await prisma.client.deleteMany({ where: { companyId: { in: companies } } })
  await prisma.company.deleteMany({ where: { id: { in: companies } } })
  await prisma.user.deleteMany({ where: { id: { in: users } } })
})
async function fixture(role = "OWNER") {
  const own = await prisma.company.create({ data: { name: "Fictional inbox relations" } }), foreign = await prisma.company.create({ data: { name: "Foreign inbox relations" } })
  companies.push(own.id, foreign.id)
  const user = await prisma.user.create({ data: { name: "Fictional inbox reader" } }); users.push(user.id)
  await prisma.membership.create({ data: { companyId: own.id, userId: user.id, role, status: "ACTIVE" } })
  const channel = await prisma.communicationChannel.create({ data: { companyId: own.id, provider: "RESEND", emailAddress: "own@example.test", visibility: "SHARED" } })
  const foreignChannel = await prisma.communicationChannel.create({ data: { companyId: foreign.id, provider: "RESEND", emailAddress: "foreign@example.test", visibility: "SHARED" } })
  const client = await prisma.client.create({ data: { companyId: foreign.id, name: "FOREIGN-INBOX-CLIENT" } })
  const contact = await prisma.contact.create({ data: { clientId: client.id, firstName: "FOREIGN-INBOX-CONTACT", lastName: "Fiction" } })
  const lead = await prisma.leadCapture.create({ data: { companyId: foreign.id, firstName: "FOREIGN-INBOX-LEAD", lastName: "Fiction", email: "foreign@example.test", privacyAccepted: true, fingerprint: own.id } })
  session.companyId = own.id; session.userId = user.id
  return { own, foreign, user, channel, foreignChannel, client, contact, lead }
}
describe.sequential("inbox relations on real SQL", () => {
  it.each(["channelId", "clientId", "contactId", "leadCaptureId"] as const)("refuses a local thread with foreign %s without mutation or audit", async key => {
    const f = await fixture()
    const reference = { channelId: f.foreignChannel.id, clientId: f.client.id, contactId: f.contact.id, leadCaptureId: f.lead.id }[key]
    const thread = await prisma.emailThread.create({ data: { companyId: f.own.id, channelId: f.channel.id, subject: "Incoherent thread", [key]: reference } })
    const cursor = await prisma.emailMessage.create({ data: { companyId: f.own.id, threadId: thread.id, direction: "INBOUND", provider: "RESEND", fromAddress: "fiction@example.test", toAddresses: [], subject: "Incoherent" } })
    expect((await getCommunicationInboxPage({ search: "Incoherent" })).total).toBe(0)
    await expect(getPreviousCommunicationMessages({ threadId: thread.id, beforeMessageId: cursor.id })).rejects.toThrow("Conversation introuvable")
    await expect(updateEmailThread(thread.id, { status: "ARCHIVED", markRead: true })).rejects.toThrow("Conversation introuvable")
    expect(await updateCommunicationThreadAssignment(thread.id, "CLAIM")).toMatchObject({ success: false })
    expect(await prisma.emailThread.findUnique({ where: { id: thread.id } })).toMatchObject({ status: "OPEN", assignedUserId: null })
    expect(await prisma.auditLog.count({ where: { resourceId: thread.id } })).toBe(0)
  })
  it.each(["OWNER", "ADMIN", "SALES"])("excludes foreign messages and events from %s projections, search and pagination", async role => {
    const f = await fixture(role)
    const thread = await prisma.emailThread.create({ data: { companyId: f.own.id, channelId: f.channel.id, subject: "Coherent thread" } })
    const message = await prisma.emailMessage.create({ data: { companyId: f.own.id, threadId: thread.id, direction: "INBOUND", provider: "RESEND", fromAddress: "own@example.test", toAddresses: [], subject: "Own message" } })
    const foreignMessage = await prisma.emailMessage.create({ data: { companyId: f.foreign.id, threadId: thread.id, direction: "INBOUND", provider: "RESEND", fromAddress: "foreign@example.test", toAddresses: [], subject: "FOREIGN-INBOX-MESSAGE", bodyText: "FOREIGN-INBOX-BODY" } })
    await prisma.emailEvent.create({ data: { companyId: f.foreign.id, messageId: message.id, provider: "RESEND", providerEventId: "foreign", type: "FOREIGN-INBOX-EVENT", occurredAt: new Date() } })
    const page = await getCommunicationInboxPage({})
    expect(page.total).toBe(1)
    expect(page.threads[0].messages.map(row => row.id)).toEqual([message.id])
    expect(page.threads[0].messages[0].events).toEqual([])
    expect((await getCommunicationInboxPage({ search: "FOREIGN-INBOX-BODY" })).total).toBe(0)
    await expect(getPreviousCommunicationMessages({ threadId: thread.id, beforeMessageId: foreignMessage.id })).rejects.toThrow("Message de pagination introuvable")
  })
})
