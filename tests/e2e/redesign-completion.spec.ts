import { expect, test } from "@playwright/test"

test("les gabarits restent contenus aux largeurs de recette", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Matrice de largeurs exécutée une fois")
  for (const route of ["clients", "contacts", "pipeline", "devis/new", "factures/new"]) {
    await page.goto(`/dashboard/${route}`)
    await page.waitForFunction(() => document.documentElement.dataset.appHydrated === "true")
    for (const width of [1920, 1440, 1280, 1024, 768, 390, 360, 320]) {
      await page.setViewportSize({ width, height: 900 })
      const main = page.locator("#dashboard-main")
      await expect.poll(() => main.evaluate((element) => element.scrollWidth <= element.clientWidth + 1), { message: `${route} à ${width}px` }).toBe(true)
      if (route === "cycle de vente" && width < 640) await expect(main.locator("[data-cycle de vente-scroll-viewport] > section:visible")).toHaveCount(1)
    }
  }
})

test("le clavier ferme la fenêtre et restitue le focus", async ({ page }) => {
  await page.goto("/dashboard/clients")
  await page.waitForFunction(() => document.documentElement.dataset.appHydrated === "true")
  const trigger = page.getByRole("button", { name: "Ajouter un client", exact: true }).first()
  await trigger.focus()
  await page.keyboard.press("Enter")
  await expect(page.getByRole("dialog")).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await expect(trigger).toBeFocused()
})

test("les contacts partagent une recherche paginée et réversible", async ({ page }) => {
  await page.goto("/dashboard/contacts")
  await page.waitForFunction(() => document.documentElement.dataset.appHydrated === "true")
  const input = page.getByRole("textbox", { name: "Rechercher un contact" })
  await input.fill("recette124@example.test")
  await expect(page.getByRole("link", { name: "recette124@example.test", exact: true })).toBeVisible()
  await expect(page.locator("main article")).toHaveCount(1)
  await page.reload()
  await expect(input).toHaveValue("recette124@example.test")
  await input.fill("introuvable-recette-completion")
  await expect(page.getByText("Aucun contact dans cette vue")).toBeVisible()
  await page.getByRole("button", { name: "Réinitialiser", exact: true }).click()
  await expect(page.locator("main article")).toHaveCount(25)
})

test.describe("erreurs réseau contrôlées", () => {
  // Keep fault injection in Playwright; a service worker can bypass page.route.
  test.use({ serviceWorkers: "block" })

  test("une erreur de lecture conserve la recherche et permet de réessayer", async ({ page }) => {
    await page.goto("/dashboard/contacts")
    await page.waitForFunction(() => document.documentElement.dataset.appHydrated === "true")
    await page.route("**/dashboard/contacts*", (route) => route.request().method() === "POST" ? route.abort("failed") : route.continue())
    const input = page.getByRole("textbox", { name: "Rechercher un contact" })
    await input.fill("recette124@example.test")
    await expect(page.getByRole("alert").filter({ hasText: "Impossible d’actualiser la liste." })).toBeVisible({ timeout: 30_000 })
    await expect(input).toHaveValue("recette124@example.test")
    await page.unroute("**/dashboard/contacts*")
    await page.getByRole("button", { name: "Réessayer", exact: true }).click()
    await expect(page.getByRole("link", { name: "recette124@example.test", exact: true })).toBeVisible()
    await expect(page.locator("main article")).toHaveCount(1)
    await expect(page.getByText("Impossible d’actualiser la liste.")).toHaveCount(0)
  })
})

test("le portefeuille SAV conserve sa page et rend les derniers dossiers accessibles", async ({ page }) => {
  await page.goto("/dashboard/service/customer-success")
  await page.waitForFunction(() => document.documentElement.dataset.appHydrated === "true")
  const search = page.getByRole("textbox", { name: "Rechercher un client du portefeuille" })
  await search.fill("ZZZ Recette")
  await expect(page.getByText("Page 1 sur 5", { exact: true })).toBeVisible()
  await page.getByRole("button", { name: "Page suivante" }).click()
  await page.reload()
  await expect(search).toHaveValue("ZZZ Recette")
  await expect(page.getByText("Page 2 sur 5", { exact: true })).toBeVisible()
  await search.fill("ZZZ Recette 124")
  await expect(page.getByRole("link", { name: /ZZZ Recette 124/ })).toBeVisible()
  await expect(page.getByText("Page 1 sur 1", { exact: true })).toBeVisible()
})
