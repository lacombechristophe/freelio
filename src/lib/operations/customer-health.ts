export const customerHealthMetricDefinitions = {
  OPEN_TICKETS: { label: "Tickets ouverts", unit: "nombre" },
  OVERDUE_TICKETS: { label: "Tickets hors délai", unit: "nombre" },
  TICKETS_90D: { label: "Tickets sur 90 jours", unit: "nombre" },
  SATISFACTION_PERCENT: { label: "Satisfaction moyenne", unit: "%" },
  DAYS_SINCE_ACTIVITY: { label: "Jours sans activité", unit: "jours" },
  OVERDUE_BALANCE_CENTS: { label: "Encours échu", unit: "centimes" },
  DAYS_TO_RENEWAL: { label: "Jours avant renouvellement", unit: "jours" },
  ACTIVE_CONTRACTS: { label: "Contrats actifs", unit: "nombre" },
} as const

export type CustomerHealthMetric = keyof typeof customerHealthMetricDefinitions
export type CustomerHealthMetrics = Record<CustomerHealthMetric, number | null>

export type CustomerHealthRuleInput = {
  id: string
  name: string
  metric: string
  operator: string
  threshold: number
  impact: number
  priority?: number
}

export type CustomerHealthFactor = {
  ruleId: string
  name: string
  metric: CustomerHealthMetric
  value: number
  threshold: number
  operator: string
  impact: number
}

export const defaultCustomerHealthRules: Omit<CustomerHealthRuleInput, "id">[] = [
  { name: "Au moins un ticket hors délai", metric: "OVERDUE_TICKETS", operator: "GTE", threshold: 1, impact: -20, priority: 90 },
  { name: "Trois tickets ouverts ou plus", metric: "OPEN_TICKETS", operator: "GTE", threshold: 3, impact: -15, priority: 80 },
  { name: "Satisfaction inférieure à 60 %", metric: "SATISFACTION_PERCENT", operator: "LTE", threshold: 60, impact: -25, priority: 100 },
  { name: "Facture échue non réglée", metric: "OVERDUE_BALANCE_CENTS", operator: "GTE", threshold: 1, impact: -25, priority: 100 },
  { name: "Aucune activité depuis 90 jours", metric: "DAYS_SINCE_ACTIVITY", operator: "GTE", threshold: 90, impact: -10, priority: 50 },
  { name: "Renouvellement dans moins de 60 jours", metric: "DAYS_TO_RENEWAL", operator: "LTE", threshold: 60, impact: -5, priority: 40 },
]

function isMetric(value: string): value is CustomerHealthMetric {
  return value in customerHealthMetricDefinitions
}

function matches(value: number, operator: string, threshold: number) {
  if (operator === "GTE") return value >= threshold
  if (operator === "GT") return value > threshold
  if (operator === "LTE") return value <= threshold
  if (operator === "LT") return value < threshold
  if (operator === "EQ") return value === threshold
  return false
}

export function customerHealthStatus(score: number) {
  if (score >= 75) return "HEALTHY" as const
  if (score >= 50) return "WATCH" as const
  return "RISK" as const
}

export function evaluateCustomerHealth(metrics: CustomerHealthMetrics, rules: CustomerHealthRuleInput[]) {
  const factors = rules
    .filter((rule) => isMetric(rule.metric))
    .flatMap((rule): CustomerHealthFactor[] => {
      const metric = rule.metric as CustomerHealthMetric
      const value = metrics[metric]
      if (value === null || !matches(value, rule.operator, rule.threshold)) return []
      return [{ ruleId: rule.id, name: rule.name, metric, value, threshold: rule.threshold, operator: rule.operator, impact: rule.impact }]
    })
    .sort((left, right) => Math.abs(right.impact) - Math.abs(left.impact) || left.name.localeCompare(right.name, "fr"))
  const score = Math.max(0, Math.min(100, 100 + factors.reduce((total, factor) => total + factor.impact, 0)))
  return { score, status: customerHealthStatus(score), factors }
}
