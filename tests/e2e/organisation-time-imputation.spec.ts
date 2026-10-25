import { createDatabaseClient } from "@/lib/database-client"
import { expect, test } from "@playwright/test"

const database = createDatabaseClient()
test.afterAll(async () => { await database.$disconnect() })
let clientErrors: string[] = []
test.beforeEach(async ({ page }, info) => {
  clientErrors = []; page.on("pageerror", error => clientErrors.push(error.message))
  await page.context().clearCookies(); await page.goto("/auth/login")
  await page.getByLabel("Adresse e-mail professionnelle").fill(`task-time-${info.project.name}@example.test`)
  await page.getByLabel("Mot de passe", { exact: true }).fill(process.env.E2E_USER_PASSWORD || "RecetteSolide2026")
  await page.getByRole("button", { name: "Se connecter", exact: true }).click()
  await page.waitForURL(url => url.pathname === "/dashboard", { timeout: 60_000 })
  expect((await page.goto("/dashboard/organisation"))?.status()).toBe(200)
})
test.afterEach(() => { expect(clientErrors).toEqual([]) })

async function persistedTask(id: string) {
  if (process.env.RECIPE_ISOLATED !== "true" || !process.env.DATABASE_URL?.startsWith("file:") || process.env.PLAYWRIGHT_BASE_URL) throw new Error("La preuve SQL navigateur exige la recette SQLite isolée")
  return database.organisationTask.findUniqueOrThrow({ where: { id }, include: { timeEntry: true, project: { select: { consumedCents: true } } } })
}

test("An imputed task leaves the open list and a reopened task cannot be imputed again", async ({ page }, info) => {
  const row = page.getByText("FICTIONAL-TASK-ONCE", { exact: true }).first().locator("..").locator("..").locator("..")
  await row.getByTitle("Imputer en temps passé", { exact: true }).click()
  await expect(page.getByText("Temps imputé et tâche terminée.", { exact: true })).toBeVisible()
  await expect(page.getByText("FICTIONAL-TASK-ONCE", { exact: true })).toHaveCount(0)
  const id = `ctasktimeonce${info.project.name}`, initial = await persistedTask(id)
  expect(initial).toMatchObject({ status: "DONE", timeImputedAt: expect.any(Date), timeEntry: { durationSec: 3600, sourceOrganisationTaskId: id }, project: { consumedCents: 6250 } })
  // Simulate an external reopening only in the disposable, guarded database.
  await database.organisationTask.update({ where: { id }, data: { status: "TODO" } })
  const reopened = await persistedTask(id)
  await page.reload()
  await row.getByTitle("Imputer en temps passé", { exact: true }).click()
  await expect(page.getByText("Cette tâche a déjà été imputée", { exact: true })).toBeVisible()
  await expect(row.getByText("À faire", { exact: true })).toBeVisible()
  await page.reload()
  expect(await persistedTask(id)).toEqual(reopened)
})

for (const [kind, message] of [["DURATION", "Saisie invalide : vérifiez la durée, la date et la description."], ["RELATION", "Tâche introuvable ou chantier inaccessible"]]) {
  test(`A ${kind.toLowerCase()} refusal is explained and preserves the task`, async ({ page }, info) => {
    const id = `ctasktime${kind.toLowerCase()}${info.project.name}`, initial = await persistedTask(id)
    const row = page.getByText(`FICTIONAL-TASK-${kind}`, { exact: true }).first().locator("..").locator("..").locator("..")
    await row.getByTitle("Imputer en temps passé", { exact: true }).click()
    await expect(page.getByText(message, { exact: true })).toBeVisible()
    await expect(row.getByText("À faire", { exact: true })).toBeVisible()
    await page.reload()
    expect(await persistedTask(id)).toEqual(initial)
  })
}
