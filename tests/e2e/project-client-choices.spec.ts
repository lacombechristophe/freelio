import { PrismaClient } from "@prisma/client"
import { expect, test } from "@playwright/test"

const database = new PrismaClient()
test.afterAll(async () => { await database.$disconnect() })
let errors: string[] = []
test.beforeEach(async ({ page }, info) => {
  errors = []; page.on("pageerror", error => errors.push(error.message))
  await page.context().clearCookies(); await page.goto("/auth/login")
  await page.getByLabel("Adresse e-mail professionnelle").fill(`project-client-choice-${info.project.name}@example.test`)
  await page.getByLabel("Mot de passe", { exact: true }).fill(process.env.E2E_USER_PASSWORD || "RecetteSolide2026")
  await page.getByRole("button", { name: "Se connecter", exact: true }).click()
  await page.waitForURL(url => url.pathname === "/dashboard", { timeout: 60_000 })
  expect((await page.goto("/dashboard/projets"))?.status()).toBe(200)
})
test.afterEach(() => { expect(errors).toEqual([]) })

test("The 1001st client can create a project and remains selected outside the searched page", async ({ page }, info) => {
  await page.getByRole("button", { name: "Nouveau chantier", exact: true }).click()
  const dialog = page.getByRole("dialog"), name = `Created last-client project ${info.project.name}`
  await expect(dialog.getByText("1 001 résultats", { exact: true })).toBeVisible()
  await dialog.getByLabel("Nom", { exact: false }).fill(name)
  await dialog.getByLabel("Description", { exact: true }).fill("Preserved fictional creation description")
  await dialog.getByLabel("Budget (€)", { exact: true }).fill("123.45")
  await dialog.getByRole("button", { name: "Page suivante", exact: true }).click()
  await expect(dialog.getByText("Page 2 sur 41", { exact: true })).toBeVisible()
  await dialog.getByRole("textbox", { name: "Rechercher un client", exact: true }).fill("dernier client")
  await expect(dialog.getByText("1 résultat", { exact: true })).toBeVisible()
  await dialog.getByRole("combobox", { name: "Client du projet", exact: true }).click()
  await page.getByRole("option", { name: "ZZ DERNIER CLIENT", exact: true }).click()
  await dialog.getByRole("textbox", { name: "Rechercher un client", exact: true }).fill("no matching client")
  await expect(dialog.getByText("0 résultats", { exact: true })).toBeVisible()
  await expect(dialog.getByRole("combobox", { name: "Client du projet", exact: true })).toContainText("ZZ DERNIER CLIENT")
  await expect(dialog.getByLabel("Nom", { exact: false })).toHaveValue(name)
  await expect(dialog.getByLabel("Description", { exact: true })).toHaveValue("Preserved fictional creation description")
  await expect(dialog.getByLabel("Budget (€)", { exact: true })).toHaveValue("123.45")
  await dialog.getByRole("button", { name: "Créer", exact: true }).click()
  await expect(dialog).toHaveCount(0)
  const created = await database.project.findFirstOrThrow({ where: { name, clientId: `cprojectchoicelast${info.project.name}` } })
  expect(created).toMatchObject({ budgetCents: 12345, description: "Preserved fictional creation description" })
  expect(await database.auditLog.count({ where: { resourceId: created.id, action: "CREATE_PROJECT" } })).toBe(1)
})

test("An existing last-client project preserves its inputs through lookup failure and recovery", async ({ page }, info) => {
  await page.getByRole("button", { name: "Actions pour EXISTING-LAST-CLIENT-PROJECT", exact: true }).click()
  await page.getByRole("menuitem", { name: "Modifier", exact: true }).click()
  const dialog = page.getByRole("dialog")
  await expect(dialog.getByText("1 001 résultats", { exact: true })).toBeVisible()
  await expect(dialog.getByRole("combobox", { name: "Client du projet", exact: true })).toContainText("ZZ DERNIER CLIENT")
  await dialog.getByLabel("Description", { exact: true }).fill("Preserved fictional edited description")
  let failOnce = true
  await page.route("**/dashboard/projets", async route => {
    if (failOnce && route.request().method() === "POST" && route.request().headers()["next-action"]) {
      failOnce = false; await route.fulfill({ status: 503, contentType: "text/plain", body: "Fictional client choice outage" })
    } else await route.continue()
  })
  await dialog.getByRole("textbox", { name: "Rechercher un client", exact: true }).fill("Client 0001")
  await expect(dialog.getByRole("alert")).toContainText("Impossible d’actualiser la liste.")
  await expect(dialog.getByRole("button", { name: "Enregistrer", exact: true })).toBeDisabled()
  await expect(dialog.getByRole("combobox", { name: "Client du projet", exact: true })).toContainText("ZZ DERNIER CLIENT")
  await expect(dialog.getByLabel("Description", { exact: true })).toHaveValue("Preserved fictional edited description")
  await expect(dialog.getByLabel("Budget (€)", { exact: true })).toHaveValue("123.45")
  await dialog.getByRole("button", { name: "Réessayer", exact: true }).click()
  await expect(dialog.getByText("1 résultat", { exact: true })).toBeVisible()
  await dialog.getByRole("button", { name: "Enregistrer", exact: true }).click()
  await expect(dialog).toHaveCount(0)
  expect(await database.project.findUniqueOrThrow({ where: { id: `cprojectchoiceexisting${info.project.name}` } })).toMatchObject({ clientId: `cprojectchoicelast${info.project.name}`, budgetCents: 12345, description: "Preserved fictional edited description" })
})
