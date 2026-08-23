import { describe, expect, it } from "vitest"

import {
  associationIds,
  classifySourceObject,
  clientCandidate,
  contactCandidate,
  equipmentCandidate,
  invoiceCandidate,
  opportunityCandidate,
  paymentCandidate,
  productCandidate,
  stockMovementCandidate,
} from "@/lib/migrations/normalize"

describe("migration normalization", () => {
  it("classifies HubSpot and French Extrabat exports", () => {
    expect(classifySourceObject("companies")).toBe("CLIENT")
    expect(classifySourceObject("export_clients_2026")).toBe("CLIENT")
    expect(classifySourceObject("contacts")).toBe("CONTACT")
    expect(classifySourceObject("deals")).toBe("OPPORTUNITY")
    expect(classifySourceObject("leads")).toBe("OPPORTUNITY")
    expect(classifySourceObject("appels_activities")).toBe("ACTIVITY")
    expect(classifySourceObject("communications")).toBe("ACTIVITY")
    expect(classifySourceObject("export_fournisseurs_2026")).toBe("SUPPLIER")
    expect(classifySourceObject("articles")).toBe("PRODUCT")
    expect(classifySourceObject("chantiers")).toBe("PROJECT")
    expect(classifySourceObject("dossiers_sav")).toBe("TICKET")
    expect(classifySourceObject("articles_installes")).toBe("EQUIPMENT")
    expect(classifySourceObject("commandes_fournisseurs")).toBe("PURCHASE_ORDER")
    expect(classifySourceObject("mouvements_stock")).toBe("STOCK_MOVEMENT")
    expect(classifySourceObject("factures")).toBe("INVOICE")
    expect(classifySourceObject("reglements_clients")).toBe("PAYMENT")
  })

  it("normalizes operational products, equipment and signed stock quantities", () => {
    const product = productCandidate({ Référence: "CS-42", Désignation: "Coverseal", "Prix achat": "8 500,00 €", "Prix vente": "12 900 €" }, "fallback")
    const equipment = equipmentCandidate({ Désignation: "Couverture Martin", Fabricant: "Coverseal", "Numéro série": "SER-001", "Date pose": "2026-07-14" })
    const movement = stockMovementCandidate({ Type: "Sortie chantier", Quantité: "3", Date: "2026-08-01" })

    expect(product).toMatchObject({ sku: "CS-42", label: "Coverseal", purchasePriceCents: 850_000, salePriceCents: 1_290_000 })
    expect(equipment).toMatchObject({ label: "Couverture Martin", manufacturer: "Coverseal", serialNumber: "SER-001" })
    expect(equipment.installedAt?.toISOString().slice(0, 10)).toBe("2026-07-14")
    expect(movement).toMatchObject({ type: "OUT", quantity: -3 })
  })

  it("preserves financial totals and payment references", () => {
    const invoice = invoiceCandidate({ Numéro: "FA-42", Objet: "Pose", "Total HT": "10 000 €", "Total TVA": "2 000 €", Statut: "Payée", Échéance: "2026-09-01" }, "fallback")
    const payment = paymentCandidate({ Montant: "12 000 €", "Date règlement": "2026-08-15", "Mode règlement": "Virement", Référence: "VIR-42" })

    expect(invoice).toMatchObject({ number: "FA-42", totalHtCents: 1_000_000, totalTvaCents: 200_000, totalTtcCents: 1_200_000, status: "PAID" })
    expect(payment).toMatchObject({ amountCents: 1_200_000, method: "Virement", reference: "VIR-42" })
  })

  it("maps common French client and contact fields without dropping the source", () => {
    const payload = { "Raison sociale": "Diskoov", Adresse: "1 rue Test", "Code postal": "44000", Ville: "Nantes", Prénom: "Alice", Email: "alice@example.com" }
    const client = clientCandidate(payload)
    const contact = contactCandidate(payload)

    expect(client).toMatchObject({ name: "Diskoov", type: "ENTERPRISE", address: "1 rue Test, 44000 Nantes" })
    expect(contact).toMatchObject({ firstName: "Alice", email: "alice@example.com" })
    expect(client.customFields).toBe(payload)
  })

  it("normalizes deal amounts, probability and nested associations", () => {
    const payload = {
      dealname: "Piscine Martin",
      amount: "12 345,67 €",
      hs_deal_stage_probability: "0.75",
      associations: { companies: { results: [{ id: "123" }] }, contacts: { results: [{ id: "456" }] } },
    }
    const opportunity = opportunityCandidate(payload)

    expect(opportunity.valueCents).toBe(1_234_567)
    expect(opportunity.probability).toBe(75)
    expect(associationIds(payload, "company")).toEqual(["123"])
    expect(associationIds(payload, "contact")).toEqual(["456"])
  })
})
