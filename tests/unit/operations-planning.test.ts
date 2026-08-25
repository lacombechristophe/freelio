import { describe, expect, it } from "vitest"

import { haversineKm, planningEnd, planningSlotsOverlap, routeDistanceKm } from "@/lib/operations/planning"

describe("field planning", () => {
  it("assumes one hour when an intervention has no planned end", () => {
    expect(planningEnd({ scheduledStart: "2026-08-25T08:00:00.000Z", scheduledEnd: null }).toISOString()).toBe("2026-08-25T09:00:00.000Z")
  })

  it("detects overlaps but accepts adjacent interventions", () => {
    const first = { scheduledStart: "2026-08-25T08:00:00.000Z", scheduledEnd: "2026-08-25T09:30:00.000Z" }
    expect(planningSlotsOverlap(first, { scheduledStart: "2026-08-25T09:00:00.000Z", scheduledEnd: "2026-08-25T10:00:00.000Z" })).toBe(true)
    expect(planningSlotsOverlap(first, { scheduledStart: "2026-08-25T09:30:00.000Z", scheduledEnd: null })).toBe(false)
  })

  it("computes route distance only for geolocated consecutive legs", () => {
    const paris = { latitude: 48.8566, longitude: 2.3522 }
    const lyon = { latitude: 45.764, longitude: 4.8357 }
    const distance = haversineKm(paris, lyon)
    expect(distance).not.toBeNull()
    expect(distance!).toBeGreaterThan(390)
    expect(distance!).toBeLessThan(410)
    expect(routeDistanceKm([paris, lyon, { latitude: null, longitude: null }])).toMatchObject({ measuredLegs: 1, totalLegs: 2 })
  })
})
