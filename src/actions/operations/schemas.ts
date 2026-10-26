import { z } from "zod"

export const id = z.string().cuid()

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

export const siteSchema = z.object({
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

export const productSchema = z.object({
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

export const warehouseSchema = z.object({
  agencyId: optionalId,
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().min(1).max(30),
  address: optionalText,
})

export const equipmentSchema = z.object({
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

export const ticketSchema = z.object({
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

export const ticketUpdateSchema = z.object({
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

export const ticketMergeSchema = z.object({ sourceId: id, targetId: id }).refine((value) => value.sourceId !== value.targetId, { message: "Les deux tickets doivent être différents" })

export const interventionSchema = z
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

export const interventionPlanningSchema = z
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

export const maintenanceContractSchema = z.object({
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

export const maintenanceRenewalSettingsSchema = z.object({
  contractId: id,
  expectedUpdatedAt: z.string().datetime({ offset: true }),
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

export const purchaseOrderSchema = z
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

export const movementSchema = z.object({
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

export const stockTransferSchema = z
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

export const interventionMaterialSchema = z.object({
  interventionId: id,
  warehouseId: id,
  productId: id,
  quantity: z.coerce.number().int().min(1).max(100_000),
})

export const customerOrderSchema = z.object({
  clientId: id,
  projectId: optionalId,
  expectedInstallationAt: z.string().trim().optional().transform(value => value || null).refine(value => {
    if (!value) return true
    const day = value.match(/^\d{4}-\d{2}-\d{2}/)?.[0]
    if (!day || !Number.isFinite(new Date(value).getTime())) return false
    return new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) === day
  }, "Date de pose invalide").transform(value => value ? new Date(value) : null),
  notes: optionalText,
  productId: optionalId,
  label: z.string().trim().min(2).max(200),
  quantity: z.coerce.number().positive().max(1_000_000),
  unitPriceCents: z.coerce.number().int().min(0).max(2_000_000_000),
  tvaRate: z.coerce.number().min(0).max(100).default(20),
  depositCents: z.coerce.number().int().min(0).max(2_000_000_000).default(0),
})

export const quoteToCustomerOrderSchema = z.object({
  quoteId: id,
  expectedRevision: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  depositRate: z.coerce.number().min(0).max(100).default(0),
  expectedInstallationAt: z
    .union([z.string().date(), z.literal("")])
    .optional()
    .transform((value) => (value ? new Date(`${value}T12:00:00.000Z`) : null)),
})

export const goodsReceiptSchema = z.object({
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

export const purchaseAcknowledgementSchema = z.object({
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

export const purchaseIssueResolutionSchema = z.object({
  issueId: id,
  resolution: z.enum(["REPLACEMENT", "CREDIT", "ACCEPTED", "OTHER"]),
  notes: z.string().trim().min(2).max(2_000),
})

export const supplierReturnSchema = z.object({
  purchaseOrderId: id,
  purchaseOrderLineId: id,
  warehouseId: id,
  quantity: z.coerce.number().int().min(1).max(1_000_000),
  reason: z.string().trim().min(2).max(500),
  notes: optionalText,
})

export const reservationSchema = z.object({
  warehouseId: id,
  productId: id,
  projectId: optionalId,
  customerOrderId: optionalId,
  quantity: z.coerce.number().int().min(1).max(1_000_000),
  notes: optionalText,
})

export const deliveryNoteSchema = z.object({
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

export const deliverySignatureSchema = z.object({
  deliveryNoteId: id,
  recipientName: z.string().trim().min(2, "Le nom du réceptionnaire est requis").max(160),
  customerApproval: z.literal(true, { error: "L’accord du réceptionnaire doit être confirmé" }),
})

export const customerOrderInvoiceSchema = z.object({
  customerOrderId: id,
  mode: z.enum(["DEPOSIT", "BALANCE"]).default("BALANCE"),
  dueDays: z.coerce.number().int().min(0).max(365).default(30),
})
