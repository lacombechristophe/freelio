import { expect, test, type Page } from "@playwright/test"

async function openClient(page: Page, surface: string, role: string) {
  await page.context().clearCookies()
  await page.goto("/auth/login")
  await page.getByLabel("Adresse e-mail professionnelle").fill(`client-reader-${role}-${surface}@example.test`)
  await page.getByLabel("Mot de passe", { exact: true }).fill(process.env.E2E_USER_PASSWORD || "RecetteSolide2026")
  await page.getByRole("button", { name: "Se connecter", exact: true }).click()
  await page.waitForURL(url => url.pathname === "/dashboard", { timeout: 60_000 })
  await page.goto("/dashboard/clients")
  await expect(page.locator("html[data-app-hydrated='true']")).toHaveCount(1)
  await page.getByRole("textbox", { name: "Rechercher dans les clients", exact: true }).fill(`UIQA Client permissions ${surface}`)
  await page.getByRole("link").filter({ hasText: `UIQA Client permissions ${surface}` }).click()
  await expect(page.getByRole("heading", { name: `UIQA Client permissions ${surface}`, exact: true })).toBeVisible()
}

test("technician reads the client without receiving commercial lists or financial amounts", async ({ page }, info) => {
  await openClient(page, info.project.name, "technician")
  await expect(page.getByRole("link", { name: "Créer un devis", exact: true })).toHaveCount(0)
  await expect(page.locator(".record-metrics").getByText("Accès Finance requis", { exact: true })).toHaveCount(2)
  await page.getByRole("tab", { name: "Documents", exact: true }).click()
  await expect(page.getByText("Accès commercial requis", { exact: true })).toBeVisible()
  await expect(page.getByText("Devis récents", { exact: true })).toBeVisible()
  await expect(page.getByText("Factures récentes", { exact: true })).toBeVisible()
  await expect(page.getByText(/UIQA-CLIENT-(QUOTE|INVOICE)/)).toHaveCount(0)
  await page.getByRole("tab", { name: "Chantiers", exact: true }).click()
  await expect(page.getByText("UIQA Client project PERMITTED", { exact: true })).toBeVisible()
  await expect(page.getByText("UIQA Client project OTHER", { exact: true })).toHaveCount(0)
})

test("sales keeps quote creation and assigned quotes while financial data stays unavailable", async ({ page }, info) => {
  await openClient(page, info.project.name, "sales")
  await expect(page.getByRole("link", { name: "Créer un devis", exact: true })).toBeVisible()
  await expect(page.locator(".record-metrics").getByText("Accès Finance requis", { exact: true })).toHaveCount(2)
  await page.getByRole("tab", { name: "Documents", exact: true }).click()
  await expect(page.getByRole("link", { name: "UIQA-CLIENT-QUOTE-PERMITTED", exact: true })).toBeVisible()
  await expect(page.getByText("UIQA-CLIENT-QUOTE-OTHER", { exact: true })).toHaveCount(0)
  await expect(page.getByText(/UIQA-CLIENT-INVOICE/)).toHaveCount(0)
})

test("owner reads both agencies and live totals instead of stale client counters", async ({ page }, info) => {
  await openClient(page, info.project.name, "owner")
  await expect(page.getByRole("link", { name: "Créer un devis", exact: true })).toBeVisible()
  await expect(page.locator(".record-metrics")).toContainText("20,00")
  await expect(page.getByText("Accès Finance requis", { exact: true })).toHaveCount(0)
  await page.getByRole("tab", { name: "Documents", exact: true }).click()
  for (const marker of ["PERMITTED", "OTHER"]) {
    await expect(page.getByRole("link", { name: `UIQA-CLIENT-QUOTE-${marker}`, exact: true })).toBeVisible()
    await expect(page.getByRole("link", { name: `UIQA-CLIENT-INVOICE-${marker}`, exact: true })).toBeVisible()
  }
})
