export const DEFAULT_SERVICE_FIRST_RESPONSE_HOURS: Record<string, number> = { URGENT: 1, HIGH: 4, NORMAL: 8, LOW: 16 }
export const DEFAULT_SERVICE_RESOLUTION_HOURS: Record<string, number> = { URGENT: 4, HIGH: 16, NORMAL: 40, LOW: 80 }

export type ServiceSlaPolicy = {
  timezone: string
  dayStart: number
  dayEnd: number
  workdays: number[]
  holidays: string[]
  firstResponseHours: Record<string, number>
  resolutionHours: Record<string, number>
}

const weekday: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

function numberMap(value: unknown, fallback: Record<string, number>) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback
  return Object.fromEntries(Object.entries(fallback).map(([key, defaultValue]) => {
    const candidate = Number((value as Record<string, unknown>)[key])
    return [key, Number.isFinite(candidate) && candidate > 0 && candidate <= 1_000 ? candidate : defaultValue]
  }))
}

export function serviceSlaPolicy(input?: {
  serviceTimezone?: string | null
  serviceDayStart?: number | null
  serviceDayEnd?: number | null
  serviceWorkdays?: unknown
  serviceHolidays?: unknown
  serviceFirstResponseHours?: unknown
  serviceResolutionHours?: unknown
} | null): ServiceSlaPolicy {
  const timezone = input?.serviceTimezone || "Europe/Paris"
  try { new Intl.DateTimeFormat("fr-FR", { timeZone: timezone }).format(new Date()) } catch { throw new Error("Fuseau horaire de service invalide") }
  const dayStart = Number.isInteger(input?.serviceDayStart) ? input!.serviceDayStart! : 8
  const dayEnd = Number.isInteger(input?.serviceDayEnd) ? input!.serviceDayEnd! : 18
  if (dayStart < 0 || dayEnd > 23 || dayStart >= dayEnd) throw new Error("Horaires de service invalides")
  const configuredWorkdays = Array.isArray(input?.serviceWorkdays) ? input.serviceWorkdays.filter((item): item is number => Number.isInteger(item) && Number(item) >= 0 && Number(item) <= 6) : [1, 2, 3, 4, 5]
  const workdays = configuredWorkdays.length > 0 ? configuredWorkdays : [1, 2, 3, 4, 5]
  const holidays = Array.isArray(input?.serviceHolidays) ? input.serviceHolidays.filter((item): item is string => typeof item === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item)) : []
  return { timezone, dayStart, dayEnd, workdays: [...new Set(workdays)], holidays: [...new Set(holidays)], firstResponseHours: numberMap(input?.serviceFirstResponseHours, DEFAULT_SERVICE_FIRST_RESPONSE_HOURS), resolutionHours: numberMap(input?.serviceResolutionHours, DEFAULT_SERVICE_RESOLUTION_HOURS) }
}

function localParts(date: Date, policy: ServiceSlaPolicy) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: policy.timezone, weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date)
  const get = (type: string) => parts.find((part) => part.type === type)?.value || ""
  return { weekday: weekday[get("weekday")], date: `${get("year")}-${get("month")}-${get("day")}`, minutes: Number(get("hour")) * 60 + Number(get("minute")) }
}

function calendarDay(date: string, offset: number) {
  const [year, month, day] = date.split("-").map(Number)
  const value = new Date(Date.UTC(year, month - 1, day + offset))
  return value.toISOString().slice(0, 10)
}

function calendarWeekday(date: string) {
  const [year, month, day] = date.split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}

function isOpenDate(date: string, policy: ServiceSlaPolicy) {
  return policy.workdays.includes(calendarWeekday(date)) && !policy.holidays.includes(date)
}

function zonedDateTimeToUtc(date: string, minutes: number, policy: ServiceSlaPolicy) {
  const [year, month, day] = date.split("-").map(Number)
  const desired = Date.UTC(year, month - 1, day, Math.floor(minutes / 60), minutes % 60)
  let candidate = desired
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const local = localParts(new Date(candidate), policy)
    const [localYear, localMonth, localDay] = local.date.split("-").map(Number)
    const observed = Date.UTC(localYear, localMonth - 1, localDay, Math.floor(local.minutes / 60), local.minutes % 60)
    const correction = desired - observed
    if (correction === 0) return new Date(candidate)
    candidate += correction
  }
  throw new Error("Horaire local de service impossible à convertir")
}

function nextOpening(start: Date, policy: ServiceSlaPolicy) {
  const local = localParts(start, policy)
  for (let offset = 0; offset < 3_700; offset += 1) {
    const date = calendarDay(local.date, offset)
    if (!isOpenDate(date, policy)) continue
    if (offset === 0 && local.minutes >= policy.dayStart * 60 && local.minutes < policy.dayEnd * 60) return new Date(start)
    if (offset > 0 || local.minutes < policy.dayStart * 60) return zonedDateTimeToUtc(date, policy.dayStart * 60, policy)
  }
  throw new Error("Aucun jour ouvré disponible dans la politique SLA")
}

export function addBusinessMinutes(start: Date, minutes: number, policy: ServiceSlaPolicy) {
  let candidate = new Date(start)
  let remaining = Math.max(0, Math.round(minutes))
  for (let attempt = 0; attempt < 3_700 && remaining > 0; attempt += 1) {
    candidate = nextOpening(candidate, policy)
    const local = localParts(candidate, policy)
    const available = policy.dayEnd * 60 - local.minutes
    const consumed = Math.min(remaining, available)
    candidate = zonedDateTimeToUtc(local.date, local.minutes + consumed, policy)
    remaining -= consumed
  }
  if (remaining > 0) throw new Error("Échéance SLA impossible à calculer")
  return candidate
}

export function addBusinessHours(start: Date, hours: number, policy: ServiceSlaPolicy) {
  return addBusinessMinutes(start, hours * 60, policy)
}

export function businessMinutesBetween(start: Date, end: Date, policy: ServiceSlaPolicy) {
  if (end <= start) return 0
  let cursor = new Date(start)
  let total = 0
  for (let attempt = 0; attempt < 3_700 && cursor < end; attempt += 1) {
    cursor = nextOpening(cursor, policy)
    if (cursor >= end) break
    const local = localParts(cursor, policy)
    const closing = zonedDateTimeToUtc(local.date, policy.dayEnd * 60, policy)
    const segmentEnd = closing < end ? closing : end
    total += Math.max(0, segmentEnd.getTime() - cursor.getTime())
    cursor = closing
  }
  return Math.floor(total / 60_000)
}

function pauseDurationMinutes(input: { pausedMinutes?: number | null; waitingSince?: Date | null }, policy: ServiceSlaPolicy, now: Date) {
  return Math.max(0, input.pausedMinutes || 0) + (input.waitingSince ? businessMinutesBetween(input.waitingSince, now, policy) : 0)
}

export function serviceResolutionTarget(input: { requestedAt: Date; dueAt?: Date | null; priority: string; pausedMinutes?: number | null; waitingSince?: Date | null }, policy = serviceSlaPolicy(), now = new Date()) {
  const paused = pauseDurationMinutes(input, policy, now)
  if (input.dueAt) return { targetAt: addBusinessMinutes(input.dueAt, paused, policy), source: "CUSTOM" as const }
  const hours = policy.resolutionHours[input.priority] ?? policy.resolutionHours.NORMAL
  const base = addBusinessHours(input.requestedAt, hours, policy)
  return { targetAt: addBusinessMinutes(base, paused, policy), source: "POLICY" as const }
}

export function serviceFirstResponseTarget(input: { requestedAt: Date; priority: string; firstRespondedAt?: Date | null; pausedMinutes?: number | null; waitingSince?: Date | null }, policy = serviceSlaPolicy(), now = new Date()) {
  const hours = policy.firstResponseHours[input.priority] ?? policy.firstResponseHours.NORMAL
  const base = addBusinessHours(input.requestedAt, hours, policy)
  return { targetAt: addBusinessMinutes(base, pauseDurationMinutes(input, policy, now), policy), respondedAt: input.firstRespondedAt || null }
}

export function serviceTargetIsBreached(input: { targetAt: Date; status: string; completedAt?: Date | null; now?: Date }) {
  return !input.completedAt && !["RESOLVED", "CLOSED"].includes(input.status) && input.targetAt < (input.now ?? new Date())
}
