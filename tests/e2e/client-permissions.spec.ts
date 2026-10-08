import { expect, test, type Page } from "@playwright/test"
import { readFile } from "node:fs/promises"

async function openDirectory(page: Page, surface: string, role: string) {
  await page.context().clearCookies()
  await page.goto("/auth/login")
  await page.getByLabel("Adresse e-mail professionnelle").fill(`client-reader-${role}-${surface}@example.test`)
  await page.getByLabel("Mot de passe", { exact: true }).fill(process.env.E2E_USER_PASSWORD || "RecetteSolide2026")
  await page.getByRole("button", { name: "Se connecter", exact: true }).click()
  await page.waitForURL(url => url.pathname === "/dashboard", { timeout: 60_000 })
  await page.goto("/dashboard/clients")
  await expect(page.locator("html[data-app-hydrated='true']")).toHaveCount(1)
  await page.getByRole("textbox", { name: "Rechercher dans les clients", exact: true }).fill(`UIQA Client permissions ${surface}`)
  await expect(page.getByRole("link").filter({ hasText: `UIQA Client permissions ${surface}` })).toBeVisible()
}

async function openClient(page: Page, surface: string, role: string) {
  await openDirectory(page, surface, role)
  await page.getByRole("link").filter({ hasText: `UIQA Client permissions ${surface}` }).click()
  await expect(page.getByRole("heading", { name: `UIQA Client permissions ${surface}`, exact: true })).toBeVisible()
}

test("technician reads the client without receiving commercial lists or financial amounts", async ({ page }, info) => {
  await openClient(page, info.project.name, "technician")
  await expect(page.getByRole("button", { name: "Créer un devis", exact: true })).toHaveCount(0)
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

for (const role of ["owner", "technician", "sales"]) {
  test(`client directory and CSV preserve Finance permissions for ${role}`, async ({ page }, info) => {
    await openDirectory(page, info.project.name, role)
    const row = page.getByRole("row").filter({ hasText: `UIQA Client permissions ${info.project.name}` })
    const revenue = row.locator('[data-column="revenue"]')
    const unpaid = row.locator('[data-column="unpaid"]')
    if (role === "owner") {
      await expect(revenue).toContainText("20,00")
      await expect(unpaid).toContainText("0,00")
    } else {
      await expect(revenue).toHaveText("Accès Finance requis")
      await expect(unpaid).toHaveText("Accès Finance requis")
    }
    // Existing mobile CSS hides these columns; the export must still apply ACLs.
    if (info.project.name === "mobile") await expect(revenue).toBeHidden()
    else await expect(revenue).toBeVisible()
    const downloadPromise = page.waitForEvent("download")
    await page.getByRole("button", { name: "Exporter", exact: true }).click()
    const download = await downloadPromise
    const filename = await download.path()
    expect(filename).not.toBeNull()
    const csv = await readFile(filename!, "utf8")
    expect(csv).toContain(`UIQA Client permissions ${info.project.name}`)
    if (role === "owner") {
      expect(csv).toContain('"20";"0"')
      expect(csv).not.toContain("Accès Finance requis")
    } else {
      expect(csv.match(/Accès Finance requis/g)).toHaveLength(2)
      expect(csv).not.toContain('"20"')
      expect(csv).not.toContain('"9999.99"')
    }
  })
}

test("sales keeps quote creation and assigned quotes while financial data stays unavailable", async ({ page }, info) => {
  await openClient(page, info.project.name, "sales")
  await expect(page.getByRole("button", { name: "Créer un devis", exact: true })).toBeVisible()
  await expect(page.locator(".record-metrics").getByText("Accès Finance requis", { exact: true })).toHaveCount(2)
  await page.getByRole("tab", { name: "Documents", exact: true }).click()
  await expect(page.getByRole("link", { name: "UIQA-CLIENT-QUOTE-PERMITTED", exact: true })).toBeVisible()
  await expect(page.getByText("UIQA-CLIENT-QUOTE-OTHER", { exact: true })).toHaveCount(0)
  await expect(page.getByText(/UIQA-CLIENT-INVOICE/)).toHaveCount(0)
})

test("owner reads both agencies and live totals instead of stale client counters", async ({ page }, info) => {
  await openClient(page, info.project.name, "owner")
  await expect(page.getByRole("button", { name: "Créer un devis", exact: true })).toBeVisible()
  await expect(page.locator(".record-metrics")).toContainText("20,00")
  await expect(page.getByText("Accès Finance requis", { exact: true })).toHaveCount(0)
  await page.getByRole("tab", { name: "Documents", exact: true }).click()
  for (const marker of ["PERMITTED", "OTHER"]) {
    await expect(page.getByRole("link", { name: `UIQA-CLIENT-QUOTE-${marker}`, exact: true })).toBeVisible()
    await expect(page.getByRole("link", { name: `UIQA-CLIENT-INVOICE-${marker}`, exact: true })).toBeVisible()
  }
})
