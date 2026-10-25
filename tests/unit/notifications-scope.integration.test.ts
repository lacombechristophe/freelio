import { createDatabaseClient } from "@/lib/database-client"
import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
import { deleteAllNotifications, deleteNotification, getNotifications, getUnreadCount, markAllAsRead, markAsRead } from "@/actions/notifications"
import { notifyPortalTeam } from "@/lib/portal/notifications"
import { exportUserData } from "@/actions/compliance"
import { LEGACY_BACKUP_SCHEMA, restoreBackupPayload } from "@/lib/backup"
import prisma from "@/lib/prisma"
import { requestContext } from "@/lib/context"
import { capturePublicLead } from "@/lib/leads/capture"
import { dispatchAutomationEvent, enqueueAutomationEvent } from "@/lib/automations/engine"

const db = createDatabaseClient()
describe.sequential("Personal notifications stay within the active workspace", () => {
  let companyA: string, companyB: string, peerId: string, ownId: string, otherId: string, legacyId: string
  const extraUsers: string[] = []
  beforeEach(async () => {
    companyA = (await db.company.create({ data: { name: "Fictional notification A" } })).id
    companyB = (await db.company.create({ data: { name: "Fictional notification B" } })).id
    session.companyId = companyA
    session.userId = (await db.user.create({ data: { companyId: companyA, email: `${randomUUID()}@example.test` } })).id
    peerId = (await db.user.create({ data: { companyId: companyA, email: `${randomUUID()}@example.test` } })).id
    await db.membership.createMany({ data: [
      { companyId: companyA, userId: session.userId, role: "OWNER", status: "ACTIVE" },
      { companyId: companyB, userId: session.userId, role: "OWNER", status: "ACTIVE" },
      { companyId: companyA, userId: peerId, role: "OWNER", status: "ACTIVE" },
    ] })
    await notifyPortalTeam(companyA, "Private workspace A", "Fictional client A")
    await notifyPortalTeam(companyB, "Private workspace B", "Fictional client B")
    ownId = (await db.notification.findFirstOrThrow({ where: { userId: session.userId, title: "Private workspace A" } })).id
    otherId = (await db.notification.findFirstOrThrow({ where: { userId: session.userId, title: "Private workspace B" } })).id
    legacyId = (await db.notification.create({ data: { userId: session.userId, type: "SYSTEM", title: "Unattributed historical message", message: "No trustworthy workspace metadata" } })).id
  })
  afterEach(async () => {
    vi.unstubAllEnvs()
    const users = [session.userId, peerId, ...extraUsers.splice(0)]
    await db.auditLog.deleteMany({ where: { userId: { in: users } } })
    await db.notification.deleteMany({ where: { userId: { in: users } } })
    await db.opportunity.deleteMany({ where: { pipeline: { companyId: { in: [companyA, companyB] } } } })
    await db.pipeline.deleteMany({ where: { companyId: { in: [companyA, companyB] } } })
    await db.client.deleteMany({ where: { companyId: { in: [companyA, companyB] } } })
    await db.membership.deleteMany({ where: { companyId: { in: [companyA, companyB] } } })
    await db.user.deleteMany({ where: { id: { in: users } } })
    await db.company.deleteMany({ where: { id: { in: [companyA, companyB] } } })
  })
  afterAll(async () => { await db.$disconnect() })

  it("reads only the current user's attributed workspace messages", async () => {
    expect((await getNotifications()).map(row => row.id)).toEqual([ownId])
    expect(await getUnreadCount()).toBe(1)
    expect(await db.notification.findUniqueOrThrow({ where: { id: legacyId } })).toMatchObject({ isRead: false })
  })
  it("does not keep exposing a departed workspace through the bell", async () => {
    await db.membership.updateMany({ where: { companyId: companyB, userId: session.userId }, data: { status: "SUSPENDED" } })
    expect((await getNotifications()).map(row => row.id)).toEqual([ownId])
    expect(await getUnreadCount()).toBe(1)
    session.companyId = companyB
    await expect(getNotifications()).rejects.toThrow("plus accès")
  })
  it("composes the company and recipient guards even without an action filter", async () => {
    const membership = await db.membership.findUniqueOrThrow({ where: { companyId_userId: { companyId: companyA, userId: session.userId } } })
    await requestContext.run({ ...session, membershipId: membership.id, role: "OWNER", agencyIds: null }, async () => {
      expect((await prisma.notification.findMany()).map(row => row.id)).toEqual([ownId])
      expect(await prisma.notification.updateMany({ data: { isRead: true } })).toMatchObject({ count: 1 })
    })
    expect((await db.notification.findUniqueOrThrow({ where: { id: otherId } })).isRead).toBe(false)
    expect((await db.notification.findFirstOrThrow({ where: { userId: peerId } })).isRead).toBe(false)
  })
  it("filters nested account-export notifications to the active workspace", async () => {
    session.companyId = companyB
    const result = await exportUserData()
    expect(result.data?.notifications.map(row => row.id)).toEqual([otherId])
  })
  it("refuses to import old unattributed messages before touching existing history", async () => {
    await expect(restoreBackupPayload({ schema: LEGACY_BACKUP_SCHEMA, company: { id: companyA }, localFiles: [],
      notifications: [{ id: "fictional imported notification", userId: session.userId, title: "Unverifiable origin" }] }, session.userId, companyA)).rejects.toThrow("société vérifiable")
    expect(await db.notification.count({ where: { userId: session.userId } })).toBe(3)
    expect(await db.auditLog.count({ where: { userId: session.userId } })).toBe(0)
  })
  it("notifies every eligible lead recipient beyond the old twenty-member limit", async () => {
    for (let index = 0; index < 21; index++) {
      const user = await db.user.create({ data: { companyId: companyA, email: `${randomUUID()}@example.test` } })
      extraUsers.push(user.id)
      await db.membership.create({ data: { companyId: companyA, userId: user.id, role: "SALES", status: "ACTIVE" } })
    }
    vi.stubEnv("PUBLIC_LEAD_COMPANY_ID", companyA)
    vi.stubEnv("PUBLIC_PRIVACY_NOTICE_URL", "https://example.test/privacy")
    await capturePublicLead({ firstName: "Fictional", lastName: "Volume", email: `${randomUUID()}@example.test`, privacyAccepted: true })
    const rows = await db.notification.findMany({ where: { companyId: companyA, type: "LEAD_CREATED" } })
    expect(rows).toHaveLength(23)
    expect(rows.map(row => row.userId).sort()).toEqual([session.userId, peerId, ...extraUsers].sort())
  })
  it("attributes workflow notifications to their source company and intended recipients", async () => {
    const lead = await db.leadCapture.create({ data: { companyId: companyA, firstName: "Fictional", lastName: "Workflow", privacyAccepted: true, fingerprint: randomUUID() } })
    const actions = [{ type: "NOTIFY_TEAM", title: "Fictional notification workflow" }]
    await db.automationWorkflow.create({ data: { companyId: companyA, name: "Fictional tenant workflow", trigger: "LEAD_CREATED", status: "ACTIVE", publishedVersion: 1, conditions: {}, actions,
      versions: { create: { companyId: companyA, version: 1, status: "PUBLISHED", publishedAt: new Date(), trigger: "LEAD_CREATED", conditions: {}, actions } },
    } })
    const eventId = await prisma.$transaction(tx => enqueueAutomationEvent(tx, { companyId: companyA, event: "LEAD_CREATED", eventKey: `${lead.id}:created`, subjectModel: "LeadCapture", subjectId: lead.id, leadId: lead.id }))
    expect((await dispatchAutomationEvent(eventId)).completed).toBe(1)
    const rows = await db.notification.findMany({ where: { type: "AUTOMATION", title: "Fictional notification workflow" } })
    expect(rows).toHaveLength(2)
    expect(rows.every(row => row.companyId === companyA)).toBe(true)
    expect(rows.map(row => row.userId).sort()).toEqual([session.userId, peerId].sort())
  })
  it("refuses to mark another workspace's notification as read", async () => {
    await expect(markAsRead(otherId)).rejects.toMatchObject({ code: "P2025" })
    expect((await db.notification.findUniqueOrThrow({ where: { id: otherId } })).isRead).toBe(false)
  })
  it("marks all only within the current workspace", async () => {
    await markAllAsRead()
    expect((await db.notification.findUniqueOrThrow({ where: { id: ownId } })).isRead).toBe(true)
    expect((await db.notification.findUniqueOrThrow({ where: { id: otherId } })).isRead).toBe(false)
    expect((await db.notification.findUniqueOrThrow({ where: { id: legacyId } })).isRead).toBe(false)
  })
  it("refuses to delete another workspace's notification", async () => {
    await expect(deleteNotification(otherId)).rejects.toMatchObject({ code: "P2025" })
    expect(await db.notification.findUnique({ where: { id: otherId } })).not.toBeNull()
  })
  it("clears only the current workspace and preserves unattributed history", async () => {
    await deleteAllNotifications()
    expect(await db.notification.findUnique({ where: { id: ownId } })).toBeNull()
    expect(await db.notification.findUnique({ where: { id: otherId } })).not.toBeNull()
    expect(await db.notification.findUnique({ where: { id: legacyId } })).not.toBeNull()
  })
  it.each(["OWNER", "VIEWER"])("lets %s manage their own messages without a domain write grant", async role => {
    await db.membership.updateMany({ where: { companyId: companyA, userId: session.userId }, data: { role } })
    expect(await markAsRead(ownId)).toMatchObject({ id: ownId, isRead: true })
    await deleteNotification(ownId)
    expect(await db.notification.findUnique({ where: { id: ownId } })).toBeNull()
    const peerMessage = await db.notification.findFirstOrThrow({ where: { userId: peerId } })
    await expect(deleteNotification(peerMessage.id)).rejects.toMatchObject({ code: "P2025" })
  })
})
