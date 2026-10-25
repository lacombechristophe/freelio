import { createDatabaseClient } from "@/lib/database-client"
import { expect, test } from "@playwright/test"

const database = createDatabaseClient()
test.afterAll(async () => { await database.$disconnect() })
async function persistedExpense(label: string, surface: string) {
  if (process.env.RECIPE_ISOLATED !== "true" || !process.env.DATABASE_URL?.startsWith("file:") || process.env.PLAYWRIGHT_BASE_URL) throw new Error("La preuve SQL navigateur exige la recette SQLite isolée")
  const user = await database.user.findUniqueOrThrow({ where: { email: `expense-project-${surface}@example.test` }, select: { companyId: true } })
  expect(user.companyId).not.toBeNull()
  const rows = await database.expense.findMany({ where: { companyId: user.companyId!, label }, select: { clientId: true, projectId: true, amountCents: true } })
  expect(rows).toHaveLength(1)
  return rows[0]
}

let clientErrors: string[] = []
test.beforeEach(async ({ page }, info) => {
  clientErrors = []
  page.on("pageerror", error => clientErrors.push(error.message))
  await page.context().clearCookies()
  await page.goto("/auth/login")
  await page.getByLabel("Adresse e-mail professionnelle").fill(`expense-project-${info.project.name}@example.test`)
  await page.getByLabel("Mot de passe", { exact: true }).fill(process.env.E2E_USER_PASSWORD || "RecetteSolide2026")
  await page.getByRole("button", { name: "Se connecter", exact: true }).click()
  await page.waitForURL(url => url.pathname === "/dashboard", { timeout: 60_000 })
  expect((await page.goto("/dashboard/depenses"))?.status()).toBe(200)
})
test.afterEach(() => { expect(clientErrors).toEqual([]) })

test("Older project remains selected outside search and creates an expense with its client", async ({ page }, info) => {
  await page.getByRole("button", { name: "Saisie manuelle", exact: true }).click()
  const dialog = page.getByRole("dialog")
  const label = `New linked expense ${info.project.name}`
  await dialog.getByLabel("Libellé", { exact: false }).fill(label)
  await dialog.getByLabel("Montant TTC", { exact: false }).fill("12.34")
  await expect(dialog.getByText("101 résultats", { exact: true })).toBeVisible()
  for (let pageNumber = 2; pageNumber <= 5; pageNumber++) {
    await dialog.getByRole("button", { name: "Page suivante", exact: true }).click()
    await expect(dialog.getByText(`Page ${pageNumber} sur 5`, { exact: true })).toBeVisible()
    await expect(dialog.getByText("101 résultats", { exact: true })).toBeVisible()
  }
  await dialog.getByRole("combobox", { name: "Projet lié", exact: true }).click()
  await page.getByRole("option", { name: "ZZ ANCIEN CHANTIER", exact: true }).click()
  await dialog.getByRole("textbox", { name: "Rechercher un chantier", exact: true }).fill("no matching project")
  await expect(dialog.getByText("0 résultats", { exact: true })).toBeVisible()
  await expect(dialog.getByRole("combobox", { name: "Projet lié", exact: true })).toContainText("ZZ ANCIEN CHANTIER")
  await expect(dialog.getByLabel("Libellé", { exact: false })).toHaveValue(label)
  await dialog.getByRole("button", { name: "Créer", exact: true }).click()
  await expect(dialog).toHaveCount(0)
  expect(await persistedExpense(label, info.project.name)).toEqual({ clientId: `cexpensepickerclient${info.project.name}`, projectId: `cexpensepickerolder${info.project.name}`, amountCents: 1234 })
  await page.reload()
  await expect(page.getByRole("row").filter({ hasText: label })).toContainText("12,34")
})

test("Editing an older linked expense preserves fields and blocks saving through a failed lookup", async ({ page }, info) => {
  await page.getByRole("row").filter({ hasText: "EXISTING-LINKED-EXPENSE" }).getByRole("button", { name: "Ouvrir les actions de la dépense", exact: true }).click()
  await page.getByRole("menuitem", { name: "Éditer", exact: true }).click()
  const dialog = page.getByRole("dialog")
  await expect(dialog.getByText("101 résultats", { exact: true })).toBeVisible()
  await expect(dialog.getByRole("combobox", { name: "Projet lié", exact: true })).toContainText("ZZ ANCIEN CHANTIER")
  const label = `Edited linked expense ${info.project.name}`
  await dialog.getByLabel("Libellé", { exact: false }).fill(label)
  let failOnce = true
  await page.route("**/dashboard/depenses", async route => {
    if (failOnce && route.request().method() === "POST" && route.request().headers()["next-action"]) {
      failOnce = false
      await route.fulfill({ status: 503, contentType: "text/plain", body: "Fictional selector outage" })
    } else await route.continue()
  })
  await dialog.getByRole("textbox", { name: "Rechercher un chantier", exact: true }).fill("Recent project 001")
  await expect(dialog.getByRole("alert")).toContainText("Impossible d’actualiser la liste.")
  await expect(dialog.getByRole("button", { name: "Enregistrer", exact: true })).toBeDisabled()
  await expect(dialog.getByLabel("Libellé", { exact: false })).toHaveValue(label)
  await expect(dialog.getByLabel("Montant TTC", { exact: false })).toHaveValue("12.34")
  await expect(dialog.getByRole("combobox", { name: "Projet lié", exact: true })).toContainText("ZZ ANCIEN CHANTIER")
  await dialog.getByRole("button", { name: "Réessayer", exact: true }).click()
  await expect(dialog.getByText("1 résultat", { exact: true })).toBeVisible()
  await dialog.getByRole("button", { name: "Enregistrer", exact: true }).click()
  await expect(dialog).toHaveCount(0)
  expect(await persistedExpense(label, info.project.name)).toEqual({ clientId: `cexpensepickerclient${info.project.name}`, projectId: `cexpensepickerolder${info.project.name}`, amountCents: 1234 })
  await page.reload()
  await expect(page.getByRole("row").filter({ hasText: label })).toContainText("12,34")
})

test("Editing an expense with a direct client link preserves it without assigning a project", async ({ page }, info) => {
  await page.getByRole("row").filter({ hasText: "CLIENT-ONLY-EXPENSE" }).getByRole("button", { name: "Ouvrir les actions de la dépense", exact: true }).click()
  await page.getByRole("menuitem", { name: "Éditer", exact: true }).click()
  const dialog = page.getByRole("dialog")
  await expect(dialog.getByText("101 résultats", { exact: true })).toBeVisible()
  await expect(dialog.getByRole("combobox", { name: "Projet lié", exact: true })).toContainText("Aucun projet")
  const label = `Edited direct client expense ${info.project.name}`
  await dialog.getByLabel("Libellé", { exact: false }).fill(label)
  await dialog.getByRole("button", { name: "Enregistrer", exact: true }).click()
  await expect(dialog).toHaveCount(0)
  expect(await persistedExpense(label, info.project.name)).toEqual({ clientId: `cexpensepickerclient${info.project.name}`, projectId: null, amountCents: 5678 })
  await page.reload()
  await expect(page.getByRole("row").filter({ hasText: label })).toContainText("56,78")
})
