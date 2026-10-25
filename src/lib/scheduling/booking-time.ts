export function resolveBookingLocalTime(value: string, timeZone: string): { date: Date | null; error?: string } {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return { date: null, error: "Date de rendez-vous invalide." }
  const nominal = Date.parse(`${value}:00.000Z`)
  if (!Number.isFinite(nominal)) return { date: null, error: "Date de rendez-vous invalide." }
  let formatter: Intl.DateTimeFormat
  try { formatter = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }) }
  catch { return { date: null, error: "Fuseau horaire invalide." } }
  const matches: Date[] = []
  // Modern time zones use quarter-hour offsets. Enumerating them also detects
  // a repeated wall time instead of silently choosing one side of a DST change.
  for (let offset = -14 * 60; offset <= 14 * 60; offset += 15) {
    const date = new Date(nominal - offset * 60_000), parts = formatter.formatToParts(date)
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value
    if (`${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}` === value) matches.push(date)
  }
  if (matches.length !== 1) return { date: null, error: matches.length ? "Cette heure est ambiguë au changement d’heure. Choisissez un autre créneau." : "Cette heure n’existe pas dans le fuseau de la société." }
  return { date: matches[0] }
}

export function bookingLocalInput(value: Date | string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value))
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`
}
