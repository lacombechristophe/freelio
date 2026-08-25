"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { withAuth } from "@/lib/auth-wrapper"
import { logAction } from "@/lib/audit"
import { createPortalToken, hashPortalToken } from "@/lib/portal/session"
import prisma from "@/lib/prisma"

const cuid = z.string().cuid()
const accessSchema = z.object({
  clientId: cuid,
  contactId: z.union([cuid, z.literal(""), z.null()]).optional(),
  label: z.string().trim().max(120).optional().default(""),
  validityDays: z.coerce.number().int().min(1).max(90).default(30),
})

export async function createClientPortalAccess(input: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    const data = accessSchema.parse(input)
    const client = await prisma.client.findFirst({ where: { id: data.clientId, companyId }, select: { id: true } })
    if (!client) throw new Error("Client introuvable")
    const contactId = data.contactId || null
    if (contactId) {
      const contact = await prisma.contact.findFirst({ where: { id: contactId, clientId: client.id }, select: { id: true } })
      if (!contact) throw new Error("Contact introuvable pour ce client")
    }
    const token = createPortalToken()
    const expiresAt = new Date(Date.now() + data.validityDays * 24 * 60 * 60 * 1_000)
    const access = await prisma.clientPortalAccess.create({
      data: { companyId, clientId: client.id, contactId, label: data.label || null, tokenHash: hashPortalToken(token), expiresAt },
      select: { id: true },
    })
    await logAction({ userId, action: "CREATE_CLIENT_PORTAL_ACCESS", resource: "CLIENT_PORTAL_ACCESS", resourceId: access.id, payload: { clientId: client.id, contactId, expiresAt } })
    revalidatePath(`/dashboard/clients/${client.id}`)
    return { id: access.id, portalPath: `/portal/access/${token}`, expiresAt: expiresAt.toISOString() }
  }, "crm.write")
}

export async function revokeClientPortalAccess(accessId: string) {
  return withAuth(async ({ companyId, userId }) => {
    const parsedId = cuid.parse(accessId)
    const access = await prisma.clientPortalAccess.findFirst({ where: { id: parsedId, companyId }, select: { id: true, clientId: true, revokedAt: true } })
    if (!access) throw new Error("Accès portail introuvable")
    if (!access.revokedAt) await prisma.clientPortalAccess.update({ where: { id: access.id }, data: { revokedAt: new Date() } })
    await logAction({ userId, action: "REVOKE_CLIENT_PORTAL_ACCESS", resource: "CLIENT_PORTAL_ACCESS", resourceId: access.id, payload: { clientId: access.clientId } })
    revalidatePath(`/dashboard/clients/${access.clientId}`)
    return { success: true as const }
  }, "crm.write")
}

const replySchema = z.object({ clientId: cuid, body: z.string().trim().min(2).max(2_000) })

export async function sendTeamPortalMessage(input: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    const data = replySchema.parse(input)
    const [client, user] = await Promise.all([
      prisma.client.findFirst({ where: { id: data.clientId, companyId }, select: { id: true } }),
      prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } }),
    ])
    if (!client) throw new Error("Client introuvable")
    const authorName = user?.name || user?.email || "Équipe"
    const message = await prisma.$transaction(async (tx) => {
      await tx.clientPortalMessage.updateMany({ where: { companyId, clientId: client.id, direction: "CUSTOMER", readAt: null }, data: { readAt: new Date() } })
      return tx.clientPortalMessage.create({ data: { companyId, clientId: client.id, direction: "TEAM", authorName, body: data.body }, select: { id: true } })
    })
    await logAction({ userId, action: "SEND_CLIENT_PORTAL_MESSAGE", resource: "CLIENT_PORTAL_MESSAGE", resourceId: message.id, payload: { clientId: client.id } })
    revalidatePath(`/dashboard/clients/${client.id}`)
    revalidatePath("/portal")
    return { success: true as const }
  }, "crm.write")
}

const appointmentUpdateSchema = z.object({
  id: cuid,
  status: z.enum(["PENDING", "CONFIRMED", "DECLINED", "CANCELLED", "COMPLETED"]),
  response: z.string().trim().max(1_000).optional().default(""),
})

export async function updateClientPortalAppointment(input: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    const data = appointmentUpdateSchema.parse(input)
    const appointment = await prisma.clientPortalAppointmentRequest.findFirst({ where: { id: data.id, companyId }, select: { id: true, clientId: true } })
    if (!appointment) throw new Error("Demande de rendez-vous introuvable")
    await prisma.clientPortalAppointmentRequest.update({ where: { id: appointment.id }, data: { status: data.status, response: data.response || null } })
    await logAction({ userId, action: "UPDATE_CLIENT_PORTAL_APPOINTMENT", resource: "CLIENT_PORTAL_APPOINTMENT", resourceId: appointment.id, payload: { clientId: appointment.clientId, status: data.status } })
    revalidatePath(`/dashboard/clients/${appointment.clientId}`)
    revalidatePath("/portal")
    return { success: true as const }
  }, "crm.write")
}
