import { describe, expect, it } from "vitest"

import { serviceResolutionTarget, serviceTargetIsBreached } from "@/lib/operations/service-sla"

describe("serviceResolutionTarget", () => {
  const requestedAt = new Date("2026-08-26T08:00:00.000Z")

  it.each([["URGENT", 4], ["HIGH", 24], ["NORMAL", 72], ["LOW", 120]])("applies the %s resolution target", (priority, hours) => {
    const result = serviceResolutionTarget({ requestedAt, priority })
    expect(result.source).toBe("DEFAULT")
    expect(result.targetAt.toISOString()).toBe(new Date(requestedAt.getTime() + hours * 3_600_000).toISOString())
  })

  it("prefers the explicit ticket due date", () => {
    const dueAt = new Date("2026-08-30T12:00:00.000Z")
    expect(serviceResolutionTarget({ requestedAt, dueAt, priority: "URGENT" })).toEqual({ targetAt: dueAt, source: "CUSTOM" })
  })
})

describe("serviceTargetIsBreached", () => {
  const targetAt = new Date("2026-08-26T10:00:00.000Z")
  const now = new Date("2026-08-26T11:00:00.000Z")

  it("flags active tickets after their target", () => expect(serviceTargetIsBreached({ targetAt, status: "OPEN", now })).toBe(true))
  it.each(["RESOLVED", "CLOSED"])("does not flag %s tickets", (status) => expect(serviceTargetIsBreached({ targetAt, status, now })).toBe(false))
})
