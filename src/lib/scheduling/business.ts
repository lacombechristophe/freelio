import "server-only"

import { addDays, addHours, addMonths, addYears } from "date-fns"
import { z } from "zod"

import { buildYearlyDocumentPrefix, nextDocumentNumber, withDocumentNumberRetry } from "@/lib/document-numbering"
import prisma from "@/lib/prisma"
import { getNextRecurringDate } from "@/lib/workflow-rules"
import { calculateCommercialDocument } from "@/lib/finance/commercial-calculation"

const storedTemplateSchema = z.object({
  object: z.string().min(3),
  projectId: z.string().nullable().optional(),
  dueDays: z.number().int().min(0).max(365),
  lines: z.array(z.object({ label: z.string().min(1), description: z.string().nullable().optional(), quantity: z.number().positive(), unitPriceCents: z.number().int().nonnegative(), tvaRate: z.number().min(0).max(100) })).min(1),
})

async function auditUser(companyId: string, preferred?: string) {
  if (preferred) return preferred
  const membership = await prisma.membership.findFirst({ where: { companyId, status: "ACTIVE", role: { in: ["OWNER", "ADMIN", "ACCOUNTING", "OPERATIONS"] } }, orderBy: { createdAt: "asc" }, select: { userId: true } })
  return membership?.userId ?? null
}

export async function processDueRecurringInvoices(input: { companyId?: string; userId?: string; limit?: number } = {}) {
  const now = new Date()
  const due = await prisma.recurringInvoice.findMany({
    where: { ...(input.companyId ? { companyId: input.companyId } : {}), isActive: true, nextGenDate: { lte: now } },
    include: { company: { select: { isTvaApplicable: true, invoicePrefix: true } } },
    orderBy: { nextGenDate: "asc" },
    take: Math.min(input.limit ?? 100, 250),
  })
  const summary = { examined: due.length, generated: 0, skipped: 0, disabled: 0, failed: 0 }
  for (const recurring of due) {
    const parsed = storedTemplateSchema.safeParse(recurring.template)
    if (!parsed.success) {
      await prisma.recurringInvoice.update({ where: { id: recurring.id }, data: { isActive: false } })
      summary.disabled += 1
      continue
    }
    const scheduledFor = recurring.nextGenDate
    const existing = await prisma.recurringInvoiceOccurrence.findUnique({ where: { recurringId_scheduledFor: { recurringId: recurring.id, scheduledFor } } })
    if (existing) {
      summary.skipped += 1
      continue
    }
    const userId = await auditUser(recurring.companyId, input.userId)
    if (!userId) {
      summary.failed += 1
      continue
    }
    const lines = recurring.company.isTvaApplicable ? parsed.data.lines : parsed.data.lines.map((line) => ({ ...line, tvaRate: 0 }))
    const calculation = calculateCommercialDocument(lines)
    const amounts = {
      totalHtCents: calculation.totalHtCents,
      totalTvaCents: calculation.totalTvaCents,
      totalTtcCents: calculation.totalTtcCents,
    }
    try {
      await withDocumentNumberRetry(async () => prisma.$transaction(async (tx) => {
        if (await tx.recurringInvoiceOccurrence.findUnique({ where: { recurringId_scheduledFor: { recurringId: recurring.id, scheduledFor } } })) return
        const prefix = buildYearlyDocumentPrefix(recurring.company.invoicePrefix, "FACT-")
        const last = await tx.invoice.findFirst({ where: { companyId: recurring.companyId, number: { startsWith: prefix } }, orderBy: { number: "desc" }, select: { number: true } })
        const number = nextDocumentNumber(last?.number, prefix)
        const invoice = await tx.invoice.create({
          data: {
            companyId: recurring.companyId,
            clientId: recurring.clientId,
            projectId: parsed.data.projectId || null,
            number,
            object: parsed.data.object,
            status: "DRAFT",
            type: "STANDARD",
            dueDate: addDays(scheduledFor, parsed.data.dueDays),
            ...amounts,
            lines: { create: lines.map((line, index) => ({ ...line, description: line.description || null, order: index })) },
          },
        })
        await tx.recurringInvoiceOccurrence.create({ data: { recurringId: recurring.id, invoiceId: invoice.id, scheduledFor } })
        const advanced = await tx.recurringInvoice.updateMany({ where: { id: recurring.id, nextGenDate: scheduledFor, isActive: true }, data: { lastGenDate: now, nextGenDate: getNextRecurringDate(scheduledFor, recurring.frequency) } })
        if (advanced.count !== 1) throw new Error("Échéance récurrente déjà traitée")
        await tx.auditLog.create({ data: { userId, action: "GENERATE_RECURRING_INVOICE", resource: "INVOICE", resourceId: invoice.id, payload: { recurringId: recurring.id, scheduledFor: scheduledFor.toISOString(), number } } })
      }), { label: "la facture récurrente" })
      summary.generated += 1
    } catch (error) {
      console.error("Recurring invoice scheduling failed", { recurringId: recurring.id, error: error instanceof Error ? error.message : "unknown" })
      summary.failed += 1
    }
  }
  return summary
}

function nextMaintenanceDate(date: Date, frequency: string) {
  if (frequency === "MONTHLY") return addMonths(date, 1)
  if (frequency === "QUARTERLY") return addMonths(date, 3)
  if (frequency === "BIANNUAL") return addMonths(date, 6)
  return addYears(date, 1)
}

export async function processDueMaintenanceVisits(input: { companyId?: string; userId?: string; limit?: number } = {}) {
  const now = new Date()
  const due = await prisma.maintenanceContract.findMany({
    where: { ...(input.companyId ? { companyId: input.companyId } : {}), status: "ACTIVE", nextVisitAt: { lte: now } },
    orderBy: { nextVisitAt: "asc" },
    take: Math.min(input.limit ?? 100, 250),
  })
  const summary = { examined: due.length, scheduled: 0, expired: 0, skipped: 0, failed: 0 }
  for (const contract of due) {
    const scheduledFor = contract.nextVisitAt
    if (!scheduledFor) continue
    if (contract.endDate && scheduledFor > contract.endDate) {
      await prisma.maintenanceContract.updateMany({ where: { id: contract.id, nextVisitAt: scheduledFor }, data: { status: "EXPIRED", nextVisitAt: null } })
      summary.expired += 1
      continue
    }
    const userId = await auditUser(contract.companyId, input.userId)
    if (!userId) {
      summary.failed += 1
      continue
    }
    try {
      const created = await prisma.$transaction(async (tx) => {
        if (await tx.fieldIntervention.findUnique({ where: { maintenanceContractId_maintenanceScheduledFor: { maintenanceContractId: contract.id, maintenanceScheduledFor: scheduledFor } } })) return false
        const intervention = await tx.fieldIntervention.create({
          data: {
            companyId: contract.companyId,
            maintenanceContractId: contract.id,
            maintenanceScheduledFor: scheduledFor,
            siteId: contract.siteId,
            title: `Entretien · ${contract.label}`,
            type: "MAINTENANCE",
            status: "PLANNED",
            scheduledStart: scheduledFor,
            scheduledEnd: addHours(scheduledFor, 1),
          },
        })
        const nextVisitAt = nextMaintenanceDate(scheduledFor, contract.frequency)
        await tx.maintenanceContract.updateMany({
          where: { id: contract.id, nextVisitAt: scheduledFor, status: "ACTIVE" },
          data: contract.endDate && nextVisitAt > contract.endDate ? { nextVisitAt: null, status: "EXPIRED" } : { nextVisitAt },
        })
        await tx.auditLog.create({ data: { userId, action: "SCHEDULE_MAINTENANCE_VISIT", resource: "FIELD_INTERVENTION", resourceId: intervention.id, payload: { maintenanceContractId: contract.id, scheduledFor: scheduledFor.toISOString() } } })
        return true
      })
      if (created) summary.scheduled += 1
      else summary.skipped += 1
    } catch (error) {
      console.error("Maintenance visit scheduling failed", { contractId: contract.id, error: error instanceof Error ? error.message : "unknown" })
      summary.failed += 1
    }
  }
  return summary
}

export async function processScheduledBusinessJobs() {
  const [recurringInvoices, maintenanceVisits] = await Promise.all([processDueRecurringInvoices(), processDueMaintenanceVisits()])
  return { recurringInvoices, maintenanceVisits }
}
