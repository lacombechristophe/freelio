"use server"

import prisma from "@/lib/prisma"
import { withAuth } from "@/lib/auth-wrapper"
import { revalidatePath } from "next/cache"
import { notificationAge } from "@/lib/notification-age"

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
