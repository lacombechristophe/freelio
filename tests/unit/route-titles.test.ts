import { describe, expect, it } from "vitest"

import { documentTitleForPath, titleForPath } from "@/components/layout/route-titles"

describe("dashboard document titles", () => {
  it("returns the dedicated title for a static route", () => {
    expect(titleForPath("/dashboard/automatisations")).toBe("Automatisations & e-mails")
  })

  it("returns the family title for a dynamic business record", () => {
    expect(titleForPath("/dashboard/operations/fournisseurs/supplier-1")).toBe("Fiche fournisseur")
    expect(titleForPath("/dashboard/service/tickets/ticket-1")).toBe("Détail du ticket SAV")
  })

  it("uses a neutral fallback for an unknown workspace route", () => {
    expect(titleForPath("/dashboard/route-future")).toBe("Espace de travail")
  })

  it("puts the business record first in a contextual browser title", () => {
    expect(documentTitleForPath("/dashboard/clients/client-1", "  Résidence du Lac  ")).toBe(
      "Résidence du Lac · Fiche client | Freelio",
    )
    expect(documentTitleForPath("/dashboard/clients", "Clients")).toBe("Clients | Freelio")
  })
})
