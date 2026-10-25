import "server-only"

import { z } from "zod"
import prisma from "@/lib/prisma"
import type { AgencyAccess } from "@/lib/agency-access"
import { DIRECTORY_PAGE_SIZE } from "@/lib/directory-query"
import { operationsDashboardScope } from "./dashboard-scope"
import { purchaseDraftRevision } from "./purchase-drafts"

export const purchaseDirectoryQuery = z.object({
  search: z.string().trim().max(200).default(""),
  page: z.number().int().min(1).max(100000).default(1),
  status: z.enum(["ALL", "DRAFT", "PENDING_APPROVAL", "APPROVED", "SENT", "ACKNOWLEDGED", "PARTIALLY_RECEIVED", "RECEIVED", "RECEIVED_WITH_ISSUES", "CANCELED"]).default("ALL"),
  agencyId: z.string().cuid().optional(),
}).strict()

const orderBy = [{ createdAt: "desc" as const }, { id: "asc" as const }]

export async function readPurchaseOrderDirectory(companyId: string, agencyIds: AgencyAccess, query: z.infer<typeof purchaseDirectoryQuery>) {
  const scope = operationsDashboardScope(companyId, agencyIds)
  const text = { contains: query.search, ...(process.env.DATABASE_URL?.startsWith("postgres") ? { mode: "insensitive" as const } : {}) }
  const where = { ...scope.purchaseOrder,
    ...(agencyIds === null ? {} : { project: scope.project }),
    ...(query.status === "ALL" ? {} : { status: query.status }),
    ...(query.search ? { OR: [{ number: text }, { supplierReference: text }, { supplier: { name: text } }, { project: { name: text } }, { lines: { some: { OR: [{ label: text }, { product: { sku: text } }] } } }] } : {}),
  }
  return prisma.$transaction(async tx => {
    const total = await tx.purchaseOrder.count({ where })
    const page = Math.min(query.page, Math.max(1, Math.ceil(total / DIRECTORY_PAGE_SIZE)))
    const items = await tx.purchaseOrder.findMany({ where, orderBy, skip: (page - 1) * DIRECTORY_PAGE_SIZE, take: DIRECTORY_PAGE_SIZE,
      include: {
        supplier: { select: { name: true } },
        project: { select: { name: true, agencyId: true } },
        approvedByMembership: { include: { user: { select: { name: true, email: true } } } },
        lines: { include: { product: { select: { sku: true, label: true } }, supplierReturns: { where: scope.supplierReturn, select: { quantity: true } } }, orderBy: { order: "asc" } },
        issues: { where: scope.purchaseIssue, include: { product: { select: { label: true } }, purchaseOrderLine: { select: { label: true } } }, orderBy: { createdAt: "desc" } },
        supplierReturns: { where: scope.supplierReturn, include: { product: { select: { label: true } }, warehouse: { select: { name: true, agencyId: true } } }, orderBy: { createdAt: "desc" } },
      },
    })
    return { items: items.map(order => ({ ...order, draftRevision: purchaseDraftRevision(order) })), total, page }
  }, { isolationLevel: "Serializable" })
}

export async function readPurchaseOrderSummary(companyId: string, agencyIds: AgencyAccess) {
  const scope = operationsDashboardScope(companyId, agencyIds)
  const where = { ...scope.purchaseOrder, ...(agencyIds === null ? {} : { project: scope.project }), status: { notIn: ["RECEIVED", "CANCELED"] } }
  return prisma.$transaction(async tx => {
    const activeCount = await tx.purchaseOrder.count({ where })
    const items = await tx.purchaseOrder.findMany({ where, orderBy, take: 5,
      select: { id: true, number: true, status: true, supplier: { select: { name: true } }, project: { select: { name: true } } },
    })
    return { activeCount, items }
  }, { isolationLevel: "Serializable" })
}
