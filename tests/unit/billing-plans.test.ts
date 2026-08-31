import { describe, expect, it } from "vitest"

import { BILLING_PLANS, normalizeBillingPlan, planFromStripePrice, subscriptionIsUsable } from "@/lib/billing/plans"

describe("billing plans", () => {
  it("falls back safely to the alpha plan", () => {
    expect(normalizeBillingPlan("UNKNOWN")).toBe("ALPHA")
    expect(normalizeBillingPlan(null)).toBe("ALPHA")
  })

  it("keeps limits increasing with paid plans", () => {
    expect(BILLING_PLANS.ATELIER.limits.seats).toBeGreaterThan(BILLING_PLANS.ALPHA.limits.seats)
    expect(BILLING_PLANS.RESEAU.limits.agencies).toBeGreaterThan(BILLING_PLANS.ATELIER.limits.agencies)
  })

  it("maps configured Stripe prices without trusting metadata", () => {
    const previous = process.env.STRIPE_PRICE_ATELIER
    process.env.STRIPE_PRICE_ATELIER = "price_atelier_test"
    expect(planFromStripePrice("price_atelier_test")).toBe("ATELIER")
    expect(planFromStripePrice("price_unknown")).toBe("ALPHA")
    process.env.STRIPE_PRICE_ATELIER = previous
  })

  it("limits the past-due grace period", () => {
    const now = new Date("2026-08-31T00:00:00.000Z")
    expect(subscriptionIsUsable("PAST_DUE", new Date("2026-09-02T00:00:00.000Z"), now)).toBe(true)
    expect(subscriptionIsUsable("PAST_DUE", new Date("2026-08-20T00:00:00.000Z"), now)).toBe(false)
    expect(subscriptionIsUsable("CANCELED", null, now)).toBe(false)
  })
})
