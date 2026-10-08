import { expect, test, type Page } from "@playwright/test"

async function openHistory(page: Page, surface: string) {
  await page.goto("/dashboard/operations/fournisseurs")
  await page.getByRole("textbox", { name: "Rechercher un fournisseur", exact: true }).fill(`UIQA Supplier history ${surface}`)
  await expect(page.getByText("1 résultat", { exact: true })).toBeVisible()
  await page.getByRole("link").filter({ hasText: `UIQA Supplier history ${surface}` }).click()
  await expect(page.getByRole("region", { name: "Catalogue fournisseur", exact: true }).getByText("301 résultats", { exact: true })).toBeVisible()
}

test("reads all three supplier histories while keeping full metrics and independent searches", async ({ page }, info) => {
  await openHistory(page, info.project.name)
  const metrics = page.locator(".record-metrics")
  await expect(metrics).toContainText("101 commande(s)")
  await expect(metrics).toContainText("50/100 réception(s) à l’heure")
  const initialMetrics = await metrics.innerText()
  const catalogue = page.getByRole("region", { name: "Catalogue fournisseur", exact: true })
  const orders = page.getByRole("region", { name: "Historique des commandes", exact: true })
  const returns = page.getByRole("region", { name: "Retours et avoirs", exact: true })
  for (const [region, pages] of [[catalogue, 13], [orders, 5], [returns, 5]] as const) {
    for (let current = 2; current <= pages; current++) {
      await region.getByRole("button", { name: "Page suivante", exact: true }).click()
      await expect(region.getByText(`Page ${current} sur ${pages}`, { exact: true })).toBeVisible()
    }
  }
  await expect(catalogue).toContainText(`UIQA History product ${info.project.name} 300`)
  await expect(orders.getByRole("link")).toContainText(`UIQA-HISTORY-${info.project.name}-100`)
  await expect(returns).toContainText(`UIQA-RETURN-${info.project.name}-100`)
  await catalogue.getByRole("textbox").fill(`product ${info.project.name} 300`)
  await orders.getByRole("textbox").fill(`UIQA-HISTORY-${info.project.name}-100`)
  await returns.getByRole("textbox").fill(`UIQA-OLDEST-CREDIT-${info.project.name}`)
  for (const region of [catalogue, orders, returns]) await expect(region.getByText("1 résultat", { exact: true })).toBeVisible()
  await catalogue.getByRole("textbox").fill("UIQA-no-product")
  await expect(catalogue.getByText("0 résultats", { exact: true })).toBeVisible()
  await expect(orders.getByRole("textbox")).toHaveValue(`UIQA-HISTORY-${info.project.name}-100`)
  await expect(returns.getByRole("textbox")).toHaveValue(`UIQA-OLDEST-CREDIT-${info.project.name}`)
  expect(await metrics.innerText()).toBe(initialMetrics)
})

test("hides stale supplier rows during refresh and offers retry after a read failure", async ({ page }, info) => {
  await openHistory(page, info.project.name)
  const catalogue = page.getByRole("region", { name: "Catalogue fournisseur", exact: true })
  await page.route("**/dashboard/operations/fournisseurs/**", async route => {
    if (route.request().headers()["next-action"]) await route.abort("failed")
    else await route.continue()
  })
  await catalogue.getByRole("textbox").fill(`product ${info.project.name} 300`)
  await expect(catalogue.getByText(`UIQA-HISTORY-${info.project.name}-000 · UIQA History product ${info.project.name} 000`, { exact: true })).not.toBeVisible()
  await expect(catalogue.getByRole("alert")).toContainText("Impossible d’actualiser la liste.")
  await expect(catalogue.getByText("Aucun produit rattaché à ce fournisseur.", { exact: true })).not.toBeVisible()
  await page.unroute("**/dashboard/operations/fournisseurs/**")
  await catalogue.getByRole("button", { name: "Réessayer", exact: true }).click()
  await expect(catalogue.getByText("1 résultat", { exact: true })).toBeVisible()
  await expect(catalogue).toContainText(`UIQA History product ${info.project.name} 300`)
})
