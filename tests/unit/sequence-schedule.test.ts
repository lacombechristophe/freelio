import { describe, expect, it } from "vitest"

import { nextSequenceExecution, sequenceTimezoneIsValid } from "@/lib/automations/schedule"

const schedule = { businessDaysOnly: true, sendWindowStart: 8, sendWindowEnd: 18, timezone: "UTC" }

describe("nextSequenceExecution", () => {
  it("keeps a due time inside the weekday window", () => {
    expect(nextSequenceExecution(new Date("2026-08-27T09:30:00.000Z"), 2, schedule).toISOString()).toBe("2026-08-27T11:30:00.000Z")
  })

  it("moves an evening due time to the next opening", () => {
    expect(nextSequenceExecution(new Date("2026-08-27T17:45:00.000Z"), 1, schedule).toISOString()).toBe("2026-08-28T08:00:00.000Z")
  })

  it("skips the weekend", () => {
    expect(nextSequenceExecution(new Date("2026-08-28T17:30:00.000Z"), 1, schedule).toISOString()).toBe("2026-08-31T08:00:00.000Z")
  })

  it("allows weekends when configured", () => {
    expect(nextSequenceExecution(new Date("2026-08-28T17:30:00.000Z"), 1, { ...schedule, businessDaysOnly: false }).toISOString()).toBe("2026-08-29T08:00:00.000Z")
  })
})

describe("sequenceTimezoneIsValid", () => {
  it("validates IANA timezones", () => {
    expect(sequenceTimezoneIsValid("Europe/Paris")).toBe(true)
    expect(sequenceTimezoneIsValid("Invalid/Timezone")).toBe(false)
  })
})

