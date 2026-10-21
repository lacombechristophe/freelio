"use server"

import { createHash } from "node:crypto"
import { calendarPeriods } from "@/lib/calendar-days"
import { revalidatePath } from "next/cache"
import { z } from "zod"

import { withAuth, AuthorizationError } from "@/lib/auth-wrapper"
import { AssetLifecycleError } from "@/lib/operations/asset-error"
import { messageReadSelect } from "@/lib/communications/inbox-reader"
import { logAction } from "@/lib/audit"
import { buildYearlyDocumentPrefix, readCompanyDocumentNumbers, isUniqueConstraintConflict, nextDocumentNumber, withDocumentNumberRetry } from "@/lib/document-numbering"
import { calculateStockBalance, calculateStockTransferBalances } from "@/lib/operations/stock"
import { computeInvoiceSlice, remainingOrderAmount } from "@/lib/operations/orders"
import { assertSchedulingSlotFree, lockSchedulingMembers, schedulingMemberWhere, SchedulingError } from "@/lib/scheduling/resource-slots"
import { indexedMaintenancePrice, nextMaintenanceTerm } from "@/lib/operations/maintenance-renewal"
import { diagnosticSteps, diagnosticStringList, equipmentWarrantyStatus, scoreDiagnosticGuide } from "@/lib/operations/service-diagnostics"
import { scoreServiceDuplicate } from "@/lib/operations/service-duplicates"
import { recommendServiceAssignee, serviceRoutingTags } from "@/lib/operations/service-routing"
import { businessMinutesBetween, serviceFirstResponseTarget, serviceResolutionTarget, serviceSlaPolicy } from "@/lib/operations/service-sla"
import { hasPermission } from "@/lib/permissions"
import { clientWithAccessibleMetrics } from "@/lib/client-metrics-access"
import { isPublicReadOnlyDemo } from "@/lib/demo-policy"
import { readStockDirectory } from "@/lib/operations/stock-directory"
import { operationsDashboardScope } from "@/lib/operations/dashboard-scope"
import { lockActiveWarehouses } from "@/lib/operations/warehouses"
import { lockActiveSite, lockActiveEquipment, lockActiveAssetProduct } from "@/lib/operations/asset-lifecycle"
import prisma from "@/lib/prisma"
import { readSupplierProducts, readSupplierOrders, readSupplierReturns, readSupplierMetrics, supplierHistoryQuery } from "@/lib/operations/supplier-history"
import { supplierSchema, lockActiveSupplier } from "@/lib/operations/suppliers"
import { purchaseDraftRevision } from "@/lib/operations/purchase-drafts"
import { transitionPurchaseOrder } from "@/lib/operations/purchase-transitions"
import { readPurchaseStockLine, readPurchaseStockIssue, readPurchaseStockReturn, purchaseStockRevision, purchaseStockLineRevision, purchaseStockChanged, lockPurchaseStockOrder, assertPurchaseInspectionCapacity } from "@/lib/operations/purchase-stock"
import { readPurchaseOrderDirectory, readPurchaseOrderSummary } from "@/lib/operations/purchase-directory"

const id = z.string().cuid()
const optionalId = z
  .union([id, z.literal("")])
  .optional()
  .transform((value) => value || null)
const optionalText = z
  .string()
  .trim()
  .max(2_000)
  .optional()
  .transform((value) => value || null)
const optionalRoutingText = z
  .string()
  .trim()
  .max(80)
  .optional()
  .transform((value) => value || null)
const dateInput = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? new Date(value) : null))
const optionalCoordinate = z.preprocess((value) => (value === "" || value == null ? null : Number(value)), z.number().finite().nullable())

const siteSchema = z.object({
  clientId: id,
  agencyId: optionalId,
  label: z.string().trim().min(2).max(120),
  kind: z.string().trim().min(2).max(40).default("INSTALLATION"),
  address1: z.string().trim().min(3).max(200),
  address2: optionalText,
  postalCode: z
    .string()
    .trim()
    .max(20)
    .optional()
    .transform((value) => value || null),
  city: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((value) => value || null),
  accessNotes: optionalText,
  latitude: optionalCoordinate.refine((value) => value == null || (value >= -90 && value <= 90), "Latitude invalide"),
  longitude: optionalCoordinate.refine((value) => value == null || (value >= -180 && value <= 180), "Longitude invalide"),
})

const productSchema = z.object({
  sku: z.string().trim().min(1).max(80),
  label: z.string().trim().min(2).max(200),
  supplierId: optionalId,
  manufacturer: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((value) => value || null),
  family: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((value) => value || null),
  unit: z.string().trim().min(1).max(30).default("unité"),
  purchasePriceCents: z.coerce.number().int().min(0).max(2_000_000_000).default(0),
  salePriceCents: z.coerce.number().int().min(0).max(2_000_000_000).default(0),
  stockTracked: z.boolean().default(true),
})

const warehouseSchema = z.object({
  agencyId: optionalId,
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().min(1).max(30),
  address: optionalText,
})

const equipmentSchema = z.object({
  siteId: id,
  productId: optionalId,
  label: z.string().trim().min(2).max(160),
  category: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((value) => value || null),
  manufacturer: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((value) => value || null),
  model: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((value) => value || null),
  serialNumber: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((value) => value || null),
  installedAt: dateInput,
  warrantyUntil: dateInput,
  notes: optionalText,
})

const ticketSchema = z.object({
  clientId: id,
  siteId: optionalId,
  equipmentId: optionalId,
  assignedMembershipId: optionalId,
  title: z.string().trim().min(3).max(180),
  description: z.string().trim().min(3).max(5_000),
  type: z.enum(["SAV", "MAINTENANCE", "WARRANTY", "QUESTION"]).default("SAV"),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
  dueAt: dateInput,
  requiredSkill: optionalRoutingText,
  territory: optionalRoutingText,
})

const ticketUpdateSchema = z.object({
  status: z.enum(["OPEN", "QUALIFIED", "PLANNED", "WAITING", "RESOLVED", "CLOSED"]),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]),
  assignedMembershipId: optionalId,
  dueAt: dateInput,
  resolution: z
    .string()
    .trim()
    .max(5_000)
    .optional()
    .transform((value) => value || null),
  requiredSkill: optionalRoutingText,
  territory: optionalRoutingText,
})

const ticketMergeSchema = z.object({ sourceId: id, targetId: id }).refine((value) => value.sourceId !== value.targetId, { message: "Les deux tickets doivent être différents" })

const interventionSchema = z
  .object({
    ticketId: optionalId,
    projectId: optionalId,
    siteId: id,
    assignedMembershipId: optionalId,
    title: z.string().trim().min(3).max(180),
    type: z.enum(["SITE_VISIT", "INSTALLATION", "SAV", "MAINTENANCE"]).default("SAV"),
    scheduledStart: z.string().datetime(),
    scheduledEnd: z.string().datetime().optional().nullable(),
  })
  .superRefine((value, context) => {
    if (value.scheduledEnd && Date.parse(value.scheduledEnd) <= Date.parse(value.scheduledStart)) {
      context.addIssue({ code: "custom", path: ["scheduledEnd"], message: "La fin doit être postérieure au début" })
    }
  })

const interventionPlanningSchema = z
  .object({
    interventionId: id,
    assignedMembershipId: optionalId,
    scheduledStart: z.string().datetime(),
    scheduledEnd: z.string().datetime(),
  })
  .superRefine((value, context) => {
    if (Date.parse(value.scheduledEnd) <= Date.parse(value.scheduledStart)) {
      context.addIssue({ code: "custom", path: ["scheduledEnd"], message: "La fin doit être postérieure au début" })
    }
  })

const maintenanceContractSchema = z.object({
  clientId: id,
  siteId: id,
  label: z.string().trim().min(3).max(180),
  startDate: z
    .string()
    .trim()
    .min(1)
    .refine((value) => !Number.isNaN(Date.parse(value)), "Date de début invalide"),
  endDate: dateInput,
  frequency: z.enum(["MONTHLY", "QUARTERLY", "BIANNUAL", "ANNUAL"]).default("ANNUAL"),
  nextVisitAt: dateInput,
  priceCents: z.coerce.number().int().min(0).max(2_000_000_000).default(0),
  autoInvoice: z.boolean().default(false),
  tvaRate: z.coerce.number().min(0).max(100).default(20),
  invoiceDueDays: z.coerce.number().int().min(0).max(365).default(30),
  equipmentIds: z.array(id).max(100).default([]),
  notes: optionalText,
})

const maintenanceRenewalSettingsSchema = z.object({
  contractId: id,
  noticeDays: z.coerce.number().int().min(0).max(365),
  indexationRate: z.coerce.number().min(-100).max(100),
  autoRenew: z.boolean(),
  renewalStatus: z.enum(["NOT_DUE", "UPCOMING", "PROPOSED", "ACCEPTED", "DECLINED"]),
  renewalNotes: z
    .string()
    .trim()
    .max(5_000)
    .optional()
    .transform((value) => value || null),
})

const purchaseOrderLineSchema = z.object({
  productId: optionalId,
  label: z.string().trim().min(2).max(200),
  quantity: z.coerce.number().int().min(1).max(1_000_000),
  unitPriceCents: z.coerce.number().int().min(0).max(2_000_000_000),
})

const purchaseOrderSchema = z
  .object({
    supplierId: id,
    projectId: optionalId,
    expectedAt: dateInput,
    notes: optionalText,
    productId: optionalId,
    label: z.string().trim().max(200).optional(),
    quantity: z.coerce.number().int().min(1).max(1_000_000).optional(),
    unitPriceCents: z.coerce.number().int().min(0).max(2_000_000_000).optional(),
    lines: z.array(purchaseOrderLineSchema).min(1).max(200).optional(),
  })
  .superRefine((value, context) => {
    if (!value.lines?.length && (!value.label || value.quantity == null || value.unitPriceCents == null))
      context.addIssue({ code: "custom", message: "Ajoutez au moins une ligne fournisseur" })
  })

const movementSchema = z.object({
  warehouseId: id,
  productId: id,
  projectId: optionalId,
  type: z.enum(["IN", "OUT", "RESERVE", "RELEASE", "CONSUME", "ADJUST"]),
  quantity: z.coerce
    .number()
    .int()
    .min(-1_000_000)
    .max(1_000_000)
    .refine((value) => value !== 0),
  unitCostCents: z.coerce.number().int().min(0).max(2_000_000_000).optional().nullable(),
  reference: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((value) => value || null),
  notes: optionalText,
})

const stockTransferSchema = z
  .object({
    fromWarehouseId: id,
    toWarehouseId: id,
    productId: id,
    quantity: z.coerce.number().int().min(1).max(1_000_000),
    unitCostCents: z.coerce.number().int().min(0).max(2_000_000_000).optional().nullable(),
    reference: z
      .string()
      .trim()
      .max(120)
      .optional()
      .transform((value) => value || null),
    notes: optionalText,
  })
  .refine((value) => value.fromWarehouseId !== value.toWarehouseId, {
    message: "Les dépôts de départ et d’arrivée doivent être différents",
    path: ["toWarehouseId"],
  })

const interventionMaterialSchema = z.object({
  interventionId: id,
  warehouseId: id,
  productId: id,
  quantity: z.coerce.number().int().min(1).max(100_000),
})

const customerOrderSchema = z.object({
  clientId: id,
  projectId: optionalId,
  expectedInstallationAt: dateInput,
  notes: optionalText,
  productId: optionalId,
  label: z.string().trim().min(2).max(200),
  quantity: z.coerce.number().positive().max(1_000_000),
  unitPriceCents: z.coerce.number().int().min(0).max(2_000_000_000),
  tvaRate: z.coerce.number().min(0).max(100).default(20),
  depositCents: z.coerce.number().int().min(0).max(2_000_000_000).default(0),
})

const quoteToCustomerOrderSchema = z.object({
  quoteId: id,
  depositRate: z.coerce.number().min(0).max(100).default(0),
  expectedInstallationAt: z
    .union([z.string().date(), z.literal("")])
    .optional()
    .transform((value) => (value ? new Date(`${value}T12:00:00.000Z`) : null)),
})

const goodsReceiptSchema = z.object({
  purchaseOrderId: id,
  purchaseOrderLineId: id,
  warehouseId: id,
  quantity: z.coerce.number().int().min(1).max(1_000_000),
  rejectedQuantity: z.coerce.number().int().min(0).max(1_000_000).default(0),
  issueType: z.enum(["DAMAGED", "MISSING", "WRONG_ITEM", "QUALITY", "OTHER"]).optional().nullable(),
  issueNotes: optionalText,
  supplierReference: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((value) => value || null),
  notes: optionalText,
})

const purchaseAcknowledgementSchema = z.object({
  purchaseOrderId: id,
  supplierReference: z.string().trim().min(1).max(120),
  confirmedExpectedAt: z
    .string()
    .trim()
    .min(1)
    .refine(value => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
      const date = new Date(`${value}T00:00:00Z`)
      return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
    }, "Date fournisseur invalide"),
})

const purchaseIssueResolutionSchema = z.object({
  issueId: id,
  resolution: z.enum(["REPLACEMENT", "CREDIT", "ACCEPTED", "OTHER"]),
  notes: z.string().trim().min(2).max(2_000),
})

const supplierReturnSchema = z.object({
  purchaseOrderId: id,
  purchaseOrderLineId: id,
  warehouseId: id,
  quantity: z.coerce.number().int().min(1).max(1_000_000),
  reason: z.string().trim().min(2).max(500),
  notes: optionalText,
})

const reservationSchema = z.object({
  warehouseId: id,
  productId: id,
  projectId: optionalId,
  customerOrderId: optionalId,
  quantity: z.coerce.number().int().min(1).max(1_000_000),
  notes: optionalText,
})

const deliveryNoteSchema = z.object({
  customerOrderId: id,
  customerOrderLineId: id,
  quantity: z.coerce.number().positive().max(1_000_000),
  recipientName: z
    .string()
    .trim()
    .max(160)
    .optional()
    .transform((value) => value || null),
  notes: optionalText,
})

const deliverySignatureSchema = z.object({
  deliveryNoteId: id,
  recipientName: z.string().trim().min(2, "Le nom du réceptionnaire est requis").max(160),
  customerApproval: z.literal(true, { error: "L’accord du réceptionnaire doit être confirmé" }),
})

const customerOrderInvoiceSchema = z.object({
  customerOrderId: id,
  mode: z.enum(["DEPOSIT", "BALANCE"]).default("BALANCE"),
  dueDays: z.coerce.number().int().min(0).max(365).default(30),
})

function revalidateOperations() {
  revalidatePath("/dashboard/operations")
  revalidatePath("/dashboard/clients")
  revalidatePath("/dashboard/projets")
}

function assertInventoryClaim(claimed: { count: number }) {
  if (claimed.count !== 1) throw new Error("Le stock a changé pendant l’opération. Rechargez la page puis réessayez.")
}

async function getServiceRoutingRecommendation(companyId: string, ticketId: string) {
  const activeStatuses = ["OPEN", "QUALIFIED", "PLANNED", "WAITING"]
  const [ticket, members] = await Promise.all([
    prisma.serviceTicket.findFirst({
      where: { id: ticketId, companyId },
      select: {
        id: true,
        status: true,
        type: true,
        priority: true,
        requiredSkill: true,
        territory: true,
        site: { select: { city: true } },
        equipment: { select: { category: true } },
      },
    }),
    prisma.membership.findMany({
      where: { companyId, status: "ACTIVE", role: { in: ["OWNER", "ADMIN", "SERVICE", "TECHNICIAN"] } },
      select: {
        id: true,
        role: true,
        serviceAvailable: true,
        serviceTicketCapacity: true,
        serviceSkills: true,
        serviceTerritories: true,
        _count: { select: { assignedTickets: { where: { id: { not: ticketId }, status: { in: activeStatuses } } } } },
      },
    }),
  ])
  if (!ticket) throw new Error("Ticket introuvable")
  if (["RESOLVED", "CLOSED", "MERGED"].includes(ticket.status)) throw new Error("Un ticket résolu, clos ou fusionné ne peut pas être réaffecté")
  const requiredSkill = ticket.requiredSkill || ticket.equipment?.category || ticket.type
  const territory = ticket.territory || ticket.site?.city || null
  const recommendation = recommendServiceAssignee(
    { requiredSkill, territory, priority: ticket.priority },
    members.map((member) => ({
      id: member.id,
      role: member.role,
      available: member.serviceAvailable,
      capacity: member.serviceTicketCapacity,
      activeTickets: member._count.assignedTickets,
      skills: serviceRoutingTags(member.serviceSkills),
      territories: serviceRoutingTags(member.serviceTerritories),
    })),
  )
  return { recommendation, requiredSkill, territory }
}

function serviceMacroText(html: string) {
  return html
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/p>\s*<p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/gi, "'")
    .trim()
}

function renderServiceMacro(value: string, variables: Record<string, string>) {
  return Object.entries(variables).reduce((rendered, [name, replacement]) => rendered.replaceAll(`{{${name}}}`, replacement), value)
}

function schedulingFailure(error: unknown): { success: false; error: string } {
  if (error instanceof SchedulingError) return { success: false, error: error.message }
  if (error && typeof error === "object" && "code" in error && error.code === "P2034") return { success: false, error: "Le planning a changé. Rechargez puis réessayez ; votre saisie est conservée." }
  throw error
}

export async function getOperationsDashboard() {
  return withAuth(async ({ companyId, role, agencyIds }) => {
    const canReadFinance = hasPermission(role, "finance.read")
    const scope = operationsDashboardScope(companyId, agencyIds)
    const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { serviceTimezone: true } })
    const now = new Date()
    const [
      agencies,
      sites,
      stock,
      warehouses,
      purchaseOrders,
      equipments,
      tickets,
      interventions,
      contracts,
      projects,
      members,
      customerOrders,
      goodsReceipts,
      reservations,
      deliveryNotes,
      stockTransfers,
      purchaseSummary,
    ] = await Promise.all([
      prisma.agency.findMany({
        where: { ...scope.agency, active: true },
        select: { id: true, code: true, name: true, isDefault: true },
        orderBy: [{ isDefault: "desc" }, { name: "asc" }],
      }),
      prisma.customerSite.findMany({
        where: scope.site,
        include: { client: { select: { name: true } }, _count: { select: { equipments: { where: scope.equipment }, serviceTickets: { where: scope.ticket } } } },
        orderBy: { updatedAt: "desc" },
        take: 100,
      }),
      readStockDirectory(companyId, agencyIds, { search: "", page: 1 }),
      prisma.warehouse.findMany({
        where: { ...scope.warehouse, active: true },
        orderBy: { name: "asc" },
      }),
      readPurchaseOrderDirectory(companyId, agencyIds, { search: "", page: 1, status: "ALL" }),
      prisma.equipment.findMany({
        where: scope.equipment,
        include: { site: { include: { client: { select: { name: true } } } }, product: { select: { label: true, sku: true } } },
        orderBy: { updatedAt: "desc" },
        take: 200,
      }),
      prisma.serviceTicket.findMany({
        where: { ...scope.ticket, status: { not: "MERGED" } },
        include: {
          client: { select: { name: true } },
          site: { select: { label: true, agencyId: true } },
          equipment: { select: { label: true } },
          assignedMembership: { include: { user: { select: { name: true, email: true } } } },
          _count: { select: { interventions: { where: scope.intervention } } },
        },
        orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
        take: 200,
      }),
      prisma.fieldIntervention.findMany({
        where: scope.intervention,
        include: {
          site: { include: { client: { select: { name: true } } } },
          ticket: { select: { number: true } },
          assignedMembership: { include: { user: { select: { name: true, email: true } } } },
          files: { orderBy: { createdAt: "asc" }, select: { id: true, name: true, mimeType: true, size: true, kind: true, createdAt: true } },
          stockMovements: {
            where: { ...scope.stockMovement, type: "OUT" },
            include: { product: { select: { label: true, sku: true } }, warehouse: { select: { name: true } } },
            orderBy: { happenedAt: "asc" },
          },
          expenses: { where: scope.expense, select: { id: true, label: true, amountCents: true, status: true }, orderBy: { createdAt: "asc" } },
          reservations: { where: { companyId }, orderBy: { createdAt: "asc" } },
        },
        orderBy: { scheduledStart: "asc" },
        take: 200,
      }),
      prisma.maintenanceContract.findMany({
        where: scope.contract,
        include: {
          client: { select: { name: true } },
          site: { select: { label: true, agencyId: true } },
          recurringInvoice: { select: { id: true, isActive: true } },
          renewedFrom: { select: { id: true, number: true } },
          renewalProposals: { where: { companyId, client: { companyId } }, select: { id: true, number: true, status: true }, orderBy: { createdAt: "desc" }, take: 1 },
          _count: { select: { equipments: { where: { equipment: scope.equipment } }, renewedContracts: { where: scope.contract } } },
        },
        orderBy: [{ endDate: "asc" }, { nextVisitAt: "asc" }],
        take: 200,
      }),
      prisma.project.findMany({
        where: { ...scope.project, status: "ACTIVE" },
        select: { id: true, name: true, clientId: true, siteId: true, agencyId: true },
        orderBy: { name: "asc" },
        take: 300,
      }),
      prisma.membership.findMany({
        where: { companyId, status: "ACTIVE" },
        include: { user: { select: { name: true, email: true } }, agencyMemberships: { where: { agency: scope.agency }, select: { agencyId: true, isPrimary: true } } },
        orderBy: { createdAt: "asc" },
      }),
      prisma.customerOrder.findMany({
        where: scope.customerOrder,
        include: {
          client: { select: { name: true } },
          project: { select: { name: true, agencyId: true } },
          lines: true,
          invoices: canReadFinance ? { where: scope.invoice, select: { id: true, type: true, status: true } } : false,
          _count: { select: { deliveryNotes: { where: scope.deliveryNote }, stockReservations: { where: scope.reservation } } },
        },
        orderBy: { createdAt: "desc" },
        take: 150,
      }),
      prisma.goodsReceipt.findMany({
        where: scope.goodsReceipt,
        include: {
          purchaseOrder: { include: { supplier: { select: { name: true } } } },
          warehouse: { select: { name: true, agencyId: true } },
          lines: { where: scope.receiptLine, include: { product: { select: { sku: true, label: true } }, issues: { where: scope.purchaseIssue } } },
        },
        orderBy: { receivedAt: "desc" },
        take: 100,
      }),
      prisma.stockReservation.findMany({
        where: { ...scope.reservation, status: "ACTIVE" },
        include: {
          warehouse: { select: { name: true, agencyId: true } },
          product: { select: { sku: true, label: true } },
          project: { select: { name: true, agencyId: true } },
          customerOrder: { select: { number: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 150,
      }),
      prisma.deliveryNote.findMany({
        where: scope.deliveryNote,
        include: { customerOrder: { include: { client: { select: { name: true } }, project: { select: { agencyId: true } } } }, lines: true },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      prisma.stockTransfer.findMany({
        where: scope.stockTransfer,
        include: {
          fromWarehouse: { select: { name: true, agencyId: true } },
          toWarehouse: { select: { name: true, agencyId: true } },
          product: { select: { sku: true, label: true } },
        },
        orderBy: { happenedAt: "desc" },
        take: 100,
      }),
      readPurchaseOrderSummary(companyId, agencyIds),
    ])
    return {
      generatedAt: now.toISOString(),
      timeZone: company.serviceTimezone,
      tomorrowStart: calendarPeriods(now, company.serviceTimezone).tomorrowStart.toISOString(),
      agencies,
      sites,
      stock,
      warehouses,
      purchaseOrders: purchaseOrders.items,
      purchaseSummary,
      equipments,
      tickets,
      interventions,
      contracts: contracts.map(contract => ({ ...contract,
        canManageRenewal: hasPermission(role, "service.write") && !isPublicReadOnlyDemo(),
        canCreateRenewalProposal: hasPermission(role, "sales.write") && !isPublicReadOnlyDemo(),
        canRenew: hasPermission(role, "service.write") && hasPermission(role, "operations.write") && (!(contract.autoInvoice || contract.recurringInvoice?.isActive) || hasPermission(role, "finance.write")) && !isPublicReadOnlyDemo(),
      })),
      projects,
      members,
      customerOrders: customerOrders.map(order => ({
        ...order,
        billingStatus: canReadFinance ? order.billingStatus : null,
        invoices: canReadFinance ? order.invoices : [],
        _count: { ...order._count, invoices: canReadFinance ? order.invoices.length : null },
      })),
      goodsReceipts,
      reservations,
      deliveryNotes,
      stockTransfers,
      canApprovePurchases: hasPermission(role, "purchases.approve"),
      canManagePurchases: hasPermission(role, "operations.write") && !isPublicReadOnlyDemo(),
      canBillOrders: hasPermission(role, "finance.write") && !isPublicReadOnlyDemo(),
      canAutomateMaintenanceBilling: hasPermission(role, "finance.write") && !isPublicReadOnlyDemo(),
    }
  }, "operations.read")
}

export async function getServiceTicketDetail(ticketId: string) {
  return withAuth(async ({ companyId, role, agencyIds }) => {
    const parsedId = id.safeParse(ticketId)
    if (!parsedId.success) return null
    const scope = operationsDashboardScope(companyId, agencyIds)
    const ticketScope = { ...scope.ticket, ...(agencyIds === null ? {} : { site: scope.site }) }
    const noteScope = { companyId, OR: [{ authorMembershipId: null }, { authorMembership: { companyId } }] }
    const diagnosticScope = { companyId, AND: [
      { OR: [{ performedByMembershipId: null }, { performedByMembership: { companyId } }] },
      { OR: [{ guideId: null }, { guide: { companyId } }] },
    ] }
    const threadScope = { companyId, AND: [
      { OR: [{ channelId: null }, { channel: { companyId } }] },
      { OR: [{ clientId: null }, { client: { companyId } }] },
      { OR: [{ contactId: null }, { contact: { client: { companyId } } }] },
      { OR: [{ leadCaptureId: null }, { leadCapture: { companyId } }] },
    ] }
    const messages = { where: { companyId }, select: { ...messageReadSelect,
      events: { ...messageReadSelect.events, where: { companyId } },
    }, orderBy: { createdAt: "asc" as const }, take: 200 }
    const [ticket, members, company, serviceMacros, diagnosticGuides] = await Promise.all([
      prisma.serviceTicket.findFirst({
        where: { id: parsedId.data, ...ticketScope },
        include: {
          client: {
            include: {
              contacts: { orderBy: [{ isPrimary: "desc" }, { lastName: "asc" }] },
              emailThreads: {
                where: { serviceTicketId: null, ...threadScope },
                select: { id: true, subject: true, lastMessageAt: true, unreadCount: true },
                orderBy: { lastMessageAt: "desc" },
                take: 50,
              },
            },
          },
          site: true,
          equipment: true,
          assignedMembership: { include: { user: { select: { name: true, email: true } } } },
          mergedTickets: {
            where: ticketScope,
            include: {
              interventions: {
                where: scope.intervention,
                include: {
                  assignedMembership: { include: { user: { select: { name: true, email: true } } } },
                  files: { orderBy: { createdAt: "asc" } },
                  reservations: { where: { companyId }, orderBy: { createdAt: "desc" } },
                },
                orderBy: { scheduledStart: "desc" },
              },
              emailThreads: {
                where: threadScope,
                select: { id: true, subject: true, lastMessageAt: true, unreadCount: true, messages },
                orderBy: { lastMessageAt: "asc" },
              },
              notes: { where: noteScope, include: { authorMembership: { include: { user: { select: { name: true, email: true } } } } }, orderBy: { createdAt: "asc" }, take: 200 },
              diagnostics: { where: diagnosticScope, include: { performedByMembership: { include: { user: { select: { name: true, email: true } } } } }, orderBy: { completedAt: "desc" }, take: 50 },
            },
            orderBy: { mergedAt: "asc" },
          },
          interventions: {
            where: scope.intervention,
            include: {
              assignedMembership: { include: { user: { select: { name: true, email: true } } } },
              files: { orderBy: { createdAt: "asc" } },
              reservations: { where: { companyId }, orderBy: { createdAt: "desc" } },
            },
            orderBy: { scheduledStart: "desc" },
          },
          emailThreads: {
            where: threadScope,
            select: { id: true, subject: true, lastMessageAt: true, unreadCount: true, messages },
            orderBy: { lastMessageAt: "asc" },
          },
          notes: { where: noteScope, include: { authorMembership: { include: { user: { select: { name: true, email: true } } } } }, orderBy: { createdAt: "asc" }, take: 200 },
          diagnostics: { where: diagnosticScope, include: { performedByMembership: { include: { user: { select: { name: true, email: true } } } } }, orderBy: { completedAt: "desc" }, take: 50 },
        },
      }),
      prisma.membership.findMany({ where: { companyId, status: "ACTIVE" }, include: { user: { select: { name: true, email: true } } }, orderBy: { createdAt: "asc" } }),
      prisma.company.findUnique({
        where: { id: companyId },
        select: {
          name: true,
          serviceTimezone: true,
          serviceDayStart: true,
          serviceDayEnd: true,
          serviceWorkdays: true,
          serviceHolidays: true,
          serviceFirstResponseHours: true,
          serviceResolutionHours: true,
        },
      }),
      prisma.emailTemplate.findMany({
        where: { companyId, category: "SERVICE", status: "ACTIVE" },
        select: { id: true, name: true, subject: true, bodyHtml: true },
        orderBy: { name: "asc" },
        take: 200,
      }),
      prisma.serviceDiagnosticGuide.findMany({ where: { companyId, status: "ACTIVE" }, orderBy: [{ priority: "desc" }, { updatedAt: "desc" }], take: 200 }),
    ])
    if (!ticket) return null
    const mergedInto = ticket.mergedIntoTicketId
      ? await prisma.serviceTicket.findFirst({
          where: { id: ticket.mergedIntoTicketId, ...ticketScope },
          select: { id: true, number: true, title: true },
        })
      : null
    if (ticket.mergedIntoTicketId && !mergedInto) return null
    const duplicateRecords =
      ticket.status === "MERGED"
        ? []
        : await prisma.serviceTicket.findMany({
            where: {
              ...ticketScope,
              clientId: ticket.clientId,
              id: { not: ticket.id },
              status: { not: "MERGED" },
              mergedIntoTicketId: null,
              requestedAt: {
                gte: new Date(ticket.requestedAt.getTime() - 90 * 24 * 60 * 60 * 1_000),
                lte: new Date(ticket.requestedAt.getTime() + 90 * 24 * 60 * 60 * 1_000),
              },
            },
            select: { id: true, clientId: true, siteId: true, equipmentId: true, number: true, title: true, description: true, type: true, status: true, requestedAt: true },
            orderBy: { requestedAt: "desc" },
            take: 200,
          })
    const duplicateCandidates = duplicateRecords
      .flatMap((candidate) => {
        const match = scoreServiceDuplicate(ticket, candidate)
        return match ? [{ ...candidate, ...match }] : []
      })
      .sort((left, right) => right.score - left.score || left.requestedAt.getTime() - right.requestedAt.getTime())
      .slice(0, 10)
    const mergedTicketSummaries = ticket.mergedTickets.map((mergedTicket) => ({
      id: mergedTicket.id,
      number: mergedTicket.number,
      title: mergedTicket.title,
      previousStatus: mergedTicket.preMergeStatus,
      requestedAt: mergedTicket.requestedAt,
      mergedAt: mergedTicket.mergedAt,
      interventionCount: mergedTicket.interventions.length,
      conversationCount: mergedTicket.emailThreads.length,
      noteCount: mergedTicket.notes.length,
    }))
    const interventions = [
      ...ticket.interventions.map((item) => ({ ...item, mergedFrom: null })),
      ...ticket.mergedTickets.flatMap((source) => source.interventions.map((item) => ({ ...item, mergedFrom: { id: source.id, number: source.number } }))),
    ].sort((left, right) => right.scheduledStart.getTime() - left.scheduledStart.getTime())
    const emailThreads = [
      ...ticket.emailThreads.map((item) => ({ ...item, mergedFrom: null })),
      ...ticket.mergedTickets.flatMap((source) => source.emailThreads.map((item) => ({ ...item, mergedFrom: { id: source.id, number: source.number } }))),
    ].sort((left, right) => left.lastMessageAt.getTime() - right.lastMessageAt.getTime())
    const notes = [
      ...ticket.notes.map((item) => ({ ...item, mergedFrom: null })),
      ...ticket.mergedTickets.flatMap((source) => source.notes.map((item) => ({ ...item, mergedFrom: { id: source.id, number: source.number } }))),
    ].sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
    const diagnosticView = (item: (typeof ticket.diagnostics)[number], mergedFrom: { id: string; number: string } | null) => {
      const snapshot = item.guideSnapshot && typeof item.guideSnapshot === "object" && !Array.isArray(item.guideSnapshot) ? (item.guideSnapshot as Record<string, unknown>) : {}
      return {
        id: item.id,
        guideName: typeof snapshot.name === "string" ? snapshot.name : "Guide archivé",
        steps: diagnosticSteps(snapshot.steps),
        completedStepIds: diagnosticStringList(item.completedStepIds),
        warrantyStatus: item.warrantyStatus,
        symptom: item.symptom,
        outcome: item.outcome,
        recommendedAction: item.recommendedAction,
        completedAt: item.completedAt,
        performedBy: item.performedByMembership?.user.name || item.performedByMembership?.user.email || "Membre",
        mergedFrom,
      }
    }
    const diagnostics = [
      ...ticket.diagnostics.map((item) => diagnosticView(item, null)),
      ...ticket.mergedTickets.flatMap((source) => source.diagnostics.map((item) => diagnosticView(item, { id: source.id, number: source.number }))),
    ].sort((left, right) => right.completedAt.getTime() - left.completedAt.getTime())
    const guides = diagnosticGuides
      .map((guide) => {
        const match = scoreDiagnosticGuide(guide, ticket)
        return {
          id: guide.id,
          name: guide.name,
          productCategory: guide.productCategory,
          manufacturer: guide.manufacturer,
          modelPattern: guide.modelPattern,
          symptom: guide.symptom,
          steps: diagnosticSteps(guide.steps),
          resolutionHints: diagnosticStringList(guide.resolutionHints),
          warrantyInstructions: guide.warrantyInstructions,
          outOfWarrantyInstructions: guide.outOfWarrantyInstructions,
          suggested: Boolean(match),
          score: match?.score || 0,
          reasons: match?.reasons || [],
        }
      })
      .filter((guide) => guide.steps.length > 0)
      .sort((left, right) => Number(right.suggested) - Number(left.suggested) || right.score - left.score || left.name.localeCompare(right.name, "fr"))
    const warrantyStatus = equipmentWarrantyStatus(ticket.equipment?.warrantyUntil)
    const policy = serviceSlaPolicy(company)
    const contact = ticket.client.contacts[0]
    const variables = {
      "ticket.number": ticket.number,
      "ticket.title": ticket.title,
      "client.name": ticket.client.name,
      "contact.firstName": contact?.firstName || "",
      "contact.lastName": contact?.lastName || "",
      "assigned.name": ticket.assignedMembership?.user.name || ticket.assignedMembership?.user.email || "notre équipe",
      "company.name": company?.name || "notre entreprise",
    }
    const macros = serviceMacros.map((macro) => ({
      id: macro.id,
      name: macro.name,
      subject: renderServiceMacro(macro.subject, variables),
      bodyText: renderServiceMacro(serviceMacroText(macro.bodyHtml), variables),
    }))
    return {
      ...ticket,
      client: clientWithAccessibleMetrics(ticket.client, { role, agencyIds }),
      mergedInto,
      mergedTickets: mergedTicketSummaries,
      interventions,
      emailThreads,
      notes,
      diagnostics,
      diagnosticGuides: guides,
      warrantyStatus,
      duplicateCandidates,
      sla: { resolution: serviceResolutionTarget(ticket, policy), firstResponse: serviceFirstResponseTarget(ticket, policy), policy },
      macros,
      members: members.map((member) => ({ id: member.id, name: member.user.name || member.user.email || "Membre" })),
    }
  }, "service.read")
}

export async function getFieldInterventionDetail(interventionId: string) {
  return withAuth(async ({ companyId, role, agencyIds }) => {
    const parsedId = id.safeParse(interventionId)
    if (!parsedId.success) return null
    const scope = operationsDashboardScope(companyId, agencyIds)
    const intervention = await prisma.fieldIntervention.findFirst({
      where: { id: parsedId.data, ...scope.intervention },
      include: {
        site: { include: { client: { include: { contacts: { orderBy: [{ isPrimary: "desc" }, { lastName: "asc" }] } } } } },
        ticket: { select: { id: true, number: true, title: true } },
        project: { select: { id: true, name: true } },
        maintenanceContract: { select: { id: true, number: true, label: true } },
        assignedMembership: { include: { user: { select: { name: true, email: true } } } },
        files: { orderBy: { createdAt: "asc" } },
        stockMovements: { where: scope.stockMovement, include: { product: { select: { id: true, label: true } }, warehouse: { select: { id: true, name: true } } }, orderBy: { happenedAt: "desc" } },
        expenses: { where: scope.expense, orderBy: { date: "desc" } },
        reservations: { where: { companyId }, orderBy: { createdAt: "desc" } },
      },
    })
    return intervention ? { ...intervention, site: { ...intervention.site, client: clientWithAccessibleMetrics(intervention.site.client, { role, agencyIds }) } } : null
  }, "operations.read")
}

export async function getEquipmentDetail(equipmentId: string) {
  return withAuth(async ({ companyId, role, agencyIds }) => {
    const parsedId = id.safeParse(equipmentId)
    if (!parsedId.success) return null
    const scope = operationsDashboardScope(companyId, agencyIds)
    const equipment = await prisma.equipment.findFirst({
      where: { id: parsedId.data, ...scope.equipment },
      include: {
        site: { include: { client: { include: { contacts: { orderBy: [{ isPrimary: "desc" }, { lastName: "asc" }] } } } } },
        product: { select: { id: true, sku: true, label: true, manufacturer: true, supplier: { select: { id: true, name: true } } } },
        tickets: {
          where: { ...scope.ticket, ...(agencyIds === null ? {} : { site: scope.site }) },
          select: { id: true, number: true, title: true, description: true, status: true, priority: true, requestedAt: true, assignedMembership: { include: { user: { select: { name: true, email: true } } } }, _count: { select: { interventions: { where: scope.intervention } } } },
          orderBy: { requestedAt: "desc" },
        },
        maintenanceContracts: { where: { contract: scope.contract }, include: { contract: { select: { id: true, number: true, label: true, status: true, frequency: true, nextVisitAt: true } } }, orderBy: { contract: { createdAt: "desc" } } },
      },
    })
    return equipment ? { ...equipment, canManage: hasPermission(role, "operations.write"), site: { ...equipment.site, client: clientWithAccessibleMetrics(equipment.site.client, { role, agencyIds }) } } : null
  }, "operations.read")
}

export async function getSupplierDetail(supplierId: string) {
  return withAuth(async ({ companyId, role, agencyIds }) => {
    const parsedId = id.safeParse(supplierId)
    if (!parsedId.success) return null
    return prisma.$transaction(async tx => {
      const supplier = await tx.supplier.findFirst({ where: { id: parsedId.data, companyId } })
      if (!supplier) return null
      const scope = { companyId, agencyIds, supplierId: supplier.id }
      const query = supplierHistoryQuery.parse({})
      const metrics = await readSupplierMetrics(tx, scope)
      const products = await readSupplierProducts(tx, scope, query)
      const purchaseOrders = await readSupplierOrders(tx, scope, query)
      const supplierReturns = await readSupplierReturns(tx, scope, query)
      return { ...supplier, metrics, products, purchaseOrders, supplierReturns, canManage: hasPermission(role, "operations.write") }
    }, { isolationLevel: "Serializable" })
  }, "operations.read")
}

export async function getPurchaseOrderDetail(purchaseOrderId: string) {
  return withAuth(async ({ companyId, role, agencyIds }) => {
    const parsedId = id.safeParse(purchaseOrderId)
    if (!parsedId.success) return null
    const scope = operationsDashboardScope(companyId, agencyIds)
    const order = await prisma.purchaseOrder.findFirst({
      where: { id: parsedId.data, ...scope.purchaseOrder },
      include: {
        supplier: true,
        project: { select: { id: true, name: true, client: { select: { id: true, name: true } } } },
        approvedByMembership: { include: { user: { select: { name: true, email: true } } } },
        lines: {
          include: {
            product: true,
            receiptLines: { where: scope.receiptLine, include: { goodsReceipt: { include: { warehouse: true } }, issues: { where: scope.purchaseIssue } } },
            supplierReturns: { where: scope.supplierReturn, include: { warehouse: true, product: true } },
          },
          orderBy: { order: "asc" },
        },
        goodsReceipts: { where: scope.goodsReceipt, include: { warehouse: true, lines: { where: scope.receiptLine, include: { product: true, issues: { where: scope.purchaseIssue } } } }, orderBy: { receivedAt: "desc" } },
        issues: { where: scope.purchaseIssue, include: { product: true, purchaseOrderLine: true }, orderBy: { createdAt: "desc" } },
        supplierReturns: { where: scope.supplierReturn, include: { product: true, warehouse: true }, orderBy: { shippedAt: "desc" } },
      },
    })
    return order ? { ...order, draftRevision: purchaseDraftRevision(order), canManagePurchases: hasPermission(role, "operations.write") && !isPublicReadOnlyDemo(), canApprovePurchases: hasPermission(role, "purchases.approve") } : null
  }, "operations.read")
}

export async function getHelpDeskDashboard(input: unknown = {}) {
  return withAuth(async ({ companyId }) => {
    const parsedFilters = z
      .object({
        status: z.enum(["ACTIVE", "OPEN", "QUALIFIED", "PLANNED", "WAITING", "RESOLVED", "CLOSED", "ALL"]).default("ACTIVE"),
        priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT", "ALL"]).default("ALL"),
        assignedMembershipId: z.union([id, z.literal("ALL"), z.literal("UNASSIGNED")]).default("ALL"),
      })
      .safeParse(input)
    const filters = parsedFilters.success ? parsedFilters.data : { status: "ACTIVE" as const, priority: "ALL" as const, assignedMembershipId: "ALL" as const }
    const activeStatuses = ["OPEN", "QUALIFIED", "PLANNED", "WAITING"]
    const [tickets, company] = await Promise.all([
      prisma.serviceTicket.findMany({
        where: {
          companyId,
          status: filters.status === "ACTIVE" ? { in: activeStatuses } : filters.status === "ALL" ? { not: "MERGED" } : filters.status,
          priority: filters.priority === "ALL" ? undefined : filters.priority,
          assignedMembershipId: filters.assignedMembershipId === "ALL" ? undefined : filters.assignedMembershipId === "UNASSIGNED" ? null : filters.assignedMembershipId,
        },
        include: {
          client: { select: { id: true, name: true } },
          site: { select: { id: true, label: true, city: true } },
          equipment: { select: { id: true, label: true, warrantyUntil: true } },
          assignedMembership: { include: { user: { select: { name: true, email: true } } } },
          _count: { select: { interventions: true } },
        },
        orderBy: [{ priority: "desc" }, { dueAt: "asc" }, { requestedAt: "asc" }],
        take: 500,
      }),
      prisma.company.findUnique({
        where: { id: companyId },
        select: {
          serviceTimezone: true,
          serviceDayStart: true,
          serviceDayEnd: true,
          serviceWorkdays: true,
          serviceHolidays: true,
          serviceFirstResponseHours: true,
          serviceResolutionHours: true,
        },
      }),
    ])
    const members = await prisma.membership.findMany({
      where: { companyId, status: "ACTIVE" },
      include: { user: { select: { name: true, email: true } }, _count: { select: { assignedTickets: { where: { status: { in: activeStatuses } } } } } },
      orderBy: { createdAt: "asc" },
    })
    return {
      filters,
      members: members.map((member) => ({
        id: member.id,
        name: member.user.name || member.user.email || "Membre",
        openTickets: member._count.assignedTickets,
        capacity: member.serviceTicketCapacity,
        available: member.serviceAvailable,
      })),
      tickets: tickets.map((ticket) => {
        const policy = serviceSlaPolicy(company)
        const resolution = serviceResolutionTarget(ticket, policy)
        const firstResponse = serviceFirstResponseTarget(ticket, policy)
        return { ...ticket, targetAt: resolution.targetAt, slaSource: resolution.source, firstResponseTargetAt: firstResponse.targetAt }
      }),
    }
  }, "service.read")
}

export async function createCustomerSite(input: unknown) {
  return withAuth(async ({ companyId }) => {
    const data = siteSchema.parse(input)
    const [client, requestedAgency, defaultAgency] = await Promise.all([
      prisma.client.findFirst({ where: { id: data.clientId, companyId }, select: { id: true } }),
      data.agencyId ? prisma.agency.findFirst({ where: { id: data.agencyId, companyId, active: true }, select: { id: true } }) : null,
      data.agencyId ? null : prisma.agency.findFirst({ where: { companyId, isDefault: true, active: true }, select: { id: true } }),
    ])
    if (!client) throw new AssetLifecycleError("Client introuvable")
    if (data.agencyId && !requestedAgency) throw new AssetLifecycleError("Agence introuvable ou inactive")
    const site = await prisma.customerSite.create({ data: { companyId, ...data, agencyId: requestedAgency?.id || defaultAgency?.id || null } })
    revalidateOperations()
    return { success: true as const, id: site.id }
  }, "crm.write")
}

export async function createSupplier(input: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    const data = supplierSchema.parse(input)
    let supplier
    try { supplier = await prisma.supplier.create({ data: { companyId, ...data } }) } catch (error) {
      if (isUniqueConstraintConflict(error, "name") || isUniqueConstraintConflict(error, "code")) throw new Error("Ce nom ou ce code fournisseur existe déjà.")
      throw error
    }
    await logAction({ userId, action: "CREATE_SUPPLIER", resource: "SUPPLIER", resourceId: supplier.id, payload: { fields: Object.keys(data) } })
    revalidateOperations()
    return { success: true as const, id: supplier.id }
  }, "operations.write")
}

export async function createProduct(input: unknown) {
  return withAuth(async ({ companyId }) => {
    const data = productSchema.parse(input)
    const product = await prisma.$transaction(async tx => {
      if (data.supplierId) await lockActiveSupplier(tx, companyId, data.supplierId)
      return tx.product.create({ data: { companyId, ...data } })
    })
    revalidateOperations()
    return { success: true as const, id: product.id }
  }, "operations.write")
}

export async function createWarehouse(input: unknown) {
  return withAuth(async ({ companyId }) => {
    const data = warehouseSchema.parse(input)
    const agency = data.agencyId
      ? await prisma.agency.findFirst({ where: { id: data.agencyId, companyId, active: true }, select: { id: true } })
      : await prisma.agency.findFirst({ where: { companyId, isDefault: true, active: true }, select: { id: true } })
    if (data.agencyId && !agency) throw new Error("Agence introuvable ou inactive")
    const warehouse = await prisma.warehouse.create({ data: { companyId, ...data, agencyId: agency?.id || null } })
    revalidateOperations()
    return { success: true as const, id: warehouse.id }
  }, "operations.write")
}

export async function createEquipment(input: unknown) {
  return withAuth(async ({ companyId, agencyIds }) => {
    const data = equipmentSchema.parse(input)
    const equipment = await prisma.$transaction(async tx => {
      await lockActiveSite(tx, companyId, data.siteId, agencyIds)
      if (data.productId) await lockActiveAssetProduct(tx, companyId, data.productId)
      return tx.equipment.create({ data: { companyId, ...data } })
    }).catch(error => {
      if (isUniqueConstraintConflict(error, "serialNumber")) throw new AssetLifecycleError("Ce numéro de série existe déjà dans la société.")
      throw error
    })
    revalidateOperations()
    return { success: true as const, id: equipment.id }
  }, "operations.write")
}

export async function createServiceTicket(input: unknown) {
  return withAuth(async ({ companyId, userId, agencyIds }) => {
    const data = ticketSchema.parse(input)
    const client = await prisma.client.findFirst({ where: { id: data.clientId, companyId }, select: { id: true } })
    if (!client) throw new AssetLifecycleError("Client introuvable")
    if (data.siteId && !(await prisma.customerSite.findFirst({ where: { id: data.siteId, companyId, clientId: data.clientId }, select: { id: true } })))
      throw new AssetLifecycleError("Le site n'appartient pas à ce client")
    const equipment = data.equipmentId
      ? await prisma.equipment.findFirst({ where: { id: data.equipmentId, companyId }, select: { id: true, siteId: true, site: { select: { clientId: true } } } })
      : null
    if (data.equipmentId && !equipment) throw new AssetLifecycleError("Équipement introuvable")
    if (equipment && equipment.site.clientId !== data.clientId) throw new AssetLifecycleError("L’équipement n’appartient pas à ce client")
    if (equipment && data.siteId && equipment.siteId !== data.siteId) throw new AssetLifecycleError("L’équipement n’appartient pas au site sélectionné")
    if (data.assignedMembershipId && !(await prisma.membership.findFirst({ where: { id: data.assignedMembershipId, companyId, status: "ACTIVE" }, select: { id: true } })))
      throw new AssetLifecycleError("Intervenant introuvable")
    const siteId = data.siteId || equipment?.siteId || null
    const prefix = buildYearlyDocumentPrefix("SAV-", "SAV-")
    const ticket = await withDocumentNumberRetry(
      async () => {
    const last = await readCompanyDocumentNumbers(() => prisma.serviceTicket.findMany({ where: { companyId, number: { startsWith: prefix } }, select: { number: true } }))
        return prisma.$transaction(async tx => {
          if (!await tx.client.findFirst({ where: { id: data.clientId, companyId }, select: { id: true } })) throw new AssetLifecycleError("Client introuvable")
          if (siteId) {
            const site = await lockActiveSite(tx, companyId, siteId, agencyIds)
            if (site.clientId !== data.clientId) throw new AssetLifecycleError("Le site n'appartient pas à ce client")
            if (equipment) await lockActiveEquipment(tx, companyId, siteId, [equipment.id], agencyIds)
          }
          return tx.serviceTicket.create({ data: { companyId, ...data, siteId, number: nextDocumentNumber(last, prefix) } })
        })
      },
      { label: "le ticket SAV" },
    )
    let assignedMembershipId = ticket.assignedMembershipId
    if (!assignedMembershipId) {
      const routing = await getServiceRoutingRecommendation(companyId, ticket.id)
      if (routing.recommendation) {
        assignedMembershipId = routing.recommendation.membershipId
        await prisma.serviceTicket.update({
          where: { id: ticket.id },
          data: {
            assignedMembershipId,
            requiredSkill: ticket.requiredSkill || routing.requiredSkill,
            territory: ticket.territory || routing.territory,
            routingReason: routing.recommendation.reason,
            routedAt: new Date(),
          },
        })
      }
    }
    await logAction({
      userId,
      action: "CREATE_SERVICE_TICKET",
      resource: "SERVICE_TICKET",
      resourceId: ticket.id,
      payload: { number: ticket.number, clientId: ticket.clientId, assignedMembershipId },
    })
    revalidateOperations()
    return { success: true as const, id: ticket.id, number: ticket.number, assignedMembershipId }
  }, "service.write")
}

export async function createFieldIntervention(input: unknown) {
  return withAuth(async ({ companyId, agencyIds }) => {
    const data = interventionSchema.parse(input)
    const site = await prisma.customerSite.findFirst({ where: { id: data.siteId, companyId }, select: { id: true } })
    if (!site) throw new AssetLifecycleError("Site client introuvable")
    if (
      data.ticketId &&
      !(await prisma.serviceTicket.findFirst({ where: { id: data.ticketId, companyId, status: { not: "MERGED" }, mergedIntoTicketId: null }, select: { id: true } }))
    )
      throw new AssetLifecycleError("Ticket introuvable ou déjà fusionné")
    if (data.projectId && !(await prisma.project.findFirst({ where: { id: data.projectId, companyId }, select: { id: true } }))) throw new AssetLifecycleError("Chantier introuvable")
    if (data.assignedMembershipId && !(await prisma.membership.findFirst({ where: { id: data.assignedMembershipId, companyId, status: "ACTIVE" }, select: { id: true } })))
      throw new AssetLifecycleError("Intervenant introuvable")
    const scheduledStart = new Date(data.scheduledStart)
    const scheduledEnd = data.scheduledEnd ? new Date(data.scheduledEnd) : null
    const intervention = await prisma.$transaction(async tx => {
      const activeSite = await lockActiveSite(tx, companyId, data.siteId, agencyIds)
      const scope = operationsDashboardScope(companyId, agencyIds)
      if (data.ticketId) {
        const ticket = await tx.serviceTicket.findFirst({ where: { ...scope.ticket, id: data.ticketId, clientId: activeSite.clientId, status: { not: "MERGED" }, mergedIntoTicketId: null },
          select: { siteId: true, equipmentId: true } })
        if (!ticket || ticket.siteId && ticket.siteId !== data.siteId) throw new AssetLifecycleError("Ticket introuvable ou incompatible avec le site")
        if (ticket.equipmentId) await lockActiveEquipment(tx, companyId, data.siteId, [ticket.equipmentId], agencyIds)
      }
      if (data.projectId && !await tx.project.findFirst({ where: { ...scope.project, id: data.projectId, clientId: activeSite.clientId,
        OR: [{ siteId: null }, { siteId: data.siteId }] }, select: { id: true } })) throw new AssetLifecycleError("Chantier introuvable ou incompatible avec le site")
      await lockSchedulingMembers(tx, companyId, [data.assignedMembershipId])
      if (data.assignedMembershipId) {
        if (!await tx.membership.findFirst({ where: { ...schedulingMemberWhere(companyId, agencyIds), id: data.assignedMembershipId }, select: { id: true } })) throw new SchedulingError("Membre de l’équipe introuvable ou inaccessible.")
        await assertSchedulingSlotFree(tx, { companyId, membershipId: data.assignedMembershipId, start: scheduledStart, end: scheduledEnd ?? new Date(scheduledStart.getTime() + 3_600_000) })
      }
      return tx.fieldIntervention.create({
        data: {
          companyId,
          ...data,
          scheduledStart,
          scheduledEnd,
        },
      })
    })
    revalidateOperations()
    return { success: true as const, id: intervention.id }
  }, "operations.write").catch(schedulingFailure)
}

export async function rescheduleFieldIntervention(input: unknown) {
  return withAuth(async ({ companyId, userId, agencyIds }) => {
    const data = interventionPlanningSchema.parse(input)
    const intervention = await prisma.fieldIntervention.findFirst({
      where: { id: data.interventionId, ...operationsDashboardScope(companyId, agencyIds).intervention },
      select: { id: true, status: true, siteId: true, assignedMembershipId: true, updatedAt: true },
    })
    if (!intervention) throw new Error("Intervention introuvable")
    if (["CANCELED", "COMPLETED"].includes(intervention.status)) throw new Error("Une intervention terminée ou annulée ne peut pas être replanifiée")
    if (data.assignedMembershipId && !(await prisma.membership.findFirst({ where: { id: data.assignedMembershipId, companyId, status: "ACTIVE" }, select: { id: true } })))
      throw new Error("Intervenant introuvable")
    const scheduledStart = new Date(data.scheduledStart)
    const scheduledEnd = new Date(data.scheduledEnd)
    await prisma.$transaction(async tx => {
      await lockActiveSite(tx, companyId, intervention.siteId, agencyIds)
      await lockSchedulingMembers(tx, companyId, [intervention.assignedMembershipId, data.assignedMembershipId])
      if (data.assignedMembershipId) {
        if (!await tx.membership.findFirst({ where: { ...schedulingMemberWhere(companyId, agencyIds), id: data.assignedMembershipId }, select: { id: true } })) throw new SchedulingError("Membre de l’équipe introuvable ou inaccessible.")
        await assertSchedulingSlotFree(tx, { companyId, membershipId: data.assignedMembershipId, start: scheduledStart, end: scheduledEnd, excludeInterventionId: intervention.id })
      }
      const changed = await tx.fieldIntervention.updateMany({ where: { ...operationsDashboardScope(companyId, agencyIds).intervention, id: intervention.id,
        updatedAt: intervention.updatedAt, status: { notIn: ["CANCELED", "COMPLETED"] } }, data: { assignedMembershipId: data.assignedMembershipId, scheduledStart, scheduledEnd,
          updatedAt: new Date(Math.max(Date.now(), intervention.updatedAt.getTime() + 1)) } })
      if (changed.count !== 1) throw new SchedulingError("Cette intervention a changé. Rechargez le planning ; votre saisie est conservée.")
      await tx.auditLog.create({ data: { userId, action: "UPDATE_FIELD_INTERVENTION_PLAN", resource: "FIELD_INTERVENTION", resourceId: intervention.id,
        payload: { assignedMembershipId: data.assignedMembershipId, scheduledStart: scheduledStart.toISOString(), scheduledEnd: scheduledEnd.toISOString() } } })
    }, { isolationLevel: "Serializable" })
    revalidateOperations()
    return { success: true as const }
  }, "operations.write").catch(schedulingFailure)
}

export async function createMaintenanceContract(input: unknown) {
  return withAuth(async ({ companyId, userId, agencyIds, role }) => {
    const data = maintenanceContractSchema.parse(input)
    if (data.autoInvoice && !hasPermission(role, "finance.write")) throw new AuthorizationError("La facturation automatique nécessite le droit Finance en écriture.")
    const [client, site, equipmentCount, company] = await Promise.all([
      prisma.client.findFirst({ where: { id: data.clientId, companyId }, select: { id: true } }),
      prisma.customerSite.findFirst({ where: { id: data.siteId, companyId, clientId: data.clientId }, select: { id: true } }),
      data.equipmentIds.length ? prisma.equipment.count({ where: { id: { in: data.equipmentIds }, companyId, siteId: data.siteId } }) : 0,
      prisma.company.findUnique({ where: { id: companyId }, select: { isTvaApplicable: true } }),
    ])
    if (!client) throw new AssetLifecycleError("Client introuvable")
    if (!site) throw new AssetLifecycleError("Le site n’appartient pas à ce client")
    if (equipmentCount !== data.equipmentIds.length) throw new AssetLifecycleError("Un équipement ne correspond pas au site sélectionné")
    if (!company) throw new AssetLifecycleError("Entreprise introuvable")

    const prefix = buildYearlyDocumentPrefix("ENT-", "ENT-")
    const contract = await withDocumentNumberRetry(
      async () => {
    const last = await readCompanyDocumentNumbers(() => prisma.maintenanceContract.findMany({ where: { companyId, number: { startsWith: prefix } }, select: { number: true } }))
        return prisma.$transaction(async (tx) => {
          const activeSite = await lockActiveSite(tx, companyId, data.siteId, agencyIds)
          if (activeSite.clientId !== data.clientId) throw new AssetLifecycleError("Le site n’appartient pas à ce client")
          await lockActiveEquipment(tx, companyId, data.siteId, data.equipmentIds, agencyIds)
          const startDate = new Date(data.startDate)
          const created = await tx.maintenanceContract.create({
            data: {
              companyId,
              clientId: data.clientId,
              siteId: data.siteId,
              number: nextDocumentNumber(last, prefix),
              label: data.label,
              startDate,
              endDate: data.endDate,
              frequency: data.frequency,
              nextVisitAt: data.nextVisitAt || startDate,
              priceCents: data.priceCents,
              autoInvoice: data.autoInvoice,
              tvaRate: company.isTvaApplicable ? data.tvaRate : 0,
              invoiceDueDays: data.invoiceDueDays,
              notes: data.notes,
              equipments: data.equipmentIds.length ? { create: data.equipmentIds.map((equipmentId) => ({ equipmentId })) } : undefined,
            },
          })
          if (data.autoInvoice && data.priceCents > 0) {
            const recurringFrequency = data.frequency === "BIANNUAL" ? "BIANNUALLY" : data.frequency === "ANNUAL" ? "ANNUALLY" : data.frequency
            await tx.recurringInvoice.create({
              data: {
                companyId,
                clientId: data.clientId,
                maintenanceContractId: created.id,
                label: `Entretien · ${data.label}`,
                frequency: recurringFrequency,
                nextGenDate: startDate,
                template: {
                  object: `Contrat d’entretien ${created.number} · ${data.label}`,
                  projectId: null,
                  dueDays: data.invoiceDueDays,
                  lines: [
                    {
                      label: data.label,
                      description: `Échéance du contrat ${created.number}`,
                      quantity: 1,
                      unitPriceCents: data.priceCents,
                      tvaRate: company.isTvaApplicable ? data.tvaRate : 0,
                    },
                  ],
                },
              },
            })
          }
          return created
        })
      },
      { label: "le contrat d’entretien" },
    )
    await logAction({
      userId,
      action: "CREATE_MAINTENANCE_CONTRACT",
      resource: "MAINTENANCE_CONTRACT",
      resourceId: contract.id,
      payload: { number: contract.number, clientId: contract.clientId, siteId: contract.siteId },
    })
    const createdContract = await prisma.maintenanceContract.findFirstOrThrow({
      where: { id: contract.id, companyId },
      include: {
        client: { select: { name: true } },
        site: { select: { label: true, agencyId: true } },
        recurringInvoice: { select: { id: true, isActive: true } },
        renewedFrom: { select: { id: true, number: true } },
        renewalProposals: { select: { id: true, number: true, status: true }, orderBy: { createdAt: "desc" }, take: 1 },
        _count: { select: { equipments: true, renewedContracts: true } },
      },
    })
    revalidateOperations()
    return { success: true as const, id: contract.id, number: contract.number, contract: createdContract }
  }, "service.write")
}

export async function updateMaintenanceRenewalSettings(input: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    const data = maintenanceRenewalSettingsSchema.parse(input)
    const contract = await prisma.maintenanceContract.findFirst({ where: { id: data.contractId, companyId }, select: { id: true, number: true, renewalStatus: true } })
    if (!contract) throw new Error("Contrat d’entretien introuvable")
    if (contract.renewalStatus === "RENEWED") throw new Error("Ce terme a déjà été renouvelé")
    await prisma.maintenanceContract.update({
      where: { id: contract.id },
      data: { noticeDays: data.noticeDays, indexationRate: data.indexationRate, autoRenew: data.autoRenew, renewalStatus: data.renewalStatus, renewalNotes: data.renewalNotes },
    })
    await logAction({
      userId,
      action: "UPDATE_MAINTENANCE_RENEWAL",
      resource: "MAINTENANCE_CONTRACT",
      resourceId: contract.id,
      payload: { number: contract.number, noticeDays: data.noticeDays, indexationRate: data.indexationRate, autoRenew: data.autoRenew, renewalStatus: data.renewalStatus },
    })
    revalidateOperations()
    return { success: true as const }
  }, "service.write")
}

export async function renewMaintenanceContract(contractId: string) {
  return withAuth(async ({ companyId, userId, agencyIds, role }) => {
    if (!hasPermission(role, "operations.write")) throw new AuthorizationError("La création du nouveau terme nécessite le droit Opérations en écriture.")
    const parsedId = id.parse(contractId)
    const [contract, company] = await Promise.all([
      prisma.maintenanceContract.findFirst({
        where: { id: parsedId, companyId },
        include: { equipments: { select: { equipmentId: true } }, recurringInvoice: { select: { isActive: true } }, _count: { select: { renewedContracts: true } } },
      }),
      prisma.company.findUnique({ where: { id: companyId }, select: { isTvaApplicable: true } }),
    ])
    if (!contract || !company) throw new AssetLifecycleError("Contrat d’entretien introuvable")
    if ((contract.autoInvoice || contract.recurringInvoice?.isActive) && !hasPermission(role, "finance.write")) throw new AuthorizationError("La facturation automatique nécessite le droit Finance en écriture.")
    if (!contract.endDate) throw new AssetLifecycleError("Renseignez une date de fin avant de renouveler ce contrat")
    if (contract.renewalStatus === "DECLINED") throw new AssetLifecycleError("Le renouvellement a été refusé. Modifiez d’abord la décision.")
    if (contract.renewalStatus !== "ACCEPTED" && !contract.autoRenew)
      throw new AssetLifecycleError("Un accord client ou le renouvellement automatique est requis avant de créer le nouveau terme")
    if (contract.renewalStatus === "RENEWED" || contract._count.renewedContracts > 0) throw new AssetLifecycleError("Ce terme a déjà été renouvelé")
    const term = nextMaintenanceTerm(contract.startDate, contract.endDate)
    const nextPriceCents = indexedMaintenancePrice(contract.priceCents, contract.indexationRate)
    const prefix = buildYearlyDocumentPrefix("ENT-", "ENT-")
    const renewed = await withDocumentNumberRetry(
      async () => {
    const last = await readCompanyDocumentNumbers(() => prisma.maintenanceContract.findMany({ where: { companyId, number: { startsWith: prefix } }, select: { number: true } }))
        return prisma.$transaction(
          async (transaction) => {
            const site = await lockActiveSite(transaction, companyId, contract.siteId, agencyIds)
            if (site.clientId !== contract.clientId) throw new AssetLifecycleError("Site du contrat incompatible avec le client")
            await lockActiveEquipment(transaction, companyId, contract.siteId, contract.equipments.map(item => item.equipmentId), agencyIds)
            const created = await transaction.maintenanceContract.create({
              data: {
                companyId,
                clientId: contract.clientId,
                siteId: contract.siteId,
                number: nextDocumentNumber(last, prefix),
                label: contract.label,
                status: "ACTIVE",
                startDate: term.startDate,
                endDate: term.endDate,
                frequency: contract.frequency,
                nextVisitAt: term.startDate,
                priceCents: nextPriceCents,
                autoInvoice: contract.autoInvoice,
                tvaRate: company.isTvaApplicable ? contract.tvaRate : 0,
                invoiceDueDays: contract.invoiceDueDays,
                notes: contract.notes,
                noticeDays: contract.noticeDays,
                indexationRate: contract.indexationRate,
                autoRenew: contract.autoRenew,
                renewalStatus: "NOT_DUE",
                renewalNotes: contract.renewalNotes,
                renewedFromId: contract.id,
                equipments: contract.equipments.length ? { create: contract.equipments.map(({ equipmentId }) => ({ equipmentId })) } : undefined,
              },
            })
            if (contract.recurringInvoice?.isActive && nextPriceCents > 0) {
              const recurringFrequency = contract.frequency === "BIANNUAL" ? "BIANNUALLY" : contract.frequency === "ANNUAL" ? "ANNUALLY" : contract.frequency
              await transaction.recurringInvoice.updateMany({ where: { maintenanceContractId: contract.id, isActive: true }, data: { isActive: false } })
              await transaction.recurringInvoice.create({
                data: {
                  companyId,
                  clientId: contract.clientId,
                  maintenanceContractId: created.id,
                  label: `Entretien · ${contract.label}`,
                  frequency: recurringFrequency,
                  nextGenDate: term.startDate,
                  template: {
                    object: `Contrat d’entretien ${created.number} · ${contract.label}`,
                    projectId: null,
                    dueDays: contract.invoiceDueDays,
                    lines: [
                      {
                        label: contract.label,
                        description: `Échéance du contrat ${created.number}`,
                        quantity: 1,
                        unitPriceCents: nextPriceCents,
                        tvaRate: company.isTvaApplicable ? contract.tvaRate : 0,
                      },
                    ],
                  },
                },
              })
            }
            const updated = await transaction.maintenanceContract.updateMany({
              where: { id: contract.id, companyId, renewalStatus: { not: "RENEWED" } },
              data: { status: "RENEWED", renewalStatus: "RENEWED", renewedAt: new Date(), nextVisitAt: null },
            })
            if (updated.count !== 1) throw new AssetLifecycleError("Le contrat a changé pendant le renouvellement. Rechargez la page.")
            return created
          },
          { isolationLevel: "Serializable" },
        )
      },
      { label: "le renouvellement du contrat d’entretien" },
    )
    await logAction({
      userId,
      action: "RENEW_MAINTENANCE_CONTRACT",
      resource: "MAINTENANCE_CONTRACT",
      resourceId: renewed.id,
      payload: {
        previousContractId: contract.id,
        previousNumber: contract.number,
        number: renewed.number,
        startDate: renewed.startDate,
        endDate: renewed.endDate,
        priceCents: renewed.priceCents,
        indexationRate: contract.indexationRate,
      },
    })
    revalidateOperations()
    revalidatePath("/dashboard/service/customer-success")
    return { success: true as const, id: renewed.id, number: renewed.number }
  }, "service.write")
}

export async function createPurchaseOrder(input: unknown) {
  return withAuth(async ({ companyId, userId, agencyIds }) => {
    const data = purchaseOrderSchema.parse(input)
    const lines = data.lines?.length ? data.lines : [{ productId: data.productId, label: data.label!, quantity: data.quantity!, unitPriceCents: data.unitPriceCents! }]
    const projectScope = { companyId, status: "ACTIVE", client: { companyId }, ...(agencyIds === null ? {} : { agencyId: { in: agencyIds } }) }
    if (data.projectId && !(await prisma.project.findFirst({ where: { ...projectScope, id: data.projectId }, select: { id: true } }))) throw new Error("Chantier introuvable")
    const productIds = [...new Set(lines.flatMap((line) => (line.productId ? [line.productId] : [])))]
    if (productIds.length && (await prisma.product.count({ where: { id: { in: productIds }, companyId, active: true } })) !== productIds.length)
      throw new Error("Un produit fournisseur est introuvable")
    const prefix = buildYearlyDocumentPrefix("ACH-", "ACH-")
    const totalHtCents = lines.reduce((sum, line) => sum + line.quantity * line.unitPriceCents, 0)
    const order = await withDocumentNumberRetry(
      async () => {
        const last = await readCompanyDocumentNumbers(() => prisma.purchaseOrder.findMany({ where: { companyId, number: { startsWith: prefix } }, select: { number: true } }))
        return prisma.$transaction(async tx => {
          if (data.projectId && !(await tx.project.findFirst({ where: { ...projectScope, id: data.projectId }, select: { id: true } }))) throw new Error("Chantier introuvable")
          if (productIds.length && (await tx.product.count({ where: { id: { in: productIds }, companyId, active: true } })) !== productIds.length)
            throw new Error("Un produit fournisseur est introuvable")
          await lockActiveSupplier(tx, companyId, data.supplierId)
          return tx.purchaseOrder.create({
            data: {
              companyId,
              supplierId: data.supplierId,
              projectId: data.projectId,
              expectedAt: data.expectedAt,
              notes: data.notes,
              number: nextDocumentNumber(last, prefix),
              totalHtCents,
              lines: { create: lines.map((line, order) => ({ ...line, order })) },
            },
          })
        })
      },
      { label: "la commande fournisseur" },
    )
    await logAction({
      userId,
      action: "CREATE_PURCHASE_ORDER",
      resource: "PURCHASE_ORDER",
      resourceId: order.id,
      payload: { number: order.number, supplierId: data.supplierId, lineCount: lines.length, totalHtCents },
    })
    revalidateOperations()
    return { success: true as const, id: order.id, number: order.number }
  }, "operations.write")
}

export async function submitPurchaseOrder(purchaseOrderId: string) {
  return withAuth(async context => {
    const result = await transitionPurchaseOrder(context, { kind: "submit", id: id.parse(purchaseOrderId) })
    revalidateOperations()
    revalidatePath(`/dashboard/operations/achats/${purchaseOrderId}`)
    return result
  }, "operations.write")
}

export async function approvePurchaseOrder(purchaseOrderId: string) {
  return withAuth(async context => {
    const result = await transitionPurchaseOrder(context, { kind: "approve", id: id.parse(purchaseOrderId) })
    revalidateOperations()
    revalidatePath(`/dashboard/operations/achats/${purchaseOrderId}`)
    return result
  }, "purchases.approve")
}

export async function sendPurchaseOrder(purchaseOrderId: string) {
  return withAuth(async context => {
    const result = await transitionPurchaseOrder(context, { kind: "send", id: id.parse(purchaseOrderId) })
    revalidateOperations()
    revalidatePath(`/dashboard/operations/achats/${purchaseOrderId}`)
    return result
  }, "operations.write")
}

export async function acknowledgePurchaseOrder(input: unknown) {
  return withAuth(async context => {
    const data = purchaseAcknowledgementSchema.parse(input)
    const result = await transitionPurchaseOrder(context, { kind: "acknowledge", id: data.purchaseOrderId, supplierReference: data.supplierReference, confirmedExpectedAt: data.confirmedExpectedAt })
    revalidateOperations()
    revalidatePath(`/dashboard/operations/achats/${data.purchaseOrderId}`)
    return result
  }, "operations.write")
}

export async function createCustomerOrder(input: unknown) {
  return withAuth(async ({ companyId }) => {
    const data = customerOrderSchema.parse(input)
    const [client, project, product] = await Promise.all([
      prisma.client.findFirst({ where: { id: data.clientId, companyId }, select: { id: true } }),
      data.projectId ? prisma.project.findFirst({ where: { id: data.projectId, companyId, clientId: data.clientId }, select: { id: true } }) : null,
      data.productId ? prisma.product.findFirst({ where: { id: data.productId, companyId }, select: { id: true } }) : null,
    ])
    if (!client) throw new Error("Client introuvable")
    if (data.projectId && !project) throw new Error("Le chantier n'appartient pas à ce client")
    if (data.productId && !product) throw new Error("Produit introuvable")

    const totalHtCents = data.quantity * data.unitPriceCents
    const totalTvaCents = Math.round((totalHtCents * data.tvaRate) / 100)
    if (data.depositCents > totalHtCents + totalTvaCents) throw new Error("L'acompte dépasse le total de la commande")
    const prefix = buildYearlyDocumentPrefix("CMD-", "CMD-")
    const order = await withDocumentNumberRetry(
      async () => {
    const last = await readCompanyDocumentNumbers(() => prisma.customerOrder.findMany({ where: { companyId, number: { startsWith: prefix } }, select: { number: true } }))
        return prisma.customerOrder.create({
          data: {
            companyId,
            clientId: data.clientId,
            projectId: data.projectId,
            number: nextDocumentNumber(last, prefix),
            acceptedAt: new Date(),
            expectedInstallationAt: data.expectedInstallationAt,
            notes: data.notes,
            totalHtCents,
            totalTvaCents,
            totalTtcCents: totalHtCents + totalTvaCents,
            depositCents: data.depositCents,
            lines: { create: { productId: data.productId, label: data.label, quantity: data.quantity, unitPriceCents: data.unitPriceCents, tvaRate: data.tvaRate } },
          },
        })
      },
      { label: "la commande client" },
    )
    revalidateOperations()
    return { success: true as const, id: order.id, number: order.number }
  }, "operations.write")
}

export async function convertQuoteToCustomerOrder(input: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    const data = quoteToCustomerOrderSchema.parse(typeof input === "string" ? { quoteId: input } : input)
    const quote = await prisma.quote.findFirst({
      where: { id: data.quoteId, companyId },
      include: {
        customerOrder: { select: { id: true, number: true } },
        versions: {
          orderBy: { version: "desc" },
          take: 1,
          include: { sections: { orderBy: { order: "asc" }, include: { lines: { orderBy: { order: "asc" } } } } },
        },
      },
    })
    if (!quote) throw new Error("Devis introuvable")
    if (quote.projectId && !await prisma.project.findFirst({ where: { id: quote.projectId, companyId, clientId: quote.clientId, client: { companyId } }, select: { id: true } })) throw new Error("Référence liée indisponible")
    if (quote.customerOrder) {
      const existing = await prisma.customerOrder.findFirst({
        where: { id: quote.customerOrder.id, companyId, clientId: quote.clientId, client: { companyId }, project: { companyId, clientId: quote.clientId } },
        select: { id: true, number: true },
      })
      if (!existing) throw new Error("Référence liée indisponible")
      return { success: true as const, id: existing.id, number: existing.number, existing: true as const }
    }
    if (quote.status !== "ACCEPTED") throw new Error("Enregistrez l’accord du client avant de lancer la commande")
    const version = quote.versions[0]
    if (!version) throw new Error("Le devis ne contient aucune version")
    const lines = version.sections.flatMap((section) => section.lines)
    if (!lines.length) throw new Error("Le devis ne contient aucune ligne")

    const depositCents = Math.round((version.totalTtcCents * data.depositRate) / 100)

    const prefix = buildYearlyDocumentPrefix("CMD-", "CMD-")
    let order
    try {
      order = await withDocumentNumberRetry(
        async () => {
    const last = await readCompanyDocumentNumbers(() => prisma.customerOrder.findMany({ where: { companyId, number: { startsWith: prefix } }, select: { number: true } }))
          return prisma.$transaction(async (tx) => {
            const projectId =
              quote.projectId ??
              (
                await tx.project.create({
                  data: {
                    companyId,
                    clientId: quote.clientId,
                    name: `Chantier · ${quote.object}`,
                    description: `Créé depuis le devis ${quote.number}`,
                    worksiteType: "INSTALLATION",
                    worksiteStage: "COMMANDE_CONFIRMEE",
                    budgetCents: version.totalHtCents,
                    startDate: new Date(),
                  },
                  select: { id: true },
                })
              ).id
            const created = await tx.customerOrder.create({
              data: {
                companyId,
                clientId: quote.clientId,
                projectId,
                quoteId: quote.id,
                number: nextDocumentNumber(last, prefix),
                status: "CONFIRMED",
                acceptedAt: new Date(),
                expectedInstallationAt: data.expectedInstallationAt,
                totalHtCents: version.totalHtCents,
                totalTvaCents: version.totalTvaCents,
                totalTtcCents: version.totalTtcCents,
                depositCents,
                lines: {
                  create: lines.map((line, index) => ({
                    productId: line.productId,
                    label: line.label,
                    description: line.description,
                    quantity: line.quantity,
                    unitPriceCents: line.unitPriceCents,
                    tvaRate: line.tvaRate,
                    order: index,
                  })),
                },
              },
            })
            await tx.quote.update({ where: { id: quote.id }, data: { projectId } })
            return created
          })
        },
        { label: "la commande issue du devis" },
      )
    } catch (error) {
      if (!isUniqueConstraintConflict(error, "quoteId")) throw error
      const concurrentOrder = await prisma.customerOrder.findFirst({ where: { companyId, quoteId: quote.id }, select: { id: true, number: true } })
      if (!concurrentOrder) throw error
      return { success: true as const, id: concurrentOrder.id, number: concurrentOrder.number, existing: true as const }
    }
    await logAction({
      userId,
      action: "CREATE_CUSTOMER_ORDER",
      resource: "CUSTOMER_ORDER",
      resourceId: order.id,
      payload: { quoteId: quote.id, number: order.number, depositRate: data.depositRate, depositCents },
    })
    revalidateOperations()
    revalidatePath("/dashboard/devis")
    revalidatePath(`/dashboard/devis/${quote.id}`)
    return { success: true as const, id: order.id, number: order.number, existing: false as const }
  }, "sales.write")
}

export async function createInvoiceFromCustomerOrder(input: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    const data = customerOrderInvoiceSchema.parse(input)
    const order = await prisma.customerOrder.findFirst({
      where: { id: data.customerOrderId, companyId, client: { companyId }, OR: [{ projectId: null }, { project: { companyId, client: { companyId } } }] },
      include: { project: { select: { clientId: true } }, invoices: { select: { id: true, companyId: true, clientId: true, projectId: true, number: true, type: true, status: true, totalTtcCents: true } } },
    })
    if (!order || (order.project && order.project.clientId !== order.clientId)) throw new Error("Commande client introuvable")
    if (order.invoices.some(invoice => invoice.companyId !== companyId || invoice.clientId !== order.clientId || invoice.projectId !== order.projectId)) throw new Error("Commande client introuvable")
    const orderScope = {
      id: order.id, companyId, clientId: order.clientId, projectId: order.projectId,
      client: { companyId },
      OR: [{ projectId: null }, { project: { companyId, clientId: order.clientId, client: { companyId } } }],
      invoices: { every: { companyId, clientId: order.clientId, projectId: order.projectId } },
    }
    const invoiceRead = { id: true, type: true, status: true, totalTtcCents: true } as const
    const invoiceState = (invoices: Array<{ id: string; type: string; status: string; totalTtcCents: number }>) =>
      JSON.stringify([...invoices].sort((a, b) => a.id.localeCompare(b.id)).map(invoice => [invoice.id, invoice.type, invoice.status, invoice.totalTtcCents]))
    const expectedInvoiceState = invoiceState(order.invoices)
    if (order.status === "CANCELLED") throw new Error("Une commande annulée ne peut pas être facturée")
    if (data.mode === "DEPOSIT") {
      const existingDeposit = order.invoices.find((invoice) => invoice.type === "DEPOSIT" && invoice.status !== "CANCELLED")
      if (existingDeposit) {
        const current = await prisma.customerOrder.findFirst({ where: orderScope, select: { invoices: { select: invoiceRead } } })
        if (!current) throw new Error("Commande client introuvable")
        if (invoiceState(current.invoices) !== expectedInvoiceState) throw new Error("La facturation de cette commande a changé. Rechargez la page puis réessayez.")
        return { success: true as const, id: existingDeposit.id, number: existingDeposit.number, existing: true as const }
      }
      if (order.depositCents <= 0) throw new Error("Aucun acompte n’est défini sur cette commande")
    }
    const remaining = remainingOrderAmount(order.totalTtcCents, order.invoices)
    const amountTtcCents = data.mode === "DEPOSIT" ? Math.min(order.depositCents, remaining) : remaining
    if (amountTtcCents <= 0) throw new Error("Cette commande est déjà entièrement facturée")
    const totals = computeInvoiceSlice({ orderHtCents: order.totalHtCents, orderTvaCents: order.totalTvaCents, orderTtcCents: order.totalTtcCents, amountTtcCents })
    const company = await prisma.company.findFirst({ where: { id: companyId }, select: { invoicePrefix: true } })
    if (!company) throw new Error("Entreprise introuvable")
    const prefix = buildYearlyDocumentPrefix(company.invoicePrefix, "FACT-")
    const dueDate = new Date()
    dueDate.setDate(dueDate.getDate() + data.dueDays)
    const type = data.mode === "DEPOSIT" ? "DEPOSIT" : "STANDARD"
    const label = data.mode === "DEPOSIT" ? `Acompte sur commande ${order.number}` : `Solde de la commande ${order.number}`

    const invoice = await withDocumentNumberRetry(
      async () => {
    const last = await readCompanyDocumentNumbers(() => prisma.invoice.findMany({ where: { companyId, number: { startsWith: prefix } }, select: { number: true } }))
        return prisma.$transaction(async (tx) => {
          const current = await tx.customerOrder.findFirst({ where: orderScope, select: { invoices: { select: invoiceRead } } })
          if (!current) throw new Error("Commande client introuvable")
          if (invoiceState(current.invoices) !== expectedInvoiceState) throw new Error("La facturation de cette commande a changé. Rechargez la page puis réessayez.")
          const nextRemaining = remaining - amountTtcCents
          const claimed = await tx.customerOrder.updateMany({
            where: { ...orderScope, updatedAt: order.updatedAt, billingStatus: order.billingStatus },
            data: { billingStatus: nextRemaining <= 0 ? "INVOICED" : "PARTIALLY_INVOICED" },
          })
          if (claimed.count !== 1) throw new Error("La facturation de cette commande a changé. Rechargez la page puis réessayez.")
          const created = await tx.invoice.create({
            data: {
              companyId,
              clientId: order.clientId,
              projectId: order.projectId,
              customerOrderId: order.id,
              number: nextDocumentNumber(last, prefix),
              object: label,
              type,
              status: "DRAFT",
              dueDate,
              totalHtCents: totals.totalHtCents,
              totalTvaCents: totals.totalTvaCents,
              totalTtcCents: totals.totalTtcCents,
              lines: { create: { label, quantity: 1, unitPriceCents: totals.totalHtCents, tvaRate: totals.tvaRate } },
            },
          })
          return created
        })
      },
      { label: data.mode === "DEPOSIT" ? "la facture d’acompte" : "la facture de solde" },
    )
    await logAction({
      userId,
      action: "CREATE_INVOICE_FROM_ORDER",
      resource: "INVOICE",
      resourceId: invoice.id,
      payload: { customerOrderId: order.id, mode: data.mode, amountTtcCents },
    })
    revalidateOperations()
    revalidatePath("/dashboard/factures")
    return { success: true as const, id: invoice.id, number: invoice.number, existing: false as const }
  }, "finance.write")
}

export async function receivePurchaseOrder(input: unknown) {
  return withAuth(async context => {
    const { companyId, userId } = context
    const data = goodsReceiptSchema.parse(input)
    const [warehouse, line] = await Promise.all([
      prisma.warehouse.findFirst({ where: { id: data.warehouseId, companyId, active: true }, select: { id: true } }),
      readPurchaseStockLine(prisma, context, data, ["SENT", "ACKNOWLEDGED", "PARTIALLY_RECEIVED", "RECEIVED_WITH_ISSUES"]),
    ])
    if (!warehouse) throw new Error("Dépôt introuvable")
    if (!line) throw new Error("Ligne de commande fournisseur introuvable")
    if (!(["SENT", "ACKNOWLEDGED", "PARTIALLY_RECEIVED", "RECEIVED_WITH_ISSUES"] as string[]).includes(line.purchaseOrder.status)) {
      throw new Error("La commande doit être envoyée avant sa réception")
    }
    const productId = line.product?.id ?? null
    if (data.rejectedQuantity > data.quantity) throw new Error("La quantité rejetée dépasse la quantité livrée")
    if (data.rejectedQuantity && !data.issueType) throw new Error("Précisez le type d’anomalie fournisseur")
    const acceptedQuantity = data.quantity - data.rejectedQuantity
    const remaining = line.quantity - line.receivedQuantity - line.creditedQuantity
    if (data.quantity > remaining) throw new Error(`La quantité livrée dépasse le reliquat de ${remaining}`)

    const prefix = buildYearlyDocumentPrefix("REC-", "REC-")
    const receipt = await withDocumentNumberRetry(
      async () =>
        prisma.$transaction(async (tx) => {
          const freshLine = await readPurchaseStockLine(tx, context, data, ["SENT", "ACKNOWLEDGED", "PARTIALLY_RECEIVED", "RECEIVED_WITH_ISSUES"])
          if (!freshLine || purchaseStockLineRevision(freshLine) !== purchaseStockLineRevision(line)) throw new Error(purchaseStockChanged)
          await lockPurchaseStockOrder(tx, context, freshLine.purchaseOrder)
          await lockActiveWarehouses(tx, companyId, [data.warehouseId])
          const last = await readCompanyDocumentNumbers(() => tx.goodsReceipt.findMany({ where: { companyId, number: { startsWith: prefix } }, select: { number: true } }))
          {
            const claimedLine = await tx.purchaseOrderLine.updateMany({
              where: {
                id: line.id, purchaseOrderId: data.purchaseOrderId, productId: line.productId, quantity: line.quantity, unitPriceCents: line.unitPriceCents,
                receivedQuantity: line.receivedQuantity,
                creditedQuantity: line.creditedQuantity,
              },
              data: { receivedQuantity: { increment: acceptedQuantity } },
            })
            if (claimedLine.count !== 1) throw new Error("Le reliquat fournisseur a changé. Rechargez la page puis réessayez.")
          }
          const created = await tx.goodsReceipt.create({
            data: {
              companyId,
              purchaseOrderId: data.purchaseOrderId,
              warehouseId: data.warehouseId,
              number: nextDocumentNumber(last, prefix),
              supplierReference: data.supplierReference,
              notes: data.notes,
              lines: {
                create: {
                  purchaseOrderLineId: line.id,
                  productId,
                  quantity: data.quantity,
                  acceptedQuantity,
                  rejectedQuantity: data.rejectedQuantity,
                  unitCostCents: line.unitPriceCents,
                },
              },
            },
            include: { lines: { select: { id: true } } },
          })
          if (acceptedQuantity) {
            if (productId) {
              await tx.inventoryItem.upsert({
                where: { warehouseId_productId: { warehouseId: data.warehouseId, productId } },
                update: { quantity: { increment: acceptedQuantity } },
                create: { companyId, warehouseId: data.warehouseId, productId, quantity: acceptedQuantity },
              })
              await tx.stockMovement.create({
                data: {
                  companyId,
                  warehouseId: data.warehouseId,
                  productId,
                  projectId: null,
                  type: "IN",
                  quantity: acceptedQuantity,
                  unitCostCents: line.unitPriceCents,
                  reference: created.number,
                  notes: `Réception ${line.purchaseOrder.number}`,
                },
              })
            }
          }
          if (data.rejectedQuantity) {
            await tx.purchaseIssue.create({
              data: {
                companyId,
                purchaseOrderId: data.purchaseOrderId,
                purchaseOrderLineId: line.id,
                goodsReceiptLineId: created.lines[0].id,
                productId,
                type: data.issueType!,
                quantity: data.rejectedQuantity,
                notes: data.issueNotes,
              },
            })
          }
          const orderLines = await tx.purchaseOrderLine.findMany({
            where: { purchaseOrderId: data.purchaseOrderId },
            select: { quantity: true, receivedQuantity: true, creditedQuantity: true },
          })
          const complete = orderLines.every((orderLine) => orderLine.receivedQuantity + orderLine.creditedQuantity >= orderLine.quantity)
          const openIssues = await tx.purchaseIssue.count({ where: { companyId, purchaseOrderId: data.purchaseOrderId, status: { not: "RESOLVED" } } })
          await tx.purchaseOrder.update({
            where: { id: data.purchaseOrderId },
            data: { status: complete ? (openIssues ? "RECEIVED_WITH_ISSUES" : "RECEIVED") : "PARTIALLY_RECEIVED", receivedAt: complete ? new Date() : null },
          })
          await tx.auditLog.create({ data: { userId, action: "RECEIVE_PURCHASE_ORDER", resource: "PURCHASE_ORDER", resourceId: data.purchaseOrderId,
            payload: { receiptId: created.id, acceptedQuantity, rejectedQuantity: data.rejectedQuantity, issueType: data.issueType } } })
          return created
        }, { isolationLevel: "Serializable" }),
      { label: "la réception fournisseur" },
    )
    revalidateOperations()
    return { success: true as const, id: receipt.id, number: receipt.number }
  }, "operations.write")
}

export async function resolvePurchaseIssue(input: unknown) {
  return withAuth(async context => {
    const { companyId, userId } = context
    const data = purchaseIssueResolutionSchema.parse(input)
    const issue = await readPurchaseStockIssue(prisma, context, data.issueId)
    if (!issue) throw new Error("Anomalie fournisseur introuvable ou déjà résolue")
    if (data.resolution === "ACCEPTED" && !issue.goodsReceiptLine) throw new Error("Réception source introuvable")
    if (data.resolution === "ACCEPTED") assertPurchaseInspectionCapacity(issue)
    const remaining = issue.purchaseOrderLine.quantity - issue.purchaseOrderLine.receivedQuantity - issue.purchaseOrderLine.creditedQuantity
    if (["CREDIT", "ACCEPTED"].includes(data.resolution) && issue.quantity > remaining) {
      throw new Error("Le reliquat a déjà été couvert ; clôturez l’anomalie avec une autre résolution")
    }

    await prisma.$transaction(async (tx) => {
      const fresh = await readPurchaseStockIssue(tx, context, data.issueId)
      if (!fresh || purchaseStockRevision(fresh) !== purchaseStockRevision(issue)) throw new Error(purchaseStockChanged)
      await lockPurchaseStockOrder(tx, context, fresh.purchaseOrder)
      if (data.resolution === "ACCEPTED") assertPurchaseInspectionCapacity(fresh)
      if (data.resolution === "ACCEPTED") await lockActiveWarehouses(tx, companyId, [issue.goodsReceiptLine!.goodsReceipt.warehouseId])
      const nextStatus = data.resolution === "REPLACEMENT" ? "WAITING_REPLACEMENT" : "RESOLVED"
      const claimed = await tx.purchaseIssue.updateMany({
        where: { id: issue.id, companyId, status: issue.status, updatedAt: issue.updatedAt },
        data: { status: nextStatus, resolutionKind: data.resolution, resolution: data.notes, resolvedAt: nextStatus === "RESOLVED" ? new Date() : null },
      })
      if (claimed.count !== 1) throw new Error("Anomalie déjà traitée")
      if (data.resolution === "CREDIT") {
        const claimedLine = await tx.purchaseOrderLine.updateMany({
          where: {
            id: issue.purchaseOrderLineId, purchaseOrderId: issue.purchaseOrderId, productId: issue.productId, quantity: issue.purchaseOrderLine.quantity, unitPriceCents: issue.purchaseOrderLine.unitPriceCents,
            receivedQuantity: issue.purchaseOrderLine.receivedQuantity,
            creditedQuantity: issue.purchaseOrderLine.creditedQuantity,
          },
          data: { creditedQuantity: { increment: issue.quantity } },
        })
        if (claimedLine.count !== 1) throw new Error("Le reliquat fournisseur a changé. Rechargez la page puis réessayez.")
      } else if (data.resolution === "ACCEPTED") {
        const warehouseId = issue.goodsReceiptLine!.goodsReceipt.warehouseId
        const claimedLine = await tx.purchaseOrderLine.updateMany({
          where: {
            id: issue.purchaseOrderLineId, purchaseOrderId: issue.purchaseOrderId, productId: issue.productId, quantity: issue.purchaseOrderLine.quantity, unitPriceCents: issue.purchaseOrderLine.unitPriceCents,
            receivedQuantity: issue.purchaseOrderLine.receivedQuantity,
            creditedQuantity: issue.purchaseOrderLine.creditedQuantity,
          },
          data: { receivedQuantity: { increment: issue.quantity } },
        })
        if (claimedLine.count !== 1) throw new Error("Le reliquat fournisseur a changé. Rechargez la page puis réessayez.")
        if (issue.productId) {
          const productId = issue.productId
          await tx.inventoryItem.upsert({
            where: { warehouseId_productId: { warehouseId, productId } },
            update: { quantity: { increment: issue.quantity } },
            create: { companyId, warehouseId, productId, quantity: issue.quantity },
          })
          await tx.stockMovement.create({
            data: {
              companyId,
              warehouseId,
              productId,
              type: "IN",
              quantity: issue.quantity,
              unitCostCents: issue.purchaseOrderLine.unitPriceCents,
              reference: `ISS-${issue.id.slice(-8).toUpperCase()}`,
              notes: `Anomalie acceptée après contrôle · ${issue.goodsReceiptLine!.goodsReceipt.number}`,
            },
          })
        }
      }
      const orderLines = await tx.purchaseOrderLine.findMany({
        where: { purchaseOrderId: issue.purchaseOrderId },
        select: { quantity: true, receivedQuantity: true, creditedQuantity: true },
      })
      const complete = orderLines.every((line) => line.receivedQuantity + line.creditedQuantity >= line.quantity)
      const openIssues = await tx.purchaseIssue.count({ where: { companyId, purchaseOrderId: issue.purchaseOrderId, status: { not: "RESOLVED" } } })
      await tx.purchaseOrder.update({
        where: { id: issue.purchaseOrderId },
        data: { status: complete ? (openIssues ? "RECEIVED_WITH_ISSUES" : "RECEIVED") : "PARTIALLY_RECEIVED", receivedAt: complete ? new Date() : null },
      })
      await tx.auditLog.create({ data: { userId, action: "RESOLVE_PURCHASE_ISSUE", resource: "PURCHASE_ISSUE", resourceId: issue.id,
        payload: { resolution: data.resolution, purchaseOrderId: issue.purchaseOrderId, quantity: issue.quantity } } })
    }, { isolationLevel: "Serializable" })
    revalidateOperations()
    return { success: true as const }
  }, "operations.write")
}

export async function createSupplierReturn(input: unknown) {
  return withAuth(async context => {
    const { companyId, userId } = context
    const data = supplierReturnSchema.parse(input)
    const [line, warehouse] = await Promise.all([
      readPurchaseStockLine(prisma, context, data, ["SENT", "ACKNOWLEDGED", "PARTIALLY_RECEIVED", "RECEIVED_WITH_ISSUES", "RECEIVED"]),
      prisma.warehouse.findFirst({ where: { id: data.warehouseId, companyId, active: true }, select: { id: true } }),
    ])
    if (!line?.product || !warehouse) throw new Error("Ligne produit ou dépôt introuvable")
    const receivedInWarehouse = line.receiptLines.reduce((sum, item) => sum + item.acceptedQuantity + item.inspectedQuantity, 0)
    const alreadyReturned = line.supplierReturns.reduce((sum, item) => sum + item.quantity, 0)
    if (data.quantity > receivedInWarehouse - alreadyReturned) throw new Error("La quantité retournée dépasse la quantité reçue dans ce dépôt")
    const prefix = buildYearlyDocumentPrefix("RET-", "RET-")
    const supplierReturn = await withDocumentNumberRetry(
      async () =>
        prisma.$transaction(async (tx) => {
          await lockPurchaseStockOrder(tx, context, line.purchaseOrder)
          await lockActiveWarehouses(tx, companyId, [data.warehouseId])
          // A no-op update takes a row lock. The following re-read therefore includes
          // returns committed by another concurrent request before validating the cap.
          const lockedLine = await tx.purchaseOrderLine.updateMany({
            where: { id: line.id, purchaseOrderId: data.purchaseOrderId },
            data: { creditedQuantity: { increment: 0 } },
          })
          if (lockedLine.count !== 1) throw new Error("Ligne fournisseur introuvable")
          const freshLine = await readPurchaseStockLine(tx, context, data, ["SENT", "ACKNOWLEDGED", "PARTIALLY_RECEIVED", "RECEIVED_WITH_ISSUES", "RECEIVED"])
          if (!freshLine || purchaseStockLineRevision(freshLine) !== purchaseStockLineRevision(line)) throw new Error(purchaseStockChanged)
          const freshReceived = freshLine.receiptLines.reduce((sum, item) => sum + item.acceptedQuantity + item.inspectedQuantity, 0)
          const freshReturned = freshLine.supplierReturns.reduce((sum, item) => sum + item.quantity, 0)
          if (data.quantity > freshReceived - freshReturned) throw new Error("La quantité retournée dépasse la quantité reçue dans ce dépôt")

          const inventory = await tx.inventoryItem.findUnique({ where: { warehouseId_productId: { warehouseId: warehouse.id, productId: line.product!.id } } })
          if (!inventory) throw new Error("Stock du produit introuvable dans ce dépôt")
          const next = calculateStockBalance({ quantity: inventory.quantity, reservedQuantity: inventory.reservedQuantity, type: "OUT", movementQuantity: data.quantity })
    const last = await readCompanyDocumentNumbers(() => tx.supplierReturn.findMany({ where: { companyId, number: { startsWith: prefix } }, select: { number: true } }))
          const number = nextDocumentNumber(last, prefix)
          assertInventoryClaim(
            await tx.inventoryItem.updateMany({
              where: { id: inventory.id, companyId, quantity: inventory.quantity, reservedQuantity: inventory.reservedQuantity },
              data: next,
            }),
          )
          const movement = await tx.stockMovement.create({
            data: {
              companyId,
              warehouseId: warehouse.id,
              productId: line.product!.id,
              type: "OUT",
              quantity: -data.quantity,
              unitCostCents: line.unitPriceCents,
              reference: number,
              notes: `Retour fournisseur · ${data.reason}`,
            },
          })
          const created = await tx.supplierReturn.create({
            data: {
              companyId,
              purchaseOrderId: data.purchaseOrderId,
              purchaseOrderLineId: line.id,
              supplierId: line.purchaseOrder.supplierId,
              warehouseId: warehouse.id,
              productId: line.product!.id,
              stockMovementId: movement.id,
              number,
              quantity: data.quantity,
              unitCostCents: line.unitPriceCents,
              reason: data.reason,
              notes: data.notes,
            },
          })
          await tx.auditLog.create({ data: { userId, action: "CREATE_SUPPLIER_RETURN", resource: "SUPPLIER_RETURN", resourceId: created.id,
            payload: { number: created.number, purchaseOrderId: data.purchaseOrderId, quantity: data.quantity } } })
          return created
        }, { isolationLevel: "Serializable" }),
      { label: "le retour fournisseur" },
    )
    revalidateOperations()
    return { success: true as const, id: supplierReturn.id, number: supplierReturn.number }
  }, "operations.write")
}

export async function creditSupplierReturn(supplierReturnId: string, creditReference: string) {
  return withAuth(async context => {
    const { companyId, userId } = context
    const data = z.object({ supplierReturnId: id, creditReference: z.string().trim().min(1).max(120) }).parse({ supplierReturnId, creditReference })
    const supplierReturn = await readPurchaseStockReturn(prisma, context, data.supplierReturnId)
    if (!supplierReturn) throw new Error("Retour fournisseur expédié introuvable")
    await prisma.$transaction(async tx => {
      const fresh = await readPurchaseStockReturn(tx, context, data.supplierReturnId)
      if (!fresh || purchaseStockRevision(fresh) !== purchaseStockRevision(supplierReturn)) throw new Error(purchaseStockChanged)
      await lockPurchaseStockOrder(tx, context, fresh.purchaseOrder)
      const claimed = await tx.supplierReturn.updateMany({ where: { id: supplierReturn.id, companyId, status: "SHIPPED", updatedAt: supplierReturn.updatedAt }, data: { status: "CREDITED", creditedAt: new Date(), creditReference: data.creditReference } })
      if (claimed.count !== 1) throw new Error(purchaseStockChanged)
      await tx.auditLog.create({ data: { userId, action: "CREDIT_SUPPLIER_RETURN", resource: "SUPPLIER_RETURN", resourceId: supplierReturn.id,
        payload: { number: supplierReturn.number, creditReference: data.creditReference } } })
    }, { isolationLevel: "Serializable" })
    revalidateOperations()
    return { success: true as const }
  }, "operations.write")
}

async function stockReservationReferences(companyId: string, projectId?: string | null, customerOrderId?: string | null) {
  const [project, order] = await Promise.all([
    projectId ? prisma.project.findFirst({ where: { id: projectId, companyId, client: { companyId } }, select: { id: true } }) : null,
    customerOrderId ? prisma.customerOrder.findFirst({
      where: { id: customerOrderId, companyId, client: { companyId }, OR: [{ projectId: null }, { project: { companyId, client: { companyId } } }] },
      select: { id: true, clientId: true, project: { select: { clientId: true } } },
    }) : null,
  ])
  return { project, customerOrder: order && (!order.project || order.project.clientId === order.clientId) ? order : null }
}

export async function reserveStock(input: unknown) {
  return withAuth(async ({ companyId }) => {
    const data = reservationSchema.parse(input)
    const [warehouse, product, { project, customerOrder }] = await Promise.all([
      prisma.warehouse.findFirst({ where: { id: data.warehouseId, companyId, active: true }, select: { id: true } }),
      prisma.product.findFirst({ where: { id: data.productId, companyId, active: true }, select: { id: true } }),
      stockReservationReferences(companyId, data.projectId, data.customerOrderId),
    ])
    if (!warehouse || !product) throw new Error("Dépôt ou produit introuvable")
    if (data.projectId && !project) throw new Error("Chantier introuvable")
    if (data.customerOrderId && !customerOrder) throw new Error("Commande client introuvable")
    if (!data.projectId && !data.customerOrderId) throw new Error("Rattachez la réservation à un chantier ou une commande client")

    const reservation = await prisma.$transaction(async (tx) => {
      await lockActiveWarehouses(tx, companyId, [data.warehouseId])
      const current = await tx.inventoryItem.findUnique({ where: { warehouseId_productId: { warehouseId: data.warehouseId, productId: data.productId } } })
      if (!current) throw new Error("Aucun stock disponible pour ce produit")
      const next = calculateStockBalance({ quantity: current.quantity, reservedQuantity: current.reservedQuantity, type: "RESERVE", movementQuantity: data.quantity })
      const created = await tx.stockReservation.create({ data: { companyId, ...data } })
      assertInventoryClaim(
        await tx.inventoryItem.updateMany({
          where: { id: current.id, companyId, quantity: current.quantity, reservedQuantity: current.reservedQuantity },
          data: next,
        }),
      )
      await tx.stockMovement.create({
        data: {
          companyId,
          warehouseId: data.warehouseId,
          productId: data.productId,
          projectId: data.projectId,
          reservationId: created.id,
          type: "RESERVE",
          quantity: data.quantity,
          reference: data.customerOrderId ? `Commande ${data.customerOrderId}` : null,
          notes: data.notes,
        },
      })
      return created
    })
    revalidateOperations()
    return { success: true as const, id: reservation.id }
  }, "operations.write")
}

export async function releaseStockReservation(reservationId: string) {
  return withAuth(async ({ companyId }) => {
    const parsedId = id.parse(reservationId)
    const reservation = await prisma.stockReservation.findFirst({ where: { id: parsedId, companyId, status: "ACTIVE" } })
    if (!reservation) throw new Error("Réservation active introuvable")
    const references = await stockReservationReferences(companyId, reservation.projectId, reservation.customerOrderId)
    if ((reservation.projectId && !references.project) || (reservation.customerOrderId && !references.customerOrder)) throw new Error("Réservation active introuvable")
    await prisma.$transaction(async (tx) => {
      const claimedReservation = await tx.stockReservation.updateMany({
        where: { id: reservation.id, companyId, status: "ACTIVE", updatedAt: reservation.updatedAt },
        data: { status: "RELEASED", releasedAt: new Date() },
      })
      if (claimedReservation.count !== 1) throw new Error("Cette réservation vient déjà d’être traitée")
      const current = await tx.inventoryItem.findUnique({ where: { warehouseId_productId: { warehouseId: reservation.warehouseId, productId: reservation.productId } } })
      if (!current) throw new Error("Stock de la réservation introuvable")
      const next = calculateStockBalance({ quantity: current.quantity, reservedQuantity: current.reservedQuantity, type: "RELEASE", movementQuantity: reservation.quantity })
      assertInventoryClaim(
        await tx.inventoryItem.updateMany({
          where: { id: current.id, companyId, quantity: current.quantity, reservedQuantity: current.reservedQuantity },
          data: next,
        }),
      )
      await tx.stockMovement.create({
        data: {
          companyId,
          warehouseId: reservation.warehouseId,
          productId: reservation.productId,
          projectId: reservation.projectId,
          reservationId: reservation.id,
          type: "RELEASE",
          quantity: reservation.quantity,
          reference: `Libération ${reservation.id}`,
          notes: reservation.notes,
        },
      })
    })
    revalidateOperations()
    return { success: true as const }
  }, "operations.write")
}

export async function consumeStockReservation(reservationId: string) {
  return withAuth(async ({ companyId, userId }) => {
    const parsedId = id.parse(reservationId)
    const reservation = await prisma.stockReservation.findFirst({ where: { id: parsedId, companyId, status: "ACTIVE" } })
    if (!reservation) throw new Error("Réservation active introuvable")
    const references = await stockReservationReferences(companyId, reservation.projectId, reservation.customerOrderId)
    if ((reservation.projectId && !references.project) || (reservation.customerOrderId && !references.customerOrder)) throw new Error("Réservation active introuvable")
    await prisma.$transaction(async (tx) => {
      const claimedReservation = await tx.stockReservation.updateMany({
        where: { id: reservation.id, companyId, status: "ACTIVE", updatedAt: reservation.updatedAt },
        data: { status: "CONSUMED", releasedAt: new Date() },
      })
      if (claimedReservation.count !== 1) throw new Error("Cette réservation vient déjà d’être traitée")
      const current = await tx.inventoryItem.findUnique({ where: { warehouseId_productId: { warehouseId: reservation.warehouseId, productId: reservation.productId } } })
      if (!current) throw new Error("Stock de la réservation introuvable")
      const next = calculateStockBalance({ quantity: current.quantity, reservedQuantity: current.reservedQuantity, type: "CONSUME", movementQuantity: reservation.quantity })
      assertInventoryClaim(
        await tx.inventoryItem.updateMany({
          where: { id: current.id, companyId, quantity: current.quantity, reservedQuantity: current.reservedQuantity },
          data: next,
        }),
      )
      await tx.stockMovement.create({
        data: {
          companyId,
          warehouseId: reservation.warehouseId,
          productId: reservation.productId,
          projectId: reservation.projectId,
          reservationId: reservation.id,
          type: "CONSUME",
          quantity: -reservation.quantity,
          reference: reservation.customerOrderId ? `Commande ${reservation.customerOrderId}` : `Réservation ${reservation.id}`,
          notes: reservation.notes,
        },
      })
      if (reservation.customerOrderId) {
        await tx.customerOrder.updateMany({
          where: { id: reservation.customerOrderId, companyId, status: "CONFIRMED" },
          data: { status: "IN_PREPARATION" },
        })
      }
    })
    await logAction({
      userId,
      action: "CONSUME_STOCK_RESERVATION",
      resource: "STOCK_RESERVATION",
      resourceId: reservation.id,
      payload: { quantity: reservation.quantity, productId: reservation.productId },
    })
    revalidateOperations()
    return { success: true as const }
  }, "operations.write")
}

export async function createDeliveryNote(input: unknown) {
  return withAuth(async ({ companyId }) => {
    const data = deliveryNoteSchema.parse(input)
    const line = await prisma.customerOrderLine.findFirst({
      where: { id: data.customerOrderLineId, customerOrderId: data.customerOrderId, customerOrder: { companyId } },
      include: { customerOrder: { select: { id: true, projectId: true } } },
    })
    if (!line) throw new Error("Ligne de commande client introuvable")
    const remaining = line.quantity - line.deliveredQuantity
    if (data.quantity > remaining) throw new Error(`La quantité dépasse le reliquat de ${remaining}`)

    const prefix = buildYearlyDocumentPrefix("BL-", "BL-")
    const note = await withDocumentNumberRetry(
      async () =>
        prisma.$transaction(async (tx) => {
    const last = await readCompanyDocumentNumbers(() => tx.deliveryNote.findMany({ where: { companyId, number: { startsWith: prefix } }, select: { number: true } }))
          const claimedLine = await tx.customerOrderLine.updateMany({
            where: { id: line.id, deliveredQuantity: line.deliveredQuantity },
            data: { deliveredQuantity: { increment: data.quantity } },
          })
          if (claimedLine.count !== 1) throw new Error("Le reliquat de livraison a changé. Rechargez la page puis réessayez.")
          const created = await tx.deliveryNote.create({
            data: {
              companyId,
              customerOrderId: data.customerOrderId,
              projectId: line.customerOrder.projectId,
              number: nextDocumentNumber(last, prefix),
              status: "DELIVERED",
              deliveredAt: new Date(),
              recipientName: data.recipientName,
              notes: data.notes,
              lines: { create: { customerOrderLineId: line.id, productId: line.productId, label: line.label, quantity: data.quantity } },
            },
          })
          const orderLines = await tx.customerOrderLine.findMany({ where: { customerOrderId: data.customerOrderId }, select: { quantity: true, deliveredQuantity: true } })
          if (orderLines.every((orderLine) => orderLine.deliveredQuantity >= orderLine.quantity)) {
            await tx.customerOrder.update({ where: { id: data.customerOrderId }, data: { status: "DELIVERED" } })
          }
          return created
        }),
      { label: "le bon de livraison" },
    )
    revalidateOperations()
    return { success: true as const, id: note.id, number: note.number }
  }, "operations.write")
}

export async function signDeliveryNote(input: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    const data = deliverySignatureSchema.parse(input)
    const note = await prisma.deliveryNote.findFirst({
      where: { id: data.deliveryNoteId, companyId },
      include: { lines: { orderBy: { id: "asc" } } },
    })
    if (!note) throw new Error("Bon de livraison introuvable")
    if (note.signedAt && note.signatureSha256) return { success: true as const, alreadySigned: true, signatureSha256: note.signatureSha256 }
    const signedAt = new Date()
    const signatureSha256 = createHash("sha256")
      .update(
        JSON.stringify({
          deliveryNoteId: note.id,
          number: note.number,
          customerOrderId: note.customerOrderId,
          recipientName: data.recipientName,
          signedAt: signedAt.toISOString(),
          lines: note.lines.map((line) => ({ id: line.id, label: line.label, quantity: line.quantity })),
        }),
      )
      .digest("hex")
    const signed = await prisma.deliveryNote.updateMany({
      where: { id: note.id, companyId, signedAt: null },
      data: { status: "SIGNED", recipientName: data.recipientName, signedAt, signatureSha256 },
    })
    if (signed.count !== 1) throw new Error("Ce bon de livraison a déjà été signé")
    await logAction({
      userId,
      action: "SIGN_DELIVERY_NOTE",
      resource: "DELIVERY_NOTE",
      resourceId: note.id,
      payload: { number: note.number, recipientName: data.recipientName, signatureSha256 },
    })
    revalidateOperations()
    return { success: true as const, signatureSha256 }
  }, "operations.write")
}

export async function createStockMovement(input: unknown) {
  return withAuth(async ({ companyId }) => {
    const data = movementSchema.parse(input)
    const [warehouse, product, project] = await Promise.all([
      prisma.warehouse.findFirst({ where: { id: data.warehouseId, companyId, active: true }, select: { id: true } }),
      prisma.product.findFirst({ where: { id: data.productId, companyId, active: true }, select: { id: true } }),
      data.projectId ? prisma.project.findFirst({ where: { id: data.projectId, companyId }, select: { id: true } }) : null,
    ])
    if (!warehouse || !product) throw new Error("Dépôt ou produit introuvable")
    if (data.projectId && !project) throw new Error("Chantier introuvable")

    await prisma.$transaction(async (tx) => {
      await lockActiveWarehouses(tx, companyId, [data.warehouseId])
      const current = await tx.inventoryItem.findUnique({ where: { warehouseId_productId: { warehouseId: data.warehouseId, productId: data.productId } } })
      const magnitude = Math.abs(data.quantity)
      const next = calculateStockBalance({ quantity: current?.quantity ?? 0, reservedQuantity: current?.reservedQuantity ?? 0, type: data.type, movementQuantity: data.quantity })
      if (data.type === "IN" || (data.type === "ADJUST" && data.quantity > 0)) {
        const increment = data.type === "IN" ? magnitude : data.quantity
        await tx.inventoryItem.upsert({
          where: { warehouseId_productId: { warehouseId: data.warehouseId, productId: data.productId } },
          update: { quantity: { increment } },
          create: { companyId, warehouseId: data.warehouseId, productId: data.productId, quantity: increment },
        })
      } else {
        if (!current) throw new Error("Aucun stock disponible pour ce produit")
        assertInventoryClaim(
          await tx.inventoryItem.updateMany({
            where: { id: current.id, companyId, quantity: current.quantity, reservedQuantity: current.reservedQuantity },
            data: next,
          }),
        )
      }
      await tx.stockMovement.create({
        data: { companyId, ...data, quantity: data.type === "OUT" || data.type === "CONSUME" ? -magnitude : data.type === "IN" ? magnitude : data.quantity },
      })
    })
    revalidateOperations()
    return { success: true as const }
  }, "operations.write")
}

export async function createStockTransfer(input: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    const data = stockTransferSchema.parse(input)
    const [fromWarehouse, toWarehouse, product] = await Promise.all([
      prisma.warehouse.findFirst({ where: { id: data.fromWarehouseId, companyId, active: true }, select: { id: true, name: true } }),
      prisma.warehouse.findFirst({ where: { id: data.toWarehouseId, companyId, active: true }, select: { id: true, name: true } }),
      prisma.product.findFirst({ where: { id: data.productId, companyId, active: true, stockTracked: true }, select: { id: true, label: true, purchasePriceCents: true } }),
    ])
    if (!fromWarehouse || !toWarehouse || !product) throw new Error("Dépôt ou produit suivi en stock introuvable")

    const transfer = await prisma.$transaction(
      async (tx) => {
        await lockActiveWarehouses(tx, companyId, [fromWarehouse.id, toWarehouse.id])
        const [sourceInventory, destinationInventory] = await Promise.all([
          tx.inventoryItem.findUnique({ where: { warehouseId_productId: { warehouseId: fromWarehouse.id, productId: product.id } } }),
          tx.inventoryItem.findUnique({ where: { warehouseId_productId: { warehouseId: toWarehouse.id, productId: product.id } } }),
        ])
        if (!sourceInventory) throw new Error("Aucun stock disponible dans le dépôt de départ")

        const balances = calculateStockTransferBalances({
          source: { quantity: sourceInventory.quantity, reservedQuantity: sourceInventory.reservedQuantity },
          destination: { quantity: destinationInventory?.quantity ?? 0, reservedQuantity: destinationInventory?.reservedQuantity ?? 0 },
          transferQuantity: data.quantity,
        })
        await tx.inventoryItem.update({ where: { id: sourceInventory.id }, data: balances.source })
        await tx.inventoryItem.upsert({
          where: { warehouseId_productId: { warehouseId: toWarehouse.id, productId: product.id } },
          update: balances.destination,
          create: { companyId, warehouseId: toWarehouse.id, productId: product.id, ...balances.destination },
        })

        const created = await tx.stockTransfer.create({
          data: {
            companyId,
            fromWarehouseId: fromWarehouse.id,
            toWarehouseId: toWarehouse.id,
            productId: product.id,
            quantity: data.quantity,
            unitCostCents: data.unitCostCents ?? product.purchasePriceCents,
            reference: data.reference,
            notes: data.notes,
          },
          select: { id: true },
        })
        const movementReference = data.reference || `TRF-${created.id.slice(-8).toUpperCase()}`
        await tx.stockMovement.createMany({
          data: [
            {
              companyId,
              warehouseId: fromWarehouse.id,
              productId: product.id,
              stockTransferId: created.id,
              transferLeg: "OUTBOUND",
              type: "OUT",
              quantity: -data.quantity,
              unitCostCents: data.unitCostCents ?? product.purchasePriceCents,
              reference: movementReference,
              notes: data.notes,
            },
            {
              companyId,
              warehouseId: toWarehouse.id,
              productId: product.id,
              stockTransferId: created.id,
              transferLeg: "INBOUND",
              type: "IN",
              quantity: data.quantity,
              unitCostCents: data.unitCostCents ?? product.purchasePriceCents,
              reference: movementReference,
              notes: data.notes,
            },
          ],
        })
        return created
      },
      { isolationLevel: "Serializable" },
    )

    await logAction({
      userId,
      action: "TRANSFER_STOCK",
      resource: "STOCK_TRANSFER",
      resourceId: transfer.id,
      payload: { fromWarehouseId: fromWarehouse.id, toWarehouseId: toWarehouse.id, productId: product.id, quantity: data.quantity },
    })
    revalidateOperations()
    return { success: true as const, id: transfer.id }
  }, "operations.write")
}

export async function consumeInterventionMaterial(input: unknown) {
  return withAuth(async ({ companyId, userId, membershipId, role }) => {
    const data = interventionMaterialSchema.parse(input)
    const technicianScope = role === "TECHNICIAN" ? { assignedMembershipId: membershipId } : {}
    const [intervention, warehouse, product] = await Promise.all([
      prisma.fieldIntervention.findFirst({ where: { id: data.interventionId, companyId, ...technicianScope, status: { not: "CANCELED" } }, select: { id: true, projectId: true } }),
      prisma.warehouse.findFirst({ where: { id: data.warehouseId, companyId, active: true }, select: { id: true } }),
      prisma.product.findFirst({ where: { id: data.productId, companyId, active: true, stockTracked: true }, select: { id: true, purchasePriceCents: true, label: true } }),
    ])
    if (!intervention) throw new Error("Intervention introuvable ou annulée")
    if (!warehouse || !product) throw new Error("Dépôt ou produit suivi en stock introuvable")

    const movement = await prisma.$transaction(async (tx) => {
      await lockActiveWarehouses(tx, companyId, [warehouse.id])
      const current = await tx.inventoryItem.findUnique({ where: { warehouseId_productId: { warehouseId: warehouse.id, productId: product.id } } })
      if (!current) throw new Error("Aucun stock disponible pour ce produit dans ce dépôt")
      const next = calculateStockBalance({ quantity: current.quantity, reservedQuantity: current.reservedQuantity, type: "OUT", movementQuantity: data.quantity })
      assertInventoryClaim(
        await tx.inventoryItem.updateMany({
          where: { id: current.id, companyId, quantity: current.quantity, reservedQuantity: current.reservedQuantity },
          data: next,
        }),
      )
      return tx.stockMovement.create({
        data: {
          companyId,
          warehouseId: warehouse.id,
          productId: product.id,
          projectId: intervention.projectId,
          fieldInterventionId: intervention.id,
          type: "OUT",
          quantity: -data.quantity,
          unitCostCents: product.purchasePriceCents,
          reference: `INT-${intervention.id.slice(-8).toUpperCase()}`,
          notes: "Matériel consommé en intervention",
        },
        select: { id: true },
      })
    })
    await logAction({
      userId,
      action: "CONSUME_INTERVENTION_MATERIAL",
      resource: "FIELD_INTERVENTION",
      resourceId: intervention.id,
      payload: { movementId: movement.id, productId: product.id, warehouseId: warehouse.id, quantity: data.quantity, unitCostCents: product.purchasePriceCents },
    })
    revalidateOperations()
    return { success: true as const, movementId: movement.id }
  }, "operations.write")
}

export async function updateServiceTicket(ticketId: string, input: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    const parsedId = id.parse(ticketId)
    const data = ticketUpdateSchema.parse(input)
    const [ticket, company] = await Promise.all([
      prisma.serviceTicket.findFirst({
        where: { id: parsedId, companyId },
        select: {
          id: true,
          status: true,
          closedAt: true,
          waitingSince: true,
          pausedMinutes: true,
          assignedMembershipId: true,
          routingReason: true,
          routedAt: true,
          mergedIntoTicketId: true,
        },
      }),
      prisma.company.findUnique({
        where: { id: companyId },
        select: {
          serviceTimezone: true,
          serviceDayStart: true,
          serviceDayEnd: true,
          serviceWorkdays: true,
          serviceHolidays: true,
          serviceFirstResponseHours: true,
          serviceResolutionHours: true,
        },
      }),
    ])
    if (!ticket) throw new Error("Ticket introuvable")
    if (ticket.status === "MERGED" || ticket.mergedIntoTicketId) throw new Error("Ce ticket est fusionné. Restaurez-le avant de le modifier.")
    if (!company) throw new Error("Entreprise introuvable")
    if (data.assignedMembershipId && !(await prisma.membership.findFirst({ where: { id: data.assignedMembershipId, companyId, status: "ACTIVE" }, select: { id: true } })))
      throw new Error("Intervenant introuvable")
    if (["RESOLVED", "CLOSED"].includes(data.status) && !data.resolution) throw new Error("Décrivez la résolution avant de résoudre ou clore le ticket")
    const now = new Date()
    const leavingWaiting = ticket.status === "WAITING" && data.status !== "WAITING" && ticket.waitingSince
    const pausedMinutes = ticket.pausedMinutes + (leavingWaiting ? businessMinutesBetween(ticket.waitingSince!, now, serviceSlaPolicy(company)) : 0)
    const manualAssignmentChanged = data.assignedMembershipId !== ticket.assignedMembershipId
    await prisma.serviceTicket.update({
      where: { id: ticket.id },
      data: {
        status: data.status,
        priority: data.priority,
        assignedMembershipId: data.assignedMembershipId,
        dueAt: data.dueAt,
        resolution: data.resolution,
        requiredSkill: data.requiredSkill,
        territory: data.territory,
        routingReason: manualAssignmentChanged ? (data.assignedMembershipId ? "Affectation manuelle" : null) : ticket.routingReason,
        routedAt: manualAssignmentChanged ? (data.assignedMembershipId ? now : null) : ticket.routedAt,
        pausedMinutes,
        waitingSince: data.status === "WAITING" ? ticket.waitingSince || now : null,
        closedAt: data.status === "CLOSED" ? (ticket.closedAt ?? new Date()) : null,
      },
    })
    await logAction({
      userId,
      action: "UPDATE_SERVICE_TICKET",
      resource: "SERVICE_TICKET",
      resourceId: ticket.id,
      payload: { fromStatus: ticket.status, status: data.status, priority: data.priority, assignedMembershipId: data.assignedMembershipId },
    })
    revalidateOperations()
    revalidatePath(`/dashboard/service/tickets/${ticket.id}`)
    return { success: true as const }
  }, "service.write")
}

export async function routeServiceTicket(ticketId: string) {
  return withAuth(async ({ companyId, userId }) => {
    const parsedId = id.parse(ticketId)
    const routing = await getServiceRoutingRecommendation(companyId, parsedId)
    if (!routing.recommendation) throw new Error("Aucun membre disponible sous sa capacité. Ajustez la disponibilité, les compétences ou la capacité dans Équipe.")
    await prisma.serviceTicket.update({
      where: { id: parsedId },
      data: {
        assignedMembershipId: routing.recommendation.membershipId,
        requiredSkill: routing.requiredSkill,
        territory: routing.territory,
        routingReason: routing.recommendation.reason,
        routedAt: new Date(),
      },
    })
    await logAction({
      userId,
      action: "ROUTE_SERVICE_TICKET",
      resource: "SERVICE_TICKET",
      resourceId: parsedId,
      payload: {
        assignedMembershipId: routing.recommendation.membershipId,
        requiredSkill: routing.requiredSkill,
        territory: routing.territory,
        capacityOverflow: routing.recommendation.capacityOverflow,
      },
    })
    revalidateOperations()
    revalidatePath(`/dashboard/service/tickets/${parsedId}`)
    revalidatePath("/dashboard/service/help-desk")
    return { success: true as const, assignedMembershipId: routing.recommendation.membershipId, reason: routing.recommendation.reason }
  }, "service.write")
}

export async function mergeServiceTickets(input: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    const data = ticketMergeSchema.parse(input)
    const { source, target, mergedAt } = await prisma.$transaction(
      async (transaction) => {
        const tickets = await transaction.serviceTicket.findMany({
          where: { companyId, id: { in: [data.sourceId, data.targetId] } },
          select: { id: true, number: true, clientId: true, status: true, mergedIntoTicketId: true, _count: { select: { mergedTickets: true } } },
        })
        const source = tickets.find((ticket) => ticket.id === data.sourceId)
        const target = tickets.find((ticket) => ticket.id === data.targetId)
        if (!source || !target) throw new Error("Ticket source ou ticket conservé introuvable")
        if (source.clientId !== target.clientId) throw new Error("Seuls deux tickets du même client peuvent être fusionnés")
        if (source.status === "MERGED" || source.mergedIntoTicketId) throw new Error("Le ticket source est déjà fusionné")
        if (target.status === "MERGED" || target.mergedIntoTicketId) throw new Error("Le ticket à conserver est déjà fusionné dans un autre dossier")
        if (source._count.mergedTickets > 0) throw new Error("Ce ticket regroupe déjà d’autres dossiers. Restaurez-les avant de le fusionner.")

        const mergedAt = new Date()
        const merged = await transaction.serviceTicket.updateMany({
          where: { id: source.id, companyId, status: { not: "MERGED" }, mergedIntoTicketId: null },
          data: { status: "MERGED", preMergeStatus: source.status, mergedIntoTicketId: target.id, mergedAt },
        })
        if (merged.count !== 1) throw new Error("Le ticket a changé pendant la fusion. Rechargez la page.")
        return { source, target, mergedAt }
      },
      { isolationLevel: "Serializable" },
    )
    await logAction({
      userId,
      action: "MERGE_SERVICE_TICKET",
      resource: "SERVICE_TICKET",
      resourceId: target.id,
      payload: { sourceId: source.id, sourceNumber: source.number, targetId: target.id, targetNumber: target.number, previousStatus: source.status, mergedAt },
    })
    revalidateOperations()
    revalidatePath("/dashboard/service/help-desk")
    revalidatePath(`/dashboard/service/tickets/${source.id}`)
    revalidatePath(`/dashboard/service/tickets/${target.id}`)
    return { success: true as const, targetId: target.id, targetNumber: target.number }
  }, "service.write")
}

export async function unmergeServiceTicket(sourceId: string) {
  return withAuth(async ({ companyId, userId }) => {
    const parsedId = id.parse(sourceId)
    const source = await prisma.serviceTicket.findFirst({
      where: { id: parsedId, companyId },
      select: { id: true, number: true, status: true, preMergeStatus: true, mergedIntoTicketId: true, mergedInto: { select: { number: true } } },
    })
    if (!source || source.status !== "MERGED" || !source.mergedIntoTicketId) throw new Error("Ce ticket n’est pas fusionné")
    const restorableStatuses = new Set(["OPEN", "QUALIFIED", "PLANNED", "WAITING", "RESOLVED", "CLOSED"])
    const restoredStatus = source.preMergeStatus && restorableStatuses.has(source.preMergeStatus) ? source.preMergeStatus : "OPEN"
    const restored = await prisma.serviceTicket.updateMany({
      where: { id: source.id, companyId, status: "MERGED", mergedIntoTicketId: source.mergedIntoTicketId },
      data: { status: restoredStatus, preMergeStatus: null, mergedIntoTicketId: null, mergedAt: null },
    })
    if (restored.count !== 1) throw new Error("Le ticket a changé pendant la restauration. Rechargez la page.")
    await logAction({
      userId,
      action: "UNMERGE_SERVICE_TICKET",
      resource: "SERVICE_TICKET",
      resourceId: source.id,
      payload: { sourceNumber: source.number, targetId: source.mergedIntoTicketId, targetNumber: source.mergedInto?.number, restoredStatus },
    })
    revalidateOperations()
    revalidatePath("/dashboard/service/help-desk")
    revalidatePath(`/dashboard/service/tickets/${source.id}`)
    revalidatePath(`/dashboard/service/tickets/${source.mergedIntoTicketId}`)
    return { success: true as const, id: source.id, status: restoredStatus }
  }, "service.write")
}

export async function updateInterventionStatus(interventionId: string, status: "PLANNED" | "EN_ROUTE" | "IN_PROGRESS" | "CANCELED") {
  return withAuth(async ({ companyId, agencyIds }) => {
    const parsed = z.object({ interventionId: id, status: z.enum(["PLANNED", "EN_ROUTE", "IN_PROGRESS", "CANCELED"]) }).parse({ interventionId, status })
    const scope = operationsDashboardScope(companyId, agencyIds)
    const where = { id: parsed.interventionId, ...scope.intervention }
    const intervention = await prisma.fieldIntervention.findFirst({ where, select: { id: true, siteId: true, assignedMembershipId: true, scheduledStart: true, scheduledEnd: true, updatedAt: true } })
    if (!intervention) throw new Error("Intervention introuvable")
    await prisma.$transaction(async tx => {
      if (parsed.status !== "CANCELED") await lockActiveSite(tx, companyId, intervention.siteId, agencyIds)
      await lockSchedulingMembers(tx, companyId, [intervention.assignedMembershipId])
      if (parsed.status !== "CANCELED" && intervention.assignedMembershipId) {
        await assertSchedulingSlotFree(tx, { companyId, membershipId: intervention.assignedMembershipId, start: intervention.scheduledStart,
          end: intervention.scheduledEnd ?? new Date(intervention.scheduledStart.getTime() + 3_600_000), excludeInterventionId: intervention.id })
      }
      const updated = await tx.fieldIntervention.updateMany({ where: { ...where, updatedAt: intervention.updatedAt },
        data: { status: parsed.status, startedAt: parsed.status === "IN_PROGRESS" ? new Date() : undefined, updatedAt: new Date(Math.max(Date.now(), intervention.updatedAt.getTime() + 1)) } })
      if (updated.count !== 1) throw new Error("Intervention introuvable")
    }, { isolationLevel: "Serializable" })
    revalidateOperations()
    revalidatePath(`/dashboard/service/interventions/${intervention.id}`)
    return { success: true as const }
  }, "operations.write").catch(schedulingFailure)
}

export async function resolveInterventionReservation(reservationId: string) {
  return withAuth(async ({ companyId, userId, membershipId, role, agencyIds }) => {
    const parsedId = id.parse(reservationId)
    const scope = operationsDashboardScope(companyId, agencyIds)
    const where = { id: parsedId, companyId, intervention: { ...scope.intervention, ...(role === "TECHNICIAN" ? { assignedMembershipId: membershipId } : {}) } }
    const reservation = await prisma.interventionReservation.findFirst({
      where,
      select: { id: true, interventionId: true, status: true },
    })
    if (!reservation) throw new Error("Réserve introuvable")
    if (reservation.status === "RESOLVED") return { success: true as const, alreadyResolved: true }
    const updated = await prisma.interventionReservation.updateMany({ where: { ...where, status: { not: "RESOLVED" } }, data: { status: "RESOLVED", resolvedAt: new Date() } })
    if (updated.count !== 1) {
      const current = await prisma.interventionReservation.findFirst({ where, select: { status: true } })
      if (current?.status === "RESOLVED") return { success: true as const, alreadyResolved: true }
      throw new Error("Réserve introuvable")
    }
    await logAction({
      userId,
      action: "RESOLVE_INTERVENTION_RESERVATION",
      resource: "INTERVENTION_RESERVATION",
      resourceId: reservation.id,
      payload: { interventionId: reservation.interventionId },
    })
    revalidateOperations()
    return { success: true as const }
  }, "operations.write")
}
