"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { withAuth, AuthorizationError } from "@/lib/auth-wrapper"
import { requestContext } from "@/lib/context"
import { AssetLifecycleError } from "@/lib/operations/asset-error"
import { logAction } from "@/lib/audit"
import {
  buildYearlyDocumentPrefix,
  readCompanyDocumentNumbers,
  nextDocumentNumber,
  withDocumentNumberRetry,
} from "@/lib/document-numbering"
import {
  assertSchedulingSlotFree,
  lockSchedulingMembers,
  schedulingMemberWhere,
  SchedulingError,
} from "@/lib/scheduling/resource-slots"
import { indexedMaintenancePrice, nextMaintenanceTerm } from "@/lib/operations/maintenance-renewal"
import { businessMinutesBetween, serviceSlaPolicy } from "@/lib/operations/service-sla"
import { assertAcceptedMaintenanceAgreement } from "@/lib/contracts/maintenance-agreements"
import { hasPermission } from "@/lib/permissions"
import { operationsDashboardScope } from "@/lib/operations/dashboard-scope"
import { lockActiveSite, lockActiveEquipment } from "@/lib/operations/asset-lifecycle"
import prisma from "@/lib/prisma"
import { readMaintenanceRenewalSources } from "@/lib/operations/maintenance-renewal-source"
import {
  id,
  ticketSchema,
  ticketUpdateSchema,
  ticketMergeSchema,
  interventionSchema,
  interventionPlanningSchema,
  maintenanceContractSchema,
  maintenanceRenewalSettingsSchema,
} from "./schemas"
import { getServiceRoutingRecommendation } from "./routing-reader"
import { revalidateOperations } from "./revalidation"

function schedulingFailure(error: unknown): { success: false; error: string } {
  if (error instanceof SchedulingError) return { success: false, error: error.message }
  if (error instanceof z.ZodError) return { success: false, error: "Créneau invalide. Vérifiez les dates de début et de fin." }
  if (error && typeof error === "object" && "code" in error && error.code === "P2034") return { success: false, error: "Le planning a changé. Rechargez puis réessayez ; votre saisie est conservée." }
  throw error
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
  const changedMessage = "Ce contrat a changé. Vérifiez la version actuelle avant de réessayer."
  return withAuth(async context => {
    const { companyId, userId, agencyIds } = context
    const data = maintenanceRenewalSettingsSchema.parse(input)
    const scope = operationsDashboardScope(companyId, agencyIds)
    await requestContext.run({ ...context, actionPermission: "service.write", maintenanceRenewalSettings: {
      contractId: data.contractId, expectedUpdatedAt: new Date(data.expectedUpdatedAt).toISOString(),
    } }, () => prisma.$transaction(async tx => {
      const where = { ...scope.contract, id: data.contractId }
      const contract = await tx.maintenanceContract.findFirst({ where, select: { id: true, number: true, clientId: true, siteId: true,
        status: true, renewalStatus: true, updatedAt: true, _count: { select: { renewedContracts: true } } } })
      if (!contract || !await tx.customerSite.findFirst({ where: { ...scope.site, id: contract.siteId, clientId: contract.clientId }, select: { id: true } }))
        throw new Error("Contrat d’entretien introuvable")
      if (contract.status === "RENEWED" || contract.renewalStatus === "RENEWED" || contract._count.renewedContracts > 0)
        throw new Error("Ce terme a déjà été renouvelé")
      const expectedUpdatedAt = new Date(data.expectedUpdatedAt)
      if (contract.updatedAt.getTime() !== expectedUpdatedAt.getTime()) throw new Error(changedMessage)
      const updatedAt = new Date(Math.max(Date.now(), contract.updatedAt.getTime() + 1))
      const changed = await tx.maintenanceContract.updateMany({ where: { ...where, updatedAt: expectedUpdatedAt, status: { not: "RENEWED" },
        renewalStatus: { not: "RENEWED" }, renewedContracts: { none: {} }, site: { ...scope.site, clientId: contract.clientId } },
        data: { noticeDays: data.noticeDays, indexationRate: data.indexationRate, autoRenew: data.autoRenew,
          renewalStatus: data.renewalStatus, renewalNotes: data.renewalNotes, updatedAt } })
      if (changed.count !== 1) throw new Error(changedMessage)
      await tx.auditLog.create({ data: { userId, action: "UPDATE_MAINTENANCE_RENEWAL", resource: "MAINTENANCE_CONTRACT", resourceId: contract.id,
        payload: { number: contract.number, noticeDays: data.noticeDays, indexationRate: data.indexationRate, autoRenew: data.autoRenew,
          renewalStatus: data.renewalStatus, previousUpdatedAt: contract.updatedAt.toISOString(), updatedAt: updatedAt.toISOString() } } })
    }, { isolationLevel: "Serializable" }))
    revalidateOperations()
    return { success: true as const }
  }, "service.write").catch(error => {
    if (error && typeof error === "object" && "code" in error && error.code === "P2034") throw new Error(changedMessage)
    throw error
  })
}

export async function renewMaintenanceContract(contractId: string, expectedRevision: string) {
  const changedMessage = "Le contrat a changé pendant le renouvellement. Rechargez la page."
  return withAuth(async ({ companyId, userId, agencyIds, role }) => {
    if (!hasPermission(role, "operations.write")) throw new AuthorizationError("La création du nouveau terme nécessite le droit Opérations en écriture.")
    const parsedId = id.parse(contractId)
    if (!z.string().regex(/^[a-f0-9]{64}$/).safeParse(expectedRevision).success) throw new AssetLifecycleError(changedMessage)
    const prefix = buildYearlyDocumentPrefix("ENT-", "ENT-")
    const renewed = await withDocumentNumberRetry(
      async () => {
        const last = await readCompanyDocumentNumbers(() => prisma.maintenanceContract.findMany({ where: { companyId, number: { startsWith: prefix } }, select: { number: true } }))
        return prisma.$transaction(
          async (transaction) => {
            const prepared = (await readMaintenanceRenewalSources(transaction, { companyId, agencyIds }, [parsedId])).get(parsedId)
            if (!prepared) throw new AssetLifecycleError("Contrat d’entretien introuvable")
            const { source: contract, isTvaApplicable } = prepared
            if (contract.recurringInvoice && contract.recurringInvoice.clientId !== contract.clientId) throw new AssetLifecycleError("Contrat d’entretien introuvable")
            if ((contract.autoInvoice || contract.recurringInvoice?.isActive) && !hasPermission(role, "finance.write")) throw new AuthorizationError("La facturation automatique nécessite le droit Finance en écriture.")
            if (contract.status === "RENEWED" || contract.renewalStatus === "RENEWED" || contract._count.renewedContracts > 0) throw new AssetLifecycleError("Ce terme a déjà été renouvelé")
            if (prepared.revision !== expectedRevision) throw new AssetLifecycleError(changedMessage)
            if (!contract.endDate) throw new AssetLifecycleError("Renseignez une date de fin avant de renouveler ce contrat")
            if (contract.renewalStatus === "DECLINED") throw new AssetLifecycleError("Le renouvellement a été refusé. Modifiez d’abord la décision.")
            if (contract.renewalStatus !== "ACCEPTED" && !contract.autoRenew) throw new AssetLifecycleError("Un accord client ou le renouvellement automatique est requis avant de créer le nouveau terme")
            const site = await lockActiveSite(transaction, companyId, contract.siteId, agencyIds)
            if (site.clientId !== contract.clientId) throw new AssetLifecycleError("Site du contrat incompatible avec le client")
            await lockActiveEquipment(transaction, companyId, contract.siteId, contract.equipments.map(item => item.equipmentId), agencyIds)
            await assertAcceptedMaintenanceAgreement(transaction, prepared)
            const term = nextMaintenanceTerm(contract.startDate, contract.endDate)
            const nextPriceCents = indexedMaintenancePrice(contract.priceCents, contract.indexationRate)
            if (!Number.isSafeInteger(nextPriceCents) || nextPriceCents > 2147483647) throw new AssetLifecycleError("Le montant du renouvellement dépasse la capacité de calcul.")
            const updated = await transaction.maintenanceContract.updateMany({
              where: { ...operationsDashboardScope(companyId, agencyIds).contract, id: contract.id, updatedAt: contract.updatedAt,
                status: { not: "RENEWED" }, renewalStatus: contract.renewalStatus, renewedContracts: { none: {} } },
              data: { status: "RENEWED", renewalStatus: "RENEWED", renewedAt: new Date(), nextVisitAt: null,
                updatedAt: new Date(Math.max(Date.now(), contract.updatedAt.getTime() + 1)) },
            })
            if (updated.count !== 1) throw new AssetLifecycleError(changedMessage)
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
                tvaRate: isTvaApplicable ? contract.tvaRate : 0,
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
            let recurringInvoiceId: string | null = null
            if (contract.recurringInvoice?.isActive) {
              const stopped = await transaction.recurringInvoice.updateMany({ where: { id: contract.recurringInvoice.id, companyId,
                clientId: contract.clientId, maintenanceContractId: contract.id, isActive: true }, data: { isActive: false } })
              if (stopped.count !== 1) throw new AssetLifecycleError(changedMessage)
            }
            if (contract.recurringInvoice?.isActive && nextPriceCents > 0) {
              const recurringFrequency = contract.frequency === "BIANNUAL" ? "BIANNUALLY" : contract.frequency === "ANNUAL" ? "ANNUALLY" : contract.frequency
              const recurrence = await transaction.recurringInvoice.create({
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
                        tvaRate: isTvaApplicable ? contract.tvaRate : 0,
                      },
                    ],
                  },
                },
              })
              recurringInvoiceId = recurrence.id
            }
            await transaction.auditLog.create({ data: { userId, action: "RENEW_MAINTENANCE_CONTRACT", resource: "MAINTENANCE_CONTRACT", resourceId: created.id,
              payload: { previousContractId: contract.id, previousNumber: contract.number, number: created.number, startDate: created.startDate.toISOString(),
                endDate: created.endDate?.toISOString(), priceCents: created.priceCents, indexationRate: contract.indexationRate, sourceRevision: expectedRevision,
                previousRecurringInvoiceId: contract.recurringInvoice?.id ?? null, recurringInvoiceId } } })
            return created
          },
          { isolationLevel: "Serializable" },
        )
      },
      { label: "le renouvellement du contrat d’entretien" },
    )
    revalidateOperations()
    revalidatePath("/dashboard/service/customer-success")
    return { success: true as const, id: renewed.id, number: renewed.number }
  }, "service.write").catch(error => {
    if (error && typeof error === "object" && "code" in error && error.code === "P2034") throw new AssetLifecycleError(changedMessage)
    throw error
  })
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
