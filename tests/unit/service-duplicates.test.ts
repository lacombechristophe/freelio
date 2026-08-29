import { describe, expect, it } from "vitest"

import { normalizeServiceDuplicateText, scoreServiceDuplicate, serviceTextSimilarity } from "@/lib/operations/service-duplicates"

const base = {
  id: "ticket-a",
  clientId: "client-a",
  siteId: "site-a",
  equipmentId: "equipment-a",
  title: "Pompe en panne",
  description: "La pompe fait du bruit puis se coupe.",
  type: "SAV",
  requestedAt: new Date("2026-08-29T08:00:00Z"),
}

describe("service duplicate detection", () => {
  it("normalizes accents, punctuation and spacing", () => {
    expect(normalizeServiceDuplicateText("  Problème d’ÉTANCHÉITÉ ! ")).toBe("probleme d etancheite")
  })

  it("compares meaningful tokens instead of word order", () => {
    expect(serviceTextSimilarity("Pompe bruyante qui se coupe", "La pompe se coupe, bruit important")).toBeGreaterThan(0.35)
  })

  it("flags a repeated request for the same equipment", () => {
    const result = scoreServiceDuplicate(base, {
      ...base,
      id: "ticket-b",
      title: "Bruit pompe puis arrêt",
      requestedAt: new Date("2026-08-29T12:00:00Z"),
    })
    expect(result?.score).toBeGreaterThanOrEqual(75)
    expect(result?.reasons).toContain("même équipement")
  })

  it("flags an identical request even without a known site or equipment", () => {
    const result = scoreServiceDuplicate(
      { ...base, siteId: null, equipmentId: null },
      { ...base, id: "ticket-b", siteId: null, equipmentId: null, requestedAt: new Date("2026-08-29T18:00:00Z") },
    )
    expect(result?.score).toBeGreaterThanOrEqual(60)
  })

  it("does not compare tickets from different clients", () => {
    expect(scoreServiceDuplicate(base, { ...base, id: "ticket-b", clientId: "client-b" })).toBeNull()
  })

  it("does not flag unrelated requests that merely share a client", () => {
    expect(scoreServiceDuplicate(base, {
      ...base,
      id: "ticket-b",
      siteId: "site-b",
      equipmentId: "equipment-b",
      title: "Question sur une facture",
      description: "Le montant du solde doit être expliqué.",
      type: "QUESTION",
      requestedAt: new Date("2026-07-01T08:00:00Z"),
    })).toBeNull()
  })
})
