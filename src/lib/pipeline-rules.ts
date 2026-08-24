export function resolveOpportunityStage(input: {
  status: string
  probability: number
  lostReason?: string | null
  closedAt?: Date | null
  now?: Date
}) {
  const lostReason = input.lostReason?.trim() || null
  if (input.status === "LOST") {
    if (!lostReason || lostReason.length < 2) throw new Error("Le motif de perte est requis")
    return { probability: 0, lostReason, closedAt: input.closedAt ?? input.now ?? new Date() }
  }
  if (input.status === "WON") {
    return { probability: 100, lostReason: null, closedAt: input.closedAt ?? input.now ?? new Date() }
  }
  return { probability: input.probability, lostReason: null, closedAt: null }
}
