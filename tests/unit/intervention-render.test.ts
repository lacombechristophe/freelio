import { describe, expect, it } from "vitest"

import { renderInterventionReportHtml } from "@/lib/pdf/intervention-render"

describe("intervention report renderer", () => {
  it("renders the field report, evidence manifest and sealed customer approval", () => {
    const html = renderInterventionReportHtml({
      id: "intervention-12345678",
      title: "Pose & réglages <finals>",
      type: "INSTALLATION",
      status: "COMPLETED",
      scheduledStart: new Date("2026-08-24T08:00:00.000Z"),
      startedAt: new Date("2026-08-24T08:10:00.000Z"),
      completedAt: new Date("2026-08-24T09:25:00.000Z"),
      report: "Essais conformes.\nZone nettoyée.",
      laborMinutes: 75,
      customerName: "Camille Martin",
      signedAt: new Date("2026-08-24T09:25:00.000Z"),
      signatureSha256: "a".repeat(64),
      customerSignatureData: `data:image/png;base64,${"A".repeat(120)}`,
      ticketNumber: "SAV-2026-0042",
      technician: "Technicien terrain",
      company: { name: "Entreprise QA", siret: "12345678900012", brandColor: "#173B64" },
      client: { name: "Famille Martin" },
      site: { label: "Bassin principal", address1: "2 rue du Bassin", postalCode: "44000", city: "Nantes" },
      files: [{ name: "photo-fin.jpg", kind: "PHOTO", size: 1024, sha256: "b".repeat(64) }],
      materials: [{ label: "Joint <premium>", unit: "unité", quantity: 2 }],
      expenses: [{ label: "Péage chantier", category: "TOLL", amountCents: 1250, justified: true }],
      reservations: [{ title: "Réglage de tension", details: "Repasser sous 7 jours", severity: "MAJOR", status: "OPEN" }],
    })

    expect(html).toContain("Rapport d’intervention")
    expect(html).toContain("SAV-2026-0042")
    expect(html).toContain("1 h 15 min")
    expect(html).toContain("photo-fin.jpg")
    expect(html).toContain("Matériel utilisé (1)")
    expect(html).toContain("Joint &lt;premium&gt;")
    expect(html).toContain("Frais terrain (1)")
    expect(html).toContain("12,50")
    expect(html).toContain("Réserves et reprises (1)")
    expect(html).toContain("Signature manuscrite du client")
    expect(html).toContain("Camille Martin")
    expect(html).toContain("a".repeat(64))
    expect(html).not.toContain("<finals>")
    expect(html).toContain("&lt;finals&gt;")
  })
})
