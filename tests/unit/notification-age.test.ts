import { describe, expect, it, vi } from "vitest"
import { notificationAge } from "@/lib/notification-age"

describe("notification labels use the server render's reference time", () => {
  const created = new Date("2030-01-01T12:00:00Z")
  it.each([
    [59, "à l'instant", "à l'instant"],
    [60, "il y a 1 min", "1min"],
    [3599, "il y a 59 min", "59min"],
    [3600, "il y a 1h", "1h"],
    [86400, "il y a 1j", "1j"],
  ])("retains feed and compact formats at %s seconds", (seconds, feed, compact) => {
    expect(notificationAge(created, created.getTime() + Number(seconds) * 1000)).toBe(feed)
    expect(notificationAge(created, created.getTime() + Number(seconds) * 1000, true)).toBe(compact)
  })
  it("does not consult the receiving browser's clock across a minute boundary", () => {
    const reference = created.getTime() + 59_000
    const clock = vi.spyOn(Date, "now").mockReturnValue(reference + 90_000)
    try { expect(notificationAge(created, reference)).toBe("à l'instant"); expect(clock).not.toHaveBeenCalled() }
    finally { clock.mockRestore() }
  })
  it("retains the server's older-date format", () => {
    expect(notificationAge(created, created.getTime() + 2_592_000_000)).toBe(created.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }))
  })
})
