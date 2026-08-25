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
    }
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
