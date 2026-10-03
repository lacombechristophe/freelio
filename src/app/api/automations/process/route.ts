import { processAutomationBatch } from "@/lib/automations/process"
import { cronRequestIsAuthorized } from "@/lib/cron-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

async function process(request: Request) {
  if (!cronRequestIsAuthorized(request, "AUTOMATION_CRON_SECRET")) return Response.json({ error: "Accès refusé" }, { status: 401, headers: { "cache-control": "no-store" } })
  try {
    const results = await processAutomationBatch()
    const failures = results.filter((result) => result.status === "rejected")
    for (const result of failures) console.error("Automation processor failed", result.reason)
    return Response.json({
      success: failures.length === 0,
      scenarios: results[0].status === "fulfilled" ? results[0].value : { error: "Traitement indisponible" },
      summary: results[1].status === "fulfilled" ? results[1].value : { error: "Traitement indisponible" },
    }, { status: failures.length ? 503 : 200, headers: { "cache-control": "no-store" } })
  } catch (error) {
    console.error("Automation processor failed", error)
    return Response.json({ error: "Traitement indisponible" }, { status: 503, headers: { "cache-control": "no-store" } })
  }
}

export const GET = process
export const POST = process
