import { z } from "zod"

import prisma from "@/lib/prisma"
import { notifyPortalTeam } from "@/lib/portal/notifications"
import { getCurrentPortalAccess, isSameOriginPortalRequest } from "@/lib/portal/session"
import { portalRateLimit } from "@/lib/rate-limit"

const messageSchema = z.object({
  authorName: z.string().trim().max(100).optional().default(""),
  body: z.string().trim().min(2, "Le message est trop court").max(2_000, "Le message est trop long"),
})

export async function POST(request: Request) {
  if (!isSameOriginPortalRequest(request)) return Response.json({ error: "Origine invalide" }, { status: 403 })
  const access = await getCurrentPortalAccess()
  if (!access) return Response.json({ error: "Accès expiré ou révoqué" }, { status: 401 })
  const rateLimit = await portalRateLimit.limit(`message:${access.id}`)
  if (!rateLimit.success) return Response.json({ error: "Trop de messages. Réessayez plus tard." }, { status: 429 })

  try {
    const data = messageSchema.parse(await request.json())
    const defaultName = access.contact ? `${access.contact.firstName} ${access.contact.lastName}`.trim() : access.client.name
    const message = await prisma.clientPortalMessage.create({
      data: {
        companyId: access.companyId,
        clientId: access.clientId,
        direction: "CUSTOMER",
        authorName: data.authorName || defaultName,
        body: data.body,
      },
      select: { id: true, createdAt: true },
    })
    await notifyPortalTeam(access.companyId, "Nouveau message client", `${access.client.name} a écrit depuis son espace client.`)
    return Response.json(message, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: error.issues[0]?.message || "Message invalide" }, { status: 400 })
    return Response.json({ error: "Envoi temporairement indisponible" }, { status: 500 })
  }
}
