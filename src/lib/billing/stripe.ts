import "server-only"

import Stripe from "stripe"

let cachedStripe: Stripe | null = null

export function stripeClient() {
  const secret = process.env.STRIPE_SECRET_KEY?.trim()
  if (!secret) throw new Error("Stripe n’est pas configuré")
  cachedStripe ??= new Stripe(secret, { appInfo: { name: "Freelio", version: "0.1.0" } })
  return cachedStripe
}
