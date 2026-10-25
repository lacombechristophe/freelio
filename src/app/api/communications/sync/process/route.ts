import { syncDueOAuthCommunicationChannels } from "@/lib/communications/communication-sync"
import { cronRequestIsAuthorized } from "@/lib/cron-auth"
import { withProcessorLease } from "@/lib/processing/lease"

export const runtime = "nodejs"
export const maxDuration = 300

async function processSync(request: Request) {
  if (!cronRequestIsAuthorized(request, "COMMUNICATIONS_CRON_SECRET", "AUTOMATION_CRON_SECRET")) {
    return Response.json({ error: "Accès refusé" }, { status: 401, headers: { "cache-control": "no-store" } })
  }
  const result = await withProcessorLease("communication-sync", control => syncDueOAuthCommunicationChannels(10, control))
  return Response.json(result.acquired ? result.value : { examined: 0, synced: 0, messagesImported: 0, calendarEventsImported: 0, calendarReconnectRequired: 0, failed: 0, skipped: "PROCESSOR_BUSY" }, { status: result.acquired && result.value.failed > 0 ? 503 : 200, headers: { "cache-control": "no-store" } })
}

export async function GET(request: Request) {
  return processSync(request)
}

export async function POST(request: Request) {
  return processSync(request)
}
