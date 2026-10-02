"use server"

import prisma from "@/lib/prisma"
import { withAuth } from "@/lib/auth-wrapper"
import { DIRECTORY_PAGE_SIZE, compareDirectoryValues, directoryQuerySchema, matchesDirectoryFilter, type DirectoryQuery } from "@/lib/directory-query"

function contains(value: string) {
  return { contains: value.trim(), ...(/^postgres/i.test(process.env.DATABASE_URL ?? "") ? { mode: "insensitive" as const } : {}) }
}

function pageFor(total: number, requested: number) {
  return Math.min(requested, Math.max(1, Math.ceil(total / DIRECTORY_PAGE_SIZE)))
}

export async function getContactDirectory(input: DirectoryQuery) {
  const query = directoryQuerySchema.parse(input)
  return withAuth(async ({ companyId }) => {
    const where = { client: { companyId },
      ...(["OPTED_IN", "OPTED_OUT"].includes(query.status) ? { marketingStatus: query.status } : {}),
      ...(query.search.trim() ? { OR: [{ firstName: contains(query.search) }, { lastName: contains(query.search) }, { email: contains(query.search) }, { phone: contains(query.search) }, { role: contains(query.search) }, { client: { name: contains(query.search) } }] } : {}),
    }
    const total = await prisma.contact.count({ where })
    const page = pageFor(total, query.page)
    const contacts = await prisma.contact.findMany({ where, skip: (page - 1) * DIRECTORY_PAGE_SIZE, take: DIRECTORY_PAGE_SIZE,
      orderBy: [{ isPrimary: "desc" }, { lastName: "asc" }, { firstName: "asc" }, { id: "asc" }],
      include: { client: { select: { id: true, name: true, type: true } }, _count: { select: { emailDeliveries: true, sequenceEnrollments: true } } },
    })
    return { rows: contacts.map((contact) => ({ ...contact, createdAt: contact.createdAt.toISOString(), updatedAt: contact.updatedAt.toISOString() })), total, page }
  }, "crm.read")
}

export async function getQuoteDirectory(input: DirectoryQuery) {
  const query = directoryQuerySchema.parse(input)
  return withAuth(async ({ companyId }) => {
    const scope = { companyId, ...(query.search.trim() ? { OR: [{ number: contains(query.search) }, { object: contains(query.search) }, { client: { name: contains(query.search) } }] } : {}) }
    const where = { ...scope, ...(query.status !== "ALL" ? { status: query.status } : {}) }
    const [total, groups] = await Promise.all([
      prisma.quote.count({ where }),
      prisma.quote.groupBy({ by: ["status"], where: scope, _count: true }),
    ])
    const page = pageFor(total, query.page)
    const rows = await prisma.quote.findMany({ where, skip: (page - 1) * DIRECTORY_PAGE_SIZE, take: DIRECTORY_PAGE_SIZE,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: { client: { select: { id: true, name: true } }, versions: { orderBy: { version: "desc" }, take: 1, select: { totalHtCents: true, totalTvaCents: true, totalTtcCents: true } } },
    })
    return { rows, total, page, counts: Object.fromEntries([ ["ALL", groups.reduce((sum, group) => sum + group._count, 0)], ...groups.map((group) => [group.status, group._count]) ]) as Record<string, number> }
  }, "sales.read")
}

export async function getInvoiceDirectory(input: DirectoryQuery) {
  const query = directoryQuerySchema.parse(input)
  return withAuth(async ({ companyId }) => {
    const scope = { companyId, ...(query.search.trim() ? { OR: [{ number: contains(query.search) }, { client: { name: contains(query.search) } }] } : {}) }
    const where = { ...scope, ...(query.status !== "ALL" ? { status: query.status } : {}) }
    const [total, groups, unpaid] = await Promise.all([
      prisma.invoice.count({ where }),
      prisma.invoice.groupBy({ by: ["status"], where: scope, _count: true }),
      prisma.invoice.aggregate({ where: { companyId, status: { in: ["SENT", "OVERDUE"] } }, _sum: { totalTtcCents: true, paidAmountCents: true } }),
    ])
    const page = pageFor(total, query.page)
    const rows = await prisma.invoice.findMany({ where, skip: (page - 1) * DIRECTORY_PAGE_SIZE, take: DIRECTORY_PAGE_SIZE, orderBy: [{ createdAt: "desc" }, { id: "desc" }], include: { client: { select: { id: true, name: true } } } })
    return { rows, total, page, outstanding: (unpaid._sum.totalTtcCents ?? 0) - (unpaid._sum.paidAmountCents ?? 0), counts: Object.fromEntries([ ["ALL", groups.reduce((sum, group) => sum + group._count, 0)], ...groups.map((group) => [group.status, group._count]) ]) as Record<string, number> }
  }, "finance.read")
}

// Computed financial and custom-property sorts require values before pagination.
// Only matching rows are returned to the browser; the simple name directory uses DB pagination.
export async function getClientDirectory(input: DirectoryQuery) {
  const query = directoryQuerySchema.parse(input)
  return withAuth(async ({ companyId }) => {
    const where = { companyId, ...(query.search.trim() ? { OR: [
      { name: contains(query.search) }, { address: contains(query.search) }, { siret: contains(query.search) },
      { contacts: { some: { OR: [{ firstName: contains(query.search) }, { lastName: contains(query.search) }, { email: contains(query.search) }] } } },
    ] } : {}) }
    const computed = query.filters.length > 0 || query.sort.field !== "name"
    const totalBeforeFilters = await prisma.client.count({ where })
    const initialPage = pageFor(totalBeforeFilters, query.page)
    const candidates = await prisma.client.findMany({ where,
      ...(!computed ? { skip: (initialPage - 1) * DIRECTORY_PAGE_SIZE, take: DIRECTORY_PAGE_SIZE } : {}),
      orderBy: [{ name: query.sort.direction }, { id: "asc" }],
      select: { id: true, name: true, type: true, siret: true, tvaNumber: true, address: true, relationScore: true, contacts: { where: { isPrimary: true }, take: 1, select: { firstName: true, lastName: true, email: true } } },
    })
    const ids = candidates.map((client) => client.id)
    const [paid, unpaid, properties] = ids.length ? await Promise.all([
      prisma.invoice.groupBy({ by: ["clientId"], where: { companyId, clientId: { in: ids }, status: "PAID" }, _sum: { totalHtCents: true } }),
      prisma.invoice.groupBy({ by: ["clientId"], where: { companyId, clientId: { in: ids }, status: { in: ["SENT", "OVERDUE"] } }, _sum: { totalTtcCents: true, paidAmountCents: true } }),
      prisma.crmPropertyValue.findMany({ where: { companyId, recordId: { in: ids }, definition: { objectType: "CLIENT", archivedAt: null } }, select: { recordId: true, definitionId: true, value: true } }),
    ]) : [[], [], []]
    const paidMap = new Map(paid.map((item) => [item.clientId, item._sum.totalHtCents ?? 0]))
    const unpaidMap = new Map(unpaid.map((item) => [item.clientId, (item._sum.totalTtcCents ?? 0) - (item._sum.paidAmountCents ?? 0)]))
    const propertyMap = new Map<string, Record<string, unknown>>()
    for (const property of properties) propertyMap.set(property.recordId, { ...propertyMap.get(property.recordId), [property.definitionId]: property.value })
    const hydrated = candidates.map((client) => ({ ...client, totalRevenueCents: paidMap.get(client.id) ?? 0, totalUnpaidCents: unpaidMap.get(client.id) ?? 0, propertyValues: propertyMap.get(client.id) ?? {} }))
    function field(client: typeof hydrated[number], key: string): unknown {
      if (key === "name") return client.name
      if (key === "type") return client.type
      if (key === "revenue") return client.totalRevenueCents / 100
      if (key === "unpaid") return client.totalUnpaidCents / 100
      if (key === "relation") return client.relationScore
      return client.propertyValues[key] ?? null
    }
    if (!computed) return { rows: hydrated, total: totalBeforeFilters, page: initialPage }
    const matching = hydrated.filter((client) => query.filters.every((filter) => matchesDirectoryFilter(field(client, filter.field), filter)))
      .sort((left, right) => (query.sort.direction === "asc" ? 1 : -1) * compareDirectoryValues(field(left, query.sort.field), field(right, query.sort.field)) || left.id.localeCompare(right.id))
    const page = pageFor(matching.length, query.page)
    return { rows: matching.slice((page - 1) * DIRECTORY_PAGE_SIZE, page * DIRECTORY_PAGE_SIZE), total: matching.length, page }
  }, "crm.read")
}
