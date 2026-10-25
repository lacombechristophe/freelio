import "server-only"

import { CalendarReconnectRequiredError, syncOAuthCalendarChannel } from "@/lib/communications/calendar-sync"
import { syncOAuthEmailChannel } from "@/lib/communications/email-sync"
import { EMAIL_OAUTH_PROVIDERS } from "@/lib/integrations/email-oauth"
import prisma from "@/lib/prisma"
import { channelConfig, storeChannelSyncState } from "@/lib/communications/sync-state"
import { MailReconnectRequiredError } from "@/lib/communications/capabilities"
import type { ProcessorLeaseControl } from "@/lib/processing/lease"

export async function syncOAuthCommunicationChannel(companyId: string, channelId: string) {
  const connection = await prisma.communicationChannel.findFirstOrThrow({ where: { id: channelId, companyId }, select: { config: true } })
  const value = channelConfig(connection.config).mailSyncGeneration
  const generation = typeof value === "string" ? value : "legacy"
  type CapabilityResult = { examined: number; imported: number; complete: boolean; status: "SYNCED" | "CONTINUING" | "FAILED" | "RECONNECT_REQUIRED" | "DISABLED"; error: string | null }
  async function syncCapability(task: () => Promise<{ examined: number; imported: number; complete: boolean; disabled?: boolean }>, key: "emailSyncStatus" | "calendarSyncStatus"): Promise<CapabilityResult> {
    let result: CapabilityResult
    try {
      const value = await task()
      result = { ...value, status: value.disabled ? "DISABLED" : value.complete ? "SYNCED" : "CONTINUING", error: null }
    } catch (error) {
      result = { examined: 0, imported: 0, complete: false, status: error instanceof CalendarReconnectRequiredError || error instanceof MailReconnectRequiredError ? "RECONNECT_REQUIRED" : "FAILED", error: (error instanceof Error ? error.message : "Synchronisation impossible").slice(0, 500) }
    }
    await storeChannelSyncState(companyId, channelId, key, { status: result.status, error: result.error, checkedAt: new Date().toISOString() }, undefined, { mailGeneration: generation })
    return result
  }
  const email = await syncCapability(() => syncOAuthEmailChannel(companyId, channelId), "emailSyncStatus")
  const calendar = await syncCapability(() => syncOAuthCalendarChannel(companyId, channelId), "calendarSyncStatus")
  await storeChannelSyncState(companyId, channelId, "calendarSyncStatus", { status: calendar.status, error: calendar.error, checkedAt: new Date().toISOString() }, undefined,
    { mailGeneration: generation, lastError: [email.error, calendar.error].filter(Boolean).join(" ; ") || null })
  return { email, calendar }
}

export async function syncDueOAuthCommunicationChannels(limit = 10, control?: ProcessorLeaseControl) {
  const started = performance.now()
  await control?.assertOwned()
  const where = { provider: { in: [...EMAIL_OAUTH_PROVIDERS] }, status: "ACTIVE", OR: [{ mailEnabled: true }, { calendarEnabled: true }] }
  const channels = await prisma.communicationChannel.findMany({
    where,
    select: { id: true, companyId: true, provider: true, syncAttemptCursor: true },
    orderBy: [{ syncAttemptCursor: { sort: "asc", nulls: "first" } }, { id: "asc" }],
    take: Math.min(25, Math.max(1, Math.floor(limit))),
  })
  const latest = channels.length ? await prisma.communicationChannel.aggregate({ where, _max: { syncAttemptCursor: true } }) : null
  // A monotonic queue cursor preserves rotation even with equal/rolled-back clocks.
  let cursor = Math.max(Date.now(), (latest?._max.syncAttemptCursor?.getTime() ?? 0) + 1)
  const summary = { examined: 0, synced: 0, messagesImported: 0, calendarEventsImported: 0, calendarReconnectRequired: 0, failed: 0 }
  for (const channel of channels) {
    await control?.assertOwned()
    // Leave time for the current channel to finish within the 300s HTTP job.
    if (performance.now() - started >= 180_000) break
    const claimed = await prisma.communicationChannel.updateMany({
      where: { ...where, id: channel.id, companyId: channel.companyId, provider: channel.provider, syncAttemptCursor: channel.syncAttemptCursor },
      data: { syncAttemptCursor: new Date(cursor++) },
    })
    if (claimed.count !== 1) continue
    summary.examined += 1
    try {
      await control?.assertOwned()
      const result = await syncOAuthCommunicationChannel(channel.companyId, channel.id)
      await control?.assertOwned()
      if ([result.email.status, result.calendar.status].every((status) => status === "SYNCED" || status === "DISABLED")) summary.synced += 1
      summary.messagesImported += result.email.imported
      summary.calendarEventsImported += result.calendar.imported
      if (result.calendar.status === "RECONNECT_REQUIRED") summary.calendarReconnectRequired += 1
      if (result.email.status === "FAILED" || result.calendar.status === "FAILED") summary.failed += 1
    } catch {
      await control?.assertOwned()
      summary.failed += 1
    }
  }
  return summary
}
