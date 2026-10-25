import { describe, expect, it } from "vitest"
import { bookingLocalInput, resolveBookingLocalTime } from "@/lib/scheduling/booking-time"

describe("booking wall times are explicit and unambiguous", () => {
  it.each([
    ["2027-01-15T10:00", "Europe/Paris", "2027-01-15T09:00:00.000Z"],
    ["2027-07-15T10:00", "Europe/Paris", "2027-07-15T08:00:00.000Z"],
    ["2028-02-29T10:00", "Asia/Kathmandu", "2028-02-29T04:15:00.000Z"],
    ["2027-01-15T00:00", "Pacific/Chatham", "2027-01-14T10:15:00.000Z"],
  ])("resolves %s in %s and round-trips", (local, zone, expected) => {
    expect(resolveBookingLocalTime(local, zone).date?.toISOString()).toBe(expected)
    expect(bookingLocalInput(expected, zone)).toBe(local)
  })
  it.each(["2027-03-28T02:30", "2027-02-29T10:00", "2027-04-31T10:00", "invalid", "2027-01-01T25:00"])("refuses nonexistent or malformed %s", value => {
    expect(resolveBookingLocalTime(value, "Europe/Paris")).toMatchObject({ date: null, error: expect.any(String) })
  })
  it("refuses a repeated wall time instead of guessing the DST offset", () => {
    expect(resolveBookingLocalTime("2027-10-31T02:30", "Europe/Paris")).toMatchObject({ date: null, error: expect.stringContaining("ambiguë") })
  })
  it("refuses an unknown zone", () => expect(resolveBookingLocalTime("2027-01-15T10:00", "Invalid/Zone").date).toBeNull())
})
