import { expect, test } from "@playwright/test"
import { assertHostedModule } from "../hosted/page-contract"

test("la recette refuse une erreur française dans un shell HTTP 200", async ({ page }) => {
  await page.route("**/dashboard/contract-fixture", route => route.fulfill({
    status: 200, contentType: "text/html",
    body: '<main id="dashboard-main"><h1>Impossible de charger cette page</h1><p>Référence : fictive</p></main>',
  }))
  expect((await page.goto("/dashboard/contract-fixture"))?.status()).toBe(200)
  await expect(assertHostedModule(page, "Clients", undefined, 100)).rejects.toThrow()
})

test("la recette vérifie le module attendu et son onglet", async ({ page }) => {
  await page.setContent('<main id="dashboard-main"><h1>Communications</h1><button role="tab" aria-selected="true">Brouillons</button></main>')
  await assertHostedModule(page, "Communications", "Brouillons", 100)
  await expect(assertHostedModule(page, "Clients", undefined, 100)).rejects.toThrow()
  await expect(assertHostedModule(page, "Communications", "Nouvel e-mail", 100)).rejects.toThrow()
})
