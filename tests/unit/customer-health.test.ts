import { describe, expect, it } from "vitest"

import { customerHealthStatus, evaluateCustomerHealth, type CustomerHealthMetrics } from "@/lib/operations/customer-health"

const healthyMetrics: CustomerHealthMetrics = {
  OPEN_TICKETS: 0,
  OVERDUE_TICKETS: 0,
  TICKETS_90D: 0,
  SATISFACTION_PERCENT: null,
  DAYS_SINCE_ACTIVITY: 10,
  OVERDUE_BALANCE_CENTS: 0,
  DAYS_TO_RENEWAL: null,
  ACTIVE_CONTRACTS: 1,
}

describe("customer health scoring", () => {
  it("starts at 100 when no rule is triggered", () => {
    expect(evaluateCustomerHealth(healthyMetrics, []).score).toBe(100)
  })

  it("does not penalize missing metrics", () => {
    const result = evaluateCustomerHealth(healthyMetrics, [{ id: "satisfaction", name: "Satisfaction faible", metric: "SATISFACTION_PERCENT", operator: "LTE", threshold: 60, impact: -30 }])
    expect(result.score).toBe(100)
    expect(result.factors).toEqual([])
  })

  it("combines triggered factors and clamps the score", () => {
    const result = evaluateCustomerHealth({ ...healthyMetrics, OVERDUE_TICKETS: 2, OVERDUE_BALANCE_CENTS: 50_000 }, [
      { id: "tickets", name: "Tickets en retard", metric: "OVERDUE_TICKETS", operator: "GTE", threshold: 1, impact: -40 },
      { id: "balance", name: "Impayé", metric: "OVERDUE_BALANCE_CENTS", operator: "GT", threshold: 0, impact: -80 },
    ])
    expect(result.score).toBe(0)
    expect(result.status).toBe("RISK")
    expect(result.factors).toHaveLength(2)
  })

  it("supports positive signals without exceeding 100", () => {
    const result = evaluateCustomerHealth({ ...healthyMetrics, ACTIVE_CONTRACTS: 2 }, [{ id: "contract", name: "Contrat actif", metric: "ACTIVE_CONTRACTS", operator: "GTE", threshold: 1, impact: 20 }])
    expect(result.score).toBe(100)
  })

  it("uses stable status thresholds", () => {
    expect(customerHealthStatus(75)).toBe("HEALTHY")
    expect(customerHealthStatus(74)).toBe("WATCH")
    expect(customerHealthStatus(49)).toBe("RISK")
  })
})
