"use server"

import { createHash } from "node:crypto"
import { revalidatePath } from "next/cache"
import { z } from "zod"

import { withAuth } from "@/lib/auth-wrapper"
import { logAction } from "@/lib/audit"
import { buildYearlyDocumentPrefix, nextDocumentNumber, withDocumentNumberRetry } from "@/lib/document-numbering"
import { calculateStockBalance } from "@/lib/operations/stock"
import { computeInvoiceSlice, remainingOrderAmount } from "@/lib/operations/orders"
import { completeFieldInterventionForContext } from "@/lib/field/interventions"
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
  supplierReference: z.string().trim().max(120).optional().transform((value) => value || null),
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

export async function getOperationsDashboard() {
  return withAuth(async ({ companyId }) => {
    const [clients, sites, suppliers, products, warehouses, purchaseOrders, equipments, tickets, interventions, contracts, projects, members, customerOrders, goodsReceipts, reservations, deliveryNotes] = await Promise.all([
      prisma.client.findMany({ where: { companyId }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 500 }),
      prisma.customerSite.findMany({ where: { companyId }, include: { client: { select: { name: true } }, _count: { select: { equipments: true, serviceTickets: true } } }, orderBy: { updatedAt: "desc" }, take: 100 }),
      prisma.supplier.findMany({ where: { companyId, active: true }, orderBy: { name: "asc" }, take: 200 }),
      prisma.product.findMany({ where: { companyId, active: true }, include: { supplier: { select: { name: true } }, inventoryItems: { select: { quantity: true, reservedQuantity: true, reorderPoint: true } } }, orderBy: { label: "asc" }, take: 500 }),
      prisma.warehouse.findMany({ where: { companyId, active: true }, include: { inventoryItems: { include: { product: { select: { label: true, sku: true } } } } }, orderBy: { name: "asc" } }),
      prisma.purchaseOrder.findMany({ where: { companyId }, include: { supplier: { select: { name: true } }, project: { select: { name: true } }, lines: true }, orderBy: { createdAt: "desc" }, take: 100 }),
      prisma.equipment.findMany({ where: { companyId }, include: { site: { include: { client: { select: { name: true } } } }, product: { select: { label: true, sku: true } } }, orderBy: { updatedAt: "desc" }, take: 200 }),
      prisma.serviceTicket.findMany({ where: { companyId }, include: { client: { select: { name: true } }, site: { select: { label: true } }, equipment: { select: { label: true } }, assignedMembership: { include: { user: { select: { name: true, email: true } } } }, _count: { select: { interventions: true } } }, orderBy: [{ priority: "desc" }, { updatedAt: "desc" }], take: 200 }),
      prisma.fieldIntervention.findMany({ where: { companyId }, include: { site: { include: { client: { select: { name: true } } } }, ticket: { select: { number: true } }, assignedMembership: { include: { user: { select: { name: true, email: true } } } }, files: { orderBy: { createdAt: "asc" }, select: { id: true, name: true, mimeType: true, size: true, kind: true, createdAt: true } }, stockMovements: { where: { type: "OUT" }, include: { product: { select: { label: true, sku: true } }, warehouse: { select: { name: true } } }, orderBy: { happenedAt: "asc" } } }, orderBy: { scheduledStart: "asc" }, take: 200 }),
      prisma.maintenanceContract.findMany({ where: { companyId }, include: { client: { select: { name: true } }, site: { select: { label: true } }, _count: { select: { equipments: true } } }, orderBy: { nextVisitAt: "asc" }, take: 100 }),
      prisma.project.findMany({ where: { companyId, status: "ACTIVE" }, select: { id: true, name: true, clientId: true, siteId: true }, orderBy: { name: "asc" }, take: 300 }),
      prisma.membership.findMany({ where: { companyId, status: "ACTIVE" }, include: { user: { select: { name: true, email: true } } }, orderBy: { createdAt: "asc" } }),
      prisma.customerOrder.findMany({ where: { companyId }, include: { client: { select: { name: true } }, project: { select: { name: true } }, lines: true, invoices: { select: { id: true, type: true, status: true } }, _count: { select: { invoices: true, deliveryNotes: true, stockReservations: true } } }, orderBy: { createdAt: "desc" }, take: 150 }),
      prisma.goodsReceipt.findMany({ where: { companyId }, include: { purchaseOrder: { include: { supplier: { select: { name: true } } } }, warehouse: { select: { name: true } }, lines: { include: { product: { select: { sku: true, label: true } } } } }, orderBy: { receivedAt: "desc" }, take: 100 }),
      prisma.stockReservation.findMany({ where: { companyId, status: "ACTIVE" }, include: { warehouse: { select: { name: true } }, product: { select: { sku: true, label: true } }, project: { select: { name: true } }, customerOrder: { select: { number: true } } }, orderBy: { createdAt: "desc" }, take: 150 }),
      prisma.deliveryNote.findMany({ where: { companyId }, include: { customerOrder: { include: { client: { select: { name: true } } } }, lines: true }, orderBy: { createdAt: "desc" }, take: 100 }),
    ])
    return { clients, sites, suppliers, products, warehouses, purchaseOrders, equipments, tickets, interventions, contracts, projects, members, customerOrders, goodsReceipts, reservations, deliveryNotes }
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
  return withAuth(async ({ companyId }) => {
    const data = goodsReceiptSchema.parse(input)
    const [warehouse, line] = await Promise.all([
      prisma.warehouse.findFirst({ where: { id: data.warehouseId, companyId, active: true }, select: { id: true } }),
      prisma.purchaseOrderLine.findFirst({
        where: { id: data.purchaseOrderLineId, purchaseOrderId: data.purchaseOrderId, purchaseOrder: { companyId } },
        include: { purchaseOrder: { select: { id: true, number: true } }, product: { select: { id: true } } },
      }),
    ])
    if (!warehouse) throw new Error("Dépôt introuvable")
    if (!line) throw new Error("Ligne de commande fournisseur introuvable")
    if (!line.product) throw new Error("Associez un produit catalogue à la ligne avant réception")
    const productId = line.product.id
    const remaining = line.quantity - line.receivedQuantity
    if (data.quantity > remaining) throw new Error(`La quantité dépasse le reliquat de ${remaining}`)

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
          lines: { create: { purchaseOrderLineId: line.id, productId, quantity: data.quantity, unitCostCents: line.unitPriceCents } },
        },
      })
      await tx.purchaseOrderLine.update({ where: { id: line.id }, data: { receivedQuantity: { increment: data.quantity } } })
      const current = await tx.inventoryItem.findUnique({ where: { warehouseId_productId: { warehouseId: data.warehouseId, productId } } })
      const next = calculateStockBalance({ quantity: current?.quantity ?? 0, reservedQuantity: current?.reservedQuantity ?? 0, type: "IN", movementQuantity: data.quantity })
      await tx.inventoryItem.upsert({
        where: { warehouseId_productId: { warehouseId: data.warehouseId, productId } },
        update: next,
        create: { companyId, warehouseId: data.warehouseId, productId, ...next },
      })
      await tx.stockMovement.create({ data: { companyId, warehouseId: data.warehouseId, productId, projectId: null, type: "IN", quantity: data.quantity, unitCostCents: line.unitPriceCents, reference: created.number, notes: `Réception ${line.purchaseOrder.number}` } })
      const orderLines = await tx.purchaseOrderLine.findMany({ where: { purchaseOrderId: data.purchaseOrderId }, select: { quantity: true, receivedQuantity: true } })
      const complete = orderLines.every((orderLine) => orderLine.receivedQuantity >= orderLine.quantity)
      await tx.purchaseOrder.update({ where: { id: data.purchaseOrderId }, data: { status: complete ? "RECEIVED" : "PARTIALLY_RECEIVED", receivedAt: complete ? new Date() : null } })
      return created
    }), { label: "la réception fournisseur" })
    revalidateOperations()
    return { success: true as const, id: receipt.id, number: receipt.number }
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
    return { success: true as const }
  }, "operations.write")
}

export async function completeFieldIntervention(input: unknown) {
  return withAuth(async (context) => {
    const result = await completeFieldInterventionForContext(input, context)
    revalidateOperations()
    return result
  }, "operations.write")
}
