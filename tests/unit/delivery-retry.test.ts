import { describe, expect, it } from "vitest"

import { nextDeliveryRetry } from "@/lib/automations/delivery-retry"

describe("delivery retry policy", () => {
  const now = new Date("2026-09-04T08:00:00.000Z")

  it.each([
    [1, "2026-09-04T08:05:00.000Z"],
    [2, "2026-09-04T08:15:00.000Z"],
    [3, "2026-09-04T09:00:00.000Z"],
    [4, "2026-09-04T14:00:00.000Z"],
  ])("backs off attempt %i", (attempts, expected) => {
    expect(nextDeliveryRetry({ attempts, maxAttempts: 5, now })).toEqual({ deadLetter: false, nextAttemptAt: new Date(expected) })
  })

  it("dead-letters the delivery at the configured limit", () => {
    expect(nextDeliveryRetry({ attempts: 5, maxAttempts: 5, now })).toEqual({ deadLetter: true, nextAttemptAt: null })
  })
})
