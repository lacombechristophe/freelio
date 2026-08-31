import "server-only"

import prisma from "@/lib/prisma"
import { BILLING_PLANS, normalizeBillingPlan, subscriptionIsUsable, type BillingLimit } from "@/lib/billing/plans"

export async function getOrCreateSubscription(companyId: string) {
  return prisma.saasSubscription.upsert({
    where: { companyId },
    create: { companyId, plan: "ALPHA", status: "ACTIVE", seatQuantity: 1 },
    update: {},
  })
}

export async function getEntitlements(companyId: string) {
  const subscription = await getOrCreateSubscription(companyId)
  const plan = normalizeBillingPlan(subscription.plan)
  return {
    subscription,
    plan,
    definition: BILLING_PLANS[plan],
    usable: subscriptionIsUsable(subscription.status, subscription.currentPeriodEnd),
  }
}

export async function assertWithinPlanLimit(companyId: string, limit: BillingLimit, currentUsage: number) {
  const entitlement = await getEntitlements(companyId)
  if (!entitlement.usable) throw new Error("Votre abonnement doit être régularisé avant cette action.")
  const maximum = entitlement.definition.limits[limit]
  if (currentUsage >= maximum) {
    const label = limit === "seats" ? "membres" : "agences"
    throw new Error(`Limite du forfait ${entitlement.definition.name} atteinte (${maximum} ${label}). Modifiez l’abonnement pour continuer.`)
  }
  return entitlement
}
