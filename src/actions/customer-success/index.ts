"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { logAction } from "@/lib/audit"
import { withAuth } from "@/lib/auth-wrapper"
import {
  customerHealthMetricDefinitions,
  defaultCustomerHealthRules,
  evaluateCustomerHealth,
  type CustomerHealthMetric,
  type CustomerHealthMetrics,
} from "@/lib/operations/customer-health"
import prisma from "@/lib/prisma"

const cuid = z.string().cuid()
const optionalText = (max: number) => z.preprocess((value) => typeof value === "string" && value.trim() ? value.trim() : undefined, z.string().max(max).optional())
const optionalDate = z.preprocess((value) => typeof value === "string" && value.trim() ? new Date(value) : null, z.date().nullable())
const metric = z.enum(Object.keys(customerHealthMetricDefinitions) as [CustomerHealthMetric, ...CustomerHealthMetric[]])
const ruleSchema = z.object({
  name: z.string().trim().min(2).max(120),
  metric,
  operator: z.enum(["GTE", "GT", "LTE", "LT", "EQ"]),
  threshold: z.coerce.number().finite().min(-100_000_000).max(100_000_000),
  impact: z.coerce.number().int().min(-100).max(100).refine((value) => value !== 0, "L’impact ne peut pas être nul"),
  priority: z.coerce.number().int().min(0).max(100).default(0),
})
const profileSchema = z.object({
  clientId: cuid,
  successOwnerMembershipId: z.union([cuid, z.literal("")]).optional().transform((value) => value || null),
  renewalAt: optionalDate,
  renewalAmountEuros: z.coerce.number().finite().min(0).max(100_000_000).default(0),
  nextActionAt: optionalDate,
  nextActionLabel: optionalText(500),
  successPlan: optionalText(10_000),
  expansionNotes: optionalText(5_000),
})

const activeTicketStatuses = new Set(["OPEN", "QUALIFIED", "PLANNED", "WAITING"])

function daysBetween(later: Date, earlier: Date) {
  return Math.floor((later.getTime() - earlier.getTime()) / 86_400_000)
}

async function loadCustomerSuccessWorkspace(companyId: string) {
  const now = new Date()
  const since90Days = new Date(now.getTime() - 90 * 86_400_000)
  const [clients, rules, members] = await Promise.all([
    prisma.client.findMany({
      where: { companyId },
      include: {
        successOwnerMembership: { include: { user: { select: { name: true, email: true } } } },
        activities: { select: { happenedAt: true }, orderBy: { happenedAt: "desc" }, take: 1 },
        serviceTickets: { where: { status: { not: "MERGED" }, mergedIntoTicketId: null }, select: { status: true, dueAt: true, requestedAt: true }, orderBy: { requestedAt: "desc" }, take: 500 },
        satisfactionRequests: { where: { respondedAt: { not: null }, score: { not: null } }, select: { score: true, respondedAt: true, survey: { select: { scaleMin: true, scaleMax: true } } }, orderBy: { respondedAt: "desc" }, take: 100 },
        invoices: { select: { status: true, date: true, dueDate: true, totalTtcCents: true, paidAmountCents: true, type: true }, orderBy: { date: "desc" }, take: 500 },
        maintenanceContracts: { where: { status: "ACTIVE" }, select: { endDate: true }, orderBy: { endDate: "asc" }, take: 100 },
        healthSnapshots: { orderBy: { computedAt: "desc" }, take: 2 },
      },
      orderBy: { name: "asc" },
      take: 300,
    }),
    prisma.customerHealthRule.findMany({ where: { companyId, status: "ACTIVE" }, orderBy: [{ priority: "desc" }, { name: "asc" }], take: 100 }),
    prisma.membership.findMany({ where: { companyId, status: "ACTIVE" }, include: { user: { select: { name: true, email: true } } }, orderBy: { createdAt: "asc" } }),
  ])

  const ruleInputs = rules.map((rule) => ({ id: rule.id, name: rule.name, metric: rule.metric, operator: rule.operator, threshold: rule.threshold, impact: rule.impact, priority: rule.priority }))
  const portfolio = clients.map((client) => {
    const openTickets = client.serviceTickets.filter((ticket) => activeTicketStatuses.has(ticket.status))
    const overdueTickets = openTickets.filter((ticket) => ticket.dueAt && ticket.dueAt < now)
    const tickets90Days = client.serviceTickets.filter((ticket) => ticket.requestedAt >= since90Days)
    const satisfactionValues = client.satisfactionRequests.flatMap((request) => {
      if (request.score === null || request.survey.scaleMax <= request.survey.scaleMin) return []
      return [((request.score - request.survey.scaleMin) / (request.survey.scaleMax - request.survey.scaleMin)) * 100]
    })
    const overdueBalanceCents = client.invoices.filter((invoice) => invoice.type !== "CREDIT_NOTE" && !["PAID", "CANCELED"].includes(invoice.status) && invoice.dueDate < now).reduce((total, invoice) => total + Math.max(0, invoice.totalTtcCents - invoice.paidAmountCents), 0)
    const activityDates = [client.createdAt, client.activities[0]?.happenedAt, client.serviceTickets[0]?.requestedAt, client.invoices[0]?.date].filter((value): value is Date => Boolean(value))
    const lastActivityAt = activityDates.sort((left, right) => right.getTime() - left.getTime())[0]
    const contractRenewalAt = client.maintenanceContracts.map((contract) => contract.endDate).filter((value): value is Date => Boolean(value)).sort((left, right) => left.getTime() - right.getTime())[0]
    const renewalAt = client.renewalAt || contractRenewalAt || null
    const metrics: CustomerHealthMetrics = {
      OPEN_TICKETS: openTickets.length,
      OVERDUE_TICKETS: overdueTickets.length,
      TICKETS_90D: tickets90Days.length,
      SATISFACTION_PERCENT: satisfactionValues.length ? Math.round(satisfactionValues.reduce((total, value) => total + value, 0) / satisfactionValues.length) : null,
      DAYS_SINCE_ACTIVITY: lastActivityAt ? Math.max(0, daysBetween(now, lastActivityAt)) : null,
      OVERDUE_BALANCE_CENTS: overdueBalanceCents,
      DAYS_TO_RENEWAL: renewalAt ? daysBetween(renewalAt, now) : null,
      ACTIVE_CONTRACTS: client.maintenanceContracts.length,
    }
    const health = evaluateCustomerHealth(metrics, ruleInputs)
    return {
      id: client.id,
      name: client.name,
      score: health.score,
      status: health.status,
      factors: health.factors,
      metrics,
      storedScore: client.relationScore,
      lastComputedAt: client.healthLastComputedAt,
      previousScore: client.healthSnapshots[1]?.score ?? client.healthSnapshots[0]?.score ?? null,
      owner: client.successOwnerMembership ? { id: client.successOwnerMembership.id, name: client.successOwnerMembership.user.name || client.successOwnerMembership.user.email || "Membre" } : null,
      renewalAt,
      renewalAmountCents: client.renewalAmountCents,
      nextActionAt: client.nextActionAt,
      nextActionLabel: client.nextActionLabel,
      successPlan: client.successPlan,
      expansionNotes: client.expansionNotes,
    }
  }).sort((left, right) => left.score - right.score || (left.renewalAt?.getTime() || Number.MAX_SAFE_INTEGER) - (right.renewalAt?.getTime() || Number.MAX_SAFE_INTEGER) || left.name.localeCompare(right.name, "fr"))

  return {
    portfolio,
    rules,
    members: members.map((member) => ({ id: member.id, name: member.user.name || member.user.email || "Membre" })),
    metrics: {
      healthy: portfolio.filter((client) => client.status === "HEALTHY").length,
      watch: portfolio.filter((client) => client.status === "WATCH").length,
      risk: portfolio.filter((client) => client.status === "RISK").length,
      renewals90Days: portfolio.filter((client) => client.metrics.DAYS_TO_RENEWAL !== null && client.metrics.DAYS_TO_RENEWAL >= 0 && client.metrics.DAYS_TO_RENEWAL <= 90).length,
    },
  }
}

export async function getCustomerSuccessWorkspace() {
  return withAuth(({ companyId }) => loadCustomerSuccessWorkspace(companyId), "service.read")
}

export async function installDefaultCustomerHealthRules() {
  return withAuth(async ({ companyId, userId }) => {
    await prisma.$transaction(defaultCustomerHealthRules.map((rule) => prisma.customerHealthRule.upsert({
      where: { companyId_name: { companyId, name: rule.name } },
      update: { ...rule, status: "ACTIVE" },
      create: { companyId, ...rule },
    })))
    await logAction({ userId, action: "INSTALL_CUSTOMER_HEALTH_RULES", resource: "CUSTOMER_HEALTH_RULE", payload: { count: defaultCustomerHealthRules.length } })
    revalidatePath("/dashboard/service/customer-success")
    return { success: true as const }
  }, "service.write")
}

export async function createCustomerHealthRule(input: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    const data = ruleSchema.parse(input)
    if (await prisma.customerHealthRule.findFirst({ where: { companyId, name: data.name }, select: { id: true } })) throw new Error("Une règle porte déjà ce nom")
    const rule = await prisma.customerHealthRule.create({ data: { companyId, ...data } })
    await logAction({ userId, action: "CREATE_CUSTOMER_HEALTH_RULE", resource: "CUSTOMER_HEALTH_RULE", resourceId: rule.id, payload: { name: rule.name } })
    revalidatePath("/dashboard/service/customer-success")
    return { success: true as const, id: rule.id }
  }, "service.write")
}

export async function archiveCustomerHealthRule(ruleId: string) {
  return withAuth(async ({ companyId, userId }) => {
    const id = cuid.parse(ruleId)
    const rule = await prisma.customerHealthRule.findFirst({ where: { id, companyId, status: "ACTIVE" }, select: { id: true, name: true } })
    if (!rule) throw new Error("Règle de santé introuvable")
    await prisma.customerHealthRule.update({ where: { id: rule.id }, data: { status: "ARCHIVED" } })
    await logAction({ userId, action: "ARCHIVE_CUSTOMER_HEALTH_RULE", resource: "CUSTOMER_HEALTH_RULE", resourceId: rule.id, payload: { name: rule.name } })
    revalidatePath("/dashboard/service/customer-success")
    return { success: true as const }
  }, "service.write")
}

export async function updateClientSuccessProfile(input: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    const data = profileSchema.parse(input)
    const client = await prisma.client.findFirst({ where: { id: data.clientId, companyId }, select: { id: true, name: true } })
    if (!client) throw new Error("Client introuvable")
    if (data.successOwnerMembershipId && !await prisma.membership.findFirst({ where: { id: data.successOwnerMembershipId, companyId, status: "ACTIVE" }, select: { id: true } })) throw new Error("Responsable introuvable")
    await prisma.client.update({ where: { id: client.id }, data: {
      successOwnerMembershipId: data.successOwnerMembershipId,
      renewalAt: data.renewalAt,
      renewalAmountCents: Math.round(data.renewalAmountEuros * 100),
      nextActionAt: data.nextActionAt,
      nextActionLabel: data.nextActionLabel || null,
      successPlan: data.successPlan || null,
      expansionNotes: data.expansionNotes || null,
    } })
    await logAction({ userId, action: "UPDATE_CLIENT_SUCCESS_PROFILE", resource: "CLIENT", resourceId: client.id, payload: { name: client.name, renewalAt: data.renewalAt, nextActionAt: data.nextActionAt } })
    revalidatePath("/dashboard/service/customer-success")
    revalidatePath(`/dashboard/clients/${client.id}`)
    return { success: true as const }
  }, "service.write")
}

export async function recomputeCustomerHealth() {
  return withAuth(async ({ companyId, userId }) => {
    const workspace = await loadCustomerSuccessWorkspace(companyId)
    const computedAt = new Date()
    await prisma.$transaction(async (transaction) => {
      for (const client of workspace.portfolio) {
        await transaction.client.update({ where: { id: client.id }, data: { relationScore: client.score, healthLastComputedAt: computedAt } })
        if (client.previousScore !== client.score || !client.lastComputedAt || computedAt.getTime() - client.lastComputedAt.getTime() >= 86_400_000) {
          await transaction.customerHealthSnapshot.create({ data: { companyId, clientId: client.id, score: client.score, status: client.status, factors: client.factors } })
        }
      }
    })
    await logAction({ userId, action: "RECOMPUTE_CUSTOMER_HEALTH", resource: "CUSTOMER_HEALTH_SNAPSHOT", payload: { clients: workspace.portfolio.length, computedAt } })
    revalidatePath("/dashboard/service/customer-success")
    return { success: true as const, clients: workspace.portfolio.length }
  }, "service.write")
}
