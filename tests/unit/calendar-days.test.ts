import { describe, expect, it } from "vitest"
import { calendarDayKey, calendarPeriods, shiftCalendarDay } from "@/lib/calendar-days"

describe("calendar days and company service periods", () => {
  it("keeps a date-only field separate from an appointment in the service zone", () => {
    const instant = "1999-12-31T23:30:00.000Z"
    expect(calendarDayKey(instant)).toBe("1999-12-31")
    expect(calendarDayKey(instant, "Europe/Paris")).toBe("2000-01-01")
    expect(calendarDayKey(instant, "America/Los_Angeles")).toBe("1999-12-31")
  })

  it.each([
    ["2026-03-29T12:00:00Z", "2026-03-28T23:00:00.000Z", "2026-03-29T22:00:00.000Z", 23],
    ["2026-10-25T12:00:00Z", "2026-10-24T22:00:00.000Z", "2026-10-25T23:00:00.000Z", 25],
  ])("uses real midnight boundaries through the DST transition %s", (now, start, end, hours) => {
    const periods = calendarPeriods(new Date(now), "Europe/Paris")
    expect(periods.todayStart.toISOString()).toBe(start)
    expect(periods.tomorrowStart.toISOString()).toBe(end)
    expect((periods.tomorrowStart.getTime() - periods.todayStart.getTime()) / 3_600_000).toBe(hours)
  })

  it("uses the company's day, month and year near UTC midnight", () => {
    const periods = calendarPeriods(new Date("2026-12-31T23:30:00Z"), "Europe/Paris")
    expect(periods.todayStart.toISOString()).toBe("2026-12-31T23:00:00.000Z")
    expect(periods.weekStart.toISOString()).toBe("2026-12-27T23:00:00.000Z")
    expect(periods.monthStart.toISOString()).toBe("2026-12-31T23:00:00.000Z")
    expect(periods.monthEnd.toISOString()).toBe("2027-01-31T23:00:00.000Z")
    expect(periods.yearEnd.toISOString()).toBe("2027-12-31T23:00:00.000Z")
  })

  it.each([
    ["2026-09-06T12:00:00Z", "America/Santiago", "2026-09-06T04:00:00.000Z", "2026-09-07T03:00:00.000Z", 23],
    ["2026-11-01T12:00:00Z", "America/Havana", "2026-11-01T04:00:00.000Z", "2026-11-02T05:00:00.000Z", 25],
  ])("uses the first instant when midnight is skipped or repeated: %s", (now, zone, start, end, hours) => {
    const periods = calendarPeriods(new Date(now), zone)
    expect(periods.todayStart.toISOString()).toBe(start)
    expect(periods.tomorrowStart.toISOString()).toBe(end)
    expect(calendarDayKey(periods.todayStart, zone)).toBe(calendarDayKey(now, zone))
    expect(calendarDayKey(new Date(periods.todayStart.getTime() - 1), zone)).not.toBe(calendarDayKey(now, zone))
    expect((periods.tomorrowStart.getTime() - periods.todayStart.getTime()) / 3_600_000).toBe(hours)
  })

  it("starts the week on Monday, including a Sunday in a western zone", () => {
    const periods = calendarPeriods(new Date("2026-10-12T00:30:00Z"), "America/Los_Angeles")
    expect(periods.weekStart.toISOString()).toBe("2026-10-05T07:00:00.000Z")
    expect(periods.weekEnd.toISOString()).toBe("2026-10-12T07:00:00.000Z")
  })

  it.each([["2024-02-28", 1, "2024-02-29"], ["2024-02-29", 1, "2024-03-01"], ["2026-12-31", 1, "2027-01-01"]])("advances calendar dates independently of DST: %s", (key, days, expected) => {
    expect(shiftCalendarDay(key, days)).toBe(expected)
  })
})
