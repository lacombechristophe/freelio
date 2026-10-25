import { z } from "zod"

import prisma from "@/lib/prisma"
import { notifyPortalTeam } from "@/lib/portal/notifications"
import { getCurrentPortalAccess, isSameOriginPortalRequest } from "@/lib/portal/session"
import { portalRateLimit } from "@/lib/rate-limit"
import { dispatchAutomationEvent, enqueueAutomationEvent } from "@/lib/automations/engine"
import { PayloadTooLargeError, readJsonBody } from "@/lib/http-body"
import { readPortalAppointments } from "@/lib/scheduling/appointment-reader"
import { resolveBookingLocalTime } from "@/lib/scheduling/booking-time"

const appointmentSchema = z
  .object({
    subject: z.string().trim().min(3, "Précisez l’objet du rendez-vous").max(160),
    preferredStart: z.string().max(40),
    alternativeStart: z.string().max(40).nullable().optional(),
    timeZone: z.string().max(100).optional(),
    durationMinutes: z.coerce.number().int().min(15).max(480),
    notes: z.string().trim().max(2_000).optional().default(""),
  })

export async function GET(request: Request) {
  const access = await getCurrentPortalAccess()
  if (!access) return Response.json({ error: "Accès expiré ou révoqué" }, { status: 401 })
  const page = z.coerce.number().int().min(1).max(100_000).safeParse(new URL(request.url).searchParams.get("page") ?? "1")
  if (!page.success) return Response.json({ error: "Page invalide" }, { status: 400 })
  return Response.json(await readPortalAppointments(access.companyId, access.clientId, null, page.data), { headers: { "cache-control": "private, no-store" } })
}

export async function POST(request: Request) {
  if (!isSameOriginPortalRequest(request)) return Response.json({ error: "Origine invalide" }, { status: 403 })
  const access = await getCurrentPortalAccess()
  if (!access) return Response.json({ error: "Accès expiré ou révoqué" }, { status: 401 })
  const rateLimit = await portalRateLimit.limit(`appointment:${access.id}`)
  if (!rateLimit.success) return Response.json({ error: "Trop de demandes. Réessayez plus tard." }, { status: 429 })

  try {
    const data = appointmentSchema.parse(await readJsonBody(request, 16 * 1024))
    const company = await prisma.company.findUniqueOrThrow({ where: { id: access.companyId }, select: { serviceTimezone: true } })
    if (data.timeZone && data.timeZone !== company.serviceTimezone) return Response.json({ error: "Le fuseau de la société a changé. Rechargez la page ; votre demande n’a pas été enregistrée." }, { status: 409 })
    const parse = (value: string): { date: Date | null; error?: string } => {
      // Explicit offsets remain accepted for API clients; wall times always use
      // the company's zone, never the host or visitor's implicit time zone.
      const instant = z.string().datetime({ offset: true }).safeParse(value)
      return instant.success ? { date: new Date(instant.data) } : resolveBookingLocalTime(value, company.serviceTimezone)
    }
    const preferred = parse(data.preferredStart), alternative = data.alternativeStart ? parse(data.alternativeStart) : null
    if (!preferred.date || alternative && !alternative.date) return Response.json({ error: preferred.error ?? alternative?.error ?? "Date de rendez-vous invalide" }, { status: 400 })
    const soonest = Date.now() + 3_600_000, latest = Date.now() + 18 * 30 * 86_400_000
    if ([preferred.date, alternative?.date].some(date => date && (date.getTime() < soonest || date.getTime() > latest))) return Response.json({ error: "Choisissez un créneau au moins une heure à l’avance et dans les 18 prochains mois" }, { status: 400 })
    const { requestRecord, eventId } = await prisma.$transaction(async (tx) => {
    const requestRecord = await tx.clientPortalAppointmentRequest.create({
      data: {
        companyId: access.companyId,
        clientId: access.clientId,
        subject: data.subject,
        preferredStart: preferred.date!,
        alternativeStart: alternative?.date ?? null,
        durationMinutes: data.durationMinutes,
        notes: data.notes || null,
      },
      select: { id: true, createdAt: true },
    })
    const eventId = await enqueueAutomationEvent(tx, {
      companyId: access.companyId,
      event: "PORTAL_APPOINTMENT_REQUESTED",
      subjectModel: "ClientPortalAppointmentRequest",
      subjectId: requestRecord.id,
      eventKey: `${requestRecord.id}:created`,
      clientId: access.clientId,
    })
    return { requestRecord, eventId }
    })
    await dispatchAutomationEvent(eventId).catch((error) => console.error("Portal appointment automation deferred", error))
    await notifyPortalTeam(access.companyId, "Nouvelle demande de rendez-vous", `${access.client.name} propose un créneau depuis son espace client.`)
    return Response.json(requestRecord, { status: 201 })
  } catch (error) {
    if (error instanceof PayloadTooLargeError) return Response.json({ error: "Demande trop volumineuse" }, { status: 413 })
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return Response.json({ error: error instanceof z.ZodError ? error.issues[0]?.message || "Demande invalide" : "Demande invalide" }, { status: 400 })
    return Response.json({ error: "Demande temporairement indisponible" }, { status: 500 })
  }
}
