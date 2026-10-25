import { createDatabaseClient } from "@/lib/database-client"
import { expect, test } from "@playwright/test"

const database = createDatabaseClient()
test.afterAll(async () => { await database.$disconnect() })
test("Compiled model badges count only coherent projects in the accessible agencies", async ({ page }, info) => {
  if (process.env.RECIPE_ISOLATED !== "true" || !process.env.DATABASE_URL?.startsWith("file:") || process.env.PLAYWRIGHT_BASE_URL || !["desktop", "mobile"].includes(info.project.name)) throw new Error("La recette du compteur exige une SQLite fictive isolée")
  const errors: string[] = []
  page.on("pageerror", error => errors.push(error.message))
  for (const [role, count] of [["operations", 1], ["owner", 3]] as const) {
    await page.context().clearCookies(); await page.goto("/auth/login")
    await page.getByLabel("Adresse e-mail professionnelle").fill(`template-count-${role}-${info.project.name}@example.test`)
    await page.getByLabel("Mot de passe", { exact: true }).fill(process.env.E2E_USER_PASSWORD || "RecetteSolide2026")
    await page.getByRole("button", { name: "Se connecter", exact: true }).click()
    await page.waitForURL(url => url.pathname === "/dashboard", { timeout: 60_000 })
    await page.goto("/dashboard/projets")
    await page.getByRole("button", { name: "Modèles", exact: true }).click()
    const dialog = page.getByRole("dialog")
    await expect(dialog.getByText("SCOPED-TEMPLATE-COUNT", { exact: true })).toBeVisible()
    await expect(dialog.getByText(`1 étape · 30 j · ${count} chantier${count > 1 ? "s" : ""}`, { exact: true })).toBeVisible()
    await expect(dialog.getByText("1. Fictional preserved model step", { exact: true })).toBeVisible()
  }
  expect(await database.project.count({ where: { projectTemplateId: `cprojecttemplatecount${info.project.name}` } })).toBe(6)
  expect(errors).toEqual([])
})
