"use server"

import prisma from "@/lib/prisma"
import { withAuth } from "@/lib/auth-wrapper"
import { logAction } from "@/lib/audit"
import { revalidatePath } from "next/cache"
import { ClientActivitySchema, ClientNextActionSchema, ClientSchema, ContactSchema } from "@/lib/validations"
import { boundedPageSize } from "@/lib/pagination"
import { hasPermission } from "@/lib/permissions"

export async function getClients(cursor?: string, limit: number = 20) {
  return await withAuth(async ({ companyId, role, agencyIds }) => {
    const canReadFinance = hasPermission(role, "finance.read")
    const invoiceScope = { companyId, ...(agencyIds === null ? { OR: [{ projectId: null }, { project: { companyId } }] } : { project: { companyId, agencyId: { in: agencyIds } } }) }
    const pageSize = boundedPageSize(limit, 20, 100)
    const [clients, propertyDefinitions] = await Promise.all([
      prisma.client.findMany({
        where: { companyId },
        take: pageSize,
        cursor: cursor ? { id: cursor } : undefined,
        skip: cursor ? 1 : 0,
        orderBy: { createdAt: "desc" },
        include: {
          contacts: { where: { isPrimary: true }, take: 1 },
        },
      }),
      prisma.crmPropertyDefinition.findMany({
        where: { companyId, objectType: "CLIENT", archivedAt: null },
        select: { id: true, key: true, label: true, type: true, groupName: true, options: true },
        orderBy: [{ groupName: "asc" }, { position: "asc" }, { label: "asc" }],
      }),
    ])

    // Compute aggregates live so the cached `totalRevenueCents` / `totalUnpaidCents`
    // columns don't drift from reality (they're never maintained on mutations).
    const ids = clients.map((c) => c.id)
    if (ids.length === 0) return { clients: [], propertyDefinitions }

    const [paidAgg, unpaidAgg, propertyValues] = await Promise.all([
      canReadFinance ? prisma.invoice.groupBy({
        by: ["clientId"],
        where: { ...invoiceScope, clientId: { in: ids }, status: "PAID" },
        _sum: { totalHtCents: true },
      }) : [],
      canReadFinance ? prisma.invoice.groupBy({
        by: ["clientId"],
        where: { ...invoiceScope, clientId: { in: ids }, status: { in: ["SENT", "OVERDUE"] } },
        _sum: { totalTtcCents: true, paidAmountCents: true },
      }) : [],
      prisma.crmPropertyValue.findMany({
        where: { companyId, recordId: { in: ids }, definition: { objectType: "CLIENT", archivedAt: null } },
        select: { recordId: true, definitionId: true, value: true },
      }),
    ])

    const paidMap = new Map(paidAgg.map((r) => [r.clientId, r._sum.totalHtCents ?? 0]))
    const unpaidMap = new Map(unpaidAgg.map((r) => [r.clientId, (r._sum.totalTtcCents ?? 0) - (r._sum.paidAmountCents ?? 0)]))

    const propertyValuesByClient = new Map<string, Record<string, unknown>>()
    for (const property of propertyValues) {
      propertyValuesByClient.set(property.recordId, {
        ...(propertyValuesByClient.get(property.recordId) ?? {}),
        [property.definitionId]: property.value,
      })
    }

    return {
      propertyDefinitions,
      clients: clients.map((c) => ({
        ...c,
        relationScore: canReadFinance && agencyIds === null ? c.relationScore : null,
        renewalAmountCents: canReadFinance ? c.renewalAmountCents : null,
        totalRevenueCents: canReadFinance ? paidMap.get(c.id) ?? 0 : null,
        totalUnpaidCents: canReadFinance ? unpaidMap.get(c.id) ?? 0 : null,
        propertyValues: propertyValuesByClient.get(c.id) ?? {},
      })),
    }
  }, "crm.read")
}

export async function getClientById(id: string) {
  return await withAuth(async ({ companyId, agencyIds, role }) => prisma.$transaction(async tx => {
    if (typeof id !== "string" || !id.trim() || id.length > 200) return null
    const canReadSales = hasPermission(role, "sales.read")
    const canReadFinance = hasPermission(role, "finance.read")
    const projectScope = { companyId, ...(agencyIds === null ? {} : { agencyId: { in: agencyIds } }) }
    const documentScope = {
      companyId,
      ...(agencyIds === null ? { OR: [{ projectId: null }, { project: { companyId } }] } : { project: projectScope }),
    }
    const client = await tx.client.findFirst({
      where: { id, companyId },
      include: {
        contacts: true,
        activities: { orderBy: { happenedAt: "desc" }, take: 50 },
        files: { orderBy: { createdAt: "desc" }, take: 100 },
        projects: { where: projectScope, orderBy: { createdAt: "desc" }, take: 100 },
        quotes: {
          where: { ...documentScope, ...(canReadSales ? {} : { id: { in: [] } }) },
          orderBy: { createdAt: "desc" },
          take: 10,
          include: { versions: { orderBy: { version: "desc" }, take: 1 } },
        },
        invoices: { where: { ...documentScope, ...(canReadFinance ? {} : { id: { in: [] } }) }, orderBy: { createdAt: "desc" }, take: 10 },
        contracts: { where: { companyId, ...(canReadSales ? {} : { id: { in: [] } }) }, orderBy: { createdAt: "desc" }, take: 10 },
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

    const [paidAgg, unpaidAgg] = canReadFinance ? await Promise.all([
      tx.invoice.aggregate({
        where: { ...documentScope, clientId: id, status: "PAID" },
        _sum: { totalHtCents: true },
      }),
      tx.invoice.aggregate({
        where: { ...documentScope, clientId: id, status: { in: ["SENT", "OVERDUE"] } },
        _sum: { totalTtcCents: true, paidAmountCents: true },
      }),
    ]) : [null, null]
    const totalRevenueCents = paidAgg ? paidAgg._sum.totalHtCents ?? 0 : null
    const totalUnpaidCents = unpaidAgg ? (unpaidAgg._sum.totalTtcCents ?? 0) - (unpaidAgg._sum.paidAmountCents ?? 0) : null

    return { ...client, relationScore: canReadFinance && agencyIds === null ? client.relationScore : null, renewalAmountCents: canReadFinance ? client.renewalAmountCents : null, totalRevenueCents, totalUnpaidCents, access: { sales: canReadSales, finance: canReadFinance, salesWrite: hasPermission(role, "sales.write") } }
  }, { isolationLevel: "Serializable" }), "crm.read")
}

export async function getClientsMinimal() {
  return await withAuth(async ({ companyId }) => {
    return await prisma.client.findMany({
      where: { companyId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 1_000,
    })
  })
}

export async function createClient(data: unknown) {
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

export async function updateClient(id: string, data: unknown) {
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
      throw new Error(`Impossible de supprimer ce client : ${parts.join(", ")} lié(s). Supprimez-les ou archivez le client.`)
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
