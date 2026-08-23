export function computeInvoiceSlice(input: {
  orderHtCents: number
  orderTvaCents: number
  orderTtcCents: number
  amountTtcCents: number
}) {
  if (!Number.isInteger(input.amountTtcCents) || input.amountTtcCents <= 0) {
    throw new Error("Le montant à facturer doit être positif")
  }
  if (input.orderTtcCents <= 0 || input.amountTtcCents > input.orderTtcCents) {
    throw new Error("Le montant à facturer dépasse la commande")
  }
  const totalHtCents = Math.round(input.amountTtcCents * input.orderHtCents / input.orderTtcCents)
  const totalTvaCents = input.amountTtcCents - totalHtCents
  const tvaRate = totalHtCents ? Math.round(totalTvaCents / totalHtCents * 10_000) / 100 : 0
  return { totalHtCents, totalTvaCents, totalTtcCents: input.amountTtcCents, tvaRate }
}

export function remainingOrderAmount(totalTtcCents: number, invoices: Array<{ totalTtcCents: number; status: string; type: string }>) {
  const invoiced = invoices
    .filter((invoice) => invoice.status !== "CANCELLED" && invoice.type !== "CREDIT_NOTE")
    .reduce((sum, invoice) => sum + Math.max(0, invoice.totalTtcCents), 0)
  return Math.max(0, totalTtcCents - invoiced)
}
