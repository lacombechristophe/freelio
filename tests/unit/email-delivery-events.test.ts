import { describe, expect, it } from "vitest"

import { emailDeliveryStatusForEvent, emailEventCanReplaceAtSameTime, emailEventUpdateGuard } from "@/lib/communications/delivery-events"

describe("email delivery event ordering", () => {
  it("maps provider events to persisted states", () => {
    expect(emailDeliveryStatusForEvent("email.delivered")).toBe("DELIVERED")
    expect(emailDeliveryStatusForEvent("email.complained")).toBe("COMPLAINED")
    expect(emailDeliveryStatusForEvent("unknown")).toBeUndefined()
  })

  it("does not downgrade equal-timestamp engagement events", () => {
    expect(emailEventCanReplaceAtSameTime("CLICKED", "SENT")).toBe(false)
    expect(emailEventCanReplaceAtSameTime("OPENED", "DELIVERED")).toBe(false)
    expect(emailEventCanReplaceAtSameTime("SENT", "DELIVERED")).toBe(true)
    expect(emailEventCanReplaceAtSameTime("CLICKED", "COMPLAINED")).toBe(true)
  })

  it("guards against late provider events that would regress the final state", () => {
    const occurredAt = new Date("2026-09-04T08:00:00.000Z")
    const clickedGuard = emailEventUpdateGuard("CLICKED", occurredAt)
    const deliveredGuard = emailEventUpdateGuard("DELIVERED", occurredAt)

    const clickedReplaceable = clickedGuard.AND[0].status?.in ?? []
    const deliveredReplaceable = deliveredGuard.AND[0].status?.in ?? []
    expect(clickedReplaceable).toContain("OPENED")
    expect(deliveredReplaceable).not.toContain("CLICKED")
    expect(deliveredReplaceable).not.toContain("COMPLAINED")
  })
})
