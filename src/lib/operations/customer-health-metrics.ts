import type { CustomerHealthMetrics } from "@/lib/operations/customer-health"
import type { TransactionClient } from "@/lib/prisma"

type HealthDatabase = Pick<TransactionClient, "serviceTicket" | "satisfactionRequest" | "satisfactionSurvey" | "maintenanceContract" | "invoice" | "clientActivity">
type HealthClient = { id: string; createdAt: Date; renewalAt: Date | null }
const activeTicketStatuses = ["OPEN", "QUALIFIED", "PLANNED", "WAITING"]

/** Aggregate complete histories for a bounded client batch; never sample rows. */
export async function loadCustomerHealthMetrics(database: HealthDatabase, companyId: string, clients: HealthClient[], now: Date) {
  const clientId = { in: clients.map((client) => client.id) }
  const ticketWhere = { companyId, clientId, status: { not: "MERGED" }, mergedIntoTicketId: null }
  const [tickets, overdueTickets, recentTickets, activities, invoices, contracts, responses, surveys] = await Promise.all([
    database.serviceTicket.groupBy({ by: ["clientId", "status"], where: ticketWhere, _count: { _all: true }, _max: { requestedAt: true } }),
    database.serviceTicket.groupBy({ by: ["clientId"], where: { ...ticketWhere, status: { in: activeTicketStatuses }, dueAt: { lt: now } }, _count: { _all: true } }),
    database.serviceTicket.groupBy({ by: ["clientId"], where: { ...ticketWhere, requestedAt: { gte: new Date(now.getTime() - 90 * 86_400_000) } }, _count: { _all: true } }),
    database.clientActivity.groupBy({ by: ["clientId"], where: { clientId, client: { companyId } }, _max: { happenedAt: true } }),
    database.invoice.groupBy({ by: ["clientId"], where: { companyId, clientId }, _max: { date: true } }),
    database.maintenanceContract.groupBy({ by: ["clientId"], where: { companyId, clientId, status: "ACTIVE" }, _count: { _all: true }, _min: { endDate: true } }),
    database.satisfactionRequest.groupBy({ by: ["clientId", "surveyId"], where: { companyId, clientId, respondedAt: { not: null }, score: { not: null } }, _sum: { score: true }, _count: { score: true } }),
    database.satisfactionSurvey.findMany({ where: { companyId }, select: { id: true, scaleMin: true, scaleMax: true } }),
  ])
  const result = new Map(clients.map((client) => [client.id, { renewalAt: client.renewalAt,
    metrics: { OPEN_TICKETS: 0, OVERDUE_TICKETS: 0, TICKETS_90D: 0, SATISFACTION_PERCENT: null, DAYS_SINCE_ACTIVITY: 0,
      OVERDUE_BALANCE_CENTS: 0, DAYS_TO_RENEWAL: null, ACTIVE_CONTRACTS: 0 } as CustomerHealthMetrics,
  }]))
  const lastActivity = new Map(clients.map((client) => [client.id, client.createdAt.getTime()]))
  const markActivity = (id: string, at: Date | null) => { if (at) lastActivity.set(id, Math.max(lastActivity.get(id) ?? 0, at.getTime())) }
  for (const ticket of tickets) {
    if (activeTicketStatuses.includes(ticket.status)) result.get(ticket.clientId)!.metrics.OPEN_TICKETS! += ticket._count._all
    markActivity(ticket.clientId, ticket._max.requestedAt)
  }
  for (const ticket of overdueTickets) result.get(ticket.clientId)!.metrics.OVERDUE_TICKETS = ticket._count._all
  for (const ticket of recentTickets) result.get(ticket.clientId)!.metrics.TICKETS_90D = ticket._count._all
  for (const activity of activities) markActivity(activity.clientId, activity._max.happenedAt)
  for (const invoice of invoices) markActivity(invoice.clientId, invoice._max.date)
  for (const contract of contracts) {
    const health = result.get(contract.clientId)!
    health.metrics.ACTIVE_CONTRACTS = contract._count._all
    health.renewalAt ||= contract._min.endDate
  }
  const scales = new Map(surveys.map((survey) => [survey.id, survey]))
  const satisfaction = new Map<string, { total: number; count: number }>()
  for (const response of responses) {
    const scale = scales.get(response.surveyId)
    if (!scale || scale.scaleMax <= scale.scaleMin) continue
    const summary = satisfaction.get(response.clientId) ?? { total: 0, count: 0 }
    summary.total += ((response._sum.score! - response._count.score * scale.scaleMin) / (scale.scaleMax - scale.scaleMin)) * 100
    summary.count += response._count.score
    satisfaction.set(response.clientId, summary)
  }
  // Clamp each outstanding invoice separately: an overpayment must not offset
  // a different unpaid invoice. Drafts and credit notes are never overdue debt.
  let cursor: string | undefined
  while (true) {
    const debt = await database.invoice.findMany({ where: { companyId, clientId, type: { not: "CREDIT_NOTE" },
      status: { notIn: ["DRAFT", "PAID", "CANCELED"] }, dueDate: { lt: now }, ...(cursor ? { id: { gt: cursor } } : {}),
    }, select: { id: true, clientId: true, totalTtcCents: true, paidAmountCents: true }, orderBy: { id: "asc" }, take: 400 })
    for (const invoice of debt) result.get(invoice.clientId)!.metrics.OVERDUE_BALANCE_CENTS! += Math.max(0, invoice.totalTtcCents - invoice.paidAmountCents)
    if (debt.length < 400) break
    cursor = debt.at(-1)!.id
  }
  for (const client of clients) {
    const health = result.get(client.id)!
    const feedback = satisfaction.get(client.id)
    health.metrics.SATISFACTION_PERCENT = feedback?.count ? Math.round(feedback.total / feedback.count) : null
    health.metrics.DAYS_SINCE_ACTIVITY = Math.max(0, Math.floor((now.getTime() - lastActivity.get(client.id)!) / 86_400_000))
    health.metrics.DAYS_TO_RENEWAL = health.renewalAt ? Math.floor((health.renewalAt.getTime() - now.getTime()) / 86_400_000) : null
  }
  return result
}
