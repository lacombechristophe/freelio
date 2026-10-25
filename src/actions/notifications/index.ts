"use server"

import prisma from "@/lib/prisma"
import { withAuth } from "@/lib/auth-wrapper"
import { revalidatePath } from "next/cache"
import { notificationAge } from "@/lib/notification-age"
import { parseNotificationQuery } from "@/lib/notification-query"
import { DIRECTORY_PAGE_SIZE } from "@/lib/directory-query"
import { Prisma } from "@/generated/prisma/client"

export async function getNotificationDirectory(input: unknown = {}) {
  return withAuth(async ({ userId, companyId }) => {
    const query = parseNotificationQuery(input)
    const scope = { userId, companyId }
    const contains = { contains: query.search, ...(process.env.DATABASE_URL?.startsWith("postgres") ? { mode: "insensitive" as const } : {}) }
    const where: Prisma.NotificationWhereInput = {
      ...scope,
      ...(query.status === "ALL" ? {} : { isRead: query.status === "READ" }),
      ...(query.search ? { OR: [{ title: contains }, { message: contains }] } : {}),
    }
    return prisma.$transaction(async tx => {
      const [total, totalAll, unreadCount] = await Promise.all([
        tx.notification.count({ where }), tx.notification.count({ where: scope }), tx.notification.count({ where: { ...scope, isRead: false } }),
      ])
      const page = Math.min(query.page, Math.max(1, Math.ceil(total / DIRECTORY_PAGE_SIZE)))
      const rows = await tx.notification.findMany({
        where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * DIRECTORY_PAGE_SIZE, take: DIRECTORY_PAGE_SIZE,
        select: { id: true, type: true, title: true, message: true, isRead: true, createdAt: true },
      })
      const referenceTime = Date.now()
      return {
        notifications: rows.map(row => ({ ...row, ageLabel: notificationAge(row.createdAt, referenceTime) })),
        total, totalAll, unreadCount, query: { ...query, page },
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  })
}

export async function getNotifications() {
  return await withAuth(async ({ userId, companyId }) => {
    const notifications = await prisma.notification.findMany({
      where: { userId, companyId },
      orderBy: { createdAt: "desc" },
      take: 50,
    })
    const referenceTime = Date.now()
    return notifications.map(notification => ({ ...notification, ageLabel: notificationAge(notification.createdAt, referenceTime), compactAgeLabel: notificationAge(notification.createdAt, referenceTime, true) }))
  })
}

export async function getUnreadCount() {
  return await withAuth(async ({ userId, companyId }) => {
    return await prisma.notification.count({
      where: { userId, companyId, isRead: false },
    })
  })
}

export async function markAsRead(id: string) {
  return await withAuth(async ({ userId, companyId }) => {
    const notif = await prisma.notification.update({
      where: { id, userId, companyId },
      data: { isRead: true },
    })
    revalidatePath("/dashboard")
    revalidatePath("/dashboard/notifications")
    return notif
  })
}

export async function markAllAsRead() {
  return await withAuth(async ({ userId, companyId }) => {
    await prisma.notification.updateMany({
      where: { userId, companyId, isRead: false },
      data: { isRead: true },
    })
    revalidatePath("/dashboard")
    revalidatePath("/dashboard/notifications")
    return { ok: true }
  })
}

export async function deleteNotification(id: string) {
  return await withAuth(async ({ userId, companyId }) => {
    await prisma.notification.delete({ where: { id, userId, companyId } })
    revalidatePath("/dashboard/notifications")
    return { ok: true }
  })
}

export async function deleteAllNotifications() {
  return await withAuth(async ({ userId, companyId }) => {
    await prisma.notification.deleteMany({ where: { userId, companyId } })
    revalidatePath("/dashboard/notifications")
    return { ok: true }
  })
}
