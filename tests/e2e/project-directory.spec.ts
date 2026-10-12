import { PrismaClient } from "@prisma/client"
import { expect, test } from "@playwright/test"

const database = new PrismaClient()
test.afterAll(async () => { await database.$disconnect() })
let clientErrors: string[] = []
test.beforeEach(async ({ page }, info) => {
  clientErrors = []; page.on("pageerror", error => clientErrors.push(error.message))
  await page.context().clearCookies(); await page.goto("/auth/login")
  await page.getByLabel("Adresse e-mail professionnelle").fill(`project-directory-${info.project.name}@example.test`)
  await page.getByLabel("Mot de passe", { exact: true }).fill(process.env.E2E_USER_PASSWORD || "RecetteSolide2026")
  await page.getByRole("button", { name: "Se connecter", exact: true }).click()
  await page.waitForURL(url => url.pathname === "/dashboard", { timeout: 60_000 })
  expect((await page.goto("/dashboard/projets"))?.status()).toBe(200)
})
test.afterEach(() => { expect(clientErrors).toEqual([]) })

test("All 101 projects are paged, including the oldest worksite and complete status filters", async ({ page }) => {
  const pagination = page.getByRole("navigation", { name: "Pagination", exact: true })
  await expect(page.getByRole("status").filter({ hasText: "101 résultats" })).toBeVisible()
  await expect(page.getByRole("link", { name: /Recent project/ })).toHaveCount(25)
  for (let i = 2; i <= 5; i++) {
    await pagination.getByRole("button", { name: "Page suivante", exact: true }).click()
    await expect(pagination.getByText(`Page ${i} sur 5`, { exact: true })).toBeVisible()
  }
  await expect(page.getByRole("link", { name: /ZZ ANCIEN CHANTIER/ })).toBeVisible()
  await page.getByRole("button", { name: "Terminé", exact: true }).click()
  await expect(page.getByRole("status").filter({ hasText: "1 résultat" })).toBeVisible()
  await expect(pagination.getByText("Page 1 sur 1", { exact: true })).toBeVisible()
  await expect(page.getByRole("link", { name: /ZZ ANCIEN CHANTIER/ })).toBeVisible()
  await page.getByRole("button", { name: "Tous", exact: true }).click()
  await page.getByRole("textbox", { name: "Rechercher un chantier", exact: true }).fill("ANCIEN CHANTIER")
  await expect(page.getByRole("status").filter({ hasText: "1 résultat" })).toBeVisible()
  await expect(page.getByRole("link", { name: /ZZ ANCIEN CHANTIER/ })).toBeVisible()
})

test("A failed pending search preserves a newly opened form and its input", async ({ page }) => {
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  let intercepted = false
  await page.route("**/dashboard/projets", async route => {
    if (!intercepted && route.request().method() === "POST" && route.request().headers()["next-action"] && route.request().postData()?.includes("Recent project 09")) {
      intercepted = true; await gate
      await route.fulfill({ status: 503, contentType: "text/plain", body: "Fictional project directory outage" })
    } else await route.continue()
  })
  try {
    await page.getByRole("textbox", { name: "Rechercher un chantier", exact: true }).fill("Recent project 09")
    await page.getByRole("button", { name: "Nouveau chantier", exact: true }).click()
    const dialog = page.getByRole("dialog")
    await dialog.getByLabel("Nom", { exact: false }).fill("Unsaved fictional project")
    await dialog.getByLabel("Description", { exact: true }).fill("Retain this fictional description")
    await expect.poll(() => intercepted).toBe(true)
    release()
    await expect(page.getByRole("alert", { includeHidden: true }).filter({ hasText: "Impossible d’actualiser la liste." })).toContainText("Impossible d’actualiser la liste.")
    await expect(dialog.getByLabel("Nom", { exact: false })).toHaveValue("Unsaved fictional project")
    await expect(dialog.getByLabel("Description", { exact: true })).toHaveValue("Retain this fictional description")
    await dialog.getByRole("button", { name: "Annuler", exact: true }).click()
    await expect(page.getByRole("alert").filter({ hasText: "Impossible d’actualiser la liste." })).toBeVisible()
    await page.getByRole("button", { name: "Réessayer", exact: true }).click()
    await expect(page.getByRole("status").filter({ hasText: "10 résultats" })).toBeVisible()
    await expect(page.getByRole("textbox", { name: "Rechercher un chantier", exact: true })).toHaveValue("Recent project 09")
  } finally { release() }
})

test("An older worksite can be edited without losing its client, agency or budget", async ({ page }, info) => {
  await page.getByRole("textbox", { name: "Rechercher un chantier", exact: true }).fill("ANCIEN CHANTIER")
  await expect(page.getByRole("status").filter({ hasText: "1 résultat" })).toBeVisible()
  await page.getByRole("button", { name: "Actions pour ZZ ANCIEN CHANTIER", exact: true }).click()
  await page.getByRole("menuitem", { name: "Modifier", exact: true }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("Description", { exact: true }).fill("Saved fictional historical project")
  await expect(dialog.getByRole("combobox", { name: "Client du projet", exact: true })).toContainText("Fictional project directory customer")
  await expect(dialog.getByRole("combobox", { name: "Agence responsable du chantier", exact: true })).toContainText("Fictional local agency")
  await dialog.getByRole("button", { name: "Enregistrer", exact: true }).click()
  await expect(dialog).toHaveCount(0)
  if (process.env.RECIPE_ISOLATED !== "true" || !process.env.DATABASE_URL?.startsWith("file:") || process.env.PLAYWRIGHT_BASE_URL) throw new Error("La preuve SQL navigateur exige la recette SQLite isolée")
  const project = await database.project.findUniqueOrThrow({ where: { id: `cprojectdirectoryolder${info.project.name}` }, select: { description: true, budgetCents: true, consumedCents: true, client: { select: { name: true } }, agency: { select: { name: true } } } })
  expect(project).toEqual({ description: "Saved fictional historical project", budgetCents: 120000, consumedCents: 30000, client: { name: "Fictional project directory customer" }, agency: { name: "Fictional local agency" } })
  await page.reload()
  await page.getByRole("textbox", { name: "Rechercher un chantier", exact: true }).fill("ANCIEN CHANTIER")
  await page.getByRole("button", { name: "Actions pour ZZ ANCIEN CHANTIER", exact: true }).click()
  await page.getByRole("menuitem", { name: "Modifier", exact: true }).click()
  await expect(page.getByRole("dialog").getByLabel("Description", { exact: true })).toHaveValue("Saved fictional historical project")
})
