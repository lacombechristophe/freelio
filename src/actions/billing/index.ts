"use server"

import { redirect } from "next/navigation"
import { z } from "zod"

import { withAuth } from "@/lib/auth-wrapper"
import { BILLING_PLANS, billingConfigurationIssues, stripePriceId } from "@/lib/billing/plans"
import { getEntitlements } from "@/lib/billing/subscription"
import { stripeClient } from "@/lib/billing/stripe"
import prisma from "@/lib/prisma"

const paidPlanSchema = z.enum(["ATELIER", "RESEAU"])

function applicationUrl() {
  const value = process.env.PUBLIC_APP_URL?.trim() || process.env.AUTH_URL?.trim()
  if (!value) throw new Error("URL publique non configurée")
  return new URL(value).origin
}

export async function getBillingOverview() {
  return withAuth(async ({ companyId }) => {
    const [entitlement, activeMembers, pendingInvitations, agencies] = await Promise.all([
      getEntitlements(companyId),
      prisma.membership.count({ where: { companyId, status: "ACTIVE" } }),
      prisma.companyInvitation.count({ where: { companyId, acceptedAt: null, expiresAt: { gt: new Date() } } }),
      prisma.agency.count({ where: { companyId, active: true } }),
    ])
    const configurationIssues = billingConfigurationIssues()
    return {
      plan: entitlement.plan,
      status: entitlement.subscription.status,
      cancelAtPeriodEnd: entitlement.subscription.cancelAtPeriodEnd,
      currentPeriodEnd: entitlement.subscription.currentPeriodEnd?.toISOString() ?? null,
      trialEndsAt: entitlement.subscription.trialEndsAt?.toISOString() ?? null,
      hasStripeCustomer: Boolean(entitlement.subscription.stripeCustomerId),
      configured: configurationIssues.length === 0,
      usage: { seats: activeMembers + pendingInvitations, agencies },
      plans: BILLING_PLANS,
    }
  })
}

export async function startCheckout(formData: FormData) {
  const parsed = paidPlanSchema.safeParse(formData.get("plan"))
  if (!parsed.success) throw new Error("Forfait invalide")

  const checkoutUrl = await withAuth(async ({ companyId, userId }) => {
    const [entitlement, user, company] = await Promise.all([
      getEntitlements(companyId),
      prisma.user.findUnique({ where: { id: userId }, select: { email: true } }),
      prisma.company.findUnique({ where: { id: companyId }, select: { name: true } }),
    ])
    const price = stripePriceId(parsed.data)
    if (!price) throw new Error("Le tarif Stripe de ce forfait n’est pas configuré")
    const stripe = stripeClient()
    let customerId = entitlement.subscription.stripeCustomerId
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user?.email || undefined,
        name: company?.name || undefined,
        metadata: { companyId },
      }, { idempotencyKey: `customer:${companyId}` })
      customerId = customer.id
      await prisma.saasSubscription.update({ where: { companyId }, data: { stripeCustomerId: customerId } })
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price, quantity: 1 }],
      allow_promotion_codes: true,
      billing_address_collection: "auto",
      tax_id_collection: { enabled: true },
      client_reference_id: companyId,
      metadata: { companyId, requestedPlan: parsed.data },
      subscription_data: { metadata: { companyId, requestedPlan: parsed.data } },
      success_url: `${applicationUrl()}/dashboard/billing?checkout=success`,
      cancel_url: `${applicationUrl()}/dashboard/billing?checkout=cancelled`,
    })
    if (!session.url) throw new Error("Stripe n’a pas retourné d’URL de paiement")
    return session.url
  }, "company.manage")

  redirect(checkoutUrl)
}

export async function openBillingPortal() {
  const portalUrl = await withAuth(async ({ companyId }) => {
    const entitlement = await getEntitlements(companyId)
    if (!entitlement.subscription.stripeCustomerId) throw new Error("Aucun compte de facturation Stripe n’est encore associé")
    const session = await stripeClient().billingPortal.sessions.create({
      customer: entitlement.subscription.stripeCustomerId,
      return_url: `${applicationUrl()}/dashboard/billing`,
    })
    return session.url
  }, "company.manage")
  redirect(portalUrl)
}
