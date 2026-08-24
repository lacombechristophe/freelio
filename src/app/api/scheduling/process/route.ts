import { createHash, timingSafeEqual } from "node:crypto"

import { processScheduledBusinessJobs } from "@/lib/scheduling/business"

export const runtime = "nodejs"

function validSecret(request: Request) {
  const expected = (process.env.SCHEDULER_CRON_SECRET || process.env.AUTOMATION_CRON_SECRET)?.trim()
  if (!expected) return false
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || ""
  return timingSafeEqual(createHash("sha256").update(expected).digest(), createHash("sha256").update(provided).digest())
}

export async function POST(request: Request) {
  if (!validSecret(request)) return Response.json({ error: "Accès refusé" }, { status: 401, headers: { "cache-control": "no-store" } })
  try {
    return Response.json({ success: true, ...(await processScheduledBusinessJobs()) }, { headers: { "cache-control": "no-store" } })
  } catch (error) {
    console.error("Business scheduling endpoint failed", error)
    return Response.json({ error: "Ordonnancement indisponible" }, { status: 503, headers: { "cache-control": "no-store" } })
  }
}
