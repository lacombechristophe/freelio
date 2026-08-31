import { processDueSequenceEmails } from "@/lib/automations/sequences"
import { cronRequestIsAuthorized } from "@/lib/cron-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

async function process(request: Request) {
  if (!cronRequestIsAuthorized(request, "AUTOMATION_CRON_SECRET")) return Response.json({ error: "Accès refusé" }, { status: 401, headers: { "cache-control": "no-store" } })
  try {
    const summary = await processDueSequenceEmails(100)
    return Response.json({ success: true, summary }, { headers: { "cache-control": "no-store" } })
  } catch (error) {
    console.error("Automation processor failed", error)
    return Response.json({ error: "Traitement indisponible" }, { status: 503, headers: { "cache-control": "no-store" } })
  }
}

export const GET = process
export const POST = process
