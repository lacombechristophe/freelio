export type ServiceAnalyticsTicket = {
  id: string
  status: string
  priority: string
  requestedAt: Date | string
  firstRespondedAt?: Date | string | null
  closedAt?: Date | string | null
  firstResponseTargetAt: Date | string
  resolutionTargetAt: Date | string
  firstResponseMinutes?: number | null
  resolutionMinutes?: number | null
  assigneeId?: string | null
  assigneeName?: string | null
}

export type ServiceAnalyticsDiagnostic = {
  ticketId: string
  guideName: string
  completedAt: Date | string
}

export type ServiceAnalyticsSatisfaction = {
  score: number
  scaleMin: number
  scaleMax: number
}

export type ServiceAnalyticsHealth = {
  score: number
}

const activeStatuses = new Set(["OPEN", "QUALIFIED", "PLANNED", "WAITING"])
const dayMs = 86_400_000

function time(value: Date | string | null | undefined) {
  if (!value) return null
  const result = new Date(value).getTime()
  return Number.isNaN(result) ? null : result
}

function percent(numerator: number, denominator: number) {
  return denominator > 0 ? Math.round((numerator / denominator) * 100) : null
}

function average(values: number[]) {
  return values.length ? Math.round(values.reduce((total, value) => total + value, 0) / values.length) : null
}

function ticketSummary(tickets: ServiceAnalyticsTicket[], startAt: number, endAt: number, now: number) {
  const created = tickets.filter((ticket) => {
    const requestedAt = time(ticket.requestedAt)
    return requestedAt !== null && requestedAt >= startAt && requestedAt <= endAt
  })
  const closed = tickets.filter((ticket) => {
    const closedAt = time(ticket.closedAt)
    return closedAt !== null && closedAt >= startAt && closedAt <= endAt
  })
  const backlog = tickets.filter((ticket) => activeStatuses.has(ticket.status))
  const firstResponseEligible = created.filter((ticket) => ticket.firstRespondedAt || (time(ticket.firstResponseTargetAt) ?? Number.MAX_SAFE_INTEGER) <= now)
  const firstResponseMet = firstResponseEligible.filter((ticket) => {
    const respondedAt = time(ticket.firstRespondedAt)
    const targetAt = time(ticket.firstResponseTargetAt)
    return respondedAt !== null && targetAt !== null && respondedAt <= targetAt
  })
  const resolutionEligible = tickets.filter((ticket) => {
    const closedAt = time(ticket.closedAt)
    const closedInPeriod = closedAt !== null && closedAt >= startAt && closedAt <= endAt
    const overdueActive = activeStatuses.has(ticket.status) && (time(ticket.resolutionTargetAt) ?? Number.MAX_SAFE_INTEGER) <= now
    return closedInPeriod || overdueActive
  })
  const resolutionMet = resolutionEligible.filter((ticket) => {
    const closedAt = time(ticket.closedAt)
    const targetAt = time(ticket.resolutionTargetAt)
    return closedAt !== null && targetAt !== null && closedAt <= targetAt
  })
  return {
    created: created.length,
    closed: closed.length,
    backlog: backlog.length,
    firstResponseMet: firstResponseMet.length,
    firstResponseEligible: firstResponseEligible.length,
    firstResponsePercent: percent(firstResponseMet.length, firstResponseEligible.length),
    resolutionMet: resolutionMet.length,
    resolutionEligible: resolutionEligible.length,
    resolutionPercent: percent(resolutionMet.length, resolutionEligible.length),
    averageFirstResponseMinutes: average(created.flatMap((ticket) => ticket.firstResponseMinutes == null ? [] : [ticket.firstResponseMinutes])),
    averageResolutionMinutes: average(closed.flatMap((ticket) => ticket.resolutionMinutes == null ? [] : [ticket.resolutionMinutes])),
  }
}

export function buildServiceAnalytics(input: {
  tickets: ServiceAnalyticsTicket[]
  diagnostics: ServiceAnalyticsDiagnostic[]
  satisfaction: ServiceAnalyticsSatisfaction[]
  health: ServiceAnalyticsHealth[]
  startAt: Date | string
  endAt: Date | string
  now?: Date | string
}) {
  const startAt = time(input.startAt) ?? 0
  const endAt = time(input.endAt) ?? Date.now()
  const now = time(input.now) ?? Date.now()
  const summary = ticketSummary(input.tickets, startAt, endAt, now)
  const createdTicketIds = new Set(input.tickets.filter((ticket) => {
    const requestedAt = time(ticket.requestedAt)
    return requestedAt !== null && requestedAt >= startAt && requestedAt <= endAt
  }).map((ticket) => ticket.id))
  const diagnosedTicketIds = new Set(input.diagnostics.filter((item) => createdTicketIds.has(item.ticketId)).map((item) => item.ticketId))

  const groupRows = <T extends string>(entries: Array<[T, ServiceAnalyticsTicket[]]>) => entries.map(([key, tickets]) => ({ key, ...ticketSummary(tickets, startAt, endAt, now) }))
  const byPriority = groupRows([...new Map(input.tickets.map((ticket) => ticket.priority).map((priority) => [priority, input.tickets.filter((ticket) => ticket.priority === priority)] as const)).entries()]
    .sort(([left], [right]) => ["URGENT", "HIGH", "NORMAL", "LOW"].indexOf(left) - ["URGENT", "HIGH", "NORMAL", "LOW"].indexOf(right)))
  const assigneeKeys = new Map<string, { name: string; tickets: ServiceAnalyticsTicket[] }>()
  for (const ticket of input.tickets) {
    const key = ticket.assigneeId || "UNASSIGNED"
    const group = assigneeKeys.get(key) || { name: ticket.assigneeName || "Non affecté", tickets: [] }
    group.tickets.push(ticket)
    assigneeKeys.set(key, group)
  }
  const byAssignee = [...assigneeKeys.entries()].map(([key, group]) => ({ key, name: group.name, ...ticketSummary(group.tickets, startAt, endAt, now) })).sort((left, right) => right.backlog - left.backlog || right.created - left.created || left.name.localeCompare(right.name, "fr"))

  const statusCounts = [...new Set(input.tickets.map((ticket) => ticket.status))].map((status) => ({ status, count: input.tickets.filter((ticket) => ticket.status === status).length })).sort((left, right) => right.count - left.count)
  const diagnosticCounts = new Map<string, number>()
  for (const diagnostic of input.diagnostics) diagnosticCounts.set(diagnostic.guideName, (diagnosticCounts.get(diagnostic.guideName) || 0) + 1)
  const topDiagnostics = [...diagnosticCounts.entries()].map(([name, count]) => ({ name, count })).sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, "fr")).slice(0, 8)

  const periodDays = Math.max(1, Math.ceil((endAt - startAt) / dayMs))
  const bucketCount = Math.max(1, Math.ceil(periodDays / 7))
  const trend = Array.from({ length: bucketCount }, (_, index) => {
    const bucketStart = startAt + index * 7 * dayMs
    const bucketEnd = Math.min(endAt, bucketStart + 7 * dayMs - 1)
    return {
      startAt: new Date(bucketStart),
      endAt: new Date(bucketEnd),
      created: input.tickets.filter((ticket) => {
        const requestedAt = time(ticket.requestedAt)
        return requestedAt !== null && requestedAt >= bucketStart && requestedAt <= bucketEnd
      }).length,
      closed: input.tickets.filter((ticket) => {
        const closedAt = time(ticket.closedAt)
        return closedAt !== null && closedAt >= bucketStart && closedAt <= bucketEnd
      }).length,
    }
  })

  const satisfactionPercentages = input.satisfaction.flatMap((item) => item.scaleMax > item.scaleMin ? [((item.score - item.scaleMin) / (item.scaleMax - item.scaleMin)) * 100] : [])
  const healthDistribution = [
    { status: "HEALTHY", count: input.health.filter((item) => item.score >= 75).length },
    { status: "WATCH", count: input.health.filter((item) => item.score >= 50 && item.score < 75).length },
    { status: "RISK", count: input.health.filter((item) => item.score < 50).length },
  ]

  return {
    summary: {
      ...summary,
      diagnosticCoveragePercent: percent(diagnosedTicketIds.size, createdTicketIds.size),
      diagnosedTickets: diagnosedTicketIds.size,
      satisfactionPercent: satisfactionPercentages.length ? Math.round(satisfactionPercentages.reduce((total, value) => total + value, 0) / satisfactionPercentages.length) : null,
      satisfactionResponses: satisfactionPercentages.length,
      averageHealthScore: input.health.length ? Math.round(input.health.reduce((total, item) => total + item.score, 0) / input.health.length) : null,
    },
    byPriority,
    byAssignee,
    statusCounts,
    topDiagnostics,
    trend,
    healthDistribution,
  }
}
