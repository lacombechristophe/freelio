import { describe, expect, it } from "vitest"

import {
  calendarDurationMinutes,
  googleCalendarPayload,
  localDateTimeInZone,
  microsoftCalendarPayload,
  parseGoogleCalendarEvent,
  parseMicrosoftCalendarEvent,
} from "@/lib/integrations/calendar-event"

describe("calendar provider normalization", () => {
  it("normalizes a timed Google event", () => {
    const event = parseGoogleCalendarEvent({
      id: "google-1",
      summary: "Visite technique",
      description: "Contrôle du local technique",
      location: "12 rue des Bassins",
      start: { dateTime: "2026-09-02T08:30:00+02:00" },
      end: { dateTime: "2026-09-02T10:00:00+02:00" },
      etag: "etag-1",
    })
    expect(event).toMatchObject({ id: "google-1", title: "Visite technique", cancelled: false })
    expect(event && calendarDurationMinutes(event)).toBe(90)
    expect(event?.startAt.toISOString()).toBe("2026-09-02T06:30:00.000Z")
  })

  it("normalizes Microsoft UTC values without an explicit suffix", () => {
    const event = parseMicrosoftCalendarEvent({
      id: "graph-1",
      subject: "Réunion chantier",
      bodyPreview: "Validation avant pose",
      start: { dateTime: "2026-09-03T12:00:00.0000000", timeZone: "UTC" },
      end: { dateTime: "2026-09-03T13:00:00.0000000", timeZone: "UTC" },
      changeKey: "change-1",
    })
    expect(event).toMatchObject({ id: "graph-1", title: "Réunion chantier", etag: "change-1" })
    expect(event && calendarDurationMinutes(event)).toBe(60)
  })

  it("rejects malformed or inverted events", () => {
    expect(parseGoogleCalendarEvent({ id: "bad", start: { dateTime: "invalid" }, end: { dateTime: "invalid" } })).toBeNull()
    expect(parseMicrosoftCalendarEvent({ id: "bad", start: { dateTime: "2026-09-03T13:00:00Z" }, end: { dateTime: "2026-09-03T12:00:00Z" } })).toBeNull()
  })

  it("builds bounded provider payloads from the same task", () => {
    const input = { title: "Rendez-vous client", notes: "Préparer le devis", startAt: new Date("2026-09-04T08:00:00Z"), durationMinutes: 75 }
    expect(googleCalendarPayload(input)).toEqual({
      summary: "Rendez-vous client",
      description: "Préparer le devis",
      start: { dateTime: "2026-09-04T08:00:00.000Z" },
      end: { dateTime: "2026-09-04T09:15:00.000Z" },
    })
    expect(microsoftCalendarPayload(input)).toMatchObject({
      subject: "Rendez-vous client",
      start: { dateTime: "2026-09-04T08:00:00.000", timeZone: "UTC" },
      end: { dateTime: "2026-09-04T09:15:00.000", timeZone: "UTC" },
    })
  })

  it("converts a French local appointment to UTC across daylight saving time", () => {
    expect(localDateTimeInZone("2026-09-04T09:00", "Europe/Paris")?.toISOString()).toBe("2026-09-04T07:00:00.000Z")
    expect(localDateTimeInZone("2026-12-04T09:00", "Europe/Paris")?.toISOString()).toBe("2026-12-04T08:00:00.000Z")
  })
})
