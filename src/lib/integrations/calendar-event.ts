export type CalendarProvider = "GOOGLE" | "MICROSOFT"

export type ExternalCalendarEvent = {
  id: string
  title: string
  description: string | null
  location: string | null
  startAt: Date
  endAt: Date
  cancelled: boolean
  etag: string | null
}

export function localDateTimeInZone(value: string, timeZone: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value)
  if (!match) return null
  const target = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]))
  let candidate = new Date(target)
  for (let pass = 0; pass < 2; pass += 1) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(candidate)
    const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((item) => item.type === type)?.value)
    const represented = Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"))
    candidate = new Date(candidate.getTime() + target - represented)
  }
  return Number.isNaN(candidate.getTime()) ? null : candidate
}

type GoogleDate = { date?: string; dateTime?: string }
type GoogleEvent = {
  id?: string
  status?: string
  etag?: string
  summary?: string
  description?: string
  location?: string
  start?: GoogleDate
  end?: GoogleDate
}

type MicrosoftEvent = {
  id?: string
  subject?: string
  bodyPreview?: string
  isCancelled?: boolean
  changeKey?: string
  location?: { displayName?: string }
  start?: { dateTime?: string; timeZone?: string }
  end?: { dateTime?: string; timeZone?: string }
  "@removed"?: unknown
}

function validDate(value: string | null | undefined) {
  if (!value) return null
  const candidate = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00Z`)
    : new Date(/(?:Z|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value}Z`)
  return Number.isNaN(candidate.getTime()) ? null : candidate
}

function bounded(value: string | null | undefined, max: number) {
  const trimmed = value?.trim()
  return trimmed ? trimmed.slice(0, max) : null
}

export function parseGoogleCalendarEvent(input: GoogleEvent): ExternalCalendarEvent | null {
  if (!input.id) return null
  const startAt = validDate(input.start?.dateTime || input.start?.date)
  const endAt = validDate(input.end?.dateTime || input.end?.date)
  if (!startAt || !endAt || endAt <= startAt) return null
  return {
    id: input.id,
    title: bounded(input.summary, 180) || "Événement sans titre",
    description: bounded(input.description, 2_000),
    location: bounded(input.location, 300),
    startAt,
    endAt,
    cancelled: input.status === "cancelled",
    etag: bounded(input.etag, 500),
  }
}

export function parseMicrosoftCalendarEvent(input: MicrosoftEvent): ExternalCalendarEvent | null {
  if (!input.id) return null
  const startAt = validDate(input.start?.dateTime)
  const endAt = validDate(input.end?.dateTime)
  if (!startAt || !endAt || endAt <= startAt) return null
  return {
    id: input.id,
    title: bounded(input.subject, 180) || "Événement sans titre",
    description: bounded(input.bodyPreview, 2_000),
    location: bounded(input.location?.displayName, 300),
    startAt,
    endAt,
    cancelled: Boolean(input.isCancelled || input["@removed"]),
    etag: bounded(input.changeKey, 500),
  }
}

export function calendarTaskNotes(event: ExternalCalendarEvent) {
  return [event.description, event.location ? `Lieu : ${event.location}` : null].filter(Boolean).join("\n\n") || null
}

export function calendarDurationMinutes(event: Pick<ExternalCalendarEvent, "startAt" | "endAt">) {
  return Math.max(1, Math.min(24 * 60, Math.round((event.endAt.getTime() - event.startAt.getTime()) / 60_000)))
}

export function googleCalendarPayload(input: { title: string; notes: string | null; startAt: Date; durationMinutes: number }) {
  const endAt = new Date(input.startAt.getTime() + Math.max(1, input.durationMinutes) * 60_000)
  return {
    summary: input.title,
    description: input.notes || undefined,
    start: { dateTime: input.startAt.toISOString() },
    end: { dateTime: endAt.toISOString() },
  }
}

export function microsoftCalendarPayload(input: { title: string; notes: string | null; startAt: Date; durationMinutes: number }) {
  const endAt = new Date(input.startAt.getTime() + Math.max(1, input.durationMinutes) * 60_000)
  const graphDate = (date: Date) => date.toISOString().replace(/Z$/, "")
  return {
    subject: input.title,
    body: { contentType: "text", content: input.notes || "" },
    start: { dateTime: graphDate(input.startAt), timeZone: "UTC" },
    end: { dateTime: graphDate(endAt), timeZone: "UTC" },
  }
}
