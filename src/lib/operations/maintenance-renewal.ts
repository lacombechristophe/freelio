const dayMs = 86_400_000

export function indexedMaintenancePrice(priceCents: number, indexationRate: number) {
  return Math.max(0, Math.round(priceCents * (1 + indexationRate / 100)))
}

export function nextMaintenanceTerm(startDate: Date | string, endDate: Date | string) {
  const start = new Date(startDate)
  const end = new Date(endDate)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) throw new Error("Période de contrat invalide")
  const durationDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / dayMs) + 1)
  const nextStartDate = new Date(end.getTime() + dayMs)
  const nextEndDate = new Date(nextStartDate.getTime() + (durationDays - 1) * dayMs)
  return { startDate: nextStartDate, endDate: nextEndDate, durationDays }
}

export function maintenanceRenewalWindow(endDate: Date | string | null | undefined, noticeDays: number, now = new Date()) {
  if (!endDate) return { status: "NO_END" as const, daysRemaining: null }
  const end = new Date(endDate)
  const daysRemaining = Math.ceil((end.getTime() - now.getTime()) / dayMs)
  if (daysRemaining < 0) return { status: "OVERDUE" as const, daysRemaining }
  if (daysRemaining <= Math.max(0, noticeDays)) return { status: "OPEN" as const, daysRemaining }
  return { status: "FUTURE" as const, daysRemaining }
}
