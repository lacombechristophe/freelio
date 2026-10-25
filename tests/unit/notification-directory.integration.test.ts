import { createDatabaseClient } from "@/lib/database-client"
import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/app/dashboard/notifications/notifications-view", () => ({ NotificationsView: () => null }))
import NotificationsPage from "@/app/dashboard/notifications/page"
import { deleteAllNotifications, deleteNotification, getNotificationDirectory, getNotifications, getUnreadCount, markAllAsRead, markAsRead } from "@/actions/notifications"

const db = createDatabaseClient()
describe.sequential("Complete personal notification history", () => {
  let companyA: string, companyB: string, actorId: string, peerId: string, oldestId: string
  beforeEach(async () => {
    companyA = (await db.company.create({ data: { name: "Fictional notification directory A" } })).id
    companyB = (await db.company.create({ data: { name: "Fictional notification directory B" } })).id
    actorId = (await db.user.create({ data: { companyId: companyA, email: `${randomUUID()}@example.test` } })).id
    peerId = (await db.user.create({ data: { companyId: companyA, email: `${randomUUID()}@example.test` } })).id
    Object.assign(session, { companyId: companyA, userId: actorId })
    await db.membership.createMany({ data: [
      { companyId: companyA, userId: actorId, role: "VIEWER", status: "ACTIVE" },
      { companyId: companyB, userId: actorId, role: "OWNER", status: "ACTIVE" },
      { companyId: companyA, userId: peerId, role: "OWNER", status: "ACTIVE" },
    ] })
    await db.notification.createMany({ data: Array.from({ length: 51 }, (_, index) => ({
      companyId: companyA, userId: actorId, type: "SYSTEM", title: index === 0 ? "Fictional older signature" : `Fictional notice ${index}`,
      message: index === 0 ? "A historic needle in the message" : "Fictional current activity", isRead: index !== 0,
      createdAt: new Date(Date.UTC(2030, 0, 1, 0, 0, index)),
    })) })
    oldestId = (await db.notification.findFirstOrThrow({ where: { companyId: companyA, userId: actorId, isRead: false } })).id
    for (const [companyId, userId] of [[companyB, actorId], [companyA, peerId], [null, actorId]]) {
      await db.notification.create({ data: { companyId, userId: userId!, type: "SYSTEM", title: "Fictional inaccessible needle", message: "Forbidden directory result", isRead: false } })
    }
  })
  afterEach(async () => {
    vi.unstubAllEnvs()
    await db.notification.deleteMany({ where: { userId: { in: [actorId, peerId] } } })
    await db.membership.deleteMany({ where: { userId: { in: [actorId, peerId] } } })
    await db.user.deleteMany({ where: { id: { in: [actorId, peerId] } } })
    await db.company.deleteMany({ where: { id: { in: [companyA, companyB] } } })
  })
  afterAll(async () => { await db.$disconnect() })
  const page = async (query: Record<string, string | string[]> = {}) => (await NotificationsPage({ searchParams: Promise.resolve(query) })).props

  it("finds the oldest notification on page three instead of losing everything after fifty", async () => {
    const result = await page({ page: "3" })
    expect(result.notifications.map((row: { id: string }) => row.id)).toEqual([oldestId])
  })
  it("keeps the bell as a bounded preview with the full unread count", async () => {
    expect(await getNotifications()).toHaveLength(50)
    expect(await getUnreadCount()).toBe(1)
  })
  it("counts the full scope separately from the first page and returns a minimal display record", async () => {
    const result = await getNotificationDirectory()
    expect(result).toMatchObject({ total: 51, totalAll: 51, unreadCount: 1, query: { search: "", status: "ALL", page: 1 } })
    expect(result.notifications).toHaveLength(25)
    expect(result.notifications.every(row => row.isRead)).toBe(true)
    expect(Object.keys(result.notifications[0]!).sort()).toEqual(["ageLabel", "createdAt", "id", "isRead", "message", "title", "type"])
  })
  it.each(["OWNER", "TECHNICIAN", "ACCOUNTING", "VIEWER"])("keeps the same personal boundary for %s", async role => {
    await db.membership.updateMany({ where: { companyId: companyA, userId: actorId }, data: { role } })
    const result = await getNotificationDirectory({ search: "needle", companyId: companyB, userId: peerId })
    expect(result).toMatchObject({ total: 1, totalAll: 51, unreadCount: 1 })
    expect(result.notifications.map(row => row.id)).toEqual([oldestId])
  })
  it.each(["OLDER SIGNATURE", "historic needle"])("searches all titles and messages for %s", async search => {
    const result = await getNotificationDirectory({ search, page: 999 })
    expect(result.notifications.map(row => row.id)).toEqual([oldestId])
    expect(result).toMatchObject({ total: 1, totalAll: 51, unreadCount: 1, query: { search, page: 1 } })
  })
  it("filters by read state without truncating the unread indicator", async () => {
    const unread = await getNotificationDirectory({ status: "UNREAD" })
    expect(unread.notifications.map(row => row.id)).toEqual([oldestId])
    const read = await getNotificationDirectory({ status: "READ", page: 2 })
    expect(read).toMatchObject({ total: 50, totalAll: 51, unreadCount: 1, query: { status: "READ", page: 2 } })
    expect(read.notifications).toHaveLength(25)
    const empty = await getNotificationDirectory({ search: "notice", status: "UNREAD" })
    expect(empty).toMatchObject({ notifications: [], total: 0, totalAll: 51, unreadCount: 1 })
  })
  it("clamps the last page after its last notification has been removed", async () => {
    expect((await getNotificationDirectory({ page: 999 })).query.page).toBe(3)
    expect((await getNotificationDirectory({ page: Number.MAX_SAFE_INTEGER })).query.page).toBe(3)
    await deleteNotification(oldestId)
    const result = await page({ page: "3" })
    expect(result).toMatchObject({ total: 50, totalAll: 50, unreadCount: 0, query: { page: 2 } })
    expect(result.notifications).toHaveLength(25)
  })
  it("keeps applied filters and returns page one when marking the last matching item read", async () => {
    await markAsRead(oldestId)
    expect(await getNotificationDirectory({ search: "older", status: "UNREAD", page: 3 })).toMatchObject({
      total: 0, totalAll: 51, unreadCount: 0, notifications: [], query: { search: "older", status: "UNREAD", page: 1 },
    })
  })
  it("returns every row exactly once when all creation timestamps tie", async () => {
    await db.notification.updateMany({ where: { companyId: companyA, userId: actorId }, data: { createdAt: new Date("2030-01-01") } })
    const expected = await db.notification.findMany({ where: { companyId: companyA, userId: actorId }, orderBy: { id: "desc" }, select: { id: true } })
    const rows: { id: string }[] = []
    for (const selectedPage of [1, 2, 3]) rows.push(...(await getNotificationDirectory({ page: selectedPage })).notifications)
    expect(rows.map(row => row.id)).toEqual(expected.map(row => row.id))
    expect(new Set(rows.map(row => row.id)).size).toBe(51)
  })
  it("normalizes malformed URL and action fields without accepting caller ownership", async () => {
    const result = await getNotificationDirectory({ search: ["needle"], page: Number.POSITIVE_INFINITY, status: "FOREIGN", companyId: companyB, userId: peerId })
    expect(result).toMatchObject({ total: 51, unreadCount: 1, query: { search: "", status: "ALL", page: 1 } })
    expect((await page({ search: ["needle", "other"], status: ["UNREAD"], page: "-2" })).query).toEqual({ search: "", status: "ALL", page: 1 })
    expect((await getNotificationDirectory({ search: `  ${"a".repeat(201)}  `, page: "2.5" })).query).toEqual({ search: "a".repeat(200), status: "ALL", page: 1 })
  })
  it("does not expose a workspace after the membership is revoked", async () => {
    await db.membership.updateMany({ where: { companyId: companyA, userId: actorId }, data: { status: "INACTIVE" } })
    await expect(getNotificationDirectory()).rejects.toThrow("plus accès")
  })
  it("does not expose notification data without authentication or an active workspace", async () => {
    session.userId = ""
    await expect(getNotificationDirectory()).rejects.toThrow("Authentification requise")
    session.userId = actorId; session.companyId = ""
    await db.user.update({ where: { id: actorId }, data: { companyId: null } })
    expect((await page()).title).toBe("Configurez votre espace")
  })
  it("allows public-demo consultation but blocks all notification mutations", async () => {
    const before = await db.notification.findMany({ where: { userId: actorId }, orderBy: { id: "asc" } })
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    expect((await getNotificationDirectory({ search: "older" })).notifications.map(row => row.id)).toEqual([oldestId])
    for (const mutate of [() => markAsRead(oldestId), markAllAsRead, () => deleteNotification(oldestId), deleteAllNotifications]) {
      await expect(mutate()).rejects.toThrow("lecture seule")
    }
    expect(await db.notification.findMany({ where: { userId: actorId }, orderBy: { id: "asc" } })).toEqual(before)
  })
  it("does not count foreign or unattributed rows when the own workspace is empty", async () => {
    await deleteAllNotifications()
    expect(await getNotificationDirectory({ page: 3 })).toMatchObject({ notifications: [], total: 0, totalAll: 0, unreadCount: 0, query: { page: 1 } })
    expect(await db.notification.count({ where: { userId: actorId } })).toBe(2)
  })
})
