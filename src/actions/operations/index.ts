"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { withAuth } from "@/lib/auth-wrapper"
import { buildYearlyDocumentPrefix, nextDocumentNumber, withDocumentNumberRetry } from "@/lib/document-numbering"
import { calculateStockBalance } from "@/lib/operations/stock"
import prisma from "@/lib/prisma"

const id = z.string().cuid()
const optionalId = z.union([id, z.literal("")]).optional().transform((value) => value || null)
const optionalText = z.string().trim().max(2_000).optional().transform((value) => value || null)
const dateInput = z.string().trim().optional().transform((value) => value ? new Date(value) : null)

const siteSchema = z.object({
  clientId: id,
  label: z.string().trim().min(2).max(120),
  kind: z.string().trim().min(2).max(40).default("INSTALLATION"),
  address1: z.string().trim().min(3).max(200),
  address2: optionalText,
  postalCode: z.string().trim().max(20).optional().transform((value) => value || null),
  city: z.string().trim().max(100).optional().transform((value) => value || null),
  accessNotes: optionalText,
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
})

const interventionSchema = z.object({
  ticketId: optionalId,
  projectId: optionalId,
  siteId: id,
  assignedMembershipId: optionalId,
  title: z.string().trim().min(3).max(180),
  type: z.enum(["SITE_VISIT", "INSTALLATION", "SAV", "MAINTENANCE"]).default("SAV"),
  scheduledStart: z.string().datetime(),
  scheduledEnd: z.string().datetime().optional().nullable(),
})

const purchaseOrderSchema = z.object({
  supplierId: id,
  projectId: optionalId,
  expectedAt: dateInput,
  notes: optionalText,
  productId: optionalId,
  label: z.string().trim().min(2).max(200),
  quantity: z.coerce.number().int().min(1).max(1_000_000),
  unitPriceCents: z.coerce.number().int().min(0).max(2_000_000_000),
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

function revalidateOperations() {
  revalidatePath("/dashboard/operations")
  revalidatePath("/dashboard/clients")
  revalidatePath("/dashboard/projets")
}

export async function getOperationsDashboard() {
  return withAuth(async ({ companyId }) => {
    const [clients, sites, suppliers, products, warehouses, purchaseOrders, equipments, tickets, interventions, contracts, projects, members] = await Promise.all([
      prisma.client.findMany({ where: { companyId }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 500 }),
      prisma.customerSite.findMany({ where: { companyId }, include: { client: { select: { name: true } }, _count: { select: { equipments: true, serviceTickets: true } } }, orderBy: { updatedAt: "desc" }, take: 100 }),
      prisma.supplier.findMany({ where: { companyId, active: true }, orderBy: { name: "asc" }, take: 200 }),
      prisma.product.findMany({ where: { companyId, active: true }, include: { supplier: { select: { name: true } }, inventoryItems: { select: { quantity: true, reservedQuantity: true, reorderPoint: true } } }, orderBy: { label: "asc" }, take: 500 }),
      prisma.warehouse.findMany({ where: { companyId, active: true }, include: { inventoryItems: { include: { product: { select: { label: true, sku: true } } } } }, orderBy: { name: "asc" } }),
      prisma.purchaseOrder.findMany({ where: { companyId }, include: { supplier: { select: { name: true } }, project: { select: { name: true } }, lines: true }, orderBy: { createdAt: "desc" }, take: 100 }),
      prisma.equipment.findMany({ where: { companyId }, include: { site: { include: { client: { select: { name: true } } } }, product: { select: { label: true, sku: true } } }, orderBy: { updatedAt: "desc" }, take: 200 }),
      prisma.serviceTicket.findMany({ where: { companyId }, include: { client: { select: { name: true } }, site: { select: { label: true } }, equipment: { select: { label: true } }, assignedMembership: { include: { user: { select: { name: true, email: true } } } }, _count: { select: { interventions: true } } }, orderBy: [{ priority: "desc" }, { updatedAt: "desc" }], take: 200 }),
      prisma.fieldIntervention.findMany({ where: { companyId }, include: { site: { include: { client: { select: { name: true } } } }, ticket: { select: { number: true } }, assignedMembership: { include: { user: { select: { name: true, email: true } } } } }, orderBy: { scheduledStart: "asc" }, take: 200 }),
      prisma.maintenanceContract.findMany({ where: { companyId }, include: { client: { select: { name: true } }, site: { select: { label: true } }, _count: { select: { equipments: true } } }, orderBy: { nextVisitAt: "asc" }, take: 100 }),
      prisma.project.findMany({ where: { companyId, status: "ACTIVE" }, select: { id: true, name: true, clientId: true, siteId: true }, orderBy: { name: "asc" }, take: 300 }),
      prisma.membership.findMany({ where: { companyId, status: "ACTIVE" }, include: { user: { select: { name: true, email: true } } }, orderBy: { createdAt: "asc" } }),
    ])
    return { clients, sites, suppliers, products, warehouses, purchaseOrders, equipments, tickets, interventions, contracts, projects, members }
  }, "operations.read")
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
  return withAuth(async ({ companyId }) => {
    const data = ticketSchema.parse(input)
    const client = await prisma.client.findFirst({ where: { id: data.clientId, companyId }, select: { id: true } })
    if (!client) throw new Error("Client introuvable")
    if (data.siteId && !await prisma.customerSite.findFirst({ where: { id: data.siteId, companyId, clientId: data.clientId }, select: { id: true } })) throw new Error("Le site n'appartient pas à ce client")
    if (data.equipmentId && !await prisma.equipment.findFirst({ where: { id: data.equipmentId, companyId }, select: { id: true } })) throw new Error("Équipement introuvable")
    if (data.assignedMembershipId && !await prisma.membership.findFirst({ where: { id: data.assignedMembershipId, companyId, status: "ACTIVE" }, select: { id: true } })) throw new Error("Intervenant introuvable")
    const prefix = buildYearlyDocumentPrefix("SAV-", "SAV-")
    const ticket = await withDocumentNumberRetry(async () => {
      const last = await prisma.serviceTicket.findFirst({ where: { companyId, number: { startsWith: prefix } }, orderBy: { number: "desc" }, select: { number: true } })
      return prisma.serviceTicket.create({ data: { companyId, ...data, number: nextDocumentNumber(last?.number, prefix) } })
    }, { label: "le ticket SAV" })
    revalidateOperations()
    return { success: true as const, id: ticket.id, number: ticket.number }
  }, "service.write")
}

export async function createFieldIntervention(input: unknown) {
  return withAuth(async ({ companyId }) => {
    const data = interventionSchema.parse(input)
    const site = await prisma.customerSite.findFirst({ where: { id: data.siteId, companyId }, select: { id: true } })
    if (!site) throw new Error("Site client introuvable")
    if (data.ticketId && !await prisma.serviceTicket.findFirst({ where: { id: data.ticketId, companyId }, select: { id: true } })) throw new Error("Ticket introuvable")
    if (data.projectId && !await prisma.project.findFirst({ where: { id: data.projectId, companyId }, select: { id: true } })) throw new Error("Chantier introuvable")
    if (data.assignedMembershipId && !await prisma.membership.findFirst({ where: { id: data.assignedMembershipId, companyId, status: "ACTIVE" }, select: { id: true } })) throw new Error("Intervenant introuvable")
    const intervention = await prisma.fieldIntervention.create({
      data: {
        companyId,
        ...data,
        scheduledStart: new Date(data.scheduledStart),
        scheduledEnd: data.scheduledEnd ? new Date(data.scheduledEnd) : null,
      },
    })
    revalidateOperations()
    return { success: true as const, id: intervention.id }
  }, "operations.write")
}

export async function createPurchaseOrder(input: unknown) {
  return withAuth(async ({ companyId }) => {
    const data = purchaseOrderSchema.parse(input)
    if (!await prisma.supplier.findFirst({ where: { id: data.supplierId, companyId }, select: { id: true } })) throw new Error("Fournisseur introuvable")
    if (data.projectId && !await prisma.project.findFirst({ where: { id: data.projectId, companyId }, select: { id: true } })) throw new Error("Chantier introuvable")
    if (data.productId && !await prisma.product.findFirst({ where: { id: data.productId, companyId }, select: { id: true } })) throw new Error("Produit introuvable")
    const prefix = buildYearlyDocumentPrefix("ACH-", "ACH-")
    const totalHtCents = data.quantity * data.unitPriceCents
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
          lines: { create: { productId: data.productId, label: data.label, quantity: data.quantity, unitPriceCents: data.unitPriceCents } },
        },
      })
    }, { label: "la commande fournisseur" })
    revalidateOperations()
    return { success: true as const, id: order.id, number: order.number }
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

export async function updateServiceTicketStatus(ticketId: string, status: "OPEN" | "QUALIFIED" | "PLANNED" | "WAITING" | "RESOLVED" | "CLOSED") {
  return withAuth(async ({ companyId }) => {
    const parsed = z.object({ ticketId: id, status: z.enum(["OPEN", "QUALIFIED", "PLANNED", "WAITING", "RESOLVED", "CLOSED"]) }).parse({ ticketId, status })
    const ticket = await prisma.serviceTicket.findFirst({ where: { id: parsed.ticketId, companyId }, select: { id: true } })
    if (!ticket) throw new Error("Ticket introuvable")
    await prisma.serviceTicket.update({ where: { id: ticket.id }, data: { status: parsed.status, closedAt: parsed.status === "CLOSED" ? new Date() : null } })
    revalidateOperations()
    return { success: true as const }
  }, "service.write")
}

export async function updateInterventionStatus(interventionId: string, status: "PLANNED" | "EN_ROUTE" | "IN_PROGRESS" | "COMPLETED" | "CANCELED") {
  return withAuth(async ({ companyId }) => {
    const parsed = z.object({ interventionId: id, status: z.enum(["PLANNED", "EN_ROUTE", "IN_PROGRESS", "COMPLETED", "CANCELED"]) }).parse({ interventionId, status })
    const intervention = await prisma.fieldIntervention.findFirst({ where: { id: parsed.interventionId, companyId }, select: { id: true } })
    if (!intervention) throw new Error("Intervention introuvable")
    await prisma.fieldIntervention.update({
      where: { id: intervention.id },
      data: {
        status: parsed.status,
        startedAt: parsed.status === "IN_PROGRESS" ? new Date() : undefined,
        completedAt: parsed.status === "COMPLETED" ? new Date() : undefined,
      },
    })
    revalidateOperations()
    return { success: true as const }
  }, "operations.write")
}
