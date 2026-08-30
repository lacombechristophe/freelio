import { describe, expect, it } from "vitest"

import { buildServiceAnalytics, type ServiceAnalyticsTicket } from "@/lib/operations/service-analytics"

const tickets: ServiceAnalyticsTicket[] = [
  { id: "a", status: "CLOSED", priority: "HIGH", requestedAt: "2026-08-02T08:00:00Z", firstRespondedAt: "2026-08-02T09:00:00Z", closedAt: "2026-08-03T10:00:00Z", firstResponseTargetAt: "2026-08-02T12:00:00Z", resolutionTargetAt: "2026-08-04T08:00:00Z", firstResponseMinutes: 60, resolutionMinutes: 600, assigneeId: "m1", assigneeName: "Camille" },
  { id: "b", status: "OPEN", priority: "URGENT", requestedAt: "2026-08-10T08:00:00Z", firstRespondedAt: null, closedAt: null, firstResponseTargetAt: "2026-08-10T09:00:00Z", resolutionTargetAt: "2026-08-11T08:00:00Z", assigneeId: null, assigneeName: null },
  { id: "old", status: "OPEN", priority: "NORMAL", requestedAt: "2026-05-01T08:00:00Z", firstRespondedAt: "2026-05-01T10:00:00Z", closedAt: null, firstResponseTargetAt: "2026-05-01T12:00:00Z", resolutionTargetAt: "2026-05-03T08:00:00Z", assigneeId: "m1", assigneeName: "Camille" },
]

describe("service analytics", () => {
  const result = buildServiceAnalytics({
    tickets,
    diagnostics: [{ ticketId: "a", guideName: "Guide moteur", completedAt: "2026-08-02T10:00:00Z" }],
    satisfaction: [{ score: 5, scaleMin: 1, scaleMax: 5 }, { score: 3, scaleMin: 1, scaleMax: 5 }],
    health: [{ score: 90 }, { score: 60 }, { score: 30 }],
    startAt: "2026-08-01T00:00:00Z",
    endAt: "2026-08-31T23:59:59Z",
    now: "2026-08-20T00:00:00Z",
  })

  it("separates created, closed and current backlog cohorts", () => {
    expect(result.summary).toMatchObject({ created: 2, closed: 1, backlog: 2 })
  })

  it("counts overdue unanswered and unresolved tickets as SLA failures", () => {
    expect(result.summary.firstResponsePercent).toBe(50)
    expect(result.summary.resolutionPercent).toBe(33)
  })

  it("computes diagnostic coverage, satisfaction and health distribution", () => {
    expect(result.summary.diagnosticCoveragePercent).toBe(50)
    expect(result.summary.satisfactionPercent).toBe(75)
    expect(result.healthDistribution.map((item) => item.count)).toEqual([1, 1, 1])
  })

  it("groups workload by owner and priority", () => {
    expect(result.byAssignee.find((item) => item.key === "m1")).toMatchObject({ backlog: 1, created: 1 })
    expect(result.byPriority.find((item) => item.key === "URGENT")).toMatchObject({ created: 1, firstResponsePercent: 0 })
  })

  it("builds weekly created and closed trends", () => {
    expect(result.trend.reduce((total, item) => total + item.created, 0)).toBe(2)
    expect(result.trend.reduce((total, item) => total + item.closed, 0)).toBe(1)
  })
})
