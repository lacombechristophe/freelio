import { z } from "zod"

import prisma from "@/lib/prisma"
import { notifyPortalTeam } from "@/lib/portal/notifications"
import { getCurrentPortalAccess, isSameOriginPortalRequest } from "@/lib/portal/session"
import { portalRateLimit } from "@/lib/rate-limit"
import { runAutomationEvent } from "@/lib/automations/engine"

const appointmentSchema = z.object({
  subject: z.string().trim().min(3, "Précisez l’objet du rendez-vous").max(160),
  preferredStart: z.coerce.date(),
  alternativeStart: z.union([z.coerce.date(), z.literal(""), z.null()]).optional(),
  durationMinutes: z.coerce.number().int().min(15).max(480),
  notes: z.string().trim().max(2_000).optional().default(""),
}).superRefine((data, context) => {
  const soonest = Date.now() + 60 * 60 * 1_000
  const latest = Date.now() + 18 * 30 * 24 * 60 * 60 * 1_000
  if (data.preferredStart.getTime() < soonest || data.preferredStart.getTime() > latest) {
    context.addIssue({ code: "custom", path: ["preferredStart"], message: "Choisissez un créneau au moins une heure à l’avance et dans les 18 prochains mois" })
  }
})

export async function POST(request: Request) {
  if (!isSameOriginPortalRequest(request)) return Response.json({ error: "Origine invalide" }, { status: 403 })
  const access = await getCurrentPortalAccess()
  if (!access) return Response.json({ error: "Accès expiré ou révoqué" }, { status: 401 })
  const rateLimit = await portalRateLimit.limit(`appointment:${access.id}`)
  if (!rateLimit.success) return Response.json({ error: "Trop de demandes. Réessayez plus tard." }, { status: 429 })

  try {
    const data = appointmentSchema.parse(await request.json())
    const requestRecord = await prisma.clientPortalAppointmentRequest.create({
      data: {
        companyId: access.companyId,
        clientId: access.clientId,
        subject: data.subject,
        preferredStart: data.preferredStart,
        alternativeStart: data.alternativeStart instanceof Date ? data.alternativeStart : null,
        durationMinutes: data.durationMinutes,
        notes: data.notes || null,
      },
      select: { id: true, createdAt: true },
    })
    await notifyPortalTeam(access.companyId, "Nouvelle demande de rendez-vous", `${access.client.name} propose un créneau depuis son espace client.`)
    await runAutomationEvent({ companyId: access.companyId, event: "PORTAL_APPOINTMENT_REQUESTED", subjectModel: "ClientPortalAppointmentRequest", subjectId: requestRecord.id, eventKey: `${requestRecord.id}:created`, clientId: access.clientId }).catch((error) => console.error("Portal appointment automation failed", error))
    return Response.json(requestRecord, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: error.issues[0]?.message || "Demande invalide" }, { status: 400 })
    return Response.json({ error: "Demande temporairement indisponible" }, { status: 500 })
  }
}
