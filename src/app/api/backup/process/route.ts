import { processDueCompanyBackups } from "@/lib/backup-scheduler"
import { cronRequestIsAuthorized } from "@/lib/cron-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

async function process(request: Request) {
  if (!cronRequestIsAuthorized(request, "BACKUP_CRON_SECRET", "AUTOMATION_CRON_SECRET")) {
    return Response.json({ error: "Accès refusé" }, { status: 401, headers: { "cache-control": "no-store" } })
  }
  try {
    return Response.json({ success: true, summary: await processDueCompanyBackups(3) }, { headers: { "cache-control": "no-store" } })
  } catch (error) {
    console.error("Backup processor failed", error)
    return Response.json({ error: "Sauvegarde indisponible" }, { status: 503, headers: { "cache-control": "no-store" } })
  }
}

export const GET = process
export const POST = process
