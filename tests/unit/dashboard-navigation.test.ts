import { existsSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

import { dashboardHome, dashboardNavGroups, dashboardUtilityItems, navigationItemIsActive, navigationPath } from "@/components/layout/dashboard-navigation"

describe("dashboard navigation", () => {
  const allItems = [dashboardHome, ...dashboardNavGroups.flatMap((group) => group.items), ...dashboardUtilityItems]

  it("only opens one canonical space for each active route", () => {
    for (const item of allItems.filter((candidate) => candidate.activeMatch !== false)) {
      const pathname = navigationPath(item.href)
      const currentQuery = item.href.split("?")[1] || ""
      const activeGroups = dashboardNavGroups.filter((group) => group.items.some((candidate) => navigationItemIsActive(pathname, candidate, currentQuery)))
      expect(activeGroups.length, `${pathname} has ambiguous spaces`).toBeLessThanOrEqual(1)
      const activeItems = allItems.filter((candidate) => navigationItemIsActive(pathname, candidate, currentQuery))
      expect(activeItems, `${pathname} has ambiguous destinations`).toHaveLength(1)
    }
  })

  it.each([
    ["/dashboard/factures/recurrentes", "Récurrences"],
    ["/dashboard/factures/invoice-123", "Factures"],
    ["/dashboard/comptabilite/banque", "Banque"],
    ["/dashboard/settings/agencies", "Agences & dépôts"],
    ["/dashboard/settings/properties", "Paramètres"],
    ["/dashboard/service/tickets/ticket-123", "Centre de support"],
    ["/dashboard/service/equipements/equipment-123", "Parc installé"],
    ["/dashboard/service/interventions/intervention-123", "Planning"],
    ["/dashboard/operations/achats/order-123", "Achats fournisseurs"],
    ["/dashboard/operations/fournisseurs/supplier-123", "Achats fournisseurs"],
  ])("selects only the most specific destination for %s", (pathname, name) => {
    expect(allItems.filter((item) => navigationItemIsActive(pathname, item)).map((item) => item.name)).toEqual([name])
  })

  it("does not expose links to missing dashboard pages", () => {
    const projectRoot = process.cwd()
    for (const item of allItems) {
      const pathname = navigationPath(item.href)
      const relative = pathname === "/dashboard" ? "" : pathname.replace(/^\/dashboard\/?/, "")
      const pagePath = path.join(projectRoot, "src", "app", "dashboard", relative, "page.tsx")
      expect(existsSync(pagePath), `${item.name} points to missing ${pagePath}`).toBe(true)
    }
  })
})
