import { expect, test } from "@playwright/test"

test.use({ timezoneId: "America/Los_Angeles" })
let clientErrors: string[] = []

test.beforeEach(async ({ page }, info) => {
  clientErrors = []
  page.on("pageerror", error => clientErrors.push(error.message))
  page.on("console", message => { if (message.type() === "error" && /hydration|did not match|server rendered html/i.test(message.text())) clientErrors.push(message.text()) })
  await page.context().clearCookies()
  await page.goto("/auth/login")
  await page.getByLabel("Adresse e-mail professionnelle").fill(`expense-directory-${info.project.name}@example.test`)
  await page.getByLabel("Mot de passe", { exact: true }).fill(process.env.E2E_USER_PASSWORD || "RecetteSolide2026")
  await page.getByRole("button", { name: "Se connecter", exact: true }).click()
  await page.waitForURL(url => url.pathname === "/dashboard", { timeout: 60_000 })
  const response = await page.goto("/dashboard/depenses")
  expect(response?.status()).toBe(200)
  expect(await response!.text()).toContain("149,00")
})

test.afterEach(() => { expect(clientErrors).toEqual([]) })

test("Expense history reaches the older row and keeps complete cards across pages and searches", async ({ page }) => {
  const monthly = page.locator('[data-slot="card"]').filter({ hasText: "Total Mois" })
  const missing = page.locator('[data-slot="card"]').filter({ hasText: "À Justifier" })
  await expect(monthly).toContainText("149,00")
  await expect(missing).toContainText("51")
  await expect(page.getByText("51 résultats", { exact: true })).toBeVisible()
  await expect(page.getByRole("row")).toHaveCount(26)
  await page.getByRole("button", { name: "Page suivante", exact: true }).click()
  await expect(page.getByText("Page 2 sur 3", { exact: true })).toBeVisible()
  await expect(page.getByRole("row")).toHaveCount(26)
  await page.getByRole("button", { name: "Page suivante", exact: true }).click()
  await expect(page.getByText("Page 3 sur 3", { exact: true })).toBeVisible()
  await expect(page.getByRole("row").filter({ hasText: "EXPENSE-OLDER-ROW" })).toContainText("99,00")
  await expect(page.getByRole("button", { name: "Page suivante", exact: true })).toBeDisabled()
  const search = page.getByRole("textbox", { name: "Rechercher une dépense", exact: true })
  for (const value of ["expense-older-row", "BUREAU unique"]) {
    await search.fill(value)
    await expect(page.getByText("1 résultat", { exact: true })).toBeVisible()
    await expect(page.getByText("Page 1 sur 1", { exact: true })).toBeVisible()
    await expect(page.getByRole("row").filter({ hasText: "EXPENSE-OLDER-ROW" })).toBeVisible()
    await expect(monthly).toContainText("149,00")
    await expect(missing).toContainText("51")
  }
  await search.fill("unmatched-expense")
  await expect(page.getByText("0 résultats", { exact: true })).toBeVisible()
  await expect(page.getByText("Aucune dépense trouvée", { exact: true })).toBeVisible()
  await expect(monthly).toContainText("149,00")
  await expect(missing).toContainText("51")
  await page.getByRole("button", { name: "Effacer la recherche", exact: true }).click()
  await expect(page.getByText("51 résultats", { exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "Page précédente", exact: true })).toBeDisabled()
})

test("Expense form survives a failed history refresh and retry returns the current search", async ({ page }) => {
  let failOnce = true
  await page.route("**/dashboard/depenses", async route => {
    if (failOnce && route.request().method() === "POST" && route.request().headers()["next-action"]) {
      failOnce = false
      await new Promise(resolve => setTimeout(resolve, 800))
      await route.fulfill({ status: 503, contentType: "text/plain", body: "Fictional recipe outage" })
    } else await route.continue()
  })
  await page.getByRole("textbox", { name: "Rechercher une dépense", exact: true }).fill("Bureau Unique")
  await page.getByRole("button", { name: "Saisie manuelle", exact: true }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("Libellé", { exact: false }).fill("Saisie conservée pendant actualisation")
  await expect(page.getByRole("alert", { includeHidden: true }).filter({ hasText: "Impossible d’actualiser la liste." })).toBeVisible()
  await expect(dialog).toBeVisible()
  await expect(dialog.getByLabel("Libellé", { exact: false })).toHaveValue("Saisie conservée pendant actualisation")
  await dialog.getByRole("button", { name: "Annuler", exact: true }).click()
  await page.getByRole("button", { name: "Réessayer", exact: true }).click()
  await expect(page.getByText("1 résultat", { exact: true })).toBeVisible()
  await expect(page.getByRole("row").filter({ hasText: "EXPENSE-OLDER-ROW" })).toBeVisible()
  await expect(page.getByRole("textbox", { name: "Rechercher une dépense", exact: true })).toHaveValue("Bureau Unique")
  await expect(page.locator('[data-slot="card"]').filter({ hasText: "Total Mois" })).toContainText("149,00")
})
