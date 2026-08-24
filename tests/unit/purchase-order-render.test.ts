import { describe, expect, it } from "vitest"

import { renderPurchaseOrderHtml } from "@/lib/pdf/purchase-order-render"

describe("purchase order renderer", () => {
  it("renders escaped supplier data, approval and totals", () => {
    const html = renderPurchaseOrderHtml({ number: "ACH-2026-001", status: "APPROVED", orderDate: new Date("2026-08-24T10:00:00Z"), expectedAt: new Date("2026-09-01T10:00:00Z"), totalHtCents: 12_000, company: { name: "Entreprise QA" }, supplier: { name: "Usine <QA>" }, approver: "Direction QA", approvedAt: new Date("2026-08-24T11:00:00Z"), lines: [{ label: "Composant & pose", quantity: 2, receivedQuantity: 0, creditedQuantity: 0, unitPriceCents: 6_000 }] })
    expect(html).toContain("ACH-2026-001")
    expect(html).toContain("Usine &lt;QA&gt;")
    expect(html).toContain("Composant &amp; pose")
    expect(html).toContain("120,00 €")
    expect(html).toContain("Direction QA")
    expect(html).toContain("Approuvée")
    expect(html).not.toContain(">APPROVED<")
  })
})
