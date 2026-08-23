/**
 * Billing Utilities (Deterministic calculations in cents)
 */

export function calculateLineTotal(quantity: number, unitPriceCents: number) {
  // Use BigInt for calculation then back to number for storage (Prisma Int is fine for cents)
  return Math.round(quantity * unitPriceCents)
}

export function calculateTva(amountCents: number, rate: number) {
  return Math.round((amountCents * rate) / 100)
}

export function formatCentsToEuro(cents: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100)
}

export function parseEuroToCents(euroString: string) {
  const clean = euroString.replace(/[^\d.,]/g, "").replace(",", ".")
  return Math.round(parseFloat(clean) * 100)
}

export { generateFacturX } from "@/lib/pdf/facturx"

