import { expect, test } from "@playwright/test"

test.beforeEach(async ({ page }, testInfo) => {
  if (testInfo.project.name === "desktop") await page.setViewportSize({ width: 1440, height: 900 })
})

test("les listes CRM restent lisibles et les filtres sont réversibles", async ({ page }, testInfo) => {
  await page.addInitScript(() => localStorage.setItem("theme", "light"))
  for (const [route, title, search] of [
    ["clients", "Clients", "Rechercher dans les clients"],
    ["devis", "Devis", "Rechercher un devis"],
    ["factures", "Factures", "Rechercher une facture"],
  ]) {
    await page.goto(`/dashboard/${route}`)
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible()
    await page.waitForFunction(() => document.documentElement.dataset.appHydrated === "true")
    await expect(page.locator("html")).not.toHaveClass(/dark/)
    const main = page.locator("#dashboard-main")
    expect(await main.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
    const input = page.getByRole("textbox", { name: search })
    await input.fill("introuvable-qa-8675309")
    await expect(main.getByText(/Aucun client dans cette vue|Aucun devis trouvé|Aucune facture trouvée/)).toBeVisible()
    await main.getByRole("button", { name: /Réinitialiser/ }).click()
    await expect(input).toHaveValue("")
    await expect(main.getByRole("status").filter({ hasText: "Actualisation" })).toHaveCount(0)
    await expect(main.locator("tbody tr").first()).toBeVisible()
    await page.screenshot({ path: `test-results/redesign/${testInfo.project.name}/${route}.png` })
  }
})

test("les onglets client conservent les dossiers et rendent une seule section visible", async ({ page }, testInfo) => {
  await page.addInitScript(() => localStorage.setItem("theme", "light"))
  await page.goto("/dashboard/clients")
  await page.getByRole("link", { name: /Client QA Piscine/ }).click()
  await expect(page.getByRole("heading", { name: "Client QA Piscine", exact: true })).toBeVisible()
  await page.waitForFunction(() => document.documentElement.dataset.appHydrated === "true")
  for (const label of ["Documents", "Chantiers", "Informations", "Portail client", "Activité et contacts"]) {
    await page.getByRole("tab", { name: label, exact: true }).click()
    await expect(page.getByRole("tabpanel")).toHaveCount(1)
    await expect(page.getByRole("tab", { name: label, exact: true })).toHaveAttribute("aria-selected", "true")
  }
  await page.screenshot({ path: `test-results/redesign/${testInfo.project.name}/client-record.png` })
  await page.getByRole("button", { name: "Créer un devis", exact: true }).click()
  await expect(page.getByRole("heading", { name: "Nouveau devis", exact: true })).toBeVisible()
  await expect(page.getByRole("combobox").filter({ hasText: "Client QA Piscine" })).toBeVisible()
})

test("la navigation claire et sombre conserve les destinations", async ({ page }, testInfo) => {
  await page.addInitScript(() => localStorage.setItem("theme", "light"))
  await page.goto("/dashboard/pipeline")
  await expect(page.getByRole("heading", { name: "Cycle de vente", exact: true })).toBeVisible()
  await page.waitForFunction(() => document.documentElement.dataset.appHydrated === "true")
  if (testInfo.project.name === "mobile") {
    await page.getByRole("button", { name: "Ouvrir la navigation" }).click()
    await expect(page.getByRole("dialog")).toBeVisible()
    await page.getByRole("dialog").getByRole("button", { name: "Facturation", exact: true }).click()
    await page.getByRole("dialog").getByRole("link", { name: "Factures", exact: true }).click()
    await expect(page.getByRole("heading", { name: "Factures", exact: true })).toBeVisible()
    await expect(page.getByRole("dialog")).toHaveCount(0)
  } else {
    await page.screenshot({ path: "test-results/redesign/desktop/pipeline.png" })
    await page.getByRole("button", { name: "Passer en mode sombre" }).click()
    await expect(page.locator("html")).toHaveClass(/dark/)
    await page.screenshot({ path: "test-results/redesign/desktop/pipeline-dark.png" })
    await page.getByRole("button", { name: "Passer en mode clair" }).click()
  }
})
