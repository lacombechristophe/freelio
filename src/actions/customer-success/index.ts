"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { logAction } from "@/lib/audit"
import { dispatchAutomationEvent, enqueueAutomationEvent } from "@/lib/automations/engine"
import { AuthorizationError, withAuth } from "@/lib/auth-wrapper"
import { DIRECTORY_PAGE_SIZE } from "@/lib/directory-query"
import type { Prisma } from "@prisma/client"
import {
  customerHealthMetricDefinitions,
  defaultCustomerHealthRules,
  evaluateCustomerHealth,
  type CustomerHealthMetric,
} from "@/lib/operations/customer-health"
import prisma from "@/lib/prisma"
import { loadCustomerHealthMetrics } from "@/lib/operations/customer-health-metrics"
import { withProcessorLease } from "@/lib/processing/lease"

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

const portfolioQuerySchema = z.object({
  search: z.string().trim().max(200).default(""),
  status: z.enum(["ALL", "HEALTHY", "WATCH", "RISK"]).default("ALL"),
  page: z.number().int().min(1).max(100_000).default(1),
})
const healthSummarySelect = {
  id: true, name: true, createdAt: true, renewalAt: true, relationScore: true, healthLastComputedAt: true,
  healthSnapshots: { select: { score: true }, orderBy: [{ computedAt: "desc" }, { id: "desc" }], take: 2 },
} as const satisfies Prisma.ClientSelect

function summarizeHealth(client: Prisma.ClientGetPayload<{ select: typeof healthSummarySelect }>,
  completeMetrics: Awaited<ReturnType<typeof loadCustomerHealthMetrics>>, rules: Parameters<typeof evaluateCustomerHealth>[1]) {
  const { metrics, renewalAt } = completeMetrics.get(client.id)!
  const health = evaluateCustomerHealth(metrics, rules)
  return {
    id: client.id, name: client.name, score: health.score, status: health.status, factors: health.factors, metrics,
    storedScore: client.relationScore, lastComputedAt: client.healthLastComputedAt,
    previousScore: client.healthSnapshots[1]?.score ?? client.healthSnapshots[0]?.score ?? null, renewalAt,
  }
}

async function loadCustomerSuccessWorkspace(companyId: string, query: z.infer<typeof portfolioQuerySchema>) {
  const now = new Date()
  return prisma.$transaction(async (transaction) => {
    const [rules, members] = await Promise.all([
      transaction.customerHealthRule.findMany({ where: { companyId, status: "ACTIVE" }, orderBy: [{ priority: "desc" }, { name: "asc" }] }),
      transaction.membership.findMany({ where: { companyId, status: "ACTIVE" }, include: { user: { select: { name: true, email: true } } }, orderBy: { createdAt: "asc" } }),
    ])
    const summaries: ReturnType<typeof summarizeHealth>[] = []
    let cursor: string | undefined
    while (true) {
      const clients = await transaction.client.findMany({ where: { companyId, ...(cursor ? { id: { gt: cursor } } : {}) },
        select: healthSummarySelect, orderBy: { id: "asc" }, take: 200 })
      if (!clients.length) break
      const completeMetrics = await loadCustomerHealthMetrics(transaction, companyId, clients, now)
      summaries.push(...clients.map((client) => summarizeHealth(client, completeMetrics, rules)))
      cursor = clients.at(-1)!.id
    }
    const search = query.search.toLocaleLowerCase("fr-FR")
    const filtered = summaries.filter((client) => (!search || client.name.toLocaleLowerCase("fr-FR").includes(search)) && (query.status === "ALL" || client.status === query.status))
      .sort((left, right) => left.score - right.score || (left.renewalAt?.getTime() ?? Number.MAX_SAFE_INTEGER) - (right.renewalAt?.getTime() ?? Number.MAX_SAFE_INTEGER) || left.name.localeCompare(right.name, "fr") || left.id.localeCompare(right.id))
    const page = Math.min(query.page, Math.max(1, Math.ceil(filtered.length / DIRECTORY_PAGE_SIZE)))
    const visible = filtered.slice((page - 1) * DIRECTORY_PAGE_SIZE, page * DIRECTORY_PAGE_SIZE)
    const profiles = await transaction.client.findMany({ where: { companyId, id: { in: visible.map((client) => client.id) } }, select: {
      id: true, renewalAmountCents: true, nextActionAt: true, nextActionLabel: true, successPlan: true, expansionNotes: true,
      successOwnerMembership: { select: { id: true, user: { select: { name: true, email: true } } } },
    } })
    const profileById = new Map(profiles.map((profile) => [profile.id, profile]))
    return {
      portfolio: visible.map((client) => {
        const { successOwnerMembership, ...profile } = profileById.get(client.id)!
        return { ...client, ...profile, owner: successOwnerMembership ? { id: successOwnerMembership.id, name: successOwnerMembership.user.name || successOwnerMembership.user.email || "Membre" } : null }
      }),
      page, total: filtered.length, totalClients: summaries.length,
      rules,
      members: members.map((member) => ({ id: member.id, name: member.user.name || member.user.email || "Membre" })),
      metrics: {
        healthy: summaries.filter((client) => client.status === "HEALTHY").length,
        watch: summaries.filter((client) => client.status === "WATCH").length,
        risk: summaries.filter((client) => client.status === "RISK").length,
        renewals90Days: summaries.filter((client) => client.metrics.DAYS_TO_RENEWAL !== null && client.metrics.DAYS_TO_RENEWAL >= 0 && client.metrics.DAYS_TO_RENEWAL <= 90).length,
      },
    }
  }, { isolationLevel: "Serializable", timeout: 120_000 })
}

export async function getCustomerSuccessWorkspace(input: unknown = {}) {
  return withAuth(({ companyId }) => loadCustomerSuccessWorkspace(companyId, portfolioQuerySchema.parse(input)), "service.read")
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
  return withAuth(async ({ companyId, userId, agencyIds }) => {
    if (agencyIds !== null) throw new AuthorizationError("Le recalcul global de santé nécessite un administrateur de la société")
    const computedAt = new Date()
    const lease = await withProcessorLease(`customer-health:${companyId}`, (control) => prisma.$transaction(async (transaction) => {
      const eventIds: string[] = []
      const rules = await transaction.customerHealthRule.findMany({ where: { companyId, status: "ACTIVE" } })
      let cursor: string | undefined
      let count = 0
      while (true) {
        await control.assertOwned(transaction)
        const clients = await transaction.client.findMany({ where: { companyId, ...(cursor ? { id: { gt: cursor } } : {}) },
          select: { id: true, name: true, createdAt: true, renewalAt: true, relationScore: true, healthLastComputedAt: true,
            healthSnapshots: { select: { score: true, computedAt: true }, orderBy: [{ computedAt: "desc" }, { id: "desc" }], take: 1 },
          }, orderBy: { id: "asc" }, take: 200 })
        if (!clients.length) break
        const metrics = await loadCustomerHealthMetrics(transaction, companyId, clients, computedAt)
        for (const client of clients) {
          const health = evaluateCustomerHealth(metrics.get(client.id)!.metrics, rules)
          await transaction.client.update({ where: { id: client.id }, data: { relationScore: health.score, healthLastComputedAt: computedAt } })
          if (!client.healthSnapshots[0] || client.healthSnapshots[0].score !== health.score || computedAt.getTime() - client.healthSnapshots[0].computedAt.getTime() >= 86_400_000) {
            await transaction.customerHealthSnapshot.create({ data: { companyId, clientId: client.id, score: health.score, status: health.status, factors: health.factors, computedAt } })
          }
          if (client.relationScore !== health.score) eventIds.push(await enqueueAutomationEvent(transaction, {
            companyId, event: "CUSTOMER_HEALTH_CHANGED", subjectModel: "Client", subjectId: client.id,
            eventKey: `${client.id}:health:${computedAt.toISOString()}:${client.relationScore}:${health.score}`,
            clientId: client.id,
            context: { clientName: client.name, healthStatus: health.status, healthScore: health.score, previousHealthScore: client.relationScore },
          }))
        }
        count += clients.length
        cursor = clients.at(-1)!.id
      }
      await control.assertOwned(transaction)
      return { eventIds, count }
    }, { isolationLevel: "Serializable", timeout: 120_000 }))
    if (!lease.acquired) throw new Error("Un recalcul de santé est déjà en cours")
    let workflows = 0
    // Keep the interactive request bounded and avoid competing SQLite writers.
    // Remaining events are already durable and drained by processAutomationEvents.
    for (const id of lease.value.eventIds.slice(0, 10)) {
      try {
        workflows += (await dispatchAutomationEvent(id)).completed
      } catch (error) {
        console.error("Customer health automation failed", error)
      }
    }
    await logAction({ userId, action: "RECOMPUTE_CUSTOMER_HEALTH", resource: "CUSTOMER_HEALTH_SNAPSHOT", payload: { clients: lease.value.count, computedAt } })
    revalidatePath("/dashboard/service/customer-success")
    revalidatePath("/dashboard/automatisations")
    revalidatePath("/dashboard/organisation")
    return { success: true as const, clients: lease.value.count, workflows }
  }, "service.write")
}
