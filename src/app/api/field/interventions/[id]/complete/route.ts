import { z } from "zod"

import { completeFieldInterventionForContext } from "@/lib/field/interventions"
import { PayloadTooLargeError, readJsonBody } from "@/lib/http-body"
import { withRouteAuth } from "@/lib/route-auth"

export const runtime = "nodejs"

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withRouteAuth("operations.write", async (context) => {
    try {
      const { id } = await params
      const body = await readJsonBody(request, 2 * 1024 * 1024)
      const input = body && typeof body === "object" && !Array.isArray(body) ? { ...body, interventionId: id } : { interventionId: id }
      const result = await completeFieldInterventionForContext(input, context)
      return Response.json(result)
    } catch (error) {
      if (error instanceof PayloadTooLargeError) return Response.json({ error: "Clôture terrain trop volumineuse" }, { status: 413 })
      if (error instanceof SyntaxError) return Response.json({ error: "Compte rendu invalide" }, { status: 400 })
      if (error instanceof z.ZodError) return Response.json({ error: error.issues[0]?.message || "Compte rendu invalide" }, { status: 400 })
      const message = error instanceof Error ? error.message : "Clôture impossible"
      const status = message.includes("introuvable") ? 404 : message.includes("déjà") || message.includes("annulée") ? 409 : 400
      return Response.json({ error: message }, { status })
    }
  })
}
