import { z } from "zod"

export const scheduledTimeInput = z.object({
  localDateTime: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
  timezone: z.string().trim().min(1).max(100),
})

export function scheduledEmailLocalTime(instant: string, timezone: string) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(instant)).replace(" ", "T")
}

export function scheduledEmailInstant(input: z.infer<typeof scheduledTimeInput>, now = new Date()) {
  const { localDateTime, timezone } = scheduledTimeInput.parse(input)
  const base = Date.parse(`${localDateTime}:00Z`)
  if (!Number.isFinite(base) || new Date(base).toISOString().slice(0, 16) !== localDateTime) throw new Error("Date et heure invalides")
  let formatter: Intl.DateTimeFormat
  try { formatter = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }) }
  catch { throw new Error("Fuseau horaire invalide") }
  const local = (instant: number) => {
    const parts = formatter.formatToParts(new Date(instant))
    const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)!.value
    return `${value("year")}-${value("month")}-${value("day")}T${value("hour")}:${value("minute")}`
  }
  // Sample both sides of a transition, including half-hour and date-line changes.
  const offsets = new Set<number>()
  for (let hours = -36; hours <= 36; hours += 6) {
    const sample = base + hours * 3_600_000
    offsets.add(Date.parse(`${local(sample)}:00Z`) - sample)
  }
  const candidates = [...offsets].map(offset => base - offset).filter(instant => local(instant) === localDateTime)
  if (candidates.length !== 1) throw new Error("Cette heure est inexistante ou ambiguë lors du changement d’heure ; choisissez une autre heure")
  const instant = new Date(candidates[0])
  if (instant.getTime() < now.getTime() + 60_000 || instant.getTime() > now.getTime() + 366 * 24 * 3_600_000) throw new Error("Choisissez une date entre une minute et un an dans le futur")
  return instant
}
