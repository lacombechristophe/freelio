export function assertInventoryClaim(claimed: { count: number }) {
  if (claimed.count !== 1) throw new Error("Le stock a changé pendant l’opération. Rechargez la page puis réessayez.")
}
