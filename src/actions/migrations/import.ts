"use server"

import { createHash, randomUUID } from "node:crypto"
import { Prisma } from "@/generated/prisma/client"
import { revalidatePath } from "next/cache"
import { withAuth } from "@/lib/auth-wrapper"
import { DEFAULT_PIPELINE_STAGES } from "@/lib/pipeline-rules"
import {
  activityCandidate,
  associationIds,
  classifySourceObject,
  clientCandidate,
  contactCandidate,
  customerOrderCandidate,
  deliveryNoteCandidate,
  equipmentCandidate,
  goodsReceiptCandidate,
  invoiceCandidate,
  interventionCandidate,
  lineItemCandidate,
  maintenanceContractCandidate,
  opportunityCandidate,
  paymentCandidate,
  productCandidate,
  projectCandidate,
  purchaseOrderCandidate,
  quoteCandidate,
  siteCandidate,
  sourceDisplayName,
  sourceValue,
  stockMovementCandidate,
  stockReservationCandidate,
  supplierCandidate,
  ticketCandidate,
  type SourcePayload,
  warehouseCandidate,
} from "@/lib/migrations/normalize"
import { assertWarehouseEmpty, lockActiveWarehouses } from "@/lib/operations/warehouses"
import {
  lockActiveSite,
  lockActiveEquipment,
  lockActiveAssetProduct,
  closedProjectStatuses,
  closedTicketStatuses,
  closedInterventionStatuses,
  closedMaintenanceStatuses,
} from "@/lib/operations/asset-lifecycle"
import { assertSchedulingSlotFree, lockSchedulingMembers } from "@/lib/scheduling/resource-slots"
import { migrationDatabase as prisma, withMigrationRecordTransaction } from "@/lib/migrations/database"
import { connectionIdSchema } from "./schemas"

const IMPORT_ORDER = {
  CLIENT: 1,
  CONTACT: 2,
  SITE: 3,
  SUPPLIER: 4,
  PRODUCT: 5,
  WAREHOUSE: 6,
  OPPORTUNITY: 7,
  PROJECT: 8,
  EQUIPMENT: 9,
  TICKET: 10,
  INTERVENTION: 11,
  MAINTENANCE_CONTRACT: 12,
  PURCHASE_ORDER: 13,
  QUOTE: 14,
  CUSTOMER_ORDER: 15,
  INVOICE: 16,
  LINE_ITEM: 17,
  DELIVERY_NOTE: 18,
  GOODS_RECEIPT: 19,
  STOCK_RESERVATION: 20,
  STOCK_MOVEMENT: 21,
  PAYMENT: 22,
  ACTIVITY: 23,
  UNSUPPORTED: 24,
} as const

async function findMappedTarget(companyId: string, provider: string, sourceRecordId: string, targetModel: string, sourceObjectType?: string) {
  return prisma.externalIdMap.findFirst({
    where: { companyId, provider, sourceRecordId, targetModel, ...(sourceObjectType ? { sourceObjectType } : {}) },
    select: { id: true, targetRecordId: true },
  })
}

async function mapExternalTarget(input: {
  companyId: string
  provider: string
  sourceObjectType: string
  sourceRecordId: string
  targetModel: string
  targetRecordId: string
  sourceUpdatedAt: Date | null
}) {
  return prisma.externalIdMap.upsert({
    where: {
      companyId_provider_sourceObjectType_sourceRecordId: {
        companyId: input.companyId,
        provider: input.provider,
        sourceObjectType: input.sourceObjectType,
        sourceRecordId: input.sourceRecordId,
      },
    },
    update: {
      targetModel: input.targetModel,
      targetRecordId: input.targetRecordId,
      sourceUpdatedAt: input.sourceUpdatedAt,
    },
    create: input,
  })
}

async function mappedClientFromAssociations(companyId: string, provider: string, payload: SourcePayload) {
  for (const sourceId of associationIds(payload, "company")) {
    const mapping = await findMappedTarget(companyId, provider, sourceId, "Client")
    if (mapping) return mapping.targetRecordId
  }
  for (const sourceId of associationIds(payload, "contact")) {
    const mapping = await findMappedTarget(companyId, provider, sourceId, "Contact")
    if (!mapping) continue
    const contact = await prisma.contact.findUnique({ where: { id: mapping.targetRecordId }, select: { clientId: true } })
    if (contact) return contact.clientId
  }
  for (const sourceId of associationIds(payload, "deal")) {
    const mapping = await findMappedTarget(companyId, provider, sourceId, "Opportunity")
    if (!mapping) continue
    const opportunity = await prisma.opportunity.findUnique({ where: { id: mapping.targetRecordId }, select: { clientId: true } })
    if (opportunity) return opportunity.clientId
  }
  return null
}

async function mappedTargetFromAssociations(
  companyId: string,
  provider: string,
  payload: SourcePayload,
  association: "site" | "supplier" | "product" | "project" | "equipment" | "ticket" | "warehouse" | "quote" | "invoice" | "customerOrder" | "purchaseOrder",
  targetModel: string,
) {
  for (const sourceId of associationIds(payload, association)) {
    const mapping = await findMappedTarget(companyId, provider, sourceId, targetModel)
    if (mapping) return mapping.targetRecordId
  }
  return null
}

function migrationReference(prefix: string, sourceId: string) {
  const normalized = sourceId.trim().replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "record"
  return `${prefix}-${normalized}`.slice(0, 100)
}

function migrationCollisionNumber(base: string, provider: string, objectType: string, sourceId: string) {
  const suffix = createHash("sha256").update(`${provider}\u0000${objectType}\u0000${sourceId}`).digest("hex").slice(0, 8).toUpperCase()
  return `${base}-${provider}-${suffix}`.slice(0, 180)
}

async function ensureMigrationPipeline(companyId: string) {
  const existing = await prisma.pipeline.findFirst({
    where: { companyId },
    orderBy: [{ isDefault: "desc" }, { position: "asc" }, { createdAt: "asc" }],
  })
  if (existing) return existing
  return prisma.pipeline.create({
    data: { companyId, name: "Cycle de vente", stages: DEFAULT_PIPELINE_STAGES, isDefault: true },
  })
}

export async function importMigrationRun(runId: string) {
  return withAuth(async ({ companyId }) => {
    const parsedId = connectionIdSchema.parse(runId)
    const run = await prisma.migrationRun.findFirst({
      where: {
        id: parsedId, companyId,
        OR: [
          { status: { in: ["SIMULATED", "IMPORTED", "PARTIAL"] } },
          { status: "FAILED", importStartedAt: { not: null } },
          { status: "IMPORTING", importStartedAt: { not: null }, importHeartbeatAt: { lt: new Date(Date.now() - 15 * 60_000) } },
        ],
      },
      include: { records: true },
    })
    if (!run) throw new Error("Simulez ce lot avant de l'importer")
    const unresolvedSourceErrors = await prisma.migrationIssue.count({
      where: { runId: run.id, status: "OPEN", severity: "ERROR", NOT: { code: { startsWith: "VERIFY_" } } },
    })
    if (unresolvedSourceErrors) throw new Error("Corrigez les anomalies bloquantes avant l'import")
    const runProvider = run.provider

    const leaseId = randomUUID()
    const claim = await prisma.migrationRun.updateMany({
      where: { id: run.id, companyId, status: run.status, updatedAt: run.updatedAt },
      data: { status: "IMPORTING", completedAt: null, importStartedAt: run.importStartedAt ?? new Date(), importHeartbeatAt: new Date(), importLeaseId: leaseId },
    })
    if (claim.count !== 1) throw new Error("Le lot a changé pendant la préparation de l'import ; rechargez-le avant de réessayer")
    await prisma.migrationIssue.deleteMany({ where: { runId: run.id, code: { startsWith: "IMPORT_" } } })

    const sourceRecords = [...run.records].sort((a, b) => IMPORT_ORDER[classifySourceObject(a.objectType)] - IMPORT_ORDER[classifySourceObject(b.objectType)])
    const imported = new Map<string, number>()
    const rejected = new Map<string, number>()
    const issues: Array<{ severity: "WARNING" | "ERROR"; objectType: string; sourceId: string; code: string; message: string }> = []
    let pipelineId: string | null = null
    let fallbackClientId: string | null = null
    let fallbackSiteId: string | null = null
    let fallbackSupplierId: string | null = null

    async function ensureFallbackClient() {
      if (fallbackClientId) return fallbackClientId
      const name = `À rapprocher · Migration ${runProvider}`
      const client = await prisma.client.findFirst({ where: { companyId, name }, select: { id: true } })
        ?? await prisma.client.create({ data: { companyId, name, type: "ENTERPRISE", lifecycleStage: "MIGRATION_REVIEW" }, select: { id: true } })
      fallbackClientId = client.id
      return client.id
    }

    async function ensureFallbackSite() {
      if (fallbackSiteId) return fallbackSiteId
      const clientId = await ensureFallbackClient()
      const label = `Site à rapprocher · ${runProvider}`
      const site = await prisma.customerSite.findFirst({ where: { companyId, clientId, label }, select: { id: true } })
        ?? await prisma.customerSite.create({ data: { companyId, clientId, label, address1: "Adresse à compléter", kind: "MIGRATION_REVIEW" }, select: { id: true } })
      fallbackSiteId = site.id
      return site.id
    }

    async function ensureFallbackSupplier() {
      if (fallbackSupplierId) return fallbackSupplierId
      const name = `Fournisseur à rapprocher · ${runProvider}`
      const supplier = await prisma.supplier.findFirst({ where: { companyId, name }, select: { id: true } })
        ?? await prisma.supplier.create({ data: { companyId, name, active: false }, select: { id: true } })
      fallbackSupplierId = supplier.id
      return supplier.id
    }

    try {
      for (const record of sourceRecords) {
        await withMigrationRecordTransaction(async () => {
          const active = await prisma.migrationRun.updateMany({
            where: { id: run.id, companyId, status: "IMPORTING", importLeaseId: leaseId },
            data: { importHeartbeatAt: new Date() },
          })
          if (active.count !== 1) throw new Error("La réservation de cet import a expiré")
          const kind = classifySourceObject(record.objectType)
          const payload = record.payload as SourcePayload
          let targetModel: string | null = null
          let targetRecordId: string | null = null

          if (kind === "CLIENT") {
            const candidate = clientCandidate(payload)
            const mapping = await findMappedTarget(companyId, run.provider, record.sourceId, "Client", record.objectType)
            const existing = mapping ? await prisma.client.findFirst({ where: { id: mapping.targetRecordId, companyId }, select: { id: true } }) : null
            const client = existing
              ? await prisma.client.update({ where: { id: existing.id }, data: candidate })
              : await prisma.client.create({ data: { companyId, ...candidate } })
            targetModel = "Client"
            targetRecordId = client.id

            const contact = contactCandidate(payload)
            const hasContact = Boolean(sourceValue(payload, ["firstname", "first_name", "prenom", "lastname", "last_name", "nom_de_famille", "email", "phone", "telephone", "mobilephone"]))
            if (hasContact) {
              const existingContact = await prisma.contact.findFirst({
                where: {
                  clientId: client.id,
                  ...(contact.email ? { email: contact.email } : { firstName: contact.firstName, lastName: contact.lastName }),
                },
                select: { id: true },
              })
              if (existingContact) await prisma.contact.update({ where: { id: existingContact.id }, data: contact })
              else await prisma.contact.create({ data: { clientId: client.id, isPrimary: true, ...contact } })
            }
          } else if (kind === "CONTACT") {
            const candidate = contactCandidate(payload)
            const mapping = await findMappedTarget(companyId, run.provider, record.sourceId, "Contact", record.objectType)
            const existing = mapping ? await prisma.contact.findFirst({ where: { id: mapping.targetRecordId, client: { companyId } }, select: { id: true, clientId: true } }) : null
            let clientId = existing?.clientId ?? await mappedClientFromAssociations(companyId, run.provider, payload)
            if (!clientId) {
              const individual = await prisma.client.create({
                data: { companyId, name: `${candidate.firstName} ${candidate.lastName}`.trim(), type: "INDIVIDUAL", lifecycleStage: candidate.lifecycleStage, customFields: payload as Prisma.InputJsonValue },
              })
              clientId = individual.id
            }
            const contact = existing
              ? await prisma.contact.update({ where: { id: existing.id }, data: { ...candidate, clientId } })
              : await prisma.contact.create({ data: { clientId, isPrimary: true, ...candidate } })
            targetModel = "Contact"
            targetRecordId = contact.id
          } else if (kind === "SITE") {
            const candidate = siteCandidate(payload)
            const mapping = await findMappedTarget(companyId, run.provider, record.sourceId, "CustomerSite", record.objectType)
            const existing = mapping ? await prisma.customerSite.findFirst({ where: { id: mapping.targetRecordId, companyId }, select: { id: true, clientId: true } }) : null
            const mappedClientId = existing?.clientId ?? await mappedClientFromAssociations(companyId, run.provider, payload)
            const clientId = mappedClientId ?? await ensureFallbackClient()
            if (!mappedClientId) issues.push({ severity: "WARNING", objectType: record.objectType, sourceId: record.sourceId, code: "IMPORT_SITE_WITHOUT_CLIENT", message: "Site rattaché au client de contrôle faute d’association source." })
            const site = existing
              ? await prisma.customerSite.update({ where: { id: existing.id }, data: { ...candidate, clientId } })
              : await prisma.customerSite.create({ data: { companyId, clientId, ...candidate } })
            targetModel = "CustomerSite"
            targetRecordId = site.id
          } else if (kind === "SUPPLIER") {
            const candidate = supplierCandidate(payload)
            const mapping = await findMappedTarget(companyId, run.provider, record.sourceId, "Supplier", record.objectType)
            const existing = mapping ? await prisma.supplier.findFirst({ where: { id: mapping.targetRecordId, companyId }, select: { id: true } }) : null
            const supplier = existing
              ? await prisma.supplier.update({ where: { id: existing.id }, data: candidate })
              : await prisma.supplier.upsert({ where: { companyId_name: { companyId, name: candidate.name } }, update: candidate, create: { companyId, ...candidate } })
            targetModel = "Supplier"
            targetRecordId = supplier.id
          } else if (kind === "PRODUCT") {
            const candidate = productCandidate(payload, migrationReference(run.provider, record.sourceId))
            const supplierId = await mappedTargetFromAssociations(companyId, run.provider, payload, "supplier", "Supplier")
            const mapping = await findMappedTarget(companyId, run.provider, record.sourceId, "Product", record.objectType)
            const existing = mapping ? await prisma.product.findFirst({ where: { id: mapping.targetRecordId, companyId }, select: { id: true } }) : null
            const product = existing
              ? await prisma.product.update({ where: { id: existing.id }, data: { ...candidate, supplierId } })
              : await prisma.product.upsert({ where: { companyId_sku: { companyId, sku: candidate.sku } }, update: { ...candidate, supplierId }, create: { companyId, supplierId, ...candidate } })
            targetModel = "Product"
            targetRecordId = product.id
          } else if (kind === "WAREHOUSE") {
            const candidate = warehouseCandidate(payload, migrationReference("DEPOT", record.sourceId))
            const mapping = await findMappedTarget(companyId, run.provider, record.sourceId, "Warehouse", record.objectType)
            const existing = mapping ? await prisma.warehouse.findFirst({ where: { id: mapping.targetRecordId, companyId }, select: { id: true } }) : null
            const warehouse = existing
              ? await prisma.warehouse.update({ where: { id: existing.id }, data: candidate })
              : await prisma.warehouse.upsert({ where: { companyId_code: { companyId, code: candidate.code } }, update: candidate, create: { companyId, ...candidate } })
            if (!candidate.active) await assertWarehouseEmpty(prisma, companyId, warehouse.id)
            targetModel = "Warehouse"
            targetRecordId = warehouse.id
          } else if (kind === "OPPORTUNITY") {
            const candidate = opportunityCandidate(payload)
            const mapping = await findMappedTarget(companyId, run.provider, record.sourceId, "Opportunity", record.objectType)
            const existing = mapping ? await prisma.opportunity.findFirst({ where: { id: mapping.targetRecordId, pipeline: { companyId } }, select: { id: true, clientId: true } }) : null
            let clientId = existing?.clientId ?? await mappedClientFromAssociations(companyId, run.provider, payload)
            if (!clientId) {
              const placeholder = await prisma.client.create({ data: { companyId, name: `À rapprocher · ${sourceDisplayName(payload)}`, type: "ENTERPRISE", customFields: payload as Prisma.InputJsonValue } })
              clientId = placeholder.id
              issues.push({ severity: "WARNING", objectType: record.objectType, sourceId: record.sourceId, code: "IMPORT_DEAL_WITHOUT_CLIENT", message: "Affaire importée dans un client provisoire faute d'association source." })
            }
            if (!pipelineId) pipelineId = (await ensureMigrationPipeline(companyId)).id
            const opportunity = existing
              ? await prisma.opportunity.update({ where: { id: existing.id }, data: { ...candidate, clientId, pipelineId } })
              : await prisma.opportunity.create({ data: { ...candidate, clientId, pipelineId } })
            targetModel = "Opportunity"
            targetRecordId = opportunity.id
          } else if (kind === "PROJECT") {
            const candidate = projectCandidate(payload)
            const mapping = await findMappedTarget(companyId, run.provider, record.sourceId, "Project", record.objectType)
            const existing = mapping ? await prisma.project.findFirst({ where: { id: mapping.targetRecordId, companyId }, select: { id: true, clientId: true, siteId: true, status: true } }) : null
            const mappedClientId = existing?.clientId ?? await mappedClientFromAssociations(companyId, run.provider, payload)
            const clientId = mappedClientId ?? await ensureFallbackClient()
            const siteId = await mappedTargetFromAssociations(companyId, run.provider, payload, "site", "CustomerSite")
            if (siteId && (siteId !== existing?.siteId || candidate.status !== existing.status && !closedProjectStatuses.includes(candidate.status))) {
              const site = await lockActiveSite(prisma, companyId, siteId)
              if (site.clientId !== clientId) throw new Error("Le site source n’appartient pas au client du chantier")
            }
            if (!mappedClientId) issues.push({ severity: "WARNING", objectType: record.objectType, sourceId: record.sourceId, code: "IMPORT_PROJECT_WITHOUT_CLIENT", message: "Chantier rattaché au client de contrôle faute d’association source." })
            const project = existing
              ? await prisma.project.update({ where: { id: existing.id }, data: { ...candidate, clientId, siteId } })
              : await prisma.project.create({ data: { companyId, clientId, siteId, ...candidate } })
            targetModel = "Project"
            targetRecordId = project.id
          } else if (kind === "EQUIPMENT") {
            const candidate = equipmentCandidate(payload)
            const mapping = await findMappedTarget(companyId, run.provider, record.sourceId, "Equipment", record.objectType)
            let existing = mapping ? await prisma.equipment.findFirst({ where: { id: mapping.targetRecordId, companyId }, select: { id: true, siteId: true, productId: true } }) : null
            const sourceSiteId = await mappedTargetFromAssociations(companyId, run.provider, payload, "site", "CustomerSite")
            if (!existing && candidate.serialNumber) {
              const serialMatch = await prisma.equipment.findUnique({ where: { companyId_serialNumber: { companyId, serialNumber: candidate.serialNumber } }, select: { id: true, siteId: true, productId: true } })
              if (serialMatch && sourceSiteId && serialMatch.siteId !== sourceSiteId) throw new Error("Ce numéro de série est déjà rattaché à un autre site")
              existing = serialMatch
            }
            let siteId = existing?.siteId ?? sourceSiteId
            if (!siteId) {
              const clientId = await mappedClientFromAssociations(companyId, run.provider, payload)
              if (clientId) siteId = (await prisma.customerSite.findFirst({ where: { companyId, clientId }, select: { id: true } }))?.id ?? null
            }
            if (!siteId) {
              siteId = await ensureFallbackSite()
              issues.push({ severity: "WARNING", objectType: record.objectType, sourceId: record.sourceId, code: "IMPORT_EQUIPMENT_WITHOUT_SITE", message: "Équipement rattaché au site de contrôle faute d’association source." })
            }
            const productId = await mappedTargetFromAssociations(companyId, run.provider, payload, "product", "Product")
            if (!existing || siteId !== existing.siteId) await lockActiveSite(prisma, companyId, siteId)
            if (productId && productId !== existing?.productId) await lockActiveAssetProduct(prisma, companyId, productId)
            const equipment = existing
              ? await prisma.equipment.update({ where: { id: existing.id }, data: { ...candidate, siteId, productId } })
              : await prisma.equipment.create({ data: { companyId, siteId, productId, ...candidate } })
            targetModel = "Equipment"
            targetRecordId = equipment.id
          } else if (kind === "TICKET") {
            const candidate = ticketCandidate(payload, migrationReference("SAV", record.sourceId))
            const mapping = await findMappedTarget(companyId, run.provider, record.sourceId, "ServiceTicket", record.objectType)
            const existing = mapping ? await prisma.serviceTicket.findFirst({ where: { id: mapping.targetRecordId, companyId }, select: { id: true, clientId: true, siteId: true, equipmentId: true, status: true } }) : null
            if (!existing && await prisma.serviceTicket.findFirst({ where: { companyId, number: candidate.number }, select: { id: true } })) {
              candidate.number = migrationCollisionNumber(candidate.number, run.provider, record.objectType, record.sourceId)
              issues.push({ severity: "WARNING", objectType: record.objectType, sourceId: record.sourceId, code: "IMPORT_NUMBER_COLLISION", message: "Numéro de ticket déjà utilisé : un suffixe source stable a été ajouté sans écraser la fiche existante." })
            }
            const equipmentId = existing?.equipmentId ?? await mappedTargetFromAssociations(companyId, run.provider, payload, "equipment", "Equipment")
            const equipment = equipmentId ? await prisma.equipment.findFirst({ where: { id: equipmentId, companyId }, select: { siteId: true, site: { select: { clientId: true } } } }) : null
            if (equipmentId && !equipment) throw new Error("Équipement source introuvable")
            const siteId = existing?.siteId ?? equipment?.siteId ?? await mappedTargetFromAssociations(companyId, run.provider, payload, "site", "CustomerSite")
            const site = siteId ? await prisma.customerSite.findFirst({ where: { id: siteId, companyId }, select: { clientId: true } }) : null
            const mappedClientId = existing?.clientId ?? site?.clientId ?? equipment?.site.clientId ?? await mappedClientFromAssociations(companyId, run.provider, payload)
            const clientId = mappedClientId ?? await ensureFallbackClient()
            if (siteId && (!existing || siteId !== existing.siteId || equipmentId !== existing.equipmentId || candidate.status !== existing.status && !closedTicketStatuses.includes(candidate.status))) {
              const activeSite = await lockActiveSite(prisma, companyId, siteId)
              if (activeSite.clientId !== clientId) throw new Error("Le site source n’appartient pas au client du ticket")
              if (equipmentId) await lockActiveEquipment(prisma, companyId, siteId, [equipmentId])
            }
            if (!mappedClientId) issues.push({ severity: "WARNING", objectType: record.objectType, sourceId: record.sourceId, code: "IMPORT_TICKET_WITHOUT_CLIENT", message: "Ticket SAV rattaché au client de contrôle faute d’association source." })
            const ticket = existing
              ? await prisma.serviceTicket.update({ where: { id: existing.id }, data: { ...candidate, clientId, siteId, equipmentId } })
              : await prisma.serviceTicket.upsert({ where: { companyId_number: { companyId, number: candidate.number } }, update: { ...candidate, clientId, siteId, equipmentId }, create: { companyId, clientId, siteId, equipmentId, ...candidate } })
            targetModel = "ServiceTicket"
            targetRecordId = ticket.id
          } else if (kind === "INTERVENTION") {
            const candidate = interventionCandidate(payload)
            const mapping = await findMappedTarget(companyId, run.provider, record.sourceId, "FieldIntervention", record.objectType)
            const existing = mapping ? await prisma.fieldIntervention.findFirst({ where: { id: mapping.targetRecordId, companyId }, select: { id: true, siteId: true, ticketId: true, projectId: true, status: true, assignedMembershipId: true, updatedAt: true } }) : null
            const ticketId = await mappedTargetFromAssociations(companyId, run.provider, payload, "ticket", "ServiceTicket")
            const projectId = await mappedTargetFromAssociations(companyId, run.provider, payload, "project", "Project")
            let siteId = existing?.siteId ?? await mappedTargetFromAssociations(companyId, run.provider, payload, "site", "CustomerSite")
            if (!siteId && ticketId) siteId = (await prisma.serviceTicket.findFirst({ where: { id: ticketId, companyId }, select: { siteId: true } }))?.siteId ?? null
            if (!siteId && projectId) siteId = (await prisma.project.findFirst({ where: { id: projectId, companyId }, select: { siteId: true } }))?.siteId ?? null
            if (!siteId) {
              siteId = await ensureFallbackSite()
              issues.push({ severity: "WARNING", objectType: record.objectType, sourceId: record.sourceId, code: "IMPORT_INTERVENTION_WITHOUT_SITE", message: "Intervention rattachée au site de contrôle faute d’association source." })
            }
            if (!existing || siteId !== existing.siteId || ticketId !== existing.ticketId || projectId !== existing.projectId || candidate.status !== existing.status && !closedInterventionStatuses.includes(candidate.status)) {
              const site = await lockActiveSite(prisma, companyId, siteId)
              if (ticketId) {
                const ticket = await prisma.serviceTicket.findFirst({ where: { id: ticketId, companyId, clientId: site.clientId }, select: { siteId: true, equipmentId: true } })
                if (!ticket || ticket.siteId && ticket.siteId !== siteId) throw new Error("Ticket source incompatible avec le site")
                if (ticket.equipmentId) await lockActiveEquipment(prisma, companyId, siteId, [ticket.equipmentId])
              }
              if (projectId && !await prisma.project.findFirst({ where: { id: projectId, companyId, clientId: site.clientId, OR: [{ siteId: null }, { siteId }] }, select: { id: true } })) throw new Error("Chantier source incompatible avec le site")
            }
            if (existing?.assignedMembershipId) {
              await lockSchedulingMembers(prisma, companyId, [existing.assignedMembershipId])
              if (candidate.status !== "CANCELED") await assertSchedulingSlotFree(prisma, { companyId, membershipId: existing.assignedMembershipId,
                start: candidate.scheduledStart, end: candidate.scheduledEnd ?? new Date(candidate.scheduledStart.getTime() + 3_600_000), excludeInterventionId: existing.id })
            }
            let intervention: { id: string }
            if (existing) {
              const changed = await prisma.fieldIntervention.updateMany({ where: { id: existing.id, companyId, updatedAt: existing.updatedAt, assignedMembershipId: existing.assignedMembershipId },
                data: { ...candidate, siteId, ticketId, projectId, updatedAt: new Date(Math.max(Date.now(), existing.updatedAt.getTime() + 1)) } })
              if (changed.count !== 1) throw new Error("Le planning de cette intervention a changé. Rechargez le lot avant de réessayer.")
              intervention = existing
            } else intervention = await prisma.fieldIntervention.create({ data: { companyId, siteId, ticketId, projectId, ...candidate } })
            targetModel = "FieldIntervention"
            targetRecordId = intervention.id
          } else if (kind === "MAINTENANCE_CONTRACT") {
            const candidate = maintenanceContractCandidate(payload, migrationReference("CTR", record.sourceId))
            const mapping = await findMappedTarget(companyId, run.provider, record.sourceId, "MaintenanceContract", record.objectType)
            const existing = mapping ? await prisma.maintenanceContract.findFirst({ where: { id: mapping.targetRecordId, companyId }, select: { id: true, clientId: true, siteId: true, status: true } }) : null
            if (!existing && await prisma.maintenanceContract.findFirst({ where: { companyId, number: candidate.number }, select: { id: true } })) {
              candidate.number = migrationCollisionNumber(candidate.number, run.provider, record.objectType, record.sourceId)
              issues.push({ severity: "WARNING", objectType: record.objectType, sourceId: record.sourceId, code: "IMPORT_NUMBER_COLLISION", message: "Numéro de contrat déjà utilisé : un suffixe source stable a été ajouté sans écraser la fiche existante." })
            }
            let siteId = existing?.siteId ?? await mappedTargetFromAssociations(companyId, run.provider, payload, "site", "CustomerSite")
            if (!siteId) siteId = await ensureFallbackSite()
            const site = await prisma.customerSite.findFirstOrThrow({ where: { id: siteId, companyId }, select: { clientId: true } })
            const mappedClientId = existing?.clientId ?? await mappedClientFromAssociations(companyId, run.provider, payload)
            const clientId = mappedClientId ?? site.clientId
            if (!existing || siteId !== existing.siteId || candidate.status !== existing.status && !closedMaintenanceStatuses.includes(candidate.status)) {
              const activeSite = await lockActiveSite(prisma, companyId, siteId)
              if (activeSite.clientId !== clientId) throw new Error("Le site source n’appartient pas au client du contrat")
            }
            if (!mappedClientId) issues.push({ severity: "WARNING", objectType: record.objectType, sourceId: record.sourceId, code: "IMPORT_CONTRACT_WITHOUT_CLIENT", message: "Contrat rattaché au client du site faute d’association source explicite." })
            const contract = existing
              ? await prisma.maintenanceContract.update({ where: { id: existing.id }, data: { ...candidate, clientId, siteId } })
              : await prisma.maintenanceContract.upsert({ where: { companyId_number: { companyId, number: candidate.number } }, update: { ...candidate, clientId, siteId }, create: { companyId, clientId, siteId, ...candidate } })
            targetModel = "MaintenanceContract"
            targetRecordId = contract.id
          } else if (kind === "PURCHASE_ORDER") {
            const candidate = purchaseOrderCandidate(payload, migrationReference("ACH", record.sourceId))
            const mapping = await findMappedTarget(companyId, run.provider, record.sourceId, "PurchaseOrder", record.objectType)
            const existing = mapping ? await prisma.purchaseOrder.findFirst({ where: { id: mapping.targetRecordId, companyId }, select: { id: true, supplierId: true } }) : null
            if (!existing && await prisma.purchaseOrder.findFirst({ where: { companyId, number: candidate.number }, select: { id: true } })) {
              candidate.number = migrationCollisionNumber(candidate.number, run.provider, record.objectType, record.sourceId)
              issues.push({ severity: "WARNING", objectType: record.objectType, sourceId: record.sourceId, code: "IMPORT_NUMBER_COLLISION", message: "Numéro de commande fournisseur déjà utilisé : un suffixe source stable a été ajouté sans écraser le document existant." })
            }
            const mappedSupplierId = existing?.supplierId ?? await mappedTargetFromAssociations(companyId, run.provider, payload, "supplier", "Supplier")
            const supplierId = mappedSupplierId ?? await ensureFallbackSupplier()
            const projectId = await mappedTargetFromAssociations(companyId, run.provider, payload, "project", "Project")
            const productId = await mappedTargetFromAssociations(companyId, run.provider, payload, "product", "Product")
            if (!mappedSupplierId) issues.push({ severity: "WARNING", objectType: record.objectType, sourceId: record.sourceId, code: "IMPORT_PURCHASE_WITHOUT_SUPPLIER", message: "Commande rattachée au fournisseur de contrôle faute d’association source." })
            const order = await prisma.$transaction(async (tx) => {
              const base = existing
                ? await tx.purchaseOrder.update({ where: { id: existing.id }, data: { ...candidate, supplierId, projectId } })
                : await tx.purchaseOrder.upsert({ where: { companyId_number: { companyId, number: candidate.number } }, update: { ...candidate, supplierId, projectId }, create: { companyId, supplierId, projectId, ...candidate } })
              const sourceKey = `aggregate:${run.provider}:${record.objectType}:${record.sourceId}`
              await tx.purchaseOrderLine.upsert({
                where: { purchaseOrderId_sourceKey: { purchaseOrderId: base.id, sourceKey } },
                update: { productId, label: sourceDisplayName(payload), quantity: 1, unitPriceCents: candidate.totalHtCents },
                create: { purchaseOrderId: base.id, productId, label: sourceDisplayName(payload), quantity: 1, unitPriceCents: candidate.totalHtCents, sourceKey },
              })
              return base
            })
            targetModel = "PurchaseOrder"
            targetRecordId = order.id
          } else if (kind === "CUSTOMER_ORDER") {
            const candidate = customerOrderCandidate(payload, migrationReference("CMD", record.sourceId))
            const mapping = await findMappedTarget(companyId, run.provider, record.sourceId, "CustomerOrder", record.objectType)
            const existing = mapping ? await prisma.customerOrder.findFirst({ where: { id: mapping.targetRecordId, companyId }, select: { id: true, clientId: true } }) : null
            if (!existing && await prisma.customerOrder.findFirst({ where: { companyId, number: candidate.number }, select: { id: true } })) {
              candidate.number = migrationCollisionNumber(candidate.number, run.provider, record.objectType, record.sourceId)
              issues.push({ severity: "WARNING", objectType: record.objectType, sourceId: record.sourceId, code: "IMPORT_NUMBER_COLLISION", message: "Numéro de commande client déjà utilisé : un suffixe source stable a été ajouté sans écraser le document existant." })
            }
            const mappedClientId = existing?.clientId ?? await mappedClientFromAssociations(companyId, run.provider, payload)
            const clientId = mappedClientId ?? await ensureFallbackClient()
            const projectId = await mappedTargetFromAssociations(companyId, run.provider, payload, "project", "Project")
            let quoteId = await mappedTargetFromAssociations(companyId, run.provider, payload, "quote", "Quote")
            if (quoteId && await prisma.customerOrder.findFirst({ where: { quoteId, ...(existing ? { id: { not: existing.id } } : {}) }, select: { id: true } })) {
              quoteId = null
              issues.push({ severity: "WARNING", objectType: record.objectType, sourceId: record.sourceId, code: "IMPORT_QUOTE_ALREADY_CONVERTED", message: "Le devis associé est déjà lié à une autre commande ; la commande source a été conservée sans ce lien unique." })
            }
            const productId = await mappedTargetFromAssociations(companyId, run.provider, payload, "product", "Product")
            if (!mappedClientId) issues.push({ severity: "WARNING", objectType: record.objectType, sourceId: record.sourceId, code: "IMPORT_ORDER_WITHOUT_CLIENT", message: "Commande client rattachée au client de contrôle faute d’association source." })
            const tvaRate = candidate.totalHtCents ? Math.round(candidate.totalTvaCents / candidate.totalHtCents * 10_000) / 100 : 0
            const order = await prisma.$transaction(async (tx) => {
              const data = { ...candidate, clientId, projectId, quoteId }
              const base = existing
                ? await tx.customerOrder.update({ where: { id: existing.id }, data })
                : await tx.customerOrder.create({ data: { companyId, ...data } })
              const sourceKey = `aggregate:${run.provider}:${record.objectType}:${record.sourceId}`
              await tx.customerOrderLine.upsert({
                where: { customerOrderId_sourceKey: { customerOrderId: base.id, sourceKey } },
                update: { productId, label: sourceDisplayName(payload), description: `Référence source ${run.provider} · ${record.sourceId}`, quantity: 1, unitPriceCents: candidate.totalHtCents, tvaRate },
                create: { customerOrderId: base.id, productId, label: sourceDisplayName(payload), description: `Référence source ${run.provider} · ${record.sourceId}`, quantity: 1, unitPriceCents: candidate.totalHtCents, tvaRate, sourceKey },
              })
              return base
            })
            targetModel = "CustomerOrder"
            targetRecordId = order.id
          } else if (kind === "DELIVERY_NOTE") {
            let customerOrderId = await mappedTargetFromAssociations(companyId, run.provider, payload, "customerOrder", "CustomerOrder")
            if (!customerOrderId) {
              const orderNumber = sourceValue(payload, ["order_number", "numero_commande", "commande", "customer_order"])
              if (orderNumber) customerOrderId = (await prisma.customerOrder.findFirst({ where: { companyId, number: orderNumber }, select: { id: true } }))?.id ?? null
            }
            if (!customerOrderId) {
              rejected.set(record.objectType, (rejected.get(record.objectType) ?? 0) + 1)
              issues.push({ severity: "WARNING", objectType: record.objectType, sourceId: record.sourceId, code: "IMPORT_DELIVERY_WITHOUT_ORDER", message: "Bon de livraison conservé en zone brute mais non importé : commande client source non associée." })
              return
            }
            const orderLine = await prisma.customerOrderLine.findFirst({ where: { customerOrderId }, orderBy: { order: "asc" } })
            if (!orderLine) {
              rejected.set(record.objectType, (rejected.get(record.objectType) ?? 0) + 1)
              issues.push({ severity: "WARNING", objectType: record.objectType, sourceId: record.sourceId, code: "IMPORT_DELIVERY_WITHOUT_LINE", message: "Bon de livraison conservé en zone brute : la commande cible ne contient aucune ligne." })
              return
            }
            const candidate = deliveryNoteCandidate(payload, migrationReference("BL", record.sourceId))
            const mapping = await findMappedTarget(companyId, run.provider, record.sourceId, "DeliveryNote", record.objectType)
            const existing = mapping ? await prisma.deliveryNote.findFirst({ where: { id: mapping.targetRecordId, companyId }, select: { id: true } }) : null
            if (!existing && await prisma.deliveryNote.findFirst({ where: { companyId, number: candidate.number }, select: { id: true } })) {
              candidate.number = migrationCollisionNumber(candidate.number, run.provider, record.objectType, record.sourceId)
              issues.push({ severity: "WARNING", objectType: record.objectType, sourceId: record.sourceId, code: "IMPORT_NUMBER_COLLISION", message: "Numéro de bon de livraison déjà utilisé : un suffixe source stable a été ajouté sans écraser le document existant." })
            }
            const delivery = await prisma.$transaction(async (tx) => {
              const { quantity, ...document } = candidate
              const base = existing
                ? await tx.deliveryNote.update({ where: { id: existing.id }, data: { ...document, customerOrderId } })
                : await tx.deliveryNote.create({ data: { companyId, customerOrderId, ...document } })
              await tx.deliveryNoteLine.deleteMany({ where: { deliveryNoteId: base.id } })
              await tx.deliveryNoteLine.create({ data: { deliveryNoteId: base.id, customerOrderLineId: orderLine.id, productId: orderLine.productId, label: orderLine.label, quantity } })
              const delivered = await tx.deliveryNoteLine.aggregate({ where: { customerOrderLineId: orderLine.id }, _sum: { quantity: true } })
              await tx.customerOrderLine.update({ where: { id: orderLine.id }, data: { deliveredQuantity: delivered._sum.quantity ?? 0 } })
              return base
            })
            targetModel = "DeliveryNote"
            targetRecordId = delivery.id
          } else if (kind === "GOODS_RECEIPT") {
            let purchaseOrderId = await mappedTargetFromAssociations(companyId, run.provider, payload, "purchaseOrder", "PurchaseOrder")
            if (!purchaseOrderId) {
              const orderNumber = sourceValue(payload, ["order_number", "numero_commande", "commande_fournisseur", "purchase_order"])
              if (orderNumber) purchaseOrderId = (await prisma.purchaseOrder.findFirst({ where: { companyId, number: orderNumber }, select: { id: true } }))?.id ?? null
            }
            const warehouseId = await mappedTargetFromAssociations(companyId, run.provider, payload, "warehouse", "Warehouse")
            const productId = await mappedTargetFromAssociations(companyId, run.provider, payload, "product", "Product")
            if (!purchaseOrderId || !warehouseId || !productId) {
              rejected.set(record.objectType, (rejected.get(record.objectType) ?? 0) + 1)
              issues.push({ severity: "WARNING", objectType: record.objectType, sourceId: record.sourceId, code: "IMPORT_RECEIPT_WITHOUT_REFERENCE", message: "Réception conservée en zone brute mais non importée : commande, dépôt ou produit non associé." })
              return
            }
            // Prefer the actual product over a free line, then break equal
            // display positions by id so a replay cannot move the receipt.
            const purchaseLine = await prisma.purchaseOrderLine.findFirst({ where: { purchaseOrderId, productId }, orderBy: [{ order: "asc" }, { id: "asc" }] })
              ?? await prisma.purchaseOrderLine.findFirst({ where: { purchaseOrderId, productId: null }, orderBy: [{ order: "asc" }, { id: "asc" }] })
            if (!purchaseLine) {
              rejected.set(record.objectType, (rejected.get(record.objectType) ?? 0) + 1)
              issues.push({ severity: "WARNING", objectType: record.objectType, sourceId: record.sourceId, code: "IMPORT_RECEIPT_WITHOUT_LINE", message: "Réception conservée en zone brute : aucune ligne de commande fournisseur cible." })
              return
            }
            const candidate = goodsReceiptCandidate(payload, migrationReference("REC", record.sourceId))
            const mapping = await findMappedTarget(companyId, run.provider, record.sourceId, "GoodsReceipt", record.objectType)
            const existing = mapping ? await prisma.goodsReceipt.findFirst({ where: { id: mapping.targetRecordId, companyId }, select: { id: true } }) : null
            if (!existing && await prisma.goodsReceipt.findFirst({ where: { companyId, number: candidate.number }, select: { id: true } })) {
              candidate.number = migrationCollisionNumber(candidate.number, run.provider, record.objectType, record.sourceId)
              issues.push({ severity: "WARNING", objectType: record.objectType, sourceId: record.sourceId, code: "IMPORT_NUMBER_COLLISION", message: "Numéro de réception déjà utilisé : un suffixe source stable a été ajouté sans écraser le document existant." })
            }
            const receipt = await prisma.$transaction(async (tx) => {
              await lockActiveWarehouses(tx, companyId, [warehouseId])
              const { quantity, unitCostCents, ...document } = candidate
              const base = existing
                ? await tx.goodsReceipt.update({ where: { id: existing.id }, data: { ...document, purchaseOrderId, warehouseId } })
                : await tx.goodsReceipt.create({ data: { companyId, purchaseOrderId, warehouseId, ...document } })
              await tx.goodsReceiptLine.deleteMany({ where: { goodsReceiptId: base.id } })
              await tx.goodsReceiptLine.create({ data: { goodsReceiptId: base.id, purchaseOrderLineId: purchaseLine.id, productId, quantity, unitCostCents } })
              const received = await tx.goodsReceiptLine.aggregate({ where: { purchaseOrderLineId: purchaseLine.id }, _sum: { quantity: true } })
              await tx.purchaseOrderLine.update({ where: { id: purchaseLine.id }, data: { receivedQuantity: received._sum.quantity ?? 0 } })
              const movementReference = `Réception ${base.number}`
              const movement = await tx.stockMovement.findFirst({ where: { companyId, warehouseId, productId, type: "IN", reference: movementReference }, select: { id: true } })
              if (movement) await tx.stockMovement.update({ where: { id: movement.id }, data: { quantity, unitCostCents, happenedAt: candidate.receivedAt } })
              else await tx.stockMovement.create({ data: { companyId, warehouseId, productId, type: "IN", quantity, unitCostCents, happenedAt: candidate.receivedAt, reference: movementReference } })
              const stock = await tx.stockMovement.aggregate({ where: { companyId, warehouseId, productId }, _sum: { quantity: true } })
              const quantityOnHand = Math.max(0, stock._sum.quantity ?? 0)
              const current = await tx.inventoryItem.findUnique({ where: { warehouseId_productId: { warehouseId, productId } }, select: { reservedQuantity: true } })
              await tx.inventoryItem.upsert({ where: { warehouseId_productId: { warehouseId, productId } }, update: { quantity: quantityOnHand, reservedQuantity: Math.min(quantityOnHand, current?.reservedQuantity ?? 0) }, create: { companyId, warehouseId, productId, quantity: quantityOnHand } })
              return base
            })
            targetModel = "GoodsReceipt"
            targetRecordId = receipt.id
          } else if (kind === "STOCK_RESERVATION") {
            const warehouseId = await mappedTargetFromAssociations(companyId, run.provider, payload, "warehouse", "Warehouse")
            const productId = await mappedTargetFromAssociations(companyId, run.provider, payload, "product", "Product")
            const projectId = await mappedTargetFromAssociations(companyId, run.provider, payload, "project", "Project")
            const customerOrderId = await mappedTargetFromAssociations(companyId, run.provider, payload, "customerOrder", "CustomerOrder")
            if (!warehouseId || !productId || (!projectId && !customerOrderId)) {
              rejected.set(record.objectType, (rejected.get(record.objectType) ?? 0) + 1)
              issues.push({ severity: "WARNING", objectType: record.objectType, sourceId: record.sourceId, code: "IMPORT_RESERVATION_WITHOUT_REFERENCE", message: "Réservation conservée en zone brute mais non importée : stock et dossier cible incomplets." })
              return
            }
            const candidate = stockReservationCandidate(payload)
            const mapping = await findMappedTarget(companyId, run.provider, record.sourceId, "StockReservation", record.objectType)
            const existing = mapping ? await prisma.stockReservation.findFirst({ where: { id: mapping.targetRecordId, companyId }, select: { id: true } }) : null
            await lockActiveWarehouses(prisma, companyId, [warehouseId])
            const reservation = existing
              ? await prisma.stockReservation.update({ where: { id: existing.id }, data: { ...candidate, warehouseId, productId, projectId, customerOrderId } })
              : await prisma.stockReservation.create({ data: { companyId, warehouseId, productId, projectId, customerOrderId, ...candidate } })
            const reserved = await prisma.stockReservation.aggregate({ where: { companyId, warehouseId, productId, status: "ACTIVE" }, _sum: { quantity: true } })
            const inventory = await prisma.inventoryItem.findUnique({ where: { warehouseId_productId: { warehouseId, productId } }, select: { id: true, quantity: true } })
            if (inventory) await prisma.inventoryItem.update({ where: { id: inventory.id }, data: { reservedQuantity: Math.min(inventory.quantity, reserved._sum.quantity ?? 0) } })
            targetModel = "StockReservation"
            targetRecordId = reservation.id
          } else if (kind === "STOCK_MOVEMENT") {
            const warehouseId = await mappedTargetFromAssociations(companyId, run.provider, payload, "warehouse", "Warehouse")
            const productId = await mappedTargetFromAssociations(companyId, run.provider, payload, "product", "Product")
            if (!warehouseId || !productId) {
              rejected.set(record.objectType, (rejected.get(record.objectType) ?? 0) + 1)
              issues.push({ severity: "WARNING", objectType: record.objectType, sourceId: record.sourceId, code: "IMPORT_STOCK_WITHOUT_REFERENCE", message: "Mouvement conservé en zone brute mais non importé : dépôt ou article source non associé." })
              return
            }
            const candidate = stockMovementCandidate(payload)
            const projectId = await mappedTargetFromAssociations(companyId, run.provider, payload, "project", "Project")
            const mapping = await findMappedTarget(companyId, run.provider, record.sourceId, "StockMovement", record.objectType)
            const existing = mapping ? await prisma.stockMovement.findFirst({ where: { id: mapping.targetRecordId, companyId }, select: { id: true } }) : null
            await lockActiveWarehouses(prisma, companyId, [warehouseId])
            const movement = existing
              ? await prisma.stockMovement.update({ where: { id: existing.id }, data: { ...candidate, warehouseId, productId, projectId } })
              : await prisma.stockMovement.create({ data: { companyId, warehouseId, productId, projectId, ...candidate } })
            const aggregate = await prisma.stockMovement.aggregate({ where: { companyId, warehouseId, productId }, _sum: { quantity: true } })
            const quantity = Math.max(0, aggregate._sum.quantity ?? 0)
            const currentInventory = await prisma.inventoryItem.findUnique({ where: { warehouseId_productId: { warehouseId, productId } }, select: { reservedQuantity: true } })
            const reservedQuantity = Math.min(quantity, currentInventory?.reservedQuantity ?? 0)
            await prisma.inventoryItem.upsert({
              where: { warehouseId_productId: { warehouseId, productId } },
              update: { quantity, reservedQuantity },
              create: { companyId, warehouseId, productId, quantity, reservedQuantity },
            })
            targetModel = "StockMovement"
            targetRecordId = movement.id
          } else if (kind === "QUOTE") {
            const candidate = quoteCandidate(payload, migrationReference("DEV", record.sourceId))
            const mapping = await findMappedTarget(companyId, run.provider, record.sourceId, "Quote", record.objectType)
            const existing = mapping ? await prisma.quote.findFirst({ where: { id: mapping.targetRecordId, companyId }, select: { id: true, clientId: true, currentVersion: true } }) : null
            if (!existing && await prisma.quote.findFirst({ where: { companyId, number: candidate.number }, select: { id: true } })) {
              candidate.number = migrationCollisionNumber(candidate.number, run.provider, record.objectType, record.sourceId)
              issues.push({ severity: "WARNING", objectType: record.objectType, sourceId: record.sourceId, code: "IMPORT_NUMBER_COLLISION", message: "Numéro de devis déjà utilisé : un suffixe source stable a été ajouté sans écraser le document existant." })
            }
            const mappedClientId = existing?.clientId ?? await mappedClientFromAssociations(companyId, run.provider, payload)
            const clientId = mappedClientId ?? await ensureFallbackClient()
            if (!mappedClientId) issues.push({ severity: "WARNING", objectType: record.objectType, sourceId: record.sourceId, code: "IMPORT_QUOTE_WITHOUT_CLIENT", message: "Devis rattaché au client de contrôle faute d’association source." })
            const tvaRate = candidate.totalHtCents ? Math.round(candidate.totalTvaCents / candidate.totalHtCents * 10_000) / 100 : 0
            const quote = await prisma.$transaction(async (tx) => {
              const base = existing
                ? await tx.quote.update({ where: { id: existing.id }, data: { number: candidate.number, object: candidate.object, status: candidate.status, date: candidate.date, validUntil: candidate.validUntil, clientId } })
                : await tx.quote.create({ data: { companyId, clientId, number: candidate.number, object: candidate.object, status: candidate.status, date: candidate.date, validUntil: candidate.validUntil } })
              const version = await tx.quoteVersion.findFirst({ where: { quoteId: base.id, version: base.currentVersion }, select: { id: true } })
              const versionId = version
                ? (await tx.quoteVersion.update({ where: { id: version.id }, data: { totalHtCents: candidate.totalHtCents, totalTvaCents: candidate.totalTvaCents, totalTtcCents: candidate.totalTtcCents } })).id
                : (await tx.quoteVersion.create({ data: { quoteId: base.id, version: base.currentVersion, totalHtCents: candidate.totalHtCents, totalTvaCents: candidate.totalTvaCents, totalTtcCents: candidate.totalTtcCents } })).id
              await tx.quoteSection.deleteMany({ where: { versionId } })
              await tx.quoteSection.create({
                data: {
                  versionId,
                  title: "Données reprises de la source",
                  lines: { create: { label: candidate.object, description: `Référence source ${run.provider} · ${record.sourceId}`, quantity: 1, unitPriceCents: candidate.totalHtCents, tvaRate, sourceKey: `aggregate:${run.provider}:${record.objectType}:${record.sourceId}` } },
                },
              })
              return base
            })
            targetModel = "Quote"
            targetRecordId = quote.id
          } else if (kind === "INVOICE") {
            const candidate = invoiceCandidate(payload, migrationReference("FACT", record.sourceId))
            const mapping = await findMappedTarget(companyId, run.provider, record.sourceId, "Invoice", record.objectType)
            const existing = mapping ? await prisma.invoice.findFirst({ where: { id: mapping.targetRecordId, companyId }, select: { id: true, clientId: true } }) : null
            if (!existing && await prisma.invoice.findFirst({ where: { companyId, number: candidate.number }, select: { id: true } })) {
              candidate.number = migrationCollisionNumber(candidate.number, run.provider, record.objectType, record.sourceId)
              issues.push({ severity: "WARNING", objectType: record.objectType, sourceId: record.sourceId, code: "IMPORT_NUMBER_COLLISION", message: "Numéro de facture déjà utilisé : un suffixe source stable a été ajouté sans écraser le document existant." })
            }
            const mappedClientId = existing?.clientId ?? await mappedClientFromAssociations(companyId, run.provider, payload)
            const clientId = mappedClientId ?? await ensureFallbackClient()
            if (!mappedClientId) issues.push({ severity: "WARNING", objectType: record.objectType, sourceId: record.sourceId, code: "IMPORT_INVOICE_WITHOUT_CLIENT", message: "Facture rattachée au client de contrôle faute d’association source." })
            const tvaRate = candidate.totalHtCents ? Math.round(candidate.totalTvaCents / candidate.totalHtCents * 10_000) / 100 : 0
            const invoice = await prisma.$transaction(async (tx) => {
              const data = { ...candidate, clientId }
              const base = existing
                ? await tx.invoice.update({ where: { id: existing.id }, data })
                : await tx.invoice.create({ data: { companyId, ...data } })
              const sourceKey = `aggregate:${run.provider}:${record.objectType}:${record.sourceId}`
              await tx.invoiceLine.upsert({
                where: { invoiceId_sourceKey: { invoiceId: base.id, sourceKey } },
                update: { label: candidate.object, description: `Référence source ${run.provider} · ${record.sourceId}`, quantity: 1, unitPriceCents: candidate.totalHtCents, tvaRate },
                create: { invoiceId: base.id, label: candidate.object, description: `Référence source ${run.provider} · ${record.sourceId}`, quantity: 1, unitPriceCents: candidate.totalHtCents, tvaRate, sourceKey },
              })
              return base
            })
            targetModel = "Invoice"
            targetRecordId = invoice.id
          } else if (kind === "LINE_ITEM") {
            const candidate = lineItemCandidate(record.objectType, payload)
            const sourceKey = `${run.provider}:${record.objectType}:${record.sourceId}`
            const productId = await mappedTargetFromAssociations(companyId, run.provider, payload, "product", "Product")
            const quoteId = await mappedTargetFromAssociations(companyId, run.provider, payload, "quote", "Quote")
            const invoiceId = await mappedTargetFromAssociations(companyId, run.provider, payload, "invoice", "Invoice")
            const customerOrderId = await mappedTargetFromAssociations(companyId, run.provider, payload, "customerOrder", "CustomerOrder")
            const purchaseOrderId = await mappedTargetFromAssociations(companyId, run.provider, payload, "purchaseOrder", "PurchaseOrder")
            const createdTargets: Array<{ model: string; id: string }> = []

            if (quoteId) {
              const quote = await prisma.quote.findFirst({ where: { id: quoteId, companyId }, select: { currentVersion: true } })
              if (quote) {
                const version = await prisma.quoteVersion.findFirst({ where: { quoteId, version: quote.currentVersion }, select: { id: true } })
                if (version) {
                  const section = await prisma.quoteSection.findFirst({ where: { versionId: version.id, title: "Lignes reprises de la source" }, select: { id: true } })
                    ?? await prisma.quoteSection.create({ data: { versionId: version.id, title: "Lignes reprises de la source", order: 900 }, select: { id: true } })
                  const line = await prisma.quoteLine.upsert({
                    where: { sectionId_sourceKey: { sectionId: section.id, sourceKey } },
                    update: candidate,
                    create: { sectionId: section.id, sourceKey, ...candidate },
                  })
                  await prisma.quoteLine.deleteMany({ where: { section: { versionId: version.id }, sourceKey: { startsWith: "aggregate:" } } })
                  createdTargets.push({ model: "QuoteLine", id: line.id })
                }
              }
            }

            if (invoiceId) {
              const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, companyId }, select: { id: true } })
              if (invoice) {
                const line = await prisma.invoiceLine.upsert({
                  where: { invoiceId_sourceKey: { invoiceId, sourceKey } },
                  update: candidate,
                  create: { invoiceId, sourceKey, ...candidate },
                })
                await prisma.invoiceLine.deleteMany({ where: { invoiceId, sourceKey: { startsWith: "aggregate:" } } })
                createdTargets.push({ model: "InvoiceLine", id: line.id })
              }
            }

            if (customerOrderId) {
              const order = await prisma.customerOrder.findFirst({ where: { id: customerOrderId, companyId }, select: { id: true } })
              if (order) {
                const quantity = Math.max(0.01, candidate.quantity)
                const line = await prisma.customerOrderLine.upsert({
                  where: { customerOrderId_sourceKey: { customerOrderId, sourceKey } },
                  update: { productId, label: candidate.label, description: candidate.description, quantity, unitPriceCents: candidate.unitPriceCents, tvaRate: candidate.tvaRate, order: candidate.order },
                  create: { customerOrderId, productId, sourceKey, label: candidate.label, description: candidate.description, quantity, unitPriceCents: candidate.unitPriceCents, tvaRate: candidate.tvaRate, order: candidate.order },
                })
                await prisma.customerOrderLine.deleteMany({ where: { customerOrderId, sourceKey: { startsWith: "aggregate:" } } })
                createdTargets.push({ model: "CustomerOrderLine", id: line.id })
              }
            }

            if (purchaseOrderId) {
              const order = await prisma.purchaseOrder.findFirst({ where: { id: purchaseOrderId, companyId }, select: { id: true } })
              if (order) {
                const quantity = Math.max(1, Math.round(candidate.quantity))
                const line = await prisma.purchaseOrderLine.upsert({
                  where: { purchaseOrderId_sourceKey: { purchaseOrderId, sourceKey } },
                  update: { productId, label: candidate.label, quantity, unitPriceCents: candidate.unitPriceCents, order: candidate.order },
                  create: { purchaseOrderId, productId, sourceKey, label: candidate.label, quantity, unitPriceCents: candidate.unitPriceCents, order: candidate.order },
                })
                await prisma.purchaseOrderLine.deleteMany({ where: { purchaseOrderId, sourceKey: { startsWith: "aggregate:" } } })
                createdTargets.push({ model: "PurchaseOrderLine", id: line.id })
              }
            }

            if (!createdTargets.length) {
              rejected.set(record.objectType, (rejected.get(record.objectType) ?? 0) + 1)
              issues.push({ severity: "WARNING", objectType: record.objectType, sourceId: record.sourceId, code: "IMPORT_LINE_WITHOUT_DOCUMENT", message: "Ligne conservée en zone brute mais non matérialisée : aucun devis, commande ou facture source associé." })
              return
            }
            targetModel = createdTargets[0].model
            targetRecordId = createdTargets[0].id
          } else if (kind === "PAYMENT") {
            let invoiceId = await mappedTargetFromAssociations(companyId, run.provider, payload, "invoice", "Invoice")
            if (!invoiceId) {
              const invoiceNumber = sourceValue(payload, ["invoice_number", "numero_facture", "facture", "invoice"])
              if (invoiceNumber) invoiceId = (await prisma.invoice.findFirst({ where: { companyId, number: invoiceNumber }, select: { id: true } }))?.id ?? null
            }
            if (!invoiceId) {
              rejected.set(record.objectType, (rejected.get(record.objectType) ?? 0) + 1)
              issues.push({ severity: "WARNING", objectType: record.objectType, sourceId: record.sourceId, code: "IMPORT_PAYMENT_WITHOUT_INVOICE", message: "Règlement conservé en zone brute mais non importé : facture source non associée." })
              return
            }
            const candidate = paymentCandidate(payload)
            const mapping = await findMappedTarget(companyId, run.provider, record.sourceId, "InvoicePayment", record.objectType)
            const existing = mapping ? await prisma.invoicePayment.findFirst({ where: { id: mapping.targetRecordId, invoice: { companyId } }, select: { id: true } }) : null
            const payment = existing
              ? await prisma.invoicePayment.update({ where: { id: existing.id }, data: { ...candidate, invoiceId } })
              : await prisma.invoicePayment.create({ data: { invoiceId, ...candidate } })
            const [aggregate, invoice] = await Promise.all([
              prisma.invoicePayment.aggregate({ where: { invoiceId }, _sum: { amountCents: true } }),
              prisma.invoice.findFirstOrThrow({ where: { id: invoiceId, companyId }, select: { totalTtcCents: true, paidAmountCents: true, status: true } }),
            ])
            const paidAmountCents = Math.max(invoice.paidAmountCents, aggregate._sum.amountCents ?? 0)
            await prisma.invoice.update({ where: { id: invoiceId }, data: { paidAmountCents, status: paidAmountCents >= invoice.totalTtcCents ? "PAID" : invoice.status } })
            targetModel = "InvoicePayment"
            targetRecordId = payment.id
          } else if (kind === "ACTIVITY") {
            const clientId = await mappedClientFromAssociations(companyId, run.provider, payload)
            if (!clientId) {
              rejected.set(record.objectType, (rejected.get(record.objectType) ?? 0) + 1)
              issues.push({ severity: "WARNING", objectType: record.objectType, sourceId: record.sourceId, code: "IMPORT_ACTIVITY_WITHOUT_CLIENT", message: "Activité conservée dans la zone brute mais non importée : aucun client, contact ou affaire associé." })
              return
            }
            const candidate = activityCandidate(record.objectType, payload)
            const happenedAt = candidate.happenedAt.valueOf() === 0 ? record.sourceCreatedAt ?? record.sourceUpdatedAt ?? new Date() : candidate.happenedAt
            const mapping = await findMappedTarget(companyId, run.provider, record.sourceId, "ClientActivity", record.objectType)
            const existing = mapping ? await prisma.clientActivity.findFirst({ where: { id: mapping.targetRecordId, client: { companyId } }, select: { id: true } }) : null
            const activity = existing
              ? await prisma.clientActivity.update({ where: { id: existing.id }, data: { ...candidate, happenedAt, clientId } })
              : await prisma.clientActivity.create({ data: { ...candidate, happenedAt, clientId } })
            targetModel = "ClientActivity"
            targetRecordId = activity.id
          } else {
            rejected.set(record.objectType, (rejected.get(record.objectType) ?? 0) + 1)
            return
          }

          if (targetModel && targetRecordId) {
            await mapExternalTarget({
              companyId,
              provider: run.provider,
              sourceObjectType: record.objectType,
              sourceRecordId: record.sourceId,
              targetModel,
              targetRecordId,
              sourceUpdatedAt: record.sourceUpdatedAt,
            })
            await prisma.sourceRecord.update({ where: { id: record.id }, data: { targetModel, targetRecordId, importedAt: new Date() } })
            imported.set(record.objectType, (imported.get(record.objectType) ?? 0) + 1)
          }

        })
      }
      const importedCount = [...imported.values()].reduce((sum, count) => sum + count, 0)
      const rejectedCount = [...rejected.values()].reduce((sum, count) => sum + count, 0)
      const status = rejectedCount ? "PARTIAL" : "IMPORTED"
      await withMigrationRecordTransaction(async () => {
        const completed = await prisma.migrationRun.updateMany({
          where: { id: run.id, importLeaseId: leaseId, status: "IMPORTING" },
          data: { status, completedAt: new Date(), importLeaseId: null, summary: { imported: importedCount, rejected: rejectedCount, warnings: issues.length } },
        })
        if (completed.count !== 1) throw new Error("La réservation de cet import a expiré avant sa finalisation")
        if (issues.length) await prisma.migrationIssue.createMany({ data: issues.slice(0, 1_000).map((issue) => ({ runId: run.id, ...issue })) })
        for (const metric of await prisma.migrationMetric.findMany({ where: { runId: run.id } })) {
          await prisma.migrationMetric.update({
            where: { id: metric.id },
            data: { imported: imported.get(metric.objectType) ?? 0, rejected: rejected.get(metric.objectType) ?? 0 },
          })
        }
      })
      revalidatePath("/dashboard/migrations")
      revalidatePath("/dashboard/clients")
      revalidatePath("/dashboard/pipeline")
      revalidatePath("/dashboard/operations")
      revalidatePath("/dashboard/projets")
      return { success: true as const, status, imported: importedCount, rejected: rejectedCount, warnings: issues.length }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Import impossible"
      await prisma.migrationRun.updateMany({ where: { id: run.id, importLeaseId: leaseId }, data: { status: "FAILED", completedAt: new Date(), importLeaseId: null, summary: { error: message } } })
      revalidatePath("/dashboard/migrations")
      throw error
    }
  }, "migration.manage")
}
