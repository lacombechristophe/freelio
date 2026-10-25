import { createDatabaseClient } from "@/lib/database-client"
import { expect, test } from "@playwright/test"
import { hashPassword } from "../../src/lib/auth/password-core"
import { createOperationsDashboardFixture } from "../helpers/operations-dashboard-fixture"

test("site and equipment directories exclude foreign relations, including searched records and counters", async ({ page }, info) => {
  if (process.env.RECIPE_ISOLATED !== "true" || !process.env.DATABASE_URL?.startsWith("file:") || process.env.PLAYWRIGHT_BASE_URL || !["desktop", "mobile"].includes(info.project.name)) throw new Error("La recette des annuaires Sites et parc exige une SQLite fictive isolée")
  const database = createDatabaseClient()
  const fixture = await createOperationsDashboardFixture(database)
  try {
    const password = process.env.E2E_USER_PASSWORD || "RecetteSolide2026"
    await database.user.update({ where: { id: fixture.user.id }, data: { emailVerified: new Date(), passwordHash: await hashPassword(password) } })
    await database.saasSubscription.create({ data: { companyId: fixture.companyId, plan: "RESEAU", status: "ACTIVE", seatQuantity: 30 } })
    const foreignAgencySite = await database.customerSite.create({ data: { companyId: fixture.companyId, clientId: fixture.site.clientId,
      agencyId: fixture.foreignAgency.id, label: "Fictional incoherent agency site", address1: "Fictional address" } })
    await database.equipment.create({ data: { companyId: fixture.companyId, siteId: foreignAgencySite.id, label: "Fictional incoherent agency equipment" } })
    const errors: string[] = []
    page.on("pageerror", error => errors.push(error.message))
    await page.context().clearCookies()
    await page.goto("/auth/login")
    await page.getByLabel("Adresse e-mail professionnelle").fill(fixture.user.email!)
    await page.getByLabel("Mot de passe", { exact: true }).fill(password)
    await page.getByRole("button", { name: "Se connecter", exact: true }).click()
    await page.waitForURL(url => url.pathname === "/dashboard", { timeout: 60_000 })
    const before = await fixture.snapshot()
    for (const role of ["OWNER", "TECHNICIAN"]) {
      await database.membership.update({ where: { id: fixture.member.id }, data: { role } })
      await page.goto("/dashboard/operations?tab=assets")
      const sites = page.getByRole("region", { name: "Sites clients", exact: true })
      const equipment = page.getByRole("region", { name: "Parc installé", exact: true })
      const siteRow = sites.getByText(`Fictional permitted client · ${fixture.site.label}`, { exact: true }).locator("..").locator("..")
      await expect(siteRow.getByText("2 équip.", { exact: true })).toBeVisible()
      await expect(equipment.getByRole("link", { name: "Fictional permitted equipment", exact: false })).toBeVisible()
      await expect(equipment.getByText("Fictional foreign product equipment", { exact: true })).toHaveCount(0)
      await sites.getByRole("textbox", { name: "Rechercher un site", exact: true }).fill("incoherent agency site")
      await expect(sites.getByRole("status")).toHaveText("0 résultats")
      await equipment.getByRole("textbox", { name: "Rechercher un équipement", exact: true }).fill("foreign product equipment")
      await expect(equipment.getByRole("status")).toHaveText("0 résultats")
      await equipment.getByRole("textbox", { name: "Rechercher un équipement", exact: true }).fill("incoherent agency equipment")
      await expect(equipment.getByRole("status")).toHaveText("0 résultats")
    }
    expect(await fixture.snapshot()).toEqual(before)
    expect(errors).toEqual([])
  } finally {
    await fixture.cleanup()
    await database.$disconnect()
  }
})
