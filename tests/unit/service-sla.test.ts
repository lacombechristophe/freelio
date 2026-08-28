import { describe, expect, it } from "vitest"

import { addBusinessHours, businessMinutesBetween, serviceFirstResponseTarget, serviceResolutionTarget, serviceSlaPolicy, serviceTargetIsBreached } from "@/lib/operations/service-sla"

const utcPolicy = serviceSlaPolicy({ serviceTimezone: "UTC", serviceDayStart: 8, serviceDayEnd: 18, serviceWorkdays: [1, 2, 3, 4, 5], serviceHolidays: ["2026-08-31"], serviceFirstResponseHours: { URGENT: 1, HIGH: 4, NORMAL: 8, LOW: 16 }, serviceResolutionHours: { URGENT: 4, HIGH: 16, NORMAL: 40, LOW: 80 } })

describe("addBusinessHours", () => {
  it("carries work across the evening and skips weekends and holidays", () => {
    expect(addBusinessHours(new Date("2026-08-28T16:00:00.000Z"), 4, utcPolicy).toISOString()).toBe("2026-09-01T10:00:00.000Z")
  })

  it("starts the clock at the next opening", () => {
    expect(addBusinessHours(new Date("2026-08-29T10:00:00.000Z"), 1, utcPolicy).toISOString()).toBe("2026-09-01T09:00:00.000Z")
  })

  it("does not overshoot an opening when the request arrives between time slots", () => {
    expect(addBusinessHours(new Date("2026-08-27T07:53:00.000Z"), 1, utcPolicy).toISOString()).toBe("2026-08-27T09:00:00.000Z")
  })

  it("counts only open minutes while a ticket is waiting", () => {
    expect(businessMinutesBetween(new Date("2026-08-28T17:00:00.000Z"), new Date("2026-09-01T09:00:00.000Z"), utcPolicy)).toBe(120)
  })
})

describe("service SLA targets", () => {
  const requestedAt = new Date("2026-08-27T08:00:00.000Z")

  it("uses separate first-response and resolution objectives", () => {
    expect(serviceFirstResponseTarget({ requestedAt, priority: "HIGH" }, utcPolicy).targetAt.toISOString()).toBe("2026-08-27T12:00:00.000Z")
    expect(serviceResolutionTarget({ requestedAt, priority: "HIGH" }, utcPolicy).targetAt.toISOString()).toBe("2026-08-28T14:00:00.000Z")
  })

  it("prefers an explicit resolution due date", () => {
    const dueAt = new Date("2026-09-05T12:00:00.000Z")
    expect(serviceResolutionTarget({ requestedAt, dueAt, priority: "URGENT" }, utcPolicy)).toEqual({ targetAt: dueAt, source: "CUSTOM" })
  })

  it("extends targets while waiting on the customer", () => {
    const now = new Date("2026-08-27T12:00:00.000Z")
    const target = serviceResolutionTarget({ requestedAt, priority: "URGENT", pausedMinutes: 30, waitingSince: new Date("2026-08-27T11:00:00.000Z") }, utcPolicy, now)
    expect(target.targetAt.toISOString()).toBe("2026-08-27T13:30:00.000Z")
  })
})

describe("serviceTargetIsBreached", () => {
  const targetAt = new Date("2026-08-27T10:00:00.000Z")
  const now = new Date("2026-08-27T11:00:00.000Z")
  it("flags an active objective without completion", () => expect(serviceTargetIsBreached({ targetAt, status: "OPEN", now })).toBe(true))
  it("does not flag a completed first response", () => expect(serviceTargetIsBreached({ targetAt, status: "OPEN", completedAt: new Date("2026-08-27T09:00:00.000Z"), now })).toBe(false))
  it.each(["RESOLVED", "CLOSED"])("does not flag %s tickets", (status) => expect(serviceTargetIsBreached({ targetAt, status, now })).toBe(false))
})
