import { expect, test } from "@playwright/test"
import { mkdir } from "node:fs/promises"
import path from "node:path"
import { captureScrollablePage } from "./helpers/visual-evidence"

test.beforeEach(async ({ page }, info) => {
  await page.context().clearCookies()
  await page.goto("/auth/login")
  await page.getByLabel("Adresse e-mail professionnelle").fill(`catalogue-owner-${info.project.name}@example.test`)
  await page.getByLabel("Mot de passe", { exact: true }).fill(process.env.E2E_USER_PASSWORD || "RecetteSolide2026")
  await page.getByRole("button", { name: "Se connecter", exact: true }).click()
  await page.waitForURL(url => url.pathname === "/dashboard", { timeout: 60_000 })
  // The hydrated catalogue refreshes its server data once on mount.
  // Wait for its response and rendered state; the RSC stream can remain open.
  const [refresh] = await Promise.all([
    page.waitForResponse(response => response.url().endsWith("/dashboard/catalogue") && response.request().method() === "POST" && Boolean(response.request().headers()["next-action"]), { timeout: 15_000 }),
    page.goto("/dashboard/catalogue"),
  ])
  expect(refresh.ok()).toBe(true)
  await expect(page.getByRole("tabpanel").getByRole("status")).toHaveText("603 résultats")
})

test("reads every paginated catalogue state at volume with constant full counters", async ({ page }, info) => {
  const counters = page.locator(".workspace-panel").filter({ has: page.getByRole("textbox", { name: "Rechercher un produit", exact: true }) })
  await expect(counters).toContainText("602 références actives")
  await expect(counters).toContainText("1 variantes")
  await expect(counters).toContainText("1 groupes d’options")
  const originalCounters = await counters.innerText()
  const directory = path.join(process.cwd(), "test-results", "catalogue-volume", info.project.name)
  await mkdir(directory, { recursive: true })
  for (let current = 1; current <= 25; current++) {
    await expect(page.getByText(`Page ${current} sur 25`, { exact: true })).toBeVisible()
    await expect(page.getByRole("tabpanel").getByRole("status")).toHaveText("603 résultats")
    expect((await captureScrollablePage(page, directory, `page-${current}`)).complete).toBe(true)
    expect(await counters.innerText()).toBe(originalCounters)
    if (current < 25) await page.getByRole("button", { name: "Page suivante", exact: true }).click()
  }
  await expect(page.getByText("ZZZ Fictional inactive", { exact: true }).filter({ visible: true })).toBeVisible()
  await page.getByRole("textbox", { name: "Rechercher un produit", exact: true }).fill("CAT-600")
  await expect(page.getByText("1 résultat", { exact: true })).toBeVisible()
  await expect(page.getByText("Fictional catalogue 600", { exact: true }).filter({ visible: true })).toBeVisible()
  expect(await counters.innerText()).toBe(originalCounters)
  await page.getByRole("textbox", { name: "Rechercher un produit", exact: true }).fill("no-fictional-product")
  await expect(page.getByText("0 résultats", { exact: true })).toBeVisible()
  await expect(page.getByText("Aucun produit ne correspond", { exact: true })).toBeVisible()
})

test("retains a distant parent and the entered form across searches and pages", async ({ page }) => {
  await page.getByRole("button", { name: "Nouveau produit", exact: true }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("Référence / SKU *", { exact: true }).fill("FICTIONAL-UNSAVED")
  await dialog.getByLabel("Libellé *", { exact: true }).fill("Fictional retained input")
  const parent = dialog.getByRole("group", { name: "Choix du produit parent", exact: true })
  await parent.getByRole("textbox").fill("CAT-600")
  await expect(parent.getByText("1 résultat", { exact: true })).toBeVisible()
  await parent.getByRole("combobox", { name: "Produit parent", exact: true }).click()
  await page.getByRole("option", { name: "CAT-600 · Fictional catalogue 600", exact: true }).click()
  await parent.getByRole("textbox").fill("")
  await expect(parent.getByText("601 résultats", { exact: true })).toBeVisible()
  await parent.getByRole("button", { name: "Page suivante", exact: true }).click()
  await expect(parent.getByText("Page 2 sur 25", { exact: true })).toBeVisible()
  await expect(parent.getByRole("combobox", { name: "Produit parent", exact: true })).toContainText("CAT-600")
  await parent.getByRole("textbox").fill("CAT-000")
  await expect(parent.getByText("1 résultat", { exact: true })).toBeVisible()
  await expect(parent.getByRole("combobox", { name: "Produit parent", exact: true })).toContainText("CAT-600")
  await expect(dialog.getByLabel("Référence / SKU *", { exact: true })).toHaveValue("FICTIONAL-UNSAVED")
  await expect(dialog.getByLabel("Libellé *", { exact: true })).toHaveValue("Fictional retained input")
})

test("hides stale products on read failure and retries the same search", async ({ page }) => {
  await page.route("**/dashboard/catalogue", async route => {
    if (route.request().headers()["next-action"]) await route.abort("failed")
    else await route.continue()
  })
  await page.getByRole("textbox", { name: "Rechercher un produit", exact: true }).fill("CAT-600")
  await expect(page.getByRole("alert").filter({ hasText: "Impossible d’actualiser la liste." })).toContainText("Impossible d’actualiser la liste.")
  await expect(page.getByText("Fictional catalogue 000", { exact: true }).filter({ visible: true })).toHaveCount(0)
  await expect(page.getByText("Aucun produit ne correspond", { exact: true })).not.toBeVisible()
  await page.unroute("**/dashboard/catalogue")
  await page.getByRole("button", { name: "Réessayer", exact: true }).click()
  await expect(page.getByText("1 résultat", { exact: true })).toBeVisible()
  await expect(page.getByText("Fictional catalogue 600", { exact: true }).filter({ visible: true })).toBeVisible()
})
