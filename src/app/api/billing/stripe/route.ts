import { createHash } from "node:crypto"
import type Stripe from "stripe"

import { planFromStripePrice } from "@/lib/billing/plans"
import { stripeClient } from "@/lib/billing/stripe"
import prisma from "@/lib/prisma"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function objectId(value: string | { id: string } | null | undefined) {
  return typeof value === "string" ? value : value?.id ?? null
}

async function syncSubscription(subscription: Stripe.Subscription) {
  const companyId = subscription.metadata.companyId?.trim()
  const stripeCustomerId = objectId(subscription.customer)
  const item = subscription.items.data[0]
  const stripePriceId = item?.price.id ?? null
  const periodEnd = item?.current_period_end
  const data = {
    plan: planFromStripePrice(stripePriceId),
    status: subscription.status.toUpperCase(),
    stripeCustomerId,
    stripeSubscriptionId: subscription.id,
    stripePriceId,
    seatQuantity: item?.quantity ?? 1,
    trialEndsAt: subscription.trial_end ? new Date(subscription.trial_end * 1_000) : null,
    currentPeriodEnd: periodEnd ? new Date(periodEnd * 1_000) : null,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
  }

  if (companyId) {
    await prisma.saasSubscription.upsert({
      where: { companyId },
      create: { companyId, ...data },
      update: data,
    })
    return
  }
  if (!stripeCustomerId) throw new Error("Abonnement Stripe sans entreprise ni client")
  const updated = await prisma.saasSubscription.updateMany({ where: { stripeCustomerId }, data })
  if (updated.count !== 1) throw new Error("Entreprise introuvable pour l’abonnement Stripe")
}

async function processEvent(event: Stripe.Event) {
  if (["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"].includes(event.type)) {
    await syncSubscription(event.data.object as Stripe.Subscription)
    return
  }
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session
    const companyId = session.client_reference_id || session.metadata?.companyId
    if (!companyId) throw new Error("Session Stripe sans entreprise")
    await prisma.saasSubscription.upsert({
      where: { companyId },
      create: {
        companyId,
        stripeCustomerId: objectId(session.customer),
        stripeSubscriptionId: objectId(session.subscription),
      },
      update: {
        stripeCustomerId: objectId(session.customer),
        stripeSubscriptionId: objectId(session.subscription),
      },
    })
  }
}

export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim()
  const signature = request.headers.get("stripe-signature")
  if (!webhookSecret || !signature) return Response.json({ error: "Webhook non configuré" }, { status: 503 })

  const rawBody = await request.text()
  let event: Stripe.Event
  try {
    event = stripeClient().webhooks.constructEvent(rawBody, signature, webhookSecret)
  } catch {
    return Response.json({ error: "Signature invalide" }, { status: 400 })
  }

  const digest = createHash("sha256").update(rawBody).digest("hex")
  const existing = await prisma.billingWebhookEvent.findUnique({ where: { id: event.id } })
  if (existing && existing.payloadDigest !== digest) {
    console.error("Stripe webhook event id reused with a different payload", { eventId: event.id, eventType: event.type })
    return Response.json({ error: "Événement incohérent" }, { status: 409 })
  }
  const processingIsFresh = existing?.status === "PROCESSING" && existing.updatedAt.getTime() > Date.now() - 10 * 60 * 1_000
  if (existing?.status === "PROCESSED" || processingIsFresh) {
    return Response.json({ received: true, duplicate: true })
  }

  if (existing) {
    await prisma.billingWebhookEvent.update({
      where: { id: event.id },
      data: { status: "PROCESSING", attempts: { increment: 1 }, lastError: null },
    })
  } else {
    try {
      await prisma.billingWebhookEvent.create({ data: { id: event.id, type: event.type, payloadDigest: digest } })
    } catch (error) {
      const raced = await prisma.billingWebhookEvent.findUnique({ where: { id: event.id }, select: { payloadDigest: true } })
      if (raced?.payloadDigest === digest) return Response.json({ received: true, duplicate: true })
      console.error("Stripe webhook event claim failed", { eventId: event.id, eventType: event.type, error: error instanceof Error ? error.message : "unknown" })
      return Response.json({ error: "Événement non enregistré" }, { status: 500 })
    }
  }

  try {
    await processEvent(event)
    await prisma.billingWebhookEvent.update({ where: { id: event.id }, data: { status: "PROCESSED", processedAt: new Date() } })
    return Response.json({ received: true })
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Traitement impossible"
    await prisma.billingWebhookEvent.update({ where: { id: event.id }, data: { status: "FAILED", lastError: message } })
    console.error("Stripe webhook processing failed", { eventId: event.id, eventType: event.type, error: message })
    return Response.json({ error: "Traitement différé" }, { status: 500 })
  }
}
