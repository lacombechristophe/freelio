"use server"

import prisma from "@/lib/prisma"
import { withAuth } from "@/lib/auth-wrapper"
import { logAction } from "@/lib/audit"
import { revalidatePath } from "next/cache"
import { ClientActivitySchema, ClientNextActionSchema, ClientSchema, ContactSchema } from "@/lib/validations"

export async function getClients(cursor?: string, limit: number = 20) {
  return await withAuth(async ({ companyId }) => {
    const clients = await prisma.client.findMany({
      where: { companyId },
      take: limit,
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      orderBy: { createdAt: "desc" },
      include: {
        contacts: { where: { isPrimary: true }, take: 1 },
      },
    })

    // Compute aggregates live so the cached `totalRevenueCents` / `totalUnpaidCents`
    // columns don't drift from reality (they're never maintained on mutations).
    const ids = clients.map((c) => c.id)
    if (ids.length === 0) return clients

    const [paidAgg, unpaidAgg] = await Promise.all([
      prisma.invoice.groupBy({
        by: ["clientId"],
        where: { companyId, clientId: { in: ids }, status: "PAID" },
        _sum: { totalHtCents: true },
      }),
      prisma.invoice.groupBy({
        by: ["clientId"],
        where: { companyId, clientId: { in: ids }, status: { in: ["SENT", "OVERDUE"] } },
        _sum: { totalTtcCents: true, paidAmountCents: true },
      }),
    ])

    const paidMap = new Map(paidAgg.map((r) => [r.clientId, r._sum.totalHtCents ?? 0]))
    const unpaidMap = new Map(
      unpaidAgg.map((r) => [
        r.clientId,
        (r._sum.totalTtcCents ?? 0) - (r._sum.paidAmountCents ?? 0),
      ])
    )

    return clients.map((c) => ({
      ...c,
      totalRevenueCents: paidMap.get(c.id) ?? 0,
      totalUnpaidCents: unpaidMap.get(c.id) ?? 0,
    }))
  })
}

export async function getClientById(id: string) {
  return await withAuth(async ({ companyId }) => {
    const client = await prisma.client.findFirst({
      where: { id, companyId },
      include: {
        contacts: true,
        activities: { orderBy: { happenedAt: "desc" }, take: 50 },
        files: { orderBy: { createdAt: "desc" } },
        projects: { orderBy: { createdAt: "desc" } },
        quotes: {
          orderBy: { createdAt: "desc" },
          take: 10,
          include: { versions: { orderBy: { version: "desc" }, take: 1 } },
        },
        invoices: { orderBy: { createdAt: "desc" }, take: 10 },
        contracts: { orderBy: { createdAt: "desc" }, take: 10 },
        portalAccesses: {
          orderBy: { createdAt: "desc" },
          take: 25,
          select: {
            id: true,
            label: true,
            expiresAt: true,
            lastUsedAt: true,
            revokedAt: true,
            createdAt: true,
            contact: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
        },
        portalMessages: { orderBy: { createdAt: "asc" }, take: 100 },
        portalAppointmentRequests: { orderBy: { createdAt: "desc" }, take: 50 },
      },
    })
    if (!client) return null

    const [paidAgg, unpaidAgg] = await Promise.all([
      prisma.invoice.aggregate({
        where: { companyId, clientId: id, status: "PAID" },
        _sum: { totalHtCents: true },
      }),
      prisma.invoice.aggregate({
        where: { companyId, clientId: id, status: { in: ["SENT", "OVERDUE"] } },
        _sum: { totalTtcCents: true, paidAmountCents: true },
      }),
    ])
    const totalRevenueCents = paidAgg._sum.totalHtCents ?? 0
    const totalUnpaidCents =
      (unpaidAgg._sum.totalTtcCents ?? 0) - (unpaidAgg._sum.paidAmountCents ?? 0)

    return { ...client, totalRevenueCents, totalUnpaidCents }
  })
}

export async function getClientsMinimal() {
  return await withAuth(async ({ companyId }) => {
    return await prisma.client.findMany({
      where: { companyId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    })
  })
}

export async function createClient(data: any) {
  return await withAuth(async ({ companyId, userId }) => {
    const validated = ClientSchema.parse(data)
    const client = await prisma.client.create({
      data: { ...validated, companyId },
    })

    await logAction({
      userId,
      action: "CREATE_CLIENT",
      resource: "CLIENT",
      resourceId: client.id,
      payload: { name: client.name },
    })

    revalidatePath("/dashboard/clients")
    return client
  })
}

export async function updateClient(id: string, data: any) {
  return await withAuth(async ({ companyId, userId }) => {
    const validated = ClientSchema.parse(data)
    // Scope to companyId by checking first
    const existing = await prisma.client.findFirst({ where: { id, companyId } })
    if (!existing) throw new Error("Client introuvable")

    const client = await prisma.client.update({
      where: { id },
      data: validated,
    })

    await logAction({
      userId,
      action: "UPDATE_CLIENT",
      resource: "CLIENT",
      resourceId: id,
      payload: { name: client.name },
    })

    revalidatePath("/dashboard/clients")
    revalidatePath(`/dashboard/clients/${id}`)
    return client
  })
}

export async function deleteClient(id: string) {
  return await withAuth(async ({ companyId, userId }) => {
    const existing = await prisma.client.findFirst({
      where: { id, companyId },
      include: {
        _count: {
          select: { invoices: true, quotes: true, contracts: true, projects: true },
        },
      },
    })
    if (!existing) throw new Error("Client introuvable")

    const { _count } = existing
    if (_count.invoices > 0 || _count.quotes > 0 || _count.contracts > 0 || _count.projects > 0) {
      const parts: string[] = []
      if (_count.invoices > 0) parts.push(`${_count.invoices} facture(s)`)
      if (_count.quotes > 0) parts.push(`${_count.quotes} devis`)
      if (_count.contracts > 0) parts.push(`${_count.contracts} contrat(s)`)
      if (_count.projects > 0) parts.push(`${_count.projects} projet(s)`)
      throw new Error(
        `Impossible de supprimer ce client : ${parts.join(", ")} lié(s). Supprimez-les ou archivez le client.`
      )
    }

    await prisma.client.delete({ where: { id } })

    await logAction({
      userId,
      action: "DELETE_CLIENT",
      resource: "CLIENT",
      resourceId: id,
      payload: { name: existing.name },
    })

    revalidatePath("/dashboard/clients")
    return { ok: true }
  })
}

export async function createContact(clientId: string, data: unknown) {
  return withAuth(async ({ companyId }) => {
    const validated = ContactSchema.parse(data)
    const client = await prisma.client.findFirst({ where: { id: clientId, companyId } })
    if (!client) throw new Error("Client introuvable")
    if (validated.isPrimary) {
      await prisma.contact.updateMany({ where: { clientId }, data: { isPrimary: false } })
    }
    const contact = await prisma.contact.create({
      data: {
        clientId,
        ...validated,
        email: validated.email || null,
        phone: validated.phone || null,
        role: validated.role || null,
      },
    })
    revalidatePath(`/dashboard/clients/${clientId}`)
    return contact
  })
}

export async function deleteContact(id: string) {
  return withAuth(async ({ companyId }) => {
    const contact = await prisma.contact.findFirst({ where: { id, client: { companyId } } })
    if (!contact) throw new Error("Contact introuvable")
    await prisma.contact.delete({ where: { id } })
    revalidatePath(`/dashboard/clients/${contact.clientId}`)
    return { ok: true }
  })
}

export async function addClientActivity(clientId: string, data: unknown) {
  return withAuth(async ({ companyId }) => {
    const validated = ClientActivitySchema.parse(data)
    const client = await prisma.client.findFirst({ where: { id: clientId, companyId } })
    if (!client) throw new Error("Client introuvable")
    const activity = await prisma.clientActivity.create({
      data: {
        clientId,
        type: validated.type,
        content: validated.content,
        happenedAt: validated.happenedAt ? new Date(validated.happenedAt) : new Date(),
      },
    })
    revalidatePath(`/dashboard/clients/${clientId}`)
    return activity
  })
}

export async function deleteClientActivity(id: string) {
  return withAuth(async ({ companyId }) => {
    const activity = await prisma.clientActivity.findFirst({ where: { id, client: { companyId } } })
    if (!activity) throw new Error("Activité introuvable")
    await prisma.clientActivity.delete({ where: { id } })
    revalidatePath(`/dashboard/clients/${activity.clientId}`)
    return { ok: true }
  })
}

export async function setClientNextAction(clientId: string, data: unknown) {
  return withAuth(async ({ companyId }) => {
    const validated = ClientNextActionSchema.parse(data)
    const existing = await prisma.client.findFirst({ where: { id: clientId, companyId } })
    if (!existing) throw new Error("Client introuvable")
    const client = await prisma.client.update({
      where: { id: clientId },
      data: {
        nextActionLabel: validated.label || null,
        nextActionAt: validated.date ? new Date(`${validated.date}T12:00:00`) : null,
      },
    })
    revalidatePath("/dashboard/clients")
    revalidatePath(`/dashboard/clients/${clientId}`)
    return client
  })
}
