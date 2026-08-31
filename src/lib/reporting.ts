export const REPORT_PERIODS = [30, 90, 365] as const

export type ReportPeriod = (typeof REPORT_PERIODS)[number]

export type ReportingAccess = {
  crm: boolean
  sales: boolean
  finance: boolean
  operations: boolean
  service: boolean
  marketing: boolean
}

type StatusDate = { status: string; createdAt: Date }

export type ReportingInput = {
  access: ReportingAccess
  leads: StatusDate[]
  opportunities: Array<{
    status: string
    valueCents: number
    probability: number
    createdAt: Date
    closedAt: Date | null
  }>
  quotes: Array<{ status: string; date: Date }>
  invoices: Array<{
    status: string
    totalTtcCents: number
    paidAmountCents: number
    date: Date
    dueDate: Date
  }>
  payments: Array<{ amountCents: number; date: Date }>
  expenses: Array<{ amountCents: number; date: Date }>
  projects: Array<{
    status: string
    budgetCents: number
    consumedCents: number
    endDate: Date | null
  }>
  purchaseOrders: Array<{
    status: string
    totalHtCents: number
    expectedAt: Date | null
    confirmedExpectedAt: Date | null
  }>
  interventions: Array<{
    status: string
    scheduledStart: Date
    completedAt: Date | null
    laborMinutes: number
  }>
  tickets: Array<{
    status: string
    priority: string
    requestedAt: Date
    dueAt: Date | null
    closedAt: Date | null
  }>
  deliveries: StatusDate[]
  truncatedSources?: string[]
}

export type ExecutiveReport = ReturnType<typeof buildExecutiveReport>

const DAY_MS = 24 * 60 * 60 * 1_000
const CLOSED_OPPORTUNITY_STATUSES = new Set(["WON", "LOST"])
const ISSUED_INVOICE_STATUSES = new Set(["SENT", "PAID", "OVERDUE"])
const OPEN_INVOICE_STATUSES = new Set(["SENT", "OVERDUE"])
const OPEN_PURCHASE_ORDER_STATUSES = new Set(["DRAFT", "SUBMITTED", "APPROVED", "SENT", "ACKNOWLEDGED", "PARTIALLY_RECEIVED"])
const CLOSED_TICKET_STATUSES = new Set(["CLOSED", "RESOLVED", "MERGED"])
const SENT_EMAIL_STATUSES = new Set(["SENT", "DELIVERED", "OPENED", "CLICKED", "DELAYED", "BOUNCED", "COMPLAINED"])
const DELIVERED_EMAIL_STATUSES = new Set(["DELIVERED", "OPENED", "CLICKED"])
const OPENED_EMAIL_STATUSES = new Set(["OPENED", "CLICKED"])
const FAILED_EMAIL_STATUSES = new Set(["FAILED", "BOUNCED", "COMPLAINED", "SUPPRESSED"])

export function normalizeReportPeriod(value: string | number | null | undefined): ReportPeriod {
  const period = Number(value)
  return REPORT_PERIODS.includes(period as ReportPeriod) ? period as ReportPeriod : 90
}

export function reportWindow(period: ReportPeriod, now = new Date()) {
  const endAt = new Date(now)
  const startAt = new Date(endAt.getTime() - period * DAY_MS)
  const previousStartAt = new Date(startAt.getTime() - period * DAY_MS)
  return { startAt, previousStartAt, endAt }
}

function inRange(date: Date | null, start: Date, end: Date) {
  if (!date) return false
  const time = date.getTime()
  return time >= start.getTime() && time <= end.getTime()
}

function percent(numerator: number, denominator: number) {
  return denominator > 0 ? Math.round((numerator / denominator) * 1_000) / 10 : null
}

function deltaPercent(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : null
  return Math.round(((current - previous) / Math.abs(previous)) * 100)
}

function periodCount<T>(items: T[], date: (item: T) => Date | null, start: Date, end: Date) {
  return items.filter((item) => inRange(date(item), start, end)).length
}

function periodSum<T>(items: T[], date: (item: T) => Date | null, value: (item: T) => number, start: Date, end: Date) {
  return items.reduce((sum, item) => inRange(date(item), start, end) ? sum + value(item) : sum, 0)
}

function formatBucketLabel(start: Date, end: Date) {
  const formatter = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short" })
  return `${formatter.format(start)} – ${formatter.format(end)}`
}

function buildTrend(input: ReportingInput, startAt: Date, endAt: Date) {
  const bucketCount = 6
  const bucketDuration = Math.max(1, (endAt.getTime() - startAt.getTime()) / bucketCount)
  const buckets = Array.from({ length: bucketCount }, (_, index) => {
    const start = new Date(startAt.getTime() + index * bucketDuration)
    const end = new Date(index === bucketCount - 1 ? endAt : startAt.getTime() + (index + 1) * bucketDuration - 1)
    return {
      label: formatBucketLabel(start, end),
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      leads: 0,
      won: 0,
      collectedCents: 0,
      tickets: 0,
    }
  })

  function bucketIndex(date: Date) {
    return Math.min(bucketCount - 1, Math.max(0, Math.floor((date.getTime() - startAt.getTime()) / bucketDuration)))
  }

  for (const lead of input.leads) if (inRange(lead.createdAt, startAt, endAt)) buckets[bucketIndex(lead.createdAt)].leads += 1
  for (const opportunity of input.opportunities) if (opportunity.status === "WON" && inRange(opportunity.closedAt, startAt, endAt)) buckets[bucketIndex(opportunity.closedAt!)].won += 1
  for (const payment of input.payments) if (inRange(payment.date, startAt, endAt)) buckets[bucketIndex(payment.date)].collectedCents += payment.amountCents
  for (const ticket of input.tickets) if (inRange(ticket.requestedAt, startAt, endAt)) buckets[bucketIndex(ticket.requestedAt)].tickets += 1
  return buckets
}

export function buildExecutiveReport(input: ReportingInput, period: ReportPeriod, now = new Date()) {
  const { startAt, previousStartAt, endAt } = reportWindow(period, now)
  const leads = periodCount(input.leads, (item) => item.createdAt, startAt, endAt)
  const previousLeads = periodCount(input.leads, (item) => item.createdAt, previousStartAt, startAt)
  const newLeads = input.leads.filter((item) => item.status === "NEW" && inRange(item.createdAt, startAt, endAt)).length

  const won = input.opportunities.filter((item) => item.status === "WON" && inRange(item.closedAt, startAt, endAt)).length
  const lost = input.opportunities.filter((item) => item.status === "LOST" && inRange(item.closedAt, startAt, endAt)).length
  const previousWon = input.opportunities.filter((item) => item.status === "WON" && inRange(item.closedAt, previousStartAt, startAt)).length
  const openOpportunities = input.opportunities.filter((item) => !CLOSED_OPPORTUNITY_STATUSES.has(item.status))
  const openPipelineCents = openOpportunities.reduce((sum, item) => sum + item.valueCents, 0)
  const weightedPipelineCents = openOpportunities.reduce(
    (sum, item) => sum + Math.round(item.valueCents * Math.min(100, Math.max(0, item.probability)) / 100),
    0,
  )
  const issuedQuotes = input.quotes.filter((item) => item.status !== "DRAFT" && inRange(item.date, startAt, endAt))
  const acceptedQuotes = issuedQuotes.filter((item) => item.status === "ACCEPTED").length

  const issuedInvoices = input.invoices.filter((item) => ISSUED_INVOICE_STATUSES.has(item.status) && inRange(item.date, startAt, endAt))
  const invoicedCents = issuedInvoices.reduce((sum, item) => sum + item.totalTtcCents, 0)
  const collectedCents = periodSum(input.payments, (item) => item.date, (item) => item.amountCents, startAt, endAt)
  const previousCollectedCents = periodSum(input.payments, (item) => item.date, (item) => item.amountCents, previousStartAt, startAt)
  const expenseCents = periodSum(input.expenses, (item) => item.date, (item) => item.amountCents, startAt, endAt)
  const openInvoices = input.invoices.filter((item) => OPEN_INVOICE_STATUSES.has(item.status))
  const outstandingCents = openInvoices.reduce((sum, item) => sum + Math.max(0, item.totalTtcCents - item.paidAmountCents), 0)
  const overdueInvoices = openInvoices.filter((item) => item.dueDate < endAt).length

  const activeProjects = input.projects.filter((item) => item.status === "ACTIVE")
  const activeProjectBudgetCents = activeProjects.reduce((sum, item) => sum + item.budgetCents, 0)
  const activeProjectConsumedCents = activeProjects.reduce((sum, item) => sum + item.consumedCents, 0)
  const overBudgetProjects = activeProjects.filter((item) => item.budgetCents > 0 && item.consumedCents > item.budgetCents).length
  const openPurchaseOrders = input.purchaseOrders.filter((item) => OPEN_PURCHASE_ORDER_STATUSES.has(item.status))
  const latePurchaseOrders = openPurchaseOrders.filter((item) => {
    const expectedAt = item.confirmedExpectedAt ?? item.expectedAt
    return expectedAt !== null && expectedAt < endAt
  }).length
  const plannedInterventions = input.interventions.filter((item) => item.status === "PLANNED" && item.scheduledStart >= endAt).length
  const completedInterventions = input.interventions.filter((item) => item.status === "COMPLETED" && inRange(item.completedAt, startAt, endAt)).length
  const laborMinutes = input.interventions.reduce((sum, item) => inRange(item.completedAt, startAt, endAt) ? sum + item.laborMinutes : sum, 0)

  const createdTickets = periodCount(input.tickets, (item) => item.requestedAt, startAt, endAt)
  const previousCreatedTickets = periodCount(input.tickets, (item) => item.requestedAt, previousStartAt, startAt)
  const closedTickets = periodCount(input.tickets, (item) => item.closedAt, startAt, endAt)
  const activeTickets = input.tickets.filter((item) => !CLOSED_TICKET_STATUSES.has(item.status) && !item.status.startsWith("MERGED"))
  const overdueTickets = activeTickets.filter((item) => item.dueAt && item.dueAt < endAt).length
  const urgentTickets = activeTickets.filter((item) => item.priority === "URGENT").length

  const currentDeliveries = input.deliveries.filter((item) => inRange(item.createdAt, startAt, endAt))
  const sentEmails = currentDeliveries.filter((item) => SENT_EMAIL_STATUSES.has(item.status)).length
  const deliveredEmails = currentDeliveries.filter((item) => DELIVERED_EMAIL_STATUSES.has(item.status)).length
  const openedEmails = currentDeliveries.filter((item) => OPENED_EMAIL_STATUSES.has(item.status)).length
  const clickedEmails = currentDeliveries.filter((item) => item.status === "CLICKED").length
  const failedEmails = currentDeliveries.filter((item) => FAILED_EMAIL_STATUSES.has(item.status)).length

  const insights: Array<{ id: string; tone: "danger" | "warning" | "info" | "success"; label: string; detail: string; href: string }> = []
  if (input.access.finance && overdueInvoices > 0) insights.push({ id: "overdue-invoices", tone: "danger", label: `${overdueInvoices} facture(s) échue(s)`, detail: "Prioriser les relances et le rapprochement des paiements.", href: "/dashboard/factures" })
  if (input.access.operations && overBudgetProjects > 0) insights.push({ id: "over-budget", tone: "danger", label: `${overBudgetProjects} chantier(s) au-dessus du budget`, detail: "Contrôler les achats, le temps et les écarts terrain.", href: "/dashboard/projets" })
  if (input.access.operations && latePurchaseOrders > 0) insights.push({ id: "late-purchases", tone: "warning", label: `${latePurchaseOrders} commande(s) fournisseur en retard`, detail: "Sécuriser les dates nécessaires avant la pose.", href: "/dashboard/operations?tab=stock" })
  if (input.access.service && overdueTickets > 0) insights.push({ id: "overdue-tickets", tone: "warning", label: `${overdueTickets} ticket(s) SAV hors délai`, detail: "Réaffecter ou replanifier les dossiers en dépassement.", href: "/dashboard/service/help-desk" })
  if (input.access.crm && newLeads > 0) insights.push({ id: "new-leads", tone: "info", label: `${newLeads} nouvelle(s) demande(s) à qualifier`, detail: "Transformer rapidement les demandes récentes en prochaines actions.", href: "/dashboard/leads" })
  if (insights.length === 0) insights.push({ id: "healthy", tone: "success", label: "Aucun signal critique détecté", detail: "Les principaux seuils opérationnels sont sous contrôle.", href: "/dashboard" })

  return {
    period: {
      days: period,
      startAt: startAt.toISOString(),
      previousStartAt: previousStartAt.toISOString(),
      endAt: endAt.toISOString(),
    },
    access: input.access,
    acquisition: { leads, previousLeads, newLeads, deltaPercent: deltaPercent(leads, previousLeads) },
    sales: {
      won,
      lost,
      previousWon,
      winRatePercent: percent(won, won + lost),
      quoteAcceptancePercent: percent(acceptedQuotes, issuedQuotes.length),
      issuedQuotes: issuedQuotes.length,
      acceptedQuotes,
      openOpportunities: openOpportunities.length,
      openPipelineCents,
      weightedPipelineCents,
      wonDeltaPercent: deltaPercent(won, previousWon),
    },
    finance: {
      invoicedCents,
      collectedCents,
      previousCollectedCents,
      collectedDeltaPercent: deltaPercent(collectedCents, previousCollectedCents),
      expenseCents,
      operatingCashCents: collectedCents - expenseCents,
      outstandingCents,
      overdueInvoices,
    },
    operations: {
      activeProjects: activeProjects.length,
      activeProjectBudgetCents,
      activeProjectConsumedCents,
      budgetUsagePercent: percent(activeProjectConsumedCents, activeProjectBudgetCents),
      overBudgetProjects,
      openPurchaseOrders: openPurchaseOrders.length,
      latePurchaseOrders,
      plannedInterventions,
      completedInterventions,
      laborMinutes,
    },
    service: {
      createdTickets,
      previousCreatedTickets,
      createdDeltaPercent: deltaPercent(createdTickets, previousCreatedTickets),
      closedTickets,
      backlog: activeTickets.length,
      overdueTickets,
      urgentTickets,
      closureRatePercent: percent(closedTickets, createdTickets),
    },
    marketing: {
      sentEmails,
      deliveredEmails,
      openedEmails,
      clickedEmails,
      failedEmails,
      deliveryRatePercent: percent(deliveredEmails, sentEmails),
      openRatePercent: percent(openedEmails, deliveredEmails),
      clickRatePercent: percent(clickedEmails, deliveredEmails),
      failureRatePercent: percent(failedEmails, currentDeliveries.length),
    },
    trend: buildTrend(input, startAt, endAt),
    insights,
    truncatedSources: input.truncatedSources ?? [],
  }
}

export function executiveReportRows(report: ExecutiveReport) {
  const rows: Array<{ Domaine: string; Indicateur: string; Valeur: string | number; Unite: string }> = []
  const add = (domain: string, indicator: string, value: string | number | null, unit = "") => rows.push({ Domaine: domain, Indicateur: indicator, Valeur: value ?? "", Unite: unit })
  if (report.access.crm) {
    add("Acquisition", "Prospects créés", report.acquisition.leads)
    add("Acquisition", "Nouveaux à qualifier", report.acquisition.newLeads)
  }
  if (report.access.sales) {
    add("Ventes", "Opportunités ouvertes", report.sales.openOpportunities)
    add("Ventes", "Pipeline ouvert", report.sales.openPipelineCents / 100, "EUR")
    add("Ventes", "Taux de gain", report.sales.winRatePercent, "%")
    add("Ventes", "Taux d’acceptation des devis", report.sales.quoteAcceptancePercent, "%")
  }
  if (report.access.finance) {
    add("Finance", "Facturé", report.finance.invoicedCents / 100, "EUR")
    add("Finance", "Encaissé", report.finance.collectedCents / 100, "EUR")
    add("Finance", "À encaisser", report.finance.outstandingCents / 100, "EUR")
    add("Finance", "Factures échues", report.finance.overdueInvoices)
  }
  if (report.access.operations) {
    add("Opérations", "Chantiers actifs", report.operations.activeProjects)
    add("Opérations", "Utilisation budget", report.operations.budgetUsagePercent, "%")
    add("Opérations", "Commandes fournisseurs ouvertes", report.operations.openPurchaseOrders)
    add("Opérations", "Interventions terminées", report.operations.completedInterventions)
  }
  if (report.access.service) {
    add("Service", "Tickets créés", report.service.createdTickets)
    add("Service", "Tickets clos", report.service.closedTickets)
    add("Service", "Backlog", report.service.backlog)
    add("Service", "Tickets hors délai", report.service.overdueTickets)
  }
  if (report.access.marketing) {
    add("Marketing", "E-mails suivis", report.marketing.sentEmails)
    add("Marketing", "Taux de délivrabilité", report.marketing.deliveryRatePercent, "%")
    add("Marketing", "Taux d’ouverture", report.marketing.openRatePercent, "%")
    add("Marketing", "Taux de clic", report.marketing.clickRatePercent, "%")
  }
  return rows
}
