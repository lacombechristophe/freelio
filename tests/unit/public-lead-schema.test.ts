import { describe, expect, it } from "vitest"

import { normalizePhone, publicLeadSchema } from "@/lib/leads/schema"

describe("public lead schema", () => {
  it("accepts JSON and HTML checkbox values while normalizing identity", () => {
    const lead = publicLeadSchema.parse({
      firstName: "  Alice ",
      lastName: " Martin ",
      email: " ALICE@EXAMPLE.COM ",
      privacyAccepted: "on",
      marketingOptIn: "true",
    })

    expect(lead).toMatchObject({
      firstName: "Alice",
      lastName: "Martin",
      email: "alice@example.com",
      privacyAccepted: true,
      marketingOptIn: true,
      source: "WEBSITE",
    })
  })

  it("requires a contact channel and explicit privacy acceptance", () => {
    expect(publicLeadSchema.safeParse({ firstName: "Alice", lastName: "Martin", privacyAccepted: true }).success).toBe(false)
    expect(publicLeadSchema.safeParse({ firstName: "Alice", lastName: "Martin", email: "alice@example.com", privacyAccepted: false }).success).toBe(false)
  })

  it("normalizes common French phone formatting", () => {
    expect(normalizePhone("+33 (0)6 12 34 56 78")).toBe("+33612345678")
    expect(normalizePhone("06 12 34 56 78")).toBe("0612345678")
  })
})
