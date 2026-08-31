import { syncDueOAuthEmailChannels } from "@/lib/communications/email-sync"
import { cronRequestIsAuthorized } from "@/lib/cron-auth"

export const runtime = "nodejs"
export const maxDuration = 300

async function processSync(request: Request) {
  if (!cronRequestIsAuthorized(request, "COMMUNICATIONS_CRON_SECRET", "AUTOMATION_CRON_SECRET")) {
    return Response.json({ error: "Accès refusé" }, { status: 401, headers: { "cache-control": "no-store" } })
  }
  const result = await syncDueOAuthEmailChannels(10)
  return Response.json(result, { headers: { "cache-control": "no-store" } })
}

export async function GET(request: Request) {
  return processSync(request)
}

export async function POST(request: Request) {
  return processSync(request)
}
