import { expect, test } from "@playwright/test"
import { mkdir } from "node:fs/promises"
import path from "node:path"
import { captureScrollablePage } from "./helpers/visual-evidence"

test.beforeEach(async ({ page }, info) => {
  await page.context().clearCookies()
  await page.goto("/auth/login")
  await page.getByLabel("Adresse e-mail professionnelle").fill(`assets-owner-${info.project.name}@example.test`)
  await page.getByLabel("Mot de passe", { exact: true }).fill(process.env.E2E_USER_PASSWORD || "RecetteSolide2026")
  await page.getByRole("button", { name: "Se connecter", exact: true }).click()
  await page.waitForURL(url => url.pathname === "/dashboard", { timeout: 60_000 })
  await page.goto("/dashboard/operations")
  const tab = page.getByRole("tab", { name: "Sites & parc", exact: true })
  await tab.scrollIntoViewIfNeeded()
  await tab.click()
  await expect(page.getByRole("region", { name: "Sites clients", exact: true }).getByText("202 résultats", { exact: true })).toBeVisible()
})

test("reads all asset pages and preserves independent searches through agency changes", async ({ page }, info) => {
  const sites = page.getByRole("region", { name: "Sites clients", exact: true })
  const equipment = page.getByRole("region", { name: "Parc installé", exact: true })
  const directory = path.join(process.cwd(), "test-results", "operations-assets", info.project.name)
  await mkdir(directory, { recursive: true })
  for (let current = 1; current <= 13; current++) {
    await expect(equipment.getByText(`Page ${current} sur 13`, { exact: true })).toBeVisible()
    if (current <= 9) await expect(sites.getByText(`Page ${current} sur 9`, { exact: true })).toBeVisible()
    expect((await captureScrollablePage(page, directory, `pages-${current}`)).complete).toBe(true)
    if (current < 9) await sites.getByRole("button", { name: "Page suivante", exact: true }).click()
    if (current < 13) await equipment.getByRole("button", { name: "Page suivante", exact: true }).click()
  }
  await expect(sites).toContainText("Fictional site 200")
  await expect(equipment).toContainText("Fictional equipment 300")
  await sites.getByRole("textbox").fill("site 200")
  await equipment.getByRole("textbox").fill("ASSET-300")
  await expect(sites.getByText("1 résultat", { exact: true })).toBeVisible()
  await expect(equipment.getByText("1 résultat", { exact: true })).toBeVisible()
  await page.getByRole("combobox", { name: "Filtrer par agence", exact: true }).click()
  await page.getByRole("option", { name: "Fictional other agency", exact: true }).click()
  for (const region of [sites, equipment]) { await expect(region.getByText("0 résultats", { exact: true })).toBeVisible(); await expect(region.getByText("Page 1 sur 1", { exact: true })).toBeVisible() }
  await expect(sites.getByRole("textbox")).toHaveValue("site 200")
  await expect(equipment.getByRole("textbox")).toHaveValue("ASSET-300")
  await page.getByRole("combobox", { name: "Filtrer par agence", exact: true }).click()
  await page.getByRole("option", { name: "Fictional local agency", exact: true }).click()
  for (const region of [sites, equipment]) await expect(region.getByText("1 résultat", { exact: true })).toBeVisible()
})

test("hides stale asset rows after failure and retries without clearing search", async ({ page }) => {
  const sites = page.getByRole("region", { name: "Sites clients", exact: true })
  await page.route("**/dashboard/operations", async route => {
    if (route.request().headers()["next-action"]) await route.abort("failed")
    else await route.continue()
  })
  await sites.getByRole("textbox").fill("site 200")
  await expect(sites.getByRole("alert")).toContainText("Impossible d’actualiser la liste.")
  await expect(sites.getByText("Fictional assets client · Fictional site 000", { exact: true })).not.toBeVisible()
  await expect(sites.getByText("Aucun site.", { exact: true })).not.toBeVisible()
  await page.unroute("**/dashboard/operations")
  await sites.getByRole("button", { name: "Réessayer", exact: true }).click()
  await expect(sites.getByText("1 résultat", { exact: true })).toBeVisible()
  await expect(sites).toContainText("Fictional site 200")
})
