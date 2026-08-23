"use server"

import prisma from "@/lib/prisma"
import { withAuth } from "@/lib/auth-wrapper"
import { revalidatePath } from "next/cache"

export async function getNotifications() {
  return await withAuth(async ({ userId }) => {
    return await prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50,
    })
  })
}

export async function getUnreadCount() {
  return await withAuth(async ({ userId }) => {
    return await prisma.notification.count({
      where: { userId, isRead: false },
    })
  })
}

export async function markAsRead(id: string) {
  return await withAuth(async ({ userId }) => {
    const notif = await prisma.notification.update({
      where: { id, userId },
      data: { isRead: true },
    })
    revalidatePath("/dashboard")
    revalidatePath("/dashboard/notifications")
    return notif
  })
}

export async function markAllAsRead() {
  return await withAuth(async ({ userId }) => {
    await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    })
    revalidatePath("/dashboard")
    revalidatePath("/dashboard/notifications")
    return { ok: true }
  })
}

export async function deleteNotification(id: string) {
  return await withAuth(async ({ userId }) => {
    await prisma.notification.delete({ where: { id, userId } })
    revalidatePath("/dashboard/notifications")
    return { ok: true }
  })
}

export async function deleteAllNotifications() {
  return await withAuth(async ({ userId }) => {
    await prisma.notification.deleteMany({ where: { userId } })
    revalidatePath("/dashboard/notifications")
    return { ok: true }
  })
}
