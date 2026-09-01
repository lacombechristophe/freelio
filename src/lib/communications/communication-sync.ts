import "server-only"

import { CalendarReconnectRequiredError, syncOAuthCalendarChannel } from "@/lib/communications/calendar-sync"
import { syncOAuthEmailChannel } from "@/lib/communications/email-sync"
import { EMAIL_OAUTH_PROVIDERS } from "@/lib/integrations/email-oauth"
import prisma from "@/lib/prisma"

export async function syncOAuthCommunicationChannel(companyId: string, channelId: string) {
  const email = await syncOAuthEmailChannel(companyId, channelId)
  try {
    const calendar = await syncOAuthCalendarChannel(companyId, channelId)
    return { email, calendar: { ...calendar, status: "SYNCED" as const, error: null } }
  } catch (error) {
    const message = (error instanceof Error ? error.message : "Synchronisation du calendrier impossible").slice(0, 500)
    await prisma.communicationChannel.updateMany({ where: { id: channelId, companyId }, data: { lastError: message } })
    return {
      email,
      calendar: {
        examined: 0,
        imported: 0,
        status: error instanceof CalendarReconnectRequiredError ? "RECONNECT_REQUIRED" as const : "FAILED" as const,
        error: message,
      },
    }
  }
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
      summary.synced += 1
      summary.messagesImported += result.email.imported
      summary.calendarEventsImported += result.calendar.imported
      if (result.calendar.status === "RECONNECT_REQUIRED") summary.calendarReconnectRequired += 1
      if (result.calendar.status === "FAILED") summary.failed += 1
    } catch {
      summary.failed += 1
    }
  }
  return summary
}
