export type SequenceSchedule = {
  businessDaysOnly: boolean
  sendWindowStart: number
  sendWindowEnd: number
  timezone: string
}

const weekdayByName: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 0 }

function localParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date)
  const weekday = weekdayByName[parts.find((part) => part.type === "weekday")?.value || ""]
  const hour = Number(parts.find((part) => part.type === "hour")?.value)
  if (weekday === undefined || !Number.isInteger(hour)) throw new Error("Fuseau horaire invalide")
  return { weekday, hour }
}

export function sequenceTimezoneIsValid(timezone: string) {
  try {
    localParts(new Date(), timezone)
    return true
  } catch {
    return false
  }
}

export function nextSequenceExecution(base: Date, delayHours: number, schedule: SequenceSchedule) {
  if (!sequenceTimezoneIsValid(schedule.timezone)) throw new Error("Fuseau horaire invalide")
  if (!Number.isInteger(schedule.sendWindowStart) || !Number.isInteger(schedule.sendWindowEnd) || schedule.sendWindowStart < 0 || schedule.sendWindowEnd > 23 || schedule.sendWindowStart >= schedule.sendWindowEnd) throw new Error("Fenêtre d’envoi invalide")
  const delay = Math.max(0, Math.trunc(delayHours))
  let candidate = new Date(base.getTime() + delay * 3_600_000)
  candidate.setUTCSeconds(0, 0)
  for (let attempts = 0; attempts < 8 * 24 * 4; attempts += 1) {
    const { weekday, hour } = localParts(candidate, schedule.timezone)
    const businessDay = weekday >= 1 && weekday <= 5
    if ((!schedule.businessDaysOnly || businessDay) && hour >= schedule.sendWindowStart && hour < schedule.sendWindowEnd) return candidate
    candidate = new Date(candidate.getTime() + 15 * 60_000)
  }
  throw new Error("Impossible de trouver un créneau d’envoi dans les huit prochains jours")
}

