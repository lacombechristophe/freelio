export type TimeInvoiceLineMode = "GROUP_BY_PROJECT" | "DETAIL"
type TimeInvoiceEntry = {
  date: Date | string
  durationSec: number
  description: string | null
  project: { id: string; name: string }
}

function formatDate(date: Date | string) {
  return new Date(date).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" })
}

export function buildTimeInvoiceLines(entries: TimeInvoiceEntry[], hourlyRateCents: number, tvaRate: number, mode: TimeInvoiceLineMode) {
  if (mode === "DETAIL") {
    return entries.slice().sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).map((entry, order) => ({
      label: `${entry.project.name} - ${formatDate(entry.date)}`,
      description: entry.description || "Temps de développement",
      quantity: entry.durationSec / 3600,
      unitPriceCents: hourlyRateCents,
      tvaRate,
      order,
    }))
  }

  const grouped = new Map<string, TimeInvoiceEntry[]>()
  for (const entry of entries) {
    const group = grouped.get(entry.project.id) ?? []
    group.push(entry)
    grouped.set(entry.project.id, group)
  }
  return Array.from(grouped.values()).map((group, order) => {
    const sorted = group.slice().sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    const from = new Date(sorted[0].date), to = new Date(sorted[sorted.length - 1].date)
    const period = from.toDateString() === to.toDateString() ? formatDate(from) : `${formatDate(from)} - ${formatDate(to)}`
    return {
      label: `Temps passé - ${group[0].project.name}`,
      description: `${group.length} entrée(s) de temps, période ${period}.`,
      quantity: group.reduce((sum, entry) => sum + entry.durationSec, 0) / 3600,
      unitPriceCents: hourlyRateCents,
      tvaRate,
      order,
    }
  })
}
