import { expect, test } from "@playwright/test"

test("les formulaires conservent la saisie après une erreur et enregistrent le document", async ({ page }) => {
  for (const [route, clientLabel] of [["devis", "Client du devis"], ["factures", "Client de la facture"]]) {
    await page.goto(`/dashboard/${route}/new`)
    await page.waitForFunction(() => document.documentElement.dataset.appHydrated === "true")
    await page.getByLabel("Objet", { exact: false }).fill(`Recette design ${route} ${Date.now()}`)
    const line = page.getByRole("textbox", { name: "Libellé de la ligne 1", exact: true })
    await line.fill("Installation conservée")
    await page.getByRole("spinbutton", { name: "Prix unitaire hors taxes de la ligne 1", exact: true }).fill("100")
    await page.getByRole("button", { name: "Enregistrer", exact: true }).click()
    const error = page.getByRole("alert").filter({ hasText: "Sélectionnez un client" })
    await expect(error).toBeVisible()
    await expect(error).toBeFocused()
    await expect(line).toHaveValue("Installation conservée")
    await page.getByRole("combobox", { name: clientLabel }).click()
    await page.getByRole("option", { name: "Client QA Piscine", exact: true }).click()
    await expect(page.getByRole("listbox")).toBeHidden()
    await expect(page.getByRole("combobox", { name: clientLabel })).toContainText("Client QA Piscine")
    await page.getByRole("button", { name: "Enregistrer", exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`/dashboard/${route}/(?!new$)[^/?]+$`), { timeout: 45_000 })
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
    await expect(page.locator('dl').first()).toContainText("120,00")
  }
})

test("les surfaces publiques restent lisibles", async ({ browser }, testInfo) => {
  const context = await browser.newContext({ viewport: testInfo.project.name === "mobile" ? { width: 390, height: 844 } : { width: 1440, height: 900 } })
  const page = await context.newPage()
  try {
    for (const route of ["/", "/tarifs", "/auth/login", "/auth/register", "/portal"]) {
      const response = await page.goto(`http://127.0.0.1:3000${route}`)
      expect(response?.status()).toBeLessThan(400)
      await expect(page.locator("body")).not.toContainText("Application error")
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
    }
  } finally { await context.close() }
})
