export function formatCentsToEuro(cents: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100)
}

export { generateFacturX } from "@/lib/pdf/facturx"
