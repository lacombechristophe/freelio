import { describe, expect, it } from "vitest"

import { normalizeEmailAddress, resendSuppressionReason } from "@/lib/communications/suppressions"

describe("email suppression policy", () => {
  it("normalizes mailbox identity before enforcing suppression", () => {
    expect(normalizeEmailAddress("  CLIENT@Example.FR ")).toBe("client@example.fr")
  })

  it.each([
    ["email.complained", undefined, "COMPLAINT"],
    ["email.suppressed", undefined, "PROVIDER_SUPPRESSION"],
    ["email.bounced", "Permanent", "PERMANENT_BOUNCE"],
    ["email.bounced", "Transient", null],
    ["email.failed", undefined, null],
  ])("classifies %s / %s", (type, bounceType, expected) => {
    expect(resendSuppressionReason({ type, data: bounceType ? { bounce: { type: bounceType } } : undefined })).toBe(expected)
  })
})
