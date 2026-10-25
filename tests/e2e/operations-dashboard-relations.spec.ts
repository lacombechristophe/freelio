import { createDatabaseClient } from "@/lib/database-client"
import { expect, test } from "@playwright/test"
import { hashPassword } from "../../src/lib/auth/password-core"
import { createOperationsDashboardFixture, dashboardCollections } from "../helpers/operations-dashboard-fixture"

test("Operations excludes foreign relations from server payload, cards and nested counters", async ({ page }, info) => {
  if (process.env.RECIPE_ISOLATED !== "true" || !process.env.DATABASE_URL?.startsWith("file:") || process.env.PLAYWRIGHT_BASE_URL || !["desktop", "mobile"].includes(info.project.name)) throw new Error("La recette Opérations exige une SQLite fictive isolée")
  const database = createDatabaseClient()
  const fixture = await createOperationsDashboardFixture(database)
  try {
    const password = process.env.E2E_USER_PASSWORD || "RecetteSolide2026"
    await database.user.update({ where: { id: fixture.user.id }, data: { emailVerified: new Date(), passwordHash: await hashPassword(password) } })
    await database.saasSubscription.create({ data: { companyId: fixture.companyId, plan: "RESEAU", status: "ACTIVE", seatQuantity: 30 } })
    const before = await fixture.snapshot()
    const errors: string[] = []
    page.on("pageerror", error => errors.push(error.message))
    await page.context().clearCookies()
    await page.goto("/auth/login")
    await page.getByLabel("Adresse e-mail professionnelle").fill(fixture.user.email!)
    await page.getByLabel("Mot de passe", { exact: true }).fill(password)
    await page.getByRole("button", { name: "Se connecter", exact: true }).click()
    await page.waitForURL(url => url.pathname === "/dashboard", { timeout: 60_000 })

    for (const role of ["OWNER", "TECHNICIAN"]) {
      await database.membership.update({ where: { id: fixture.member.id }, data: { role } })
      const response = await page.goto("/dashboard/operations")
      expect(response?.status()).toBe(200)
      const payload = await response!.text()
      for (const key of dashboardCollections) expect(payload).toContain(fixture.positive[key])
      for (const id of [...Object.values(fixture.negative), ...fixture.extra.map(row => row.id), fixture.foreignEquipment.id,
        fixture.childIntervention.id, fixture.badTransfer.id, fixture.foreignAgency.id]) expect(payload).not.toContain(id)
      expect(payload).not.toContain("FOREIGN-OPERATIONS-")
      if (role === "TECHNICIAN") {
        expect(payload).not.toContain(fixture.otherSite.id)
        expect(payload).not.toContain(fixture.otherIntervention.id)
      }
      await page.waitForFunction(() => document.documentElement.dataset.appHydrated === "true")
      await expect(page.getByRole("heading", { name: "Centre des opérations", exact: true })).toBeVisible()
      const metric = page.locator(".workspace-metric").filter({ has: page.getByText("SAV ouverts", { exact: true }) })
      await expect(metric.getByText(role === "OWNER" ? "2" : "1", { exact: true })).toBeVisible()
      await page.getByRole("tab", { name: "SAV", exact: true }).click()
      const tickets = page.getByRole("tabpanel", { name: "SAV", exact: true })
      await expect(tickets.getByRole("link", { name: "Fictional permitted ticket", exact: true })).toBeVisible()
      await expect(tickets).toContainText(role === "OWNER" ? "2 interventions" : "1 intervention")
      await expect(tickets).not.toContainText("Fictional foreign assignee ticket")
    }
    expect(await fixture.snapshot()).toEqual(before)
    expect(errors).toEqual([])
  } finally {
    await fixture.cleanup()
    await database.$disconnect()
  }
})
