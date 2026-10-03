import "server-only"

import { CalendarReconnectRequiredError, syncOAuthCalendarChannel } from "@/lib/communications/calendar-sync"
import { syncOAuthEmailChannel } from "@/lib/communications/email-sync"
import { EMAIL_OAUTH_PROVIDERS } from "@/lib/integrations/email-oauth"
import prisma from "@/lib/prisma"
import { storeChannelSyncState } from "@/lib/communications/sync-state"

export async function syncOAuthCommunicationChannel(companyId: string, channelId: string) {
  type CapabilityResult = { examined: number; imported: number; complete: boolean; status: "SYNCED" | "CONTINUING" | "FAILED" | "RECONNECT_REQUIRED"; error: string | null }
  async function syncCapability(task: () => Promise<{ examined: number; imported: number; complete: boolean }>, key: "emailSyncStatus" | "calendarSyncStatus"): Promise<CapabilityResult> {
    let result: CapabilityResult
    try {
      const value = await task()
      result = { ...value, status: value.complete ? "SYNCED" : "CONTINUING", error: null }
    } catch (error) {
      result = { examined: 0, imported: 0, complete: false, status: error instanceof CalendarReconnectRequiredError ? "RECONNECT_REQUIRED" : "FAILED", error: (error instanceof Error ? error.message : "Synchronisation impossible").slice(0, 500) }
    }
    await storeChannelSyncState(companyId, channelId, key, { status: result.status, error: result.error, checkedAt: new Date().toISOString() })
    return result
  }
  const email = await syncCapability(() => syncOAuthEmailChannel(companyId, channelId), "emailSyncStatus")
  const calendar = await syncCapability(() => syncOAuthCalendarChannel(companyId, channelId), "calendarSyncStatus")
  await prisma.communicationChannel.updateMany({ where: { id: channelId, companyId }, data: { lastError: [email.error, calendar.error].filter(Boolean).join(" ; ") || null } })
  return { email, calendar }
}

export async function syncDueOAuthCommunicationChannels(limit = 10) {
  const channels = await prisma.communicationChannel.findMany({
    where: { provider: { in: [...EMAIL_OAUTH_PROVIDERS] }, status: "ACTIVE" },
    select: { id: true, companyId: true },
    orderBy: { lastSyncAt: "asc" },
    take: Math.min(25, Math.max(1, limit)),
  })
  const summary = { examined: channels.length, synced: 0, messagesImported: 0, calendarEventsImported: 0, calendarReconnectRequired: 0, failed: 0 }
  for (const channel of channels) {
    try {
      const result = await syncOAuthCommunicationChannel(channel.companyId, channel.id)
      if (result.email.status === "SYNCED" && result.calendar.status === "SYNCED") summary.synced += 1
      summary.messagesImported += result.email.imported
      summary.calendarEventsImported += result.calendar.imported
      if (result.calendar.status === "RECONNECT_REQUIRED") summary.calendarReconnectRequired += 1
      if (result.email.status === "FAILED" || result.calendar.status === "FAILED") summary.failed += 1
    } catch {
      summary.failed += 1
    }
  }
  return summary
}
