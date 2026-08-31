import { describe, expect, it } from "vitest"

import { buildExecutiveReport, executiveReportRows, normalizeReportPeriod, type ReportingInput } from "@/lib/reporting"

const now = new Date("2026-08-31T12:00:00.000Z")

function date(daysAgo: number) {
  return new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1_000)
}

function input(overrides: Partial<ReportingInput> = {}): ReportingInput {
  return {
    access: { crm: true, sales: true, finance: true, operations: true, service: true, marketing: true },
    leads: [],
    opportunities: [],
    quotes: [],
    invoices: [],
    payments: [],
    expenses: [],
    projects: [],
    purchaseOrders: [],
    interventions: [],
    tickets: [],
    deliveries: [],
    ...overrides,
  }
}

describe("reporting", () => {
  it("normalise les périodes publiques", () => {
    expect(normalizeReportPeriod("30")).toBe(30)
    expect(normalizeReportPeriod(365)).toBe(365)
    expect(normalizeReportPeriod("7")).toBe(90)
    expect(normalizeReportPeriod(undefined)).toBe(90)
  })

  it("calcule une lecture transverse sans mélanger périodes et encours", () => {
    const report = buildExecutiveReport(input({
      leads: [
        { status: "NEW", createdAt: date(5) },
        { status: "QUALIFIED", createdAt: date(20) },
        { status: "CONTACTED", createdAt: date(120) },
      ],
      opportunities: [
        { status: "WON", valueCents: 40_000, probability: 100, createdAt: date(40), closedAt: date(10) },
        { status: "LOST", valueCents: 20_000, probability: 0, createdAt: date(35), closedAt: date(8) },
        { status: "QUALIFIED", valueCents: 50_000, probability: 42, createdAt: date(15), closedAt: null },
        { status: "WON", valueCents: 30_000, probability: 100, createdAt: date(150), closedAt: date(120) },
      ],
      quotes: [
        { status: "ACCEPTED", date: date(12) },
        { status: "SENT", date: date(15) },
      ],
      invoices: [
        { status: "OVERDUE", totalTtcCents: 12_000, paidAmountCents: 2_000, date: date(15), dueDate: date(2) },
        { status: "PAID", totalTtcCents: 5_000, paidAmountCents: 5_000, date: date(20), dueDate: date(10) },
      ],
      payments: [
        { amountCents: 4_000, date: date(5) },
        { amountCents: 2_000, date: date(120) },
      ],
      expenses: [{ amountCents: 1_000, date: date(4) }],
      projects: [{ status: "ACTIVE", budgetCents: 10_000, consumedCents: 12_000, endDate: null }],
      purchaseOrders: [{ status: "SENT", totalHtCents: 5_000, expectedAt: date(1), confirmedExpectedAt: null }],
      interventions: [{ status: "COMPLETED", scheduledStart: date(3), completedAt: date(3), laborMinutes: 180 }],
      tickets: [
        { status: "OPEN", priority: "URGENT", requestedAt: date(2), dueAt: date(1), closedAt: null },
        { status: "CLOSED", priority: "NORMAL", requestedAt: date(10), dueAt: null, closedAt: date(4) },
        { status: "CLOSED", priority: "NORMAL", requestedAt: date(120), dueAt: null, closedAt: date(110) },
      ],
      deliveries: [
        { status: "OPENED", createdAt: date(4) },
        { status: "FAILED", createdAt: date(3) },
      ],
    }), 90, now)

    expect(report.acquisition).toMatchObject({ leads: 2, previousLeads: 1, newLeads: 1, deltaPercent: 100 })
    expect(report.sales).toMatchObject({ won: 1, lost: 1, openPipelineCents: 50_000, weightedPipelineCents: 21_000, winRatePercent: 50, quoteAcceptancePercent: 50 })
    expect(report.finance).toMatchObject({ invoicedCents: 17_000, collectedCents: 4_000, expenseCents: 1_000, outstandingCents: 10_000, overdueInvoices: 1 })
    expect(report.operations).toMatchObject({ activeProjects: 1, overBudgetProjects: 1, openPurchaseOrders: 1, latePurchaseOrders: 1, completedInterventions: 1, laborMinutes: 180 })
    expect(report.service).toMatchObject({ createdTickets: 2, closedTickets: 1, backlog: 1, overdueTickets: 1, urgentTickets: 1 })
    expect(report.marketing).toMatchObject({ sentEmails: 1, openedEmails: 1, failedEmails: 1 })
    expect(report.trend).toHaveLength(6)
    expect(report.insights.map((item) => item.id)).toEqual(expect.arrayContaining(["overdue-invoices", "over-budget", "late-purchases", "overdue-tickets", "new-leads"]))
  })

  it("n'exporte que les domaines autorisés", () => {
    const report = buildExecutiveReport(input({
      access: { crm: true, sales: true, finance: false, operations: false, service: false, marketing: false },
      leads: [{ status: "NEW", createdAt: date(2) }],
    }), 30, now)
    const rows = executiveReportRows(report)
    expect(rows.some((row) => row.Domaine === "Finance")).toBe(false)
    expect(rows.some((row) => row.Domaine === "Acquisition")).toBe(true)
  })
})
