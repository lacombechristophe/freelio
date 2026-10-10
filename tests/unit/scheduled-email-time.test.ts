import { describe, expect, it } from "vitest"
import { scheduledEmailInstant, scheduledEmailLocalTime } from "@/lib/communications/scheduled-time"

describe("explicit local time for scheduled email", () => {
  const now = new Date("2026-01-01T00:00:00Z")
  it.each([
    ["2026-02-01T10:30", "Europe/Paris", "2026-02-01T09:30:00.000Z"],
    ["2026-07-01T10:30", "Europe/Paris", "2026-07-01T08:30:00.000Z"],
    ["2026-07-01T10:30", "Asia/Kathmandu", "2026-07-01T04:45:00.000Z"],
    ["2026-07-01T10:30", "UTC", "2026-07-01T10:30:00.000Z"],
  ])("resolves %s in %s independently of the process timezone", (localDateTime, timezone, expected) => {
    expect(scheduledEmailInstant({ localDateTime, timezone }, now).toISOString()).toBe(expected)
    expect(scheduledEmailLocalTime(expected, timezone)).toBe(localDateTime)
  })
  it.each([
    ["2026-03-29T02:30", "Europe/Paris"],
    ["2026-10-25T02:30", "Europe/Paris"],
    ["2026-04-05T01:45", "Australia/Lord_Howe"],
    ["2026-10-04T02:15", "Australia/Lord_Howe"],
  ])("refuses nonexistent or repeated wall time %s in %s instead of choosing silently", (localDateTime, timezone) => {
    expect(() => scheduledEmailInstant({ localDateTime, timezone }, now)).toThrow("inexistante ou ambiguë")
  })
  it("refuses invalid dates/zones, past or less-than-a-minute times, and more than a year", () => {
    for (const localDateTime of ["2026-02-30T10:30", "2026-01-01T00:00", "2025-12-31T23:59", "2028-01-01T10:30"]) {
      expect(() => scheduledEmailInstant({ localDateTime, timezone: "UTC" }, now)).toThrow()
    }
    expect(() => scheduledEmailInstant({ localDateTime: "2026-02-01T10:30", timezone: "invalid/zone" }, now)).toThrow("Fuseau")
    expect(scheduledEmailInstant({ localDateTime: "2026-01-01T00:01", timezone: "UTC" }, now).toISOString()).toBe("2026-01-01T00:01:00.000Z")
  })
})
