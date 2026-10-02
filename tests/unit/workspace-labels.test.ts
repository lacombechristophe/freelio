import { describe, expect, it } from "vitest"
import { workspaceStatusLabel } from "@/lib/workspace-labels"
import { titleForPath } from "@/components/layout/route-titles"

describe("French workspace labels", () => {
  it.each([
    ["NEW", "Nouveau"], ["TODO", "À faire"], ["DRAFT", "Brouillon"],
    ["ACTIVE", "En cours"], ["WAITING_PARTS", "En attente de pièces"],
    ["SENT", "Envoyé"], ["WON", "Gagné"],
  ])("translates %s for display", (code, label) => {
    expect(workspaceStatusLabel(code)).toBe(label)
  })

  it("preserves custom business labels and already translated values", () => {
    expect(workspaceStatusLabel("Visite technique validée")).toBe("Visite technique validée")
    expect(workspaceStatusLabel("À relancer")).toBe("À relancer")
  })

  it("keeps the technical route while translating its title", () => {
    expect(titleForPath("/dashboard/pipeline")).toBe("Cycle de vente")
  })
})
