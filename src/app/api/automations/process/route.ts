import { createHash, timingSafeEqual } from "node:crypto"

import { processDueSequenceEmails } from "@/lib/automations/sequences"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function validSecret(request: Request) {
  const expected = process.env.AUTOMATION_CRON_SECRET?.trim()
  if (!expected) return false
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || ""
  const left = createHash("sha256").update(expected).digest()
  const right = createHash("sha256").update(provided).digest()
  return timingSafeEqual(left, right)
}

export async function POST(request: Request) {
  if (!validSecret(request)) return Response.json({ error: "Accès refusé" }, { status: 401, headers: { "cache-control": "no-store" } })
  try {
    const summary = await processDueSequenceEmails(100)
    return Response.json({ success: true, summary }, { headers: { "cache-control": "no-store" } })
  } catch (error) {
    console.error("Automation processor failed", error)
    return Response.json({ error: "Traitement indisponible" }, { status: 503, headers: { "cache-control": "no-store" } })
  }
}
