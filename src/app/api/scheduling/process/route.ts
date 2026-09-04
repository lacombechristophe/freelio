import { processScheduledBusinessJobs } from "@/lib/scheduling/business"
import { cronRequestIsAuthorized } from "@/lib/cron-auth"
import { withProcessorLease } from "@/lib/processing/lease"

export const runtime = "nodejs"

async function process(request: Request) {
  if (!cronRequestIsAuthorized(request, "SCHEDULER_CRON_SECRET", "AUTOMATION_CRON_SECRET")) return Response.json({ error: "Accès refusé" }, { status: 401, headers: { "cache-control": "no-store" } })
  try {
    const result = await withProcessorLease("business-scheduling", processScheduledBusinessJobs)
    return Response.json(result.acquired ? { success: true, ...result.value } : { success: true, skipped: "PROCESSOR_BUSY" }, { headers: { "cache-control": "no-store" } })
  } catch (error) {
    console.error("Business scheduling endpoint failed", error)
    return Response.json({ error: "Ordonnancement indisponible" }, { status: 503, headers: { "cache-control": "no-store" } })
  }
}

export const GET = process
export const POST = process
