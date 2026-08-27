"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { logAction } from "@/lib/audit"
import { withAuth } from "@/lib/auth-wrapper"
import prisma from "@/lib/prisma"

const cuid = z.string().cuid()
const noteSchema = z.object({ ticketId: cuid, body: z.string().trim().min(2).max(5_000) })
const linkSchema = z.object({ ticketId: cuid, threadId: cuid })

export async function addServiceTicketNote(input: unknown) {
  return withAuth(async ({ companyId, membershipId, userId }) => {
    const data = noteSchema.parse(input)
    const ticket = await prisma.serviceTicket.findFirst({ where: { id: data.ticketId, companyId }, select: { id: true } })
    if (!ticket) throw new Error("Ticket introuvable")
    const note = await prisma.serviceTicketNote.create({ data: { companyId, ticketId: ticket.id, authorMembershipId: membershipId, body: data.body } })
    await logAction({ userId, action: "ADD_SERVICE_TICKET_NOTE", resource: "SERVICE_TICKET", resourceId: ticket.id, payload: { noteId: note.id } })
    revalidatePath(`/dashboard/service/tickets/${ticket.id}`)
    return { success: true as const, id: note.id }
  }, "service.write")
}

export async function linkServiceTicketThread(input: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    const data = linkSchema.parse(input)
    const [ticket, thread] = await Promise.all([
      prisma.serviceTicket.findFirst({ where: { id: data.ticketId, companyId }, select: { id: true, clientId: true } }),
      prisma.emailThread.findFirst({ where: { id: data.threadId, companyId }, select: { id: true, clientId: true, serviceTicketId: true } }),
    ])
    if (!ticket || !thread) throw new Error("Ticket ou conversation introuvable")
    if (thread.clientId && thread.clientId !== ticket.clientId) throw new Error("Cette conversation appartient à un autre client")
    if (thread.serviceTicketId && thread.serviceTicketId !== ticket.id) throw new Error("Cette conversation appartient déjà à un autre ticket")
    await prisma.emailThread.update({ where: { id: thread.id }, data: { serviceTicketId: ticket.id, clientId: ticket.clientId } })
    await logAction({ userId, action: "LINK_SERVICE_TICKET_THREAD", resource: "SERVICE_TICKET", resourceId: ticket.id, payload: { threadId: thread.id } })
    revalidatePath(`/dashboard/service/tickets/${ticket.id}`)
    revalidatePath("/dashboard/communications")
    return { success: true as const }
  }, "service.write")
}

