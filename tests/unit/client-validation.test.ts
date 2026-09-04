import { describe, expect, it } from "vitest"

import { ClientSchema } from "@/lib/validations"

describe("ClientSchema", () => {
  it("normalizes user-entered identity fields before persistence", () => {
    const client = ClientSchema.parse({
      name: "  Piscines Martin  ",
      type: "ENTERPRISE",
      siret: "123 456 789 00014",
      tvaNumber: "  FR00123456789  ",
      address: "  12 rue du Bassin, 31000 Toulouse  ",
    })

    expect(client).toEqual({
      name: "Piscines Martin",
      type: "ENTERPRISE",
      siret: "12345678900014",
      tvaNumber: "FR00123456789",
      address: "12 rue du Bassin, 31000 Toulouse",
    })
  })

  it("rejects malformed SIRET values without blocking an empty optional value", () => {
    const base = {
      name: "Piscines Martin",
      type: "ENTERPRISE" as const,
      address: "12 rue du Bassin",
    }

    expect(ClientSchema.safeParse({ ...base, siret: "1234" }).success).toBe(false)
    expect(ClientSchema.safeParse({ ...base, siret: "" }).success).toBe(true)
  })
})
