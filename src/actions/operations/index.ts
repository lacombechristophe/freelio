"use server"

import { createHash } from "node:crypto"
import { revalidatePath } from "next/cache"
import { z } from "zod"

import { withAuth } from "@/lib/auth-wrapper"
import { logAction } from "@/lib/audit"
import { buildYearlyDocumentPrefix, nextDocumentNumber, withDocumentNumberRetry } from "@/lib/document-numbering"
import { calculateStockBalance } from "@/lib/operations/stock"
import { computeInvoiceSlice, remainingOrderAmount } from "@/lib/operations/orders"
import { planningSlotsOverlap } from "@/lib/operations/planning"
import { indexedMaintenancePrice, nextMaintenanceTerm } from "@/lib/operations/maintenance-renewal"
import { diagnosticSteps, diagnosticStringList, equipmentWarrantyStatus, scoreDiagnosticGuide } from "@/lib/operations/service-diagnostics"
import { scoreServiceDuplicate } from "@/lib/operations/service-duplicates"
import { recommendServiceAssignee, serviceRoutingTags } from "@/lib/operations/service-routing"
import { businessMinutesBetween, serviceFirstResponseTarget, serviceResolutionTarget, serviceSlaPolicy } from "@/lib/operations/service-sla"
import { hasPermission } from "@/lib/permissions"
import prisma from "@/lib/prisma"

const id = z.string().cuid()
const optionalId = z.union([id, z.literal("")]).optional().transform((value) => value || null)
const optionalText = z.string().trim().max(2_000).optional().transform((value) => value || null)
const optionalRoutingText = z.string().trim().max(80).optional().transform((value) => value || null)
const dateInput = z.string().trim().optional().transform((value) => value ? new Date(value) : null)
const optionalCoordinate = z.preprocess(
  (value) => value === "" || value == null ? null : Number(value),
  z.number().finite().nullable(),
)

const siteSchema = z.object({
  clientId: id,
  label: z.string().trim().min(2).max(120),
  kind: z.string().trim().min(2).max(40).default("INSTALLATION"),
  address1: z.string().trim().min(3).max(200),
  address2: optionalText,
  postalCode: z.string().trim().max(20).optional().transform((value) => value || null),
  city: z.string().trim().max(100).optional().transform((value) => value || null),
  accessNotes: optionalText,
  latitude: optionalCoordinate.refine((value) => value == null || (value >= -90 && value <= 90), "Latitude invalide"),
  longitude: optionalCoordinate.refine((value) => value == null || (value >= -180 && value <= 180), "Longitude invalide"),
})

const supplierSchema = z.object({
  name: z.string().trim().min(2).max(160),
  code: z.string().trim().max(40).optional().transform((value) => value || null),
  contactName: optionalText,
  email: z.union([z.string().trim().email(), z.literal("")]).optional().transform((value) => value || null),
  phone: z.string().trim().max(40).optional().transform((value) => value || null),
  deliveryDays: z.coerce.number().int().min(0).max(365).optional().nullable(),
})

const productSchema = z.object({
  sku: z.string().trim().min(1).max(80),
  label: z.string().trim().min(2).max(200),
  supplierId: optionalId,
  manufacturer: z.string().trim().max(120).optional().transform((value) => value || null),
  family: z.string().trim().max(120).optional().transform((value) => value || null),
  unit: z.string().trim().min(1).max(30).default("unité"),
  purchasePriceCents: z.coerce.number().int().min(0).max(2_000_000_000).default(0),
  salePriceCents: z.coerce.number().int().min(0).max(2_000_000_000).default(0),
  stockTracked: z.boolean().default(true),
})

const warehouseSchema = z.object({
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().min(1).max(30),
  address: optionalText,
})

const equipmentSchema = z.object({
  siteId: id,
  productId: optionalId,
  label: z.string().trim().min(2).max(160),
  category: z.string().trim().max(100).optional().transform((value) => value || null),
  manufacturer: z.string().trim().max(120).optional().transform((value) => value || null),
  model: z.string().trim().max(120).optional().transform((value) => value || null),
  serialNumber: z.string().trim().max(120).optional().transform((value) => value || null),
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
  resolution: z.string().trim().max(5_000).optional().transform((value) => value || null),
  requiredSkill: optionalRoutingText,
  territory: optionalRoutingText,
})

const ticketMergeSchema = z.object({ sourceId: id, targetId: id }).refine(
  (value) => value.sourceId !== value.targetId,
  { message: "Les deux tickets doivent être différents" },
)

const interventionSchema = z.object({
  ticketId: optionalId,
  projectId: optionalId,
  siteId: id,
  assignedMembershipId: optionalId,
  title: z.string().trim().min(3).max(180),
  type: z.enum(["SITE_VISIT", "INSTALLATION", "SAV", "MAINTENANCE"]).default("SAV"),
  scheduledStart: z.string().datetime(),
  scheduledEnd: z.string().datetime().optional().nullable(),
}).superRefine((value, context) => {
  if (value.scheduledEnd && Date.parse(value.scheduledEnd) <= Date.parse(value.scheduledStart)) {
    context.addIssue({ code: "custom", path: ["scheduledEnd"], message: "La fin doit être postérieure au début" })
  }
})

const interventionPlanningSchema = z.object({
  interventionId: id,
  assignedMembershipId: optionalId,
  scheduledStart: z.string().datetime(),
  scheduledEnd: z.string().datetime(),
}).superRefine((value, context) => {
  if (Date.parse(value.scheduledEnd) <= Date.parse(value.scheduledStart)) {
    context.addIssue({ code: "custom", path: ["scheduledEnd"], message: "La fin doit être postérieure au début" })
  }
})

const maintenanceContractSchema = z.object({
  clientId: id,
  siteId: id,
  label: z.string().trim().min(3).max(180),
  startDate: z.string().trim().min(1).refine((value) => !Number.isNaN(Date.parse(value)), "Date de début invalide"),
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
  renewalNotes: z.string().trim().max(5_000).optional().transform((value) => value || null),
})

const purchaseOrderLineSchema = z.object({
  productId: optionalId,
  label: z.string().trim().min(2).max(200),
  quantity: z.coerce.number().int().min(1).max(1_000_000),
  unitPriceCents: z.coerce.number().int().min(0).max(2_000_000_000),
})

const purchaseOrderSchema = z.object({
  supplierId: id,
  projectId: optionalId,
  expectedAt: dateInput,
  notes: optionalText,
  productId: optionalId,
  label: z.string().trim().max(200).optional(),
  quantity: z.coerce.number().int().min(1).max(1_000_000).optional(),
  unitPriceCents: z.coerce.number().int().min(0).max(2_000_000_000).optional(),
  lines: z.array(purchaseOrderLineSchema).min(1).max(200).optional(),
}).superRefine((value, context) => {
  if (!value.lines?.length && (!value.label || value.quantity == null || value.unitPriceCents == null)) context.addIssue({ code: "custom", message: "Ajoutez au moins une ligne fournisseur" })
})

const movementSchema = z.object({
  warehouseId: id,
  productId: id,
  projectId: optionalId,
  type: z.enum(["IN", "OUT", "RESERVE", "RELEASE", "CONSUME", "ADJUST"]),
  quantity: z.coerce.number().int().min(-1_000_000).max(1_000_000).refine((value) => value !== 0),
  unitCostCents: z.coerce.number().int().min(0).max(2_000_000_000).optional().nullable(),
  reference: z.string().trim().max(120).optional().transform((value) => value || null),
  notes: optionalText,
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

const goodsReceiptSchema = z.object({
  purchaseOrderId: id,
  purchaseOrderLineId: id,
  warehouseId: id,
  quantity: z.coerce.number().int().min(1).max(1_000_000),
  rejectedQuantity: z.coerce.number().int().min(0).max(1_000_000).default(0),
  issueType: z.enum(["DAMAGED", "MISSING", "WRONG_ITEM", "QUALITY", "OTHER"]).optional().nullable(),
  issueNotes: optionalText,
  supplierReference: z.string().trim().max(120).optional().transform((value) => value || null),
  notes: optionalText,
})

const purchaseAcknowledgementSchema = z.object({
  purchaseOrderId: id,
  supplierReference: z.string().trim().min(1).max(120),
  confirmedExpectedAt: z.string().trim().min(1).refine((value) => !Number.isNaN(Date.parse(value)), "Date fournisseur invalide"),
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
  recipientName: z.string().trim().max(160).optional().transform((value) => value || null),
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

async function getServiceRoutingRecommendation(companyId: string, ticketId: string) {
  const activeStatuses = ["OPEN", "QUALIFIED", "PLANNED", "WAITING"]
  const [ticket, members] = await Promise.all([
    prisma.serviceTicket.findFirst({ where: { id: ticketId, companyId }, select: { id: true, status: true, type: true, priority: true, requiredSkill: true, territory: true, site: { select: { city: true } }, equipment: { select: { category: true } } } }),
    prisma.membership.findMany({
      where: { companyId, status: "ACTIVE", role: { in: ["OWNER", "ADMIN", "SERVICE", "TECHNICIAN"] } },
      select: { id: true, role: true, serviceAvailable: true, serviceTicketCapacity: true, serviceSkills: true, serviceTerritories: true, _count: { select: { assignedTickets: { where: { id: { not: ticketId }, status: { in: activeStatuses } } } } } },
    }),
  ])
  if (!ticket) throw new Error("Ticket introuvable")
  if (["RESOLVED", "CLOSED", "MERGED"].includes(ticket.status)) throw new Error("Un ticket résolu, clos ou fusionné ne peut pas être réaffecté")
  const requiredSkill = ticket.requiredSkill || ticket.equipment?.category || ticket.type
  const territory = ticket.territory || ticket.site?.city || null
  const recommendation = recommendServiceAssignee({ requiredSkill, territory, priority: ticket.priority }, members.map((member) => ({ id: member.id, role: member.role, available: member.serviceAvailable, capacity: member.serviceTicketCapacity, activeTickets: member._count.assignedTickets, skills: serviceRoutingTags(member.serviceSkills), territories: serviceRoutingTags(member.serviceTerritories) })))
  return { recommendation, requiredSkill, territory }
}

function serviceMacroText(html: string) {
  return html.replace(/<br\s*\/?\s*>/gi, "\n").replace(/<\/p>\s*<p>/gi, "\n\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#0?39;/gi, "'").trim()
}

function renderServiceMacro(value: string, variables: Record<string, string>) {
  return Object.entries(variables).reduce((rendered, [name, replacement]) => rendered.replaceAll(`{{${name}}}`, replacement), value)
}

async function findInterventionSlotConflict({
  companyId,
  assignedMembershipId,
  scheduledStart,
  scheduledEnd,
  excludeInterventionId,
}: {
  companyId: string
  assignedMembershipId: string | null
  scheduledStart: Date
  scheduledEnd: Date | null
  excludeInterventionId?: string
}) {
  if (!assignedMembershipId) return null
  const effectiveEnd = scheduledEnd ?? new Date(scheduledStart.getTime() + 60 * 60 * 1_000)
  const possibleConflicts = await prisma.fieldIntervention.findMany({
    where: {
      companyId,
      assignedMembershipId,
      status: { not: "CANCELED" },
      id: excludeInterventionId ? { not: excludeInterventionId } : undefined,
      scheduledStart: { lt: effectiveEnd },
      OR: [
        { scheduledEnd: { gt: scheduledStart } },
        { scheduledEnd: null, scheduledStart: { gt: new Date(scheduledStart.getTime() - 60 * 60 * 1_000) } },
      ],
    },
    select: { id: true, title: true, scheduledStart: true, scheduledEnd: true },
    orderBy: { scheduledStart: "asc" },
  })
  const conflict = possibleConflicts.find((item) => planningSlotsOverlap(
    { scheduledStart, scheduledEnd },
    item,
  ))
  if (conflict) {
    const date = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" }).format(conflict.scheduledStart)
    return `Conflit de planning avec « ${conflict.title} » le ${date}.`
  }
  return null
}

export async function getOperationsDashboard() {
  return withAuth(async ({ companyId, role }) => {
    const [clients, sites, suppliers, products, warehouses, purchaseOrders, equipments, tickets, interventions, contracts, projects, members, customerOrders, goodsReceipts, reservations, deliveryNotes] = await Promise.all([
      prisma.client.findMany({ where: { companyId }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 500 }),
      prisma.customerSite.findMany({ where: { companyId }, include: { client: { select: { name: true } }, _count: { select: { equipments: true, serviceTickets: true } } }, orderBy: { updatedAt: "desc" }, take: 100 }),
      prisma.supplier.findMany({ where: { companyId, active: true }, orderBy: { name: "asc" }, take: 200 }),
      prisma.product.findMany({ where: { companyId, active: true }, include: { supplier: { select: { name: true } }, inventoryItems: { select: { quantity: true, reservedQuantity: true, reorderPoint: true } } }, orderBy: { label: "asc" }, take: 500 }),
      prisma.warehouse.findMany({ where: { companyId, active: true }, include: { inventoryItems: { include: { product: { select: { label: true, sku: true } } } } }, orderBy: { name: "asc" } }),
      prisma.purchaseOrder.findMany({ where: { companyId }, include: { supplier: { select: { name: true } }, project: { select: { name: true } }, approvedByMembership: { include: { user: { select: { name: true, email: true } } } }, lines: { include: { product: { select: { sku: true, label: true } }, supplierReturns: { select: { quantity: true } } }, orderBy: { order: "asc" } }, issues: { include: { product: { select: { label: true } }, purchaseOrderLine: { select: { label: true } } }, orderBy: { createdAt: "desc" } }, supplierReturns: { include: { product: { select: { label: true } }, warehouse: { select: { name: true } } }, orderBy: { createdAt: "desc" } } }, orderBy: { createdAt: "desc" }, take: 100 }),
      prisma.equipment.findMany({ where: { companyId }, include: { site: { include: { client: { select: { name: true } } } }, product: { select: { label: true, sku: true } } }, orderBy: { updatedAt: "desc" }, take: 200 }),
      prisma.serviceTicket.findMany({ where: { companyId, status: { not: "MERGED" } }, include: { client: { select: { name: true } }, site: { select: { label: true } }, equipment: { select: { label: true } }, assignedMembership: { include: { user: { select: { name: true, email: true } } } }, _count: { select: { interventions: true } } }, orderBy: [{ priority: "desc" }, { updatedAt: "desc" }], take: 200 }),
      prisma.fieldIntervention.findMany({
        where: { companyId },
        include: {
          site: { include: { client: { select: { name: true } } } },
          ticket: { select: { number: true } },
          assignedMembership: { include: { user: { select: { name: true, email: true } } } },
          files: { orderBy: { createdAt: "asc" }, select: { id: true, name: true, mimeType: true, size: true, kind: true, createdAt: true } },
          stockMovements: { where: { type: "OUT" }, include: { product: { select: { label: true, sku: true } }, warehouse: { select: { name: true } } }, orderBy: { happenedAt: "asc" } },
          expenses: { select: { id: true, label: true, amountCents: true, status: true }, orderBy: { createdAt: "asc" } },
          reservations: { orderBy: { createdAt: "asc" } },
        },
        orderBy: { scheduledStart: "asc" },
        take: 200,
      }),
      prisma.maintenanceContract.findMany({ where: { companyId }, include: { client: { select: { name: true } }, site: { select: { label: true } }, recurringInvoice: { select: { id: true, isActive: true } }, renewedFrom: { select: { id: true, number: true } }, _count: { select: { equipments: true, renewedContracts: true } } }, orderBy: [{ endDate: "asc" }, { nextVisitAt: "asc" }], take: 200 }),
      prisma.project.findMany({ where: { companyId, status: "ACTIVE" }, select: { id: true, name: true, clientId: true, siteId: true }, orderBy: { name: "asc" }, take: 300 }),
      prisma.membership.findMany({ where: { companyId, status: "ACTIVE" }, include: { user: { select: { name: true, email: true } } }, orderBy: { createdAt: "asc" } }),
      prisma.customerOrder.findMany({ where: { companyId }, include: { client: { select: { name: true } }, project: { select: { name: true } }, lines: true, invoices: { select: { id: true, type: true, status: true } }, _count: { select: { invoices: true, deliveryNotes: true, stockReservations: true } } }, orderBy: { createdAt: "desc" }, take: 150 }),
      prisma.goodsReceipt.findMany({ where: { companyId }, include: { purchaseOrder: { include: { supplier: { select: { name: true } } } }, warehouse: { select: { name: true } }, lines: { include: { product: { select: { sku: true, label: true } }, issues: true } } }, orderBy: { receivedAt: "desc" }, take: 100 }),
      prisma.stockReservation.findMany({ where: { companyId, status: "ACTIVE" }, include: { warehouse: { select: { name: true } }, product: { select: { sku: true, label: true } }, project: { select: { name: true } }, customerOrder: { select: { number: true } } }, orderBy: { createdAt: "desc" }, take: 150 }),
      prisma.deliveryNote.findMany({ where: { companyId }, include: { customerOrder: { include: { client: { select: { name: true } } } }, lines: true }, orderBy: { createdAt: "desc" }, take: 100 }),
    ])
    return { clients, sites, suppliers, products, warehouses, purchaseOrders, equipments, tickets, interventions, contracts, projects, members, customerOrders, goodsReceipts, reservations, deliveryNotes, canApprovePurchases: hasPermission(role, "purchases.approve") }
  }, "operations.read")
}

export async function getServiceTicketDetail(ticketId: string) {
  return withAuth(async ({ companyId }) => {
    const parsedId = id.safeParse(ticketId)
    if (!parsedId.success) return null
    const [ticket, members, company, serviceMacros, diagnosticGuides] = await Promise.all([
      prisma.serviceTicket.findFirst({
        where: { id: parsedId.data, companyId },
        include: {
          client: { include: { contacts: { orderBy: [{ isPrimary: "desc" }, { lastName: "asc" }] }, emailThreads: { where: { serviceTicketId: null }, select: { id: true, subject: true, lastMessageAt: true, unreadCount: true }, orderBy: { lastMessageAt: "desc" }, take: 50 } } },
          site: true,
          equipment: true,
          assignedMembership: { include: { user: { select: { name: true, email: true } } } },
          mergedTickets: {
            where: { companyId },
            include: {
              interventions: {
                include: {
                  assignedMembership: { include: { user: { select: { name: true, email: true } } } },
                  files: { orderBy: { createdAt: "asc" } },
                  reservations: { orderBy: { createdAt: "desc" } },
                },
                orderBy: { scheduledStart: "desc" },
              },
              emailThreads: { include: { messages: { include: { events: { orderBy: { occurredAt: "asc" } } }, orderBy: { createdAt: "asc" }, take: 200 } }, orderBy: { lastMessageAt: "asc" } },
              notes: { include: { authorMembership: { include: { user: { select: { name: true, email: true } } } } }, orderBy: { createdAt: "asc" }, take: 200 },
              diagnostics: { include: { performedByMembership: { include: { user: { select: { name: true, email: true } } } } }, orderBy: { completedAt: "desc" }, take: 50 },
            },
            orderBy: { mergedAt: "asc" },
          },
          interventions: {
            include: {
              assignedMembership: { include: { user: { select: { name: true, email: true } } } },
              files: { orderBy: { createdAt: "asc" } },
              reservations: { orderBy: { createdAt: "desc" } },
            },
            orderBy: { scheduledStart: "desc" },
          },
          emailThreads: { include: { messages: { include: { events: { orderBy: { occurredAt: "asc" } } }, orderBy: { createdAt: "asc" }, take: 200 } }, orderBy: { lastMessageAt: "asc" } },
          notes: { include: { authorMembership: { include: { user: { select: { name: true, email: true } } } } }, orderBy: { createdAt: "asc" }, take: 200 },
          diagnostics: { include: { performedByMembership: { include: { user: { select: { name: true, email: true } } } } }, orderBy: { completedAt: "desc" }, take: 50 },
        },
      }),
      prisma.membership.findMany({ where: { companyId, status: "ACTIVE" }, include: { user: { select: { name: true, email: true } } }, orderBy: { createdAt: "asc" } }),
      prisma.company.findUnique({ where: { id: companyId }, select: { name: true, serviceTimezone: true, serviceDayStart: true, serviceDayEnd: true, serviceWorkdays: true, serviceHolidays: true, serviceFirstResponseHours: true, serviceResolutionHours: true } }),
      prisma.emailTemplate.findMany({ where: { companyId, category: "SERVICE", status: "ACTIVE" }, select: { id: true, name: true, subject: true, bodyHtml: true }, orderBy: { name: "asc" }, take: 200 }),
      prisma.serviceDiagnosticGuide.findMany({ where: { companyId, status: "ACTIVE" }, orderBy: [{ priority: "desc" }, { updatedAt: "desc" }], take: 200 }),
    ])
    if (!ticket) return null
    const mergedInto = ticket.mergedIntoTicketId ? await prisma.serviceTicket.findFirst({
      where: { id: ticket.mergedIntoTicketId, companyId },
      select: { id: true, number: true, title: true },
    }) : null
    const duplicateRecords = ticket.status === "MERGED" ? [] : await prisma.serviceTicket.findMany({
      where: {
        companyId,
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
    const duplicateCandidates = duplicateRecords.flatMap((candidate) => {
      const match = scoreServiceDuplicate(ticket, candidate)
      return match ? [{ ...candidate, ...match }] : []
    }).sort((left, right) => right.score - left.score || left.requestedAt.getTime() - right.requestedAt.getTime()).slice(0, 10)
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
    const diagnosticView = (item: typeof ticket.diagnostics[number], mergedFrom: { id: string; number: string } | null) => {
      const snapshot = item.guideSnapshot && typeof item.guideSnapshot === "object" && !Array.isArray(item.guideSnapshot)
        ? item.guideSnapshot as Record<string, unknown>
        : {}
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
    const guides = diagnosticGuides.map((guide) => {
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
    }).filter((guide) => guide.steps.length > 0).sort((left, right) => Number(right.suggested) - Number(left.suggested) || right.score - left.score || left.name.localeCompare(right.name, "fr"))
    const warrantyStatus = equipmentWarrantyStatus(ticket.equipment?.warrantyUntil)
    const policy = serviceSlaPolicy(company)
    const contact = ticket.client.contacts[0]
    const variables = { "ticket.number": ticket.number, "ticket.title": ticket.title, "client.name": ticket.client.name, "contact.firstName": contact?.firstName || "", "contact.lastName": contact?.lastName || "", "assigned.name": ticket.assignedMembership?.user.name || ticket.assignedMembership?.user.email || "notre équipe", "company.name": company?.name || "notre entreprise" }
    const macros = serviceMacros.map((macro) => ({ id: macro.id, name: macro.name, subject: renderServiceMacro(macro.subject, variables), bodyText: renderServiceMacro(serviceMacroText(macro.bodyHtml), variables) }))
    return { ...ticket, mergedInto, mergedTickets: mergedTicketSummaries, interventions, emailThreads, notes, diagnostics, diagnosticGuides: guides, warrantyStatus, duplicateCandidates, sla: { resolution: serviceResolutionTarget(ticket, policy), firstResponse: serviceFirstResponseTarget(ticket, policy), policy }, macros, members: members.map((member) => ({ id: member.id, name: member.user.name || member.user.email || "Membre" })) }
  }, "service.read")
}

export async function getFieldInterventionDetail(interventionId: string) {
  return withAuth(async ({ companyId }) => {
    const parsedId = id.safeParse(interventionId)
    if (!parsedId.success) return null
    return prisma.fieldIntervention.findFirst({
    where: { id: parsedId.data, companyId },
    include: {
      site: { include: { client: { include: { contacts: { orderBy: [{ isPrimary: "desc" }, { lastName: "asc" }] } } } } },
      ticket: true,
      project: true,
      maintenanceContract: true,
      assignedMembership: { include: { user: { select: { name: true, email: true } } } },
      files: { orderBy: { createdAt: "asc" } },
      stockMovements: { include: { product: true, warehouse: true }, orderBy: { happenedAt: "desc" } },
      expenses: { orderBy: { date: "desc" } },
      reservations: { orderBy: { createdAt: "desc" } },
    },
    })
  }, "operations.read")
}

export async function getEquipmentDetail(equipmentId: string) {
  return withAuth(async ({ companyId }) => {
    const parsedId = id.safeParse(equipmentId)
    if (!parsedId.success) return null
    return prisma.equipment.findFirst({
    where: { id: parsedId.data, companyId },
    include: {
      site: { include: { client: { include: { contacts: { orderBy: [{ isPrimary: "desc" }, { lastName: "asc" }] } } } } },
      product: { include: { supplier: true } },
      tickets: { include: { assignedMembership: { include: { user: { select: { name: true, email: true } } } }, _count: { select: { interventions: true } } }, orderBy: { requestedAt: "desc" } },
      maintenanceContracts: { include: { contract: true }, orderBy: { contract: { createdAt: "desc" } } },
    },
    })
  }, "operations.read")
}

export async function getSupplierDetail(supplierId: string) {
  return withAuth(async ({ companyId }) => {
    const parsedId = id.safeParse(supplierId)
    if (!parsedId.success) return null
    return prisma.supplier.findFirst({
    where: { id: parsedId.data, companyId },
    include: {
      products: { include: { inventoryItems: true }, orderBy: { label: "asc" }, take: 300 },
      productPrices: { include: { product: { select: { id: true, sku: true, label: true } } }, orderBy: { validFrom: "desc" }, take: 100 },
      purchaseOrders: { include: { project: { select: { id: true, name: true } }, lines: true, issues: true }, orderBy: { orderDate: "desc" }, take: 100 },
      supplierReturns: { include: { product: { select: { label: true, sku: true } }, warehouse: { select: { name: true } } }, orderBy: { shippedAt: "desc" }, take: 100 },
    },
    })
  }, "operations.read")
}

export async function getPurchaseOrderDetail(purchaseOrderId: string) {
  return withAuth(async ({ companyId, role }) => {
    const parsedId = id.safeParse(purchaseOrderId)
    if (!parsedId.success) return null
    const order = await prisma.purchaseOrder.findFirst({
      where: { id: parsedId.data, companyId },
      include: {
        supplier: true,
        project: { include: { client: { select: { id: true, name: true } } } },
        approvedByMembership: { include: { user: { select: { name: true, email: true } } } },
        lines: { include: { product: true, receiptLines: { include: { goodsReceipt: { include: { warehouse: true } }, issues: true } }, supplierReturns: { include: { warehouse: true, product: true } } }, orderBy: { order: "asc" } },
        goodsReceipts: { include: { warehouse: true, lines: { include: { product: true, issues: true } } }, orderBy: { receivedAt: "desc" } },
        issues: { include: { product: true, purchaseOrderLine: true }, orderBy: { createdAt: "desc" } },
        supplierReturns: { include: { product: true, warehouse: true }, orderBy: { shippedAt: "desc" } },
      },
    })
    return order ? { ...order, canApprovePurchases: hasPermission(role, "purchases.approve") } : null
  }, "operations.read")
}

export async function getHelpDeskDashboard(input: unknown = {}) {
  return withAuth(async ({ companyId }) => {
    const parsedFilters = z.object({
      status: z.enum(["ACTIVE", "OPEN", "QUALIFIED", "PLANNED", "WAITING", "RESOLVED", "CLOSED", "ALL"]).default("ACTIVE"),
      priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT", "ALL"]).default("ALL"),
      assignedMembershipId: z.union([id, z.literal("ALL"), z.literal("UNASSIGNED")]).default("ALL"),
    }).safeParse(input)
    const filters = parsedFilters.success ? parsedFilters.data : { status: "ACTIVE" as const, priority: "ALL" as const, assignedMembershipId: "ALL" as const }
    const activeStatuses = ["OPEN", "QUALIFIED", "PLANNED", "WAITING"]
    const [tickets, company] = await Promise.all([prisma.serviceTicket.findMany({
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
    }), prisma.company.findUnique({ where: { id: companyId }, select: { serviceTimezone: true, serviceDayStart: true, serviceDayEnd: true, serviceWorkdays: true, serviceHolidays: true, serviceFirstResponseHours: true, serviceResolutionHours: true } })])
    const members = await prisma.membership.findMany({
      where: { companyId, status: "ACTIVE" },
      include: { user: { select: { name: true, email: true } }, _count: { select: { assignedTickets: { where: { status: { in: activeStatuses } } } } } },
      orderBy: { createdAt: "asc" },
    })
    return {
      filters,
      members: members.map((member) => ({ id: member.id, name: member.user.name || member.user.email || "Membre", openTickets: member._count.assignedTickets, capacity: member.serviceTicketCapacity, available: member.serviceAvailable })),
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
    const client = await prisma.client.findFirst({ where: { id: data.clientId, companyId }, select: { id: true } })
    if (!client) throw new Error("Client introuvable")
    const site = await prisma.customerSite.create({ data: { companyId, ...data } })
    revalidateOperations()
    return { success: true as const, id: site.id }
  }, "crm.write")
}

export async function createSupplier(input: unknown) {
  return withAuth(async ({ companyId }) => {
    const data = supplierSchema.parse(input)
    const supplier = await prisma.supplier.create({ data: { companyId, ...data } })
    revalidateOperations()
    return { success: true as const, id: supplier.id }
  }, "operations.write")
}

export async function createProduct(input: unknown) {
  return withAuth(async ({ companyId }) => {
    const data = productSchema.parse(input)
    if (data.supplierId && !await prisma.supplier.findFirst({ where: { id: data.supplierId, companyId }, select: { id: true } })) throw new Error("Fournisseur introuvable")
    const product = await prisma.product.create({ data: { companyId, ...data } })
    revalidateOperations()
    return { success: true as const, id: product.id }
  }, "operations.write")
}

export async function createWarehouse(input: unknown) {
  return withAuth(async ({ companyId }) => {
    const data = warehouseSchema.parse(input)
    const warehouse = await prisma.warehouse.create({ data: { companyId, ...data } })
    revalidateOperations()
    return { success: true as const, id: warehouse.id }
  }, "operations.write")
}

export async function createEquipment(input: unknown) {
  return withAuth(async ({ companyId }) => {
    const data = equipmentSchema.parse(input)
    const site = await prisma.customerSite.findFirst({ where: { id: data.siteId, companyId }, select: { id: true } })
    if (!site) throw new Error("Site client introuvable")
    if (data.productId && !await prisma.product.findFirst({ where: { id: data.productId, companyId }, select: { id: true } })) throw new Error("Produit introuvable")
    const equipment = await prisma.equipment.create({ data: { companyId, ...data } })
    revalidateOperations()
    return { success: true as const, id: equipment.id }
  }, "operations.write")
}

export async function createServiceTicket(input: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    const data = ticketSchema.parse(input)
    const client = await prisma.client.findFirst({ where: { id: data.clientId, companyId }, select: { id: true } })
    if (!client) throw new Error("Client introuvable")
    if (data.siteId && !await prisma.customerSite.findFirst({ where: { id: data.siteId, companyId, clientId: data.clientId }, select: { id: true } })) throw new Error("Le site n'appartient pas à ce client")
    const equipment = data.equipmentId ? await prisma.equipment.findFirst({ where: { id: data.equipmentId, companyId }, select: { id: true, siteId: true, site: { select: { clientId: true } } } }) : null
    if (data.equipmentId && !equipment) throw new Error("Équipement introuvable")
    if (equipment && equipment.site.clientId !== data.clientId) throw new Error("L’équipement n’appartient pas à ce client")
    if (equipment && data.siteId && equipment.siteId !== data.siteId) throw new Error("L’équipement n’appartient pas au site sélectionné")
    if (data.assignedMembershipId && !await prisma.membership.findFirst({ where: { id: data.assignedMembershipId, companyId, status: "ACTIVE" }, select: { id: true } })) throw new Error("Intervenant introuvable")
    const siteId = data.siteId || equipment?.siteId || null
    const prefix = buildYearlyDocumentPrefix("SAV-", "SAV-")
    const ticket = await withDocumentNumberRetry(async () => {
      const last = await prisma.serviceTicket.findFirst({ where: { companyId, number: { startsWith: prefix } }, orderBy: { number: "desc" }, select: { number: true } })
      return prisma.serviceTicket.create({ data: { companyId, ...data, siteId, number: nextDocumentNumber(last?.number, prefix) } })
    }, { label: "le ticket SAV" })
    let assignedMembershipId = ticket.assignedMembershipId
    if (!assignedMembershipId) {
      const routing = await getServiceRoutingRecommendation(companyId, ticket.id)
      if (routing.recommendation) {
        assignedMembershipId = routing.recommendation.membershipId
        await prisma.serviceTicket.update({ where: { id: ticket.id }, data: { assignedMembershipId, requiredSkill: ticket.requiredSkill || routing.requiredSkill, territory: ticket.territory || routing.territory, routingReason: routing.recommendation.reason, routedAt: new Date() } })
      }
    }
    await logAction({ userId, action: "CREATE_SERVICE_TICKET", resource: "SERVICE_TICKET", resourceId: ticket.id, payload: { number: ticket.number, clientId: ticket.clientId, assignedMembershipId } })
    revalidateOperations()
    return { success: true as const, id: ticket.id, number: ticket.number, assignedMembershipId }
  }, "service.write")
}

export async function createFieldIntervention(input: unknown) {
  return withAuth(async ({ companyId }) => {
    const data = interventionSchema.parse(input)
    const site = await prisma.customerSite.findFirst({ where: { id: data.siteId, companyId }, select: { id: true } })
    if (!site) throw new Error("Site client introuvable")
    if (data.ticketId && !await prisma.serviceTicket.findFirst({ where: { id: data.ticketId, companyId, status: { not: "MERGED" }, mergedIntoTicketId: null }, select: { id: true } })) throw new Error("Ticket introuvable ou déjà fusionné")
    if (data.projectId && !await prisma.project.findFirst({ where: { id: data.projectId, companyId }, select: { id: true } })) throw new Error("Chantier introuvable")
    if (data.assignedMembershipId && !await prisma.membership.findFirst({ where: { id: data.assignedMembershipId, companyId, status: "ACTIVE" }, select: { id: true } })) throw new Error("Intervenant introuvable")
    const scheduledStart = new Date(data.scheduledStart)
    const scheduledEnd = data.scheduledEnd ? new Date(data.scheduledEnd) : null
    const conflict = await findInterventionSlotConflict({ companyId, assignedMembershipId: data.assignedMembershipId, scheduledStart, scheduledEnd })
    if (conflict) return { success: false as const, error: conflict }
    const intervention = await prisma.fieldIntervention.create({
      data: {
        companyId,
        ...data,
        scheduledStart,
        scheduledEnd,
      },
    })
    revalidateOperations()
    return { success: true as const, id: intervention.id }
  }, "operations.write")
}

export async function rescheduleFieldIntervention(input: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    const data = interventionPlanningSchema.parse(input)
    const intervention = await prisma.fieldIntervention.findFirst({
      where: { id: data.interventionId, companyId },
      select: { id: true, status: true },
    })
    if (!intervention) throw new Error("Intervention introuvable")
    if (["CANCELED", "COMPLETED"].includes(intervention.status)) throw new Error("Une intervention terminée ou annulée ne peut pas être replanifiée")
    if (data.assignedMembershipId && !await prisma.membership.findFirst({ where: { id: data.assignedMembershipId, companyId, status: "ACTIVE" }, select: { id: true } })) throw new Error("Intervenant introuvable")
    const scheduledStart = new Date(data.scheduledStart)
    const scheduledEnd = new Date(data.scheduledEnd)
    const conflict = await findInterventionSlotConflict({
      companyId,
      assignedMembershipId: data.assignedMembershipId,
      scheduledStart,
      scheduledEnd,
      excludeInterventionId: intervention.id,
    })
    if (conflict) return { success: false as const, error: conflict }
    await prisma.fieldIntervention.update({
      where: { id: intervention.id },
      data: { assignedMembershipId: data.assignedMembershipId, scheduledStart, scheduledEnd },
    })
    await logAction({
      userId,
      action: "UPDATE_FIELD_INTERVENTION_PLAN",
      resource: "FIELD_INTERVENTION",
      resourceId: intervention.id,
      payload: { assignedMembershipId: data.assignedMembershipId, scheduledStart, scheduledEnd },
    })
    revalidateOperations()
    return { success: true as const }
  }, "operations.write")
}

export async function createMaintenanceContract(input: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    const data = maintenanceContractSchema.parse(input)
    const [client, site, equipmentCount, company] = await Promise.all([
      prisma.client.findFirst({ where: { id: data.clientId, companyId }, select: { id: true } }),
      prisma.customerSite.findFirst({ where: { id: data.siteId, companyId, clientId: data.clientId }, select: { id: true } }),
      data.equipmentIds.length ? prisma.equipment.count({ where: { id: { in: data.equipmentIds }, companyId, siteId: data.siteId } }) : 0,
      prisma.company.findUnique({ where: { id: companyId }, select: { isTvaApplicable: true } }),
    ])
    if (!client) throw new Error("Client introuvable")
    if (!site) throw new Error("Le site n’appartient pas à ce client")
    if (equipmentCount !== data.equipmentIds.length) throw new Error("Un équipement ne correspond pas au site sélectionné")
    if (!company) throw new Error("Entreprise introuvable")

    const prefix = buildYearlyDocumentPrefix("ENT-", "ENT-")
    const contract = await withDocumentNumberRetry(async () => {
      const last = await prisma.maintenanceContract.findFirst({ where: { companyId, number: { startsWith: prefix } }, orderBy: { number: "desc" }, select: { number: true } })
      return prisma.$transaction(async (tx) => {
        const startDate = new Date(data.startDate)
        const created = await tx.maintenanceContract.create({
          data: {
            companyId,
            clientId: data.clientId,
            siteId: data.siteId,
            number: nextDocumentNumber(last?.number, prefix),
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
                lines: [{ label: data.label, description: `Échéance du contrat ${created.number}`, quantity: 1, unitPriceCents: data.priceCents, tvaRate: company.isTvaApplicable ? data.tvaRate : 0 }],
              },
            },
          })
        }
        return created
      })
    }, { label: "le contrat d’entretien" })
    await logAction({ userId, action: "CREATE_MAINTENANCE_CONTRACT", resource: "MAINTENANCE_CONTRACT", resourceId: contract.id, payload: { number: contract.number, clientId: contract.clientId, siteId: contract.siteId } })
    revalidateOperations()
    return { success: true as const, id: contract.id, number: contract.number }
  }, "service.write")
}

export async function updateMaintenanceRenewalSettings(input: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    const data = maintenanceRenewalSettingsSchema.parse(input)
    const contract = await prisma.maintenanceContract.findFirst({ where: { id: data.contractId, companyId }, select: { id: true, number: true, renewalStatus: true } })
    if (!contract) throw new Error("Contrat d’entretien introuvable")
    if (contract.renewalStatus === "RENEWED") throw new Error("Ce terme a déjà été renouvelé")
    await prisma.maintenanceContract.update({ where: { id: contract.id }, data: { noticeDays: data.noticeDays, indexationRate: data.indexationRate, autoRenew: data.autoRenew, renewalStatus: data.renewalStatus, renewalNotes: data.renewalNotes } })
    await logAction({ userId, action: "UPDATE_MAINTENANCE_RENEWAL", resource: "MAINTENANCE_CONTRACT", resourceId: contract.id, payload: { number: contract.number, noticeDays: data.noticeDays, indexationRate: data.indexationRate, autoRenew: data.autoRenew, renewalStatus: data.renewalStatus } })
    revalidateOperations()
    return { success: true as const }
  }, "service.write")
}

export async function renewMaintenanceContract(contractId: string) {
  return withAuth(async ({ companyId, userId }) => {
    const parsedId = id.parse(contractId)
    const [contract, company] = await Promise.all([
      prisma.maintenanceContract.findFirst({
        where: { id: parsedId, companyId },
        include: { equipments: { select: { equipmentId: true } }, recurringInvoice: { select: { isActive: true } }, _count: { select: { renewedContracts: true } } },
      }),
      prisma.company.findUnique({ where: { id: companyId }, select: { isTvaApplicable: true } }),
    ])
    if (!contract || !company) throw new Error("Contrat d’entretien introuvable")
    if (!contract.endDate) throw new Error("Renseignez une date de fin avant de renouveler ce contrat")
    if (contract.renewalStatus === "DECLINED") throw new Error("Le renouvellement a été refusé. Modifiez d’abord la décision.")
    if (contract.renewalStatus === "RENEWED" || contract._count.renewedContracts > 0) throw new Error("Ce terme a déjà été renouvelé")
    const term = nextMaintenanceTerm(contract.startDate, contract.endDate)
    const nextPriceCents = indexedMaintenancePrice(contract.priceCents, contract.indexationRate)
    const prefix = buildYearlyDocumentPrefix("ENT-", "ENT-")
    const renewed = await withDocumentNumberRetry(async () => {
      const last = await prisma.maintenanceContract.findFirst({ where: { companyId, number: { startsWith: prefix } }, orderBy: { number: "desc" }, select: { number: true } })
      return prisma.$transaction(async (transaction) => {
        const created = await transaction.maintenanceContract.create({
          data: {
            companyId,
            clientId: contract.clientId,
            siteId: contract.siteId,
            number: nextDocumentNumber(last?.number, prefix),
            label: contract.label,
            status: "ACTIVE",
            startDate: term.startDate,
            endDate: term.endDate,
            frequency: contract.frequency,
            nextVisitAt: term.startDate,
            priceCents: nextPriceCents,
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
          await transaction.recurringInvoice.create({ data: { companyId, clientId: contract.clientId, maintenanceContractId: created.id, label: `Entretien · ${contract.label}`, frequency: recurringFrequency, nextGenDate: term.startDate, template: { object: `Contrat d’entretien ${created.number} · ${contract.label}`, projectId: null, dueDays: contract.invoiceDueDays, lines: [{ label: contract.label, description: `Échéance du contrat ${created.number}`, quantity: 1, unitPriceCents: nextPriceCents, tvaRate: company.isTvaApplicable ? contract.tvaRate : 0 }] } } })
        }
        const updated = await transaction.maintenanceContract.updateMany({ where: { id: contract.id, companyId, renewalStatus: { not: "RENEWED" } }, data: { status: "RENEWED", renewalStatus: "RENEWED", renewedAt: new Date(), nextVisitAt: null } })
        if (updated.count !== 1) throw new Error("Le contrat a changé pendant le renouvellement. Rechargez la page.")
        return created
      }, { isolationLevel: "Serializable" })
    }, { label: "le renouvellement du contrat d’entretien" })
    await logAction({ userId, action: "RENEW_MAINTENANCE_CONTRACT", resource: "MAINTENANCE_CONTRACT", resourceId: renewed.id, payload: { previousContractId: contract.id, previousNumber: contract.number, number: renewed.number, startDate: renewed.startDate, endDate: renewed.endDate, priceCents: renewed.priceCents, indexationRate: contract.indexationRate } })
    revalidateOperations()
    revalidatePath("/dashboard/service/customer-success")
    return { success: true as const, id: renewed.id, number: renewed.number }
  }, "service.write")
}

export async function createPurchaseOrder(input: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    const data = purchaseOrderSchema.parse(input)
    const lines = data.lines?.length ? data.lines : [{ productId: data.productId, label: data.label!, quantity: data.quantity!, unitPriceCents: data.unitPriceCents! }]
    if (!await prisma.supplier.findFirst({ where: { id: data.supplierId, companyId }, select: { id: true } })) throw new Error("Fournisseur introuvable")
    if (data.projectId && !await prisma.project.findFirst({ where: { id: data.projectId, companyId }, select: { id: true } })) throw new Error("Chantier introuvable")
    const productIds = [...new Set(lines.flatMap((line) => line.productId ? [line.productId] : []))]
    if (productIds.length && await prisma.product.count({ where: { id: { in: productIds }, companyId, active: true } }) !== productIds.length) throw new Error("Un produit fournisseur est introuvable")
    const prefix = buildYearlyDocumentPrefix("ACH-", "ACH-")
    const totalHtCents = lines.reduce((sum, line) => sum + line.quantity * line.unitPriceCents, 0)
    const order = await withDocumentNumberRetry(async () => {
      const last = await prisma.purchaseOrder.findFirst({ where: { companyId, number: { startsWith: prefix } }, orderBy: { number: "desc" }, select: { number: true } })
      return prisma.purchaseOrder.create({
        data: {
          companyId,
          supplierId: data.supplierId,
          projectId: data.projectId,
          expectedAt: data.expectedAt,
          notes: data.notes,
          number: nextDocumentNumber(last?.number, prefix),
          totalHtCents,
          lines: { create: lines.map((line, order) => ({ ...line, order })) },
        },
      })
    }, { label: "la commande fournisseur" })
    await logAction({ userId, action: "CREATE_PURCHASE_ORDER", resource: "PURCHASE_ORDER", resourceId: order.id, payload: { number: order.number, supplierId: data.supplierId, lineCount: lines.length, totalHtCents } })
    revalidateOperations()
    return { success: true as const, id: order.id, number: order.number }
  }, "operations.write")
}

export async function submitPurchaseOrder(purchaseOrderId: string) {
  return withAuth(async ({ companyId, userId }) => {
    const parsedId = id.parse(purchaseOrderId)
    const order = await prisma.purchaseOrder.findFirst({ where: { id: parsedId, companyId, status: "DRAFT" }, select: { id: true, number: true, _count: { select: { lines: true } } } })
    if (!order) throw new Error("Commande brouillon introuvable")
    if (!order._count.lines) throw new Error("La commande ne contient aucune ligne")
    const claimed = await prisma.purchaseOrder.updateMany({ where: { id: order.id, companyId, status: "DRAFT" }, data: { status: "PENDING_APPROVAL", submittedAt: new Date() } })
    if (claimed.count !== 1) throw new Error("La commande a déjà changé d’état")
    await logAction({ userId, action: "SUBMIT_PURCHASE_ORDER", resource: "PURCHASE_ORDER", resourceId: order.id, payload: { number: order.number } })
    revalidateOperations()
    return { success: true as const }
  }, "operations.write")
}

export async function approvePurchaseOrder(purchaseOrderId: string) {
  return withAuth(async ({ companyId, userId, membershipId }) => {
    const parsedId = id.parse(purchaseOrderId)
    const order = await prisma.purchaseOrder.findFirst({ where: { id: parsedId, companyId, status: "PENDING_APPROVAL" }, select: { id: true, number: true, totalHtCents: true } })
    if (!order) throw new Error("Commande en attente d’approbation introuvable")
    const claimed = await prisma.purchaseOrder.updateMany({ where: { id: order.id, companyId, status: "PENDING_APPROVAL" }, data: { status: "APPROVED", approvedAt: new Date(), approvedByMembershipId: membershipId } })
    if (claimed.count !== 1) throw new Error("La commande a déjà été traitée")
    await logAction({ userId, action: "APPROVE_PURCHASE_ORDER", resource: "PURCHASE_ORDER", resourceId: order.id, payload: { number: order.number, totalHtCents: order.totalHtCents } })
    revalidateOperations()
    return { success: true as const }
  }, "purchases.approve")
}

export async function sendPurchaseOrder(purchaseOrderId: string) {
  return withAuth(async ({ companyId, userId }) => {
    const parsedId = id.parse(purchaseOrderId)
    const order = await prisma.purchaseOrder.findFirst({ where: { id: parsedId, companyId, status: "APPROVED" }, select: { id: true, number: true } })
    if (!order) throw new Error("La commande doit être approuvée avant envoi")
    const claimed = await prisma.purchaseOrder.updateMany({ where: { id: order.id, companyId, status: "APPROVED" }, data: { status: "SENT", sentAt: new Date() } })
    if (claimed.count !== 1) throw new Error("La commande a déjà été envoyée")
    await logAction({ userId, action: "SEND_PURCHASE_ORDER", resource: "PURCHASE_ORDER", resourceId: order.id, payload: { number: order.number } })
    revalidateOperations()
    return { success: true as const }
  }, "operations.write")
}

export async function acknowledgePurchaseOrder(input: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    const data = purchaseAcknowledgementSchema.parse(input)
    const order = await prisma.purchaseOrder.findFirst({ where: { id: data.purchaseOrderId, companyId, status: { in: ["SENT", "ACKNOWLEDGED"] } }, select: { id: true, number: true } })
    if (!order) throw new Error("Commande envoyée introuvable")
    await prisma.purchaseOrder.update({ where: { id: order.id }, data: { status: "ACKNOWLEDGED", acknowledgedAt: new Date(), supplierReference: data.supplierReference, confirmedExpectedAt: new Date(data.confirmedExpectedAt) } })
    await logAction({ userId, action: "ACKNOWLEDGE_PURCHASE_ORDER", resource: "PURCHASE_ORDER", resourceId: order.id, payload: { number: order.number, supplierReference: data.supplierReference, confirmedExpectedAt: data.confirmedExpectedAt } })
    revalidateOperations()
    return { success: true as const }
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
    const totalTvaCents = Math.round(totalHtCents * data.tvaRate / 100)
    if (data.depositCents > totalHtCents + totalTvaCents) throw new Error("L'acompte dépasse le total de la commande")
    const prefix = buildYearlyDocumentPrefix("CMD-", "CMD-")
    const order = await withDocumentNumberRetry(async () => {
      const last = await prisma.customerOrder.findFirst({ where: { companyId, number: { startsWith: prefix } }, orderBy: { number: "desc" }, select: { number: true } })
      return prisma.customerOrder.create({
        data: {
          companyId,
          clientId: data.clientId,
          projectId: data.projectId,
          number: nextDocumentNumber(last?.number, prefix),
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
    }, { label: "la commande client" })
    revalidateOperations()
    return { success: true as const, id: order.id, number: order.number }
  }, "operations.write")
}

export async function convertQuoteToCustomerOrder(quoteId: string) {
  return withAuth(async ({ companyId, userId }) => {
    const parsedQuoteId = id.parse(quoteId)
    const quote = await prisma.quote.findFirst({
      where: { id: parsedQuoteId, companyId },
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
    if (quote.customerOrder) return { success: true as const, id: quote.customerOrder.id, number: quote.customerOrder.number, existing: true as const }
    if (!['SENT', 'ACCEPTED'].includes(quote.status)) throw new Error("Envoyez ou acceptez le devis avant de créer la commande")
    const version = quote.versions[0]
    if (!version) throw new Error("Le devis ne contient aucune version")
    const lines = version.sections.flatMap((section) => section.lines)
    if (!lines.length) throw new Error("Le devis ne contient aucune ligne")

    const prefix = buildYearlyDocumentPrefix("CMD-", "CMD-")
    const order = await withDocumentNumberRetry(async () => {
      const last = await prisma.customerOrder.findFirst({ where: { companyId, number: { startsWith: prefix } }, orderBy: { number: "desc" }, select: { number: true } })
      return prisma.$transaction(async (tx) => {
        const projectId = quote.projectId ?? (await tx.project.create({
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
        })).id
        const created = await tx.customerOrder.create({
          data: {
            companyId,
            clientId: quote.clientId,
            projectId,
            quoteId: quote.id,
            number: nextDocumentNumber(last?.number, prefix),
            status: "CONFIRMED",
            acceptedAt: new Date(),
            totalHtCents: version.totalHtCents,
            totalTvaCents: version.totalTvaCents,
            totalTtcCents: version.totalTtcCents,
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
        await tx.quote.update({ where: { id: quote.id }, data: { status: "ACCEPTED", projectId } })
        return created
      })
    }, { label: "la commande issue du devis" })
    await logAction({ userId, action: "CREATE_CUSTOMER_ORDER", resource: "CUSTOMER_ORDER", resourceId: order.id, payload: { quoteId: quote.id, number: order.number } })
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
      where: { id: data.customerOrderId, companyId },
      include: { invoices: { select: { id: true, number: true, type: true, status: true, totalTtcCents: true } } },
    })
    if (!order) throw new Error("Commande client introuvable")
    if (order.status === "CANCELLED") throw new Error("Une commande annulée ne peut pas être facturée")
    if (data.mode === "DEPOSIT") {
      const existingDeposit = order.invoices.find((invoice) => invoice.type === "DEPOSIT" && invoice.status !== "CANCELLED")
      if (existingDeposit) return { success: true as const, id: existingDeposit.id, number: existingDeposit.number, existing: true as const }
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

    const invoice = await withDocumentNumberRetry(async () => {
      const last = await prisma.invoice.findFirst({ where: { companyId, number: { startsWith: prefix } }, orderBy: { number: "desc" }, select: { number: true } })
      return prisma.$transaction(async (tx) => {
        const created = await tx.invoice.create({
          data: {
            companyId,
            clientId: order.clientId,
            projectId: order.projectId,
            customerOrderId: order.id,
            number: nextDocumentNumber(last?.number, prefix),
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
        const nextRemaining = remaining - amountTtcCents
        await tx.customerOrder.update({ where: { id: order.id }, data: { billingStatus: nextRemaining <= 0 ? "INVOICED" : "PARTIALLY_INVOICED" } })
        return created
      })
    }, { label: data.mode === "DEPOSIT" ? "la facture d’acompte" : "la facture de solde" })
    await logAction({ userId, action: "CREATE_INVOICE_FROM_ORDER", resource: "INVOICE", resourceId: invoice.id, payload: { customerOrderId: order.id, mode: data.mode, amountTtcCents } })
    revalidateOperations()
    revalidatePath("/dashboard/factures")
    return { success: true as const, id: invoice.id, number: invoice.number, existing: false as const }
  }, "finance.write")
}

export async function receivePurchaseOrder(input: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    const data = goodsReceiptSchema.parse(input)
    const [warehouse, line] = await Promise.all([
      prisma.warehouse.findFirst({ where: { id: data.warehouseId, companyId, active: true }, select: { id: true } }),
      prisma.purchaseOrderLine.findFirst({
        where: { id: data.purchaseOrderLineId, purchaseOrderId: data.purchaseOrderId, purchaseOrder: { companyId } },
        include: { purchaseOrder: { select: { id: true, number: true, status: true } }, product: { select: { id: true } } },
      }),
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
    const receipt = await withDocumentNumberRetry(async () => prisma.$transaction(async (tx) => {
      const last = await tx.goodsReceipt.findFirst({ where: { companyId, number: { startsWith: prefix } }, orderBy: { number: "desc" }, select: { number: true } })
      const created = await tx.goodsReceipt.create({
        data: {
          companyId,
          purchaseOrderId: data.purchaseOrderId,
          warehouseId: data.warehouseId,
          number: nextDocumentNumber(last?.number, prefix),
          supplierReference: data.supplierReference,
          notes: data.notes,
          lines: { create: { purchaseOrderLineId: line.id, productId, quantity: data.quantity, acceptedQuantity, rejectedQuantity: data.rejectedQuantity, unitCostCents: line.unitPriceCents } },
        },
        include: { lines: { select: { id: true } } },
      })
      if (acceptedQuantity) {
        await tx.purchaseOrderLine.update({ where: { id: line.id }, data: { receivedQuantity: { increment: acceptedQuantity } } })
        if (productId) {
          const current = await tx.inventoryItem.findUnique({ where: { warehouseId_productId: { warehouseId: data.warehouseId, productId } } })
          const next = calculateStockBalance({ quantity: current?.quantity ?? 0, reservedQuantity: current?.reservedQuantity ?? 0, type: "IN", movementQuantity: acceptedQuantity })
          await tx.inventoryItem.upsert({ where: { warehouseId_productId: { warehouseId: data.warehouseId, productId } }, update: next, create: { companyId, warehouseId: data.warehouseId, productId, ...next } })
          await tx.stockMovement.create({ data: { companyId, warehouseId: data.warehouseId, productId, projectId: null, type: "IN", quantity: acceptedQuantity, unitCostCents: line.unitPriceCents, reference: created.number, notes: `Réception ${line.purchaseOrder.number}` } })
        }
      }
      if (data.rejectedQuantity) {
        await tx.purchaseIssue.create({ data: { companyId, purchaseOrderId: data.purchaseOrderId, purchaseOrderLineId: line.id, goodsReceiptLineId: created.lines[0].id, productId, type: data.issueType!, quantity: data.rejectedQuantity, notes: data.issueNotes } })
      }
      const orderLines = await tx.purchaseOrderLine.findMany({ where: { purchaseOrderId: data.purchaseOrderId }, select: { quantity: true, receivedQuantity: true, creditedQuantity: true } })
      const complete = orderLines.every((orderLine) => orderLine.receivedQuantity + orderLine.creditedQuantity >= orderLine.quantity)
      const openIssues = await tx.purchaseIssue.count({ where: { purchaseOrderId: data.purchaseOrderId, status: { not: "RESOLVED" } } })
      await tx.purchaseOrder.update({ where: { id: data.purchaseOrderId }, data: { status: complete ? openIssues ? "RECEIVED_WITH_ISSUES" : "RECEIVED" : "PARTIALLY_RECEIVED", receivedAt: complete ? new Date() : null } })
      return created
    }), { label: "la réception fournisseur" })
    await logAction({ userId, action: "RECEIVE_PURCHASE_ORDER", resource: "PURCHASE_ORDER", resourceId: data.purchaseOrderId, payload: { receiptId: receipt.id, acceptedQuantity, rejectedQuantity: data.rejectedQuantity, issueType: data.issueType } })
    revalidateOperations()
    return { success: true as const, id: receipt.id, number: receipt.number }
  }, "operations.write")
}

export async function resolvePurchaseIssue(input: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    const data = purchaseIssueResolutionSchema.parse(input)
    const issue = await prisma.purchaseIssue.findFirst({
      where: { id: data.issueId, companyId, status: { in: ["OPEN", "WAITING_REPLACEMENT"] } },
      include: { goodsReceiptLine: { include: { goodsReceipt: { select: { warehouseId: true, number: true } } } }, purchaseOrderLine: { select: { id: true, quantity: true, receivedQuantity: true, creditedQuantity: true, unitPriceCents: true } } },
    })
    if (!issue) throw new Error("Anomalie fournisseur introuvable ou déjà résolue")
    if (data.resolution === "ACCEPTED" && !issue.goodsReceiptLine) throw new Error("Réception source introuvable")
    const remaining = issue.purchaseOrderLine.quantity - issue.purchaseOrderLine.receivedQuantity - issue.purchaseOrderLine.creditedQuantity
    if (["CREDIT", "ACCEPTED"].includes(data.resolution) && issue.quantity > remaining) {
      throw new Error("Le reliquat a déjà été couvert ; clôturez l’anomalie avec une autre résolution")
    }

    await prisma.$transaction(async (tx) => {
      const nextStatus = data.resolution === "REPLACEMENT" ? "WAITING_REPLACEMENT" : "RESOLVED"
      const claimed = await tx.purchaseIssue.updateMany({ where: { id: issue.id, companyId, status: { in: ["OPEN", "WAITING_REPLACEMENT"] } }, data: { status: nextStatus, resolution: data.notes, resolvedAt: nextStatus === "RESOLVED" ? new Date() : null } })
      if (claimed.count !== 1) throw new Error("Anomalie déjà traitée")
      if (data.resolution === "CREDIT") {
        await tx.purchaseOrderLine.update({ where: { id: issue.purchaseOrderLineId }, data: { creditedQuantity: { increment: issue.quantity } } })
      } else if (data.resolution === "ACCEPTED") {
        const warehouseId = issue.goodsReceiptLine!.goodsReceipt.warehouseId
        await tx.purchaseOrderLine.update({ where: { id: issue.purchaseOrderLineId }, data: { receivedQuantity: { increment: issue.quantity } } })
        if (issue.productId) {
          const productId = issue.productId
          const current = await tx.inventoryItem.findUnique({ where: { warehouseId_productId: { warehouseId, productId } } })
          const next = calculateStockBalance({ quantity: current?.quantity ?? 0, reservedQuantity: current?.reservedQuantity ?? 0, type: "IN", movementQuantity: issue.quantity })
          await tx.inventoryItem.upsert({ where: { warehouseId_productId: { warehouseId, productId } }, update: next, create: { companyId, warehouseId, productId, ...next } })
          await tx.stockMovement.create({ data: { companyId, warehouseId, productId, type: "IN", quantity: issue.quantity, unitCostCents: issue.purchaseOrderLine.unitPriceCents, reference: `ISS-${issue.id.slice(-8).toUpperCase()}`, notes: `Anomalie acceptée après contrôle · ${issue.goodsReceiptLine!.goodsReceipt.number}` } })
        }
      }
      const orderLines = await tx.purchaseOrderLine.findMany({ where: { purchaseOrderId: issue.purchaseOrderId }, select: { quantity: true, receivedQuantity: true, creditedQuantity: true } })
      const complete = orderLines.every((line) => line.receivedQuantity + line.creditedQuantity >= line.quantity)
      const openIssues = await tx.purchaseIssue.count({ where: { purchaseOrderId: issue.purchaseOrderId, status: { not: "RESOLVED" } } })
      await tx.purchaseOrder.update({ where: { id: issue.purchaseOrderId }, data: { status: complete ? openIssues ? "RECEIVED_WITH_ISSUES" : "RECEIVED" : "PARTIALLY_RECEIVED", receivedAt: complete ? new Date() : null } })
    })
    await logAction({ userId, action: "RESOLVE_PURCHASE_ISSUE", resource: "PURCHASE_ISSUE", resourceId: issue.id, payload: { resolution: data.resolution, purchaseOrderId: issue.purchaseOrderId, quantity: issue.quantity } })
    revalidateOperations()
    return { success: true as const }
  }, "operations.write")
}

export async function createSupplierReturn(input: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    const data = supplierReturnSchema.parse(input)
    const [line, warehouse] = await Promise.all([
      prisma.purchaseOrderLine.findFirst({ where: { id: data.purchaseOrderLineId, purchaseOrderId: data.purchaseOrderId, purchaseOrder: { companyId } }, include: { purchaseOrder: { select: { supplierId: true, number: true } }, product: { select: { id: true } }, receiptLines: { where: { goodsReceipt: { warehouseId: data.warehouseId } }, select: { acceptedQuantity: true } }, supplierReturns: { where: { warehouseId: data.warehouseId }, select: { quantity: true } } } }),
      prisma.warehouse.findFirst({ where: { id: data.warehouseId, companyId, active: true }, select: { id: true } }),
    ])
    if (!line?.product || !warehouse) throw new Error("Ligne produit ou dépôt introuvable")
    const receivedInWarehouse = line.receiptLines.reduce((sum, item) => sum + item.acceptedQuantity, 0)
    const alreadyReturned = line.supplierReturns.reduce((sum, item) => sum + item.quantity, 0)
    if (data.quantity > receivedInWarehouse - alreadyReturned) throw new Error("La quantité retournée dépasse la quantité reçue dans ce dépôt")
    const inventory = await prisma.inventoryItem.findUnique({ where: { warehouseId_productId: { warehouseId: warehouse.id, productId: line.product.id } } })
    if (!inventory) throw new Error("Stock du produit introuvable dans ce dépôt")
    const next = calculateStockBalance({ quantity: inventory.quantity, reservedQuantity: inventory.reservedQuantity, type: "OUT", movementQuantity: data.quantity })
    const prefix = buildYearlyDocumentPrefix("RET-", "RET-")
    const supplierReturn = await withDocumentNumberRetry(async () => prisma.$transaction(async (tx) => {
      const last = await tx.supplierReturn.findFirst({ where: { companyId, number: { startsWith: prefix } }, orderBy: { number: "desc" }, select: { number: true } })
      const number = nextDocumentNumber(last?.number, prefix)
      await tx.inventoryItem.update({ where: { id: inventory.id }, data: next })
      const movement = await tx.stockMovement.create({ data: { companyId, warehouseId: warehouse.id, productId: line.product!.id, type: "OUT", quantity: -data.quantity, unitCostCents: line.unitPriceCents, reference: number, notes: `Retour fournisseur · ${data.reason}` } })
      return tx.supplierReturn.create({ data: { companyId, purchaseOrderId: data.purchaseOrderId, purchaseOrderLineId: line.id, supplierId: line.purchaseOrder.supplierId, warehouseId: warehouse.id, productId: line.product!.id, stockMovementId: movement.id, number, quantity: data.quantity, unitCostCents: line.unitPriceCents, reason: data.reason, notes: data.notes } })
    }), { label: "le retour fournisseur" })
    await logAction({ userId, action: "CREATE_SUPPLIER_RETURN", resource: "SUPPLIER_RETURN", resourceId: supplierReturn.id, payload: { number: supplierReturn.number, purchaseOrderId: data.purchaseOrderId, quantity: data.quantity } })
    revalidateOperations()
    return { success: true as const, id: supplierReturn.id, number: supplierReturn.number }
  }, "operations.write")
}

export async function creditSupplierReturn(supplierReturnId: string, creditReference: string) {
  return withAuth(async ({ companyId, userId }) => {
    const data = z.object({ supplierReturnId: id, creditReference: z.string().trim().min(1).max(120) }).parse({ supplierReturnId, creditReference })
    const supplierReturn = await prisma.supplierReturn.findFirst({ where: { id: data.supplierReturnId, companyId, status: "SHIPPED" }, select: { id: true, number: true } })
    if (!supplierReturn) throw new Error("Retour fournisseur expédié introuvable")
    await prisma.supplierReturn.update({ where: { id: supplierReturn.id }, data: { status: "CREDITED", creditedAt: new Date(), creditReference: data.creditReference } })
    await logAction({ userId, action: "CREDIT_SUPPLIER_RETURN", resource: "SUPPLIER_RETURN", resourceId: supplierReturn.id, payload: { number: supplierReturn.number, creditReference: data.creditReference } })
    revalidateOperations()
    return { success: true as const }
  }, "operations.write")
}

export async function reserveStock(input: unknown) {
  return withAuth(async ({ companyId }) => {
    const data = reservationSchema.parse(input)
    const [warehouse, product, project, customerOrder] = await Promise.all([
      prisma.warehouse.findFirst({ where: { id: data.warehouseId, companyId, active: true }, select: { id: true } }),
      prisma.product.findFirst({ where: { id: data.productId, companyId, active: true }, select: { id: true } }),
      data.projectId ? prisma.project.findFirst({ where: { id: data.projectId, companyId }, select: { id: true } }) : null,
      data.customerOrderId ? prisma.customerOrder.findFirst({ where: { id: data.customerOrderId, companyId }, select: { id: true } }) : null,
    ])
    if (!warehouse || !product) throw new Error("Dépôt ou produit introuvable")
    if (data.projectId && !project) throw new Error("Chantier introuvable")
    if (data.customerOrderId && !customerOrder) throw new Error("Commande client introuvable")
    if (!data.projectId && !data.customerOrderId) throw new Error("Rattachez la réservation à un chantier ou une commande client")

    const reservation = await prisma.$transaction(async (tx) => {
      const current = await tx.inventoryItem.findUnique({ where: { warehouseId_productId: { warehouseId: data.warehouseId, productId: data.productId } } })
      if (!current) throw new Error("Aucun stock disponible pour ce produit")
      const next = calculateStockBalance({ quantity: current.quantity, reservedQuantity: current.reservedQuantity, type: "RESERVE", movementQuantity: data.quantity })
      const created = await tx.stockReservation.create({ data: { companyId, ...data } })
      await tx.inventoryItem.update({ where: { id: current.id }, data: next })
      await tx.stockMovement.create({ data: { companyId, warehouseId: data.warehouseId, productId: data.productId, projectId: data.projectId, reservationId: created.id, type: "RESERVE", quantity: data.quantity, reference: data.customerOrderId ? `Commande ${data.customerOrderId}` : null, notes: data.notes } })
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
    await prisma.$transaction(async (tx) => {
      const current = await tx.inventoryItem.findUnique({ where: { warehouseId_productId: { warehouseId: reservation.warehouseId, productId: reservation.productId } } })
      if (!current) throw new Error("Stock de la réservation introuvable")
      const next = calculateStockBalance({ quantity: current.quantity, reservedQuantity: current.reservedQuantity, type: "RELEASE", movementQuantity: reservation.quantity })
      await tx.inventoryItem.update({ where: { id: current.id }, data: next })
      await tx.stockReservation.update({ where: { id: reservation.id }, data: { status: "RELEASED", releasedAt: new Date() } })
      await tx.stockMovement.create({ data: { companyId, warehouseId: reservation.warehouseId, productId: reservation.productId, projectId: reservation.projectId, reservationId: reservation.id, type: "RELEASE", quantity: reservation.quantity, reference: `Libération ${reservation.id}`, notes: reservation.notes } })
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
    await prisma.$transaction(async (tx) => {
      const current = await tx.inventoryItem.findUnique({ where: { warehouseId_productId: { warehouseId: reservation.warehouseId, productId: reservation.productId } } })
      if (!current) throw new Error("Stock de la réservation introuvable")
      const next = calculateStockBalance({ quantity: current.quantity, reservedQuantity: current.reservedQuantity, type: "CONSUME", movementQuantity: reservation.quantity })
      await tx.inventoryItem.update({ where: { id: current.id }, data: next })
      await tx.stockReservation.update({ where: { id: reservation.id }, data: { status: "CONSUMED", releasedAt: new Date() } })
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
    await logAction({ userId, action: "CONSUME_STOCK_RESERVATION", resource: "STOCK_RESERVATION", resourceId: reservation.id, payload: { quantity: reservation.quantity, productId: reservation.productId } })
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
    const note = await withDocumentNumberRetry(async () => prisma.$transaction(async (tx) => {
      const last = await tx.deliveryNote.findFirst({ where: { companyId, number: { startsWith: prefix } }, orderBy: { number: "desc" }, select: { number: true } })
      const created = await tx.deliveryNote.create({
        data: {
          companyId,
          customerOrderId: data.customerOrderId,
          projectId: line.customerOrder.projectId,
          number: nextDocumentNumber(last?.number, prefix),
          status: "DELIVERED",
          deliveredAt: new Date(),
          recipientName: data.recipientName,
          notes: data.notes,
          lines: { create: { customerOrderLineId: line.id, productId: line.productId, label: line.label, quantity: data.quantity } },
        },
      })
      await tx.customerOrderLine.update({ where: { id: line.id }, data: { deliveredQuantity: { increment: data.quantity } } })
      const orderLines = await tx.customerOrderLine.findMany({ where: { customerOrderId: data.customerOrderId }, select: { quantity: true, deliveredQuantity: true } })
      if (orderLines.every((orderLine) => orderLine.deliveredQuantity >= orderLine.quantity)) {
        await tx.customerOrder.update({ where: { id: data.customerOrderId }, data: { status: "DELIVERED" } })
      }
      return created
    }), { label: "le bon de livraison" })
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
    const signatureSha256 = createHash("sha256").update(JSON.stringify({
      deliveryNoteId: note.id,
      number: note.number,
      customerOrderId: note.customerOrderId,
      recipientName: data.recipientName,
      signedAt: signedAt.toISOString(),
      lines: note.lines.map((line) => ({ id: line.id, label: line.label, quantity: line.quantity })),
    })).digest("hex")
    const signed = await prisma.deliveryNote.updateMany({
      where: { id: note.id, companyId, signedAt: null },
      data: { status: "SIGNED", recipientName: data.recipientName, signedAt, signatureSha256 },
    })
    if (signed.count !== 1) throw new Error("Ce bon de livraison a déjà été signé")
    await logAction({ userId, action: "SIGN_DELIVERY_NOTE", resource: "DELIVERY_NOTE", resourceId: note.id, payload: { number: note.number, recipientName: data.recipientName, signatureSha256 } })
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
      const current = await tx.inventoryItem.findUnique({ where: { warehouseId_productId: { warehouseId: data.warehouseId, productId: data.productId } } })
      const magnitude = Math.abs(data.quantity)
      const next = calculateStockBalance({ quantity: current?.quantity ?? 0, reservedQuantity: current?.reservedQuantity ?? 0, type: data.type, movementQuantity: data.quantity })
      await tx.inventoryItem.upsert({
        where: { warehouseId_productId: { warehouseId: data.warehouseId, productId: data.productId } },
        update: next,
        create: { companyId, warehouseId: data.warehouseId, productId: data.productId, ...next },
      })
      await tx.stockMovement.create({ data: { companyId, ...data, quantity: data.type === "OUT" || data.type === "CONSUME" ? -magnitude : data.type === "IN" ? magnitude : data.quantity } })
    })
    revalidateOperations()
    return { success: true as const }
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
      const current = await tx.inventoryItem.findUnique({ where: { warehouseId_productId: { warehouseId: warehouse.id, productId: product.id } } })
      if (!current) throw new Error("Aucun stock disponible pour ce produit dans ce dépôt")
      const next = calculateStockBalance({ quantity: current.quantity, reservedQuantity: current.reservedQuantity, type: "OUT", movementQuantity: data.quantity })
      await tx.inventoryItem.update({ where: { id: current.id }, data: next })
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
    await logAction({ userId, action: "CONSUME_INTERVENTION_MATERIAL", resource: "FIELD_INTERVENTION", resourceId: intervention.id, payload: { movementId: movement.id, productId: product.id, warehouseId: warehouse.id, quantity: data.quantity, unitCostCents: product.purchasePriceCents } })
    revalidateOperations()
    return { success: true as const, movementId: movement.id }
  }, "operations.write")
}

export async function updateServiceTicket(ticketId: string, input: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    const parsedId = id.parse(ticketId)
    const data = ticketUpdateSchema.parse(input)
    const [ticket, company] = await Promise.all([
      prisma.serviceTicket.findFirst({ where: { id: parsedId, companyId }, select: { id: true, status: true, closedAt: true, waitingSince: true, pausedMinutes: true, assignedMembershipId: true, routingReason: true, routedAt: true, mergedIntoTicketId: true } }),
      prisma.company.findUnique({ where: { id: companyId }, select: { serviceTimezone: true, serviceDayStart: true, serviceDayEnd: true, serviceWorkdays: true, serviceHolidays: true, serviceFirstResponseHours: true, serviceResolutionHours: true } }),
    ])
    if (!ticket) throw new Error("Ticket introuvable")
    if (ticket.status === "MERGED" || ticket.mergedIntoTicketId) throw new Error("Ce ticket est fusionné. Restaurez-le avant de le modifier.")
    if (!company) throw new Error("Entreprise introuvable")
    if (data.assignedMembershipId && !await prisma.membership.findFirst({ where: { id: data.assignedMembershipId, companyId, status: "ACTIVE" }, select: { id: true } })) throw new Error("Intervenant introuvable")
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
        routingReason: manualAssignmentChanged ? data.assignedMembershipId ? "Affectation manuelle" : null : ticket.routingReason,
        routedAt: manualAssignmentChanged ? data.assignedMembershipId ? now : null : ticket.routedAt,
        pausedMinutes,
        waitingSince: data.status === "WAITING" ? ticket.waitingSince || now : null,
        closedAt: data.status === "CLOSED" ? ticket.closedAt ?? new Date() : null,
      },
    })
    await logAction({ userId, action: "UPDATE_SERVICE_TICKET", resource: "SERVICE_TICKET", resourceId: ticket.id, payload: { fromStatus: ticket.status, status: data.status, priority: data.priority, assignedMembershipId: data.assignedMembershipId } })
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
    await prisma.serviceTicket.update({ where: { id: parsedId }, data: { assignedMembershipId: routing.recommendation.membershipId, requiredSkill: routing.requiredSkill, territory: routing.territory, routingReason: routing.recommendation.reason, routedAt: new Date() } })
    await logAction({ userId, action: "ROUTE_SERVICE_TICKET", resource: "SERVICE_TICKET", resourceId: parsedId, payload: { assignedMembershipId: routing.recommendation.membershipId, requiredSkill: routing.requiredSkill, territory: routing.territory, capacityOverflow: routing.recommendation.capacityOverflow } })
    revalidateOperations()
    revalidatePath(`/dashboard/service/tickets/${parsedId}`)
    revalidatePath("/dashboard/service/help-desk")
    return { success: true as const, assignedMembershipId: routing.recommendation.membershipId, reason: routing.recommendation.reason }
  }, "service.write")
}

export async function mergeServiceTickets(input: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    const data = ticketMergeSchema.parse(input)
    const { source, target, mergedAt } = await prisma.$transaction(async (transaction) => {
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
    }, { isolationLevel: "Serializable" })
    await logAction({ userId, action: "MERGE_SERVICE_TICKET", resource: "SERVICE_TICKET", resourceId: target.id, payload: { sourceId: source.id, sourceNumber: source.number, targetId: target.id, targetNumber: target.number, previousStatus: source.status, mergedAt } })
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
    await logAction({ userId, action: "UNMERGE_SERVICE_TICKET", resource: "SERVICE_TICKET", resourceId: source.id, payload: { sourceNumber: source.number, targetId: source.mergedIntoTicketId, targetNumber: source.mergedInto?.number, restoredStatus } })
    revalidateOperations()
    revalidatePath("/dashboard/service/help-desk")
    revalidatePath(`/dashboard/service/tickets/${source.id}`)
    revalidatePath(`/dashboard/service/tickets/${source.mergedIntoTicketId}`)
    return { success: true as const, id: source.id, status: restoredStatus }
  }, "service.write")
}

export async function updateInterventionStatus(interventionId: string, status: "PLANNED" | "EN_ROUTE" | "IN_PROGRESS" | "CANCELED") {
  return withAuth(async ({ companyId }) => {
    const parsed = z.object({ interventionId: id, status: z.enum(["PLANNED", "EN_ROUTE", "IN_PROGRESS", "CANCELED"]) }).parse({ interventionId, status })
    const intervention = await prisma.fieldIntervention.findFirst({ where: { id: parsed.interventionId, companyId }, select: { id: true } })
    if (!intervention) throw new Error("Intervention introuvable")
    await prisma.fieldIntervention.update({
      where: { id: intervention.id },
      data: {
        status: parsed.status,
        startedAt: parsed.status === "IN_PROGRESS" ? new Date() : undefined,
      },
    })
    revalidateOperations()
    revalidatePath(`/dashboard/service/interventions/${intervention.id}`)
    return { success: true as const }
  }, "operations.write")
}

export async function resolveInterventionReservation(reservationId: string) {
  return withAuth(async ({ companyId, userId, membershipId, role }) => {
    const parsedId = id.parse(reservationId)
    const reservation = await prisma.interventionReservation.findFirst({
      where: { id: parsedId, companyId, intervention: role === "TECHNICIAN" ? { assignedMembershipId: membershipId } : {} },
      select: { id: true, interventionId: true, status: true },
    })
    if (!reservation) throw new Error("Réserve introuvable")
    if (reservation.status === "RESOLVED") return { success: true as const, alreadyResolved: true }
    await prisma.interventionReservation.update({ where: { id: reservation.id }, data: { status: "RESOLVED", resolvedAt: new Date() } })
    await logAction({ userId, action: "RESOLVE_INTERVENTION_RESERVATION", resource: "INTERVENTION_RESERVATION", resourceId: reservation.id, payload: { interventionId: reservation.interventionId } })
    revalidateOperations()
    return { success: true as const }
  }, "operations.write")
}
