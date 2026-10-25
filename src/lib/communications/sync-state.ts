import { Prisma } from "@/generated/prisma/client"
import prisma from "@/lib/prisma"

export function channelConfig(value: Prisma.JsonValue | null) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {}
}

// Merge only this capability's checkpoint, so a calendar checkpoint cannot
// overwrite a simultaneous mail/configuration update.
export async function storeChannelSyncState(companyId: string, channelId: string, key: "emailSync" | "calendarSync" | "emailSyncStatus" | "calendarSyncStatus", state: Prisma.InputJsonValue | null, completedAt?: Date, options: { mailGeneration?: string; lastError?: string | null } = {}) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const current = await prisma.communicationChannel.findFirstOrThrow({ where: { id: channelId, companyId, status: "ACTIVE" }, select: { config: true, updatedAt: true } })
    if (options.mailGeneration !== undefined && (channelConfig(current.config).mailSyncGeneration ?? "legacy") !== options.mailGeneration) throw new Error("La connexion a changé ; ancien checkpoint de messagerie refusé")
    const updated = await prisma.communicationChannel.updateMany({
      where: { id: channelId, companyId, status: "ACTIVE", updatedAt: current.updatedAt, config: { equals: current.config ?? Prisma.DbNull } },
      data: { config: { ...channelConfig(current.config), [key]: state }, ...(completedAt && key === "emailSync" ? { lastSyncAt: completedAt } : {}), ...(options.lastError !== undefined ? { lastError: options.lastError } : {}) },
    })
    if (updated.count === 1) return
  }
  throw new Error("La connexion a changé pendant la synchronisation ; reprise nécessaire")
}
