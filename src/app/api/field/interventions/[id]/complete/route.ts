import { z } from "zod"

import { completeFieldInterventionForContext } from "@/lib/field/interventions"
import { getRouteAuth } from "@/lib/route-auth"

export const runtime = "nodejs"

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await getRouteAuth("operations.write")
  if (!access.ok) return access.response
  const contentLength = Number(request.headers.get("content-length") || "0")
  if (contentLength > 32 * 1024) return Response.json({ error: "Compte rendu trop volumineux" }, { status: 413 })

  try {
    const { id } = await params
    const body = await request.json()
    const result = await completeFieldInterventionForContext({ ...body, interventionId: id }, access.context)
    return Response.json(result)
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: error.issues[0]?.message || "Compte rendu invalide" }, { status: 400 })
    const message = error instanceof Error ? error.message : "Clôture impossible"
    const status = message.includes("introuvable") ? 404 : message.includes("déjà") || message.includes("annulée") ? 409 : 400
    return Response.json({ error: message }, { status })
  }
}
