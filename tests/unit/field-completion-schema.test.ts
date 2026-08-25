import { describe, expect, it } from "vitest"

import { interventionCompletionSchema } from "@/lib/field/completion-schema"

const signature = `data:image/png;base64,${"A".repeat(120)}`
const base = {
  interventionId: "cm12345678901234567890123",
  report: "Intervention terminée et contrôlée.",
  laborMinutes: 75,
  customerName: "Camille Martin",
  customerApproval: true,
  customerSignatureData: signature,
}

describe("field completion payload", () => {
  it("accepts an atomic field report with stock, expense and reservation", () => {
    const parsed = interventionCompletionSchema.parse({
      ...base,
      materials: [{ warehouseId: "cm12345678901234567890124", productId: "cm12345678901234567890125", quantity: 2 }],
      expenses: [{ sourceId: "00000000-0000-4000-8000-000000000001", label: "Péage", category: "TOLL", amountCents: 1250, tvaCents: 0 }],
      reservations: [{ sourceId: "00000000-0000-4000-8000-000000000002", title: "Réglage fin", severity: "MINOR" }],
    })
    expect(parsed.materials[0].quantity).toBe(2)
    expect(parsed.expenses[0].notes).toBeNull()
    expect(parsed.reservations[0].severity).toBe("MINOR")
  })

  it("requires a real PNG data URL and explicit customer approval", () => {
    expect(interventionCompletionSchema.safeParse({ ...base, customerSignatureData: "signature texte" }).success).toBe(false)
    expect(interventionCompletionSchema.safeParse({ ...base, customerApproval: false }).success).toBe(false)
  })

  it("rejects duplicate material lines and inconsistent VAT", () => {
    const material = { warehouseId: "cm12345678901234567890124", productId: "cm12345678901234567890125", quantity: 1 }
    expect(interventionCompletionSchema.safeParse({ ...base, materials: [material, material] }).success).toBe(false)
    expect(interventionCompletionSchema.safeParse({ ...base, expenses: [{ sourceId: "00000000-0000-4000-8000-000000000001", label: "Parking", category: "PARKING", amountCents: 500, tvaCents: 600 }] }).success).toBe(false)
  })
})
