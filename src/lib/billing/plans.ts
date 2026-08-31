export const BILLING_PLANS = {
  ALPHA: {
    code: "ALPHA",
    name: "Alpha",
    monthlyPriceCents: 0,
    description: "Découverte et configuration initiale",
    limits: { seats: 2, agencies: 1 },
  },
  ATELIER: {
    code: "ATELIER",
    name: "Atelier",
    monthlyPriceCents: 7_900,
    description: "Équipe commerciale, chantier et SAV",
    limits: { seats: 10, agencies: 3 },
  },
  RESEAU: {
    code: "RESEAU",
    name: "Réseau",
    monthlyPriceCents: 14_900,
    description: "Organisation multi-agences étendue",
    limits: { seats: 30, agencies: 10 },
  },
} as const

export type BillingPlanCode = keyof typeof BILLING_PLANS
export type BillingLimit = keyof (typeof BILLING_PLANS)[BillingPlanCode]["limits"]

export function normalizeBillingPlan(value: string | null | undefined): BillingPlanCode {
  return value && value in BILLING_PLANS ? value as BillingPlanCode : "ALPHA"
}

export function stripePriceId(plan: Exclude<BillingPlanCode, "ALPHA">) {
  return process.env[`STRIPE_PRICE_${plan}`]?.trim() || null
}

export function planFromStripePrice(priceId: string | null | undefined): BillingPlanCode {
  if (priceId && priceId === stripePriceId("ATELIER")) return "ATELIER"
  if (priceId && priceId === stripePriceId("RESEAU")) return "RESEAU"
  return "ALPHA"
}

export function billingConfigurationIssues(environment: NodeJS.ProcessEnv = process.env) {
  return ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRICE_ATELIER", "STRIPE_PRICE_RESEAU"]
    .filter((name) => !environment[name]?.trim())
}

export function subscriptionIsUsable(status: string, currentPeriodEnd?: Date | null, now = new Date()) {
  const normalized = status.toUpperCase()
  if (normalized === "ACTIVE" || normalized === "TRIALING") return true
  if (normalized !== "PAST_DUE" || !currentPeriodEnd) return false
  return currentPeriodEnd.getTime() + 7 * 24 * 60 * 60 * 1_000 > now.getTime()
}
