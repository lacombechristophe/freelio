import { Prisma } from "@prisma/client"
import prisma from "@/lib/prisma"

export function channelConfig(value: Prisma.JsonValue | null) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {}
}

// Merge only this capability's checkpoint, so a calendar checkpoint cannot
// overwrite a simultaneous mail/configuration update.
export async function storeChannelSyncState(companyId: string, channelId: string, key: "emailSync" | "calendarSync" | "emailSyncStatus" | "calendarSyncStatus", state: Prisma.InputJsonValue | null, completedAt?: Date) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const current = await prisma.communicationChannel.findFirstOrThrow({ where: { id: channelId, companyId, status: "ACTIVE" }, select: { config: true, updatedAt: true } })
    const updated = await prisma.communicationChannel.updateMany({
      where: { id: channelId, companyId, status: "ACTIVE", updatedAt: current.updatedAt, config: { equals: current.config ?? Prisma.DbNull } },
      data: { config: { ...channelConfig(current.config), [key]: state }, ...(completedAt && key === "emailSync" ? { lastSyncAt: completedAt } : {}) },
    })
    if (updated.count === 1) return
  }
  throw new Error("La connexion a changé pendant la synchronisation ; reprise nécessaire")
}
