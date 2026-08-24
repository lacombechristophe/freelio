import { describe, expect, it } from "vitest"

import { renderDeliveryNoteHtml } from "@/lib/pdf/delivery-render"

describe("delivery note renderer", () => {
  it("renders delivered lines and the sealed recipient proof", () => {
    const html = renderDeliveryNoteHtml({
      number: "BL-2026-0042",
      status: "SIGNED",
      deliveredAt: new Date("2026-08-24T08:00:00.000Z"),
      recipientName: "Camille Martin",
      signedAt: new Date("2026-08-24T08:05:00.000Z"),
      signatureSha256: "c".repeat(64),
      company: { name: "Entreprise QA", brandColor: "#173B64" },
      client: { name: "Famille <Martin>" },
      order: { number: "CMD-2026-0012" },
      site: { label: "Bassin", address1: "2 rue du Bassin", postalCode: "44000", city: "Nantes" },
      lines: [{ label: "Couverture sur mesure", quantity: 1.5 }],
    })
    expect(html).toContain("BL-2026-0042")
    expect(html).toContain("CMD-2026-0012")
    expect(html).toContain("Couverture sur mesure")
    expect(html).toContain("Camille Martin")
    expect(html).toContain("c".repeat(64))
    expect(html).toContain("Famille &lt;Martin&gt;")
    expect(html).not.toContain("Famille <Martin>")
  })
})
