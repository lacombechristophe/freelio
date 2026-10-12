import { expect, test } from "@playwright/test"

const billedMessage = "Ce temps est déjà rattaché à une facture. Il ne peut être modifié ni supprimé."
let clientErrors: string[] = []
test.beforeEach(async ({ page }, info) => {
  clientErrors = []
  page.on("pageerror", error => clientErrors.push(error.message))
  await page.context().clearCookies()
  await page.goto("/auth/login")
  await page.getByLabel("Adresse e-mail professionnelle").fill(`time-integrity-${info.project.name}@example.test`)
  await page.getByLabel("Mot de passe", { exact: true }).fill(process.env.E2E_USER_PASSWORD || "RecetteSolide2026")
  await page.getByRole("button", { name: "Se connecter", exact: true }).click()
  await page.waitForURL(url => url.pathname === "/dashboard", { timeout: 60_000 })
  expect((await page.goto("/dashboard/temps"))?.status()).toBe(200)
})
test.afterEach(() => { expect(clientErrors).toEqual([]) })

test("A billed time edit is explained and retains the form and original row", async ({ page }) => {
  const row = page.getByRole("row").filter({ hasText: "FICTIONAL-BILLED-TIME" })
  await row.getByRole("button", { name: "Ouvrir les actions de la saisie de temps", exact: true }).click()
  await page.getByRole("menuitem", { name: "Éditer", exact: true }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("Heures", { exact: true }).fill("2")
  await dialog.getByLabel("Description", { exact: true }).fill("Unsaved fictional edit")
  await dialog.getByRole("button", { name: "Enregistrer", exact: true }).click()
  await expect(page.getByText(billedMessage, { exact: true })).toBeVisible()
  await expect(dialog.getByLabel("Heures", { exact: true })).toHaveValue("2")
  await expect(dialog.getByLabel("Description", { exact: true })).toHaveValue("Unsaved fictional edit")
  await dialog.getByRole("button", { name: "Annuler", exact: true }).click()
  await page.reload()
  await expect(page.getByRole("row").filter({ hasText: "FICTIONAL-BILLED-TIME" })).toContainText("0h 01m")
})

test("A billed time deletion is explained and preserves the entry after reload", async ({ page }) => {
  await page.getByRole("row").filter({ hasText: "FICTIONAL-BILLED-TIME" }).getByRole("button", { name: "Ouvrir les actions de la saisie de temps", exact: true }).click()
  await page.getByRole("menuitem", { name: "Supprimer", exact: true }).click()
  await page.getByRole("dialog").getByRole("button", { name: "Supprimer", exact: true }).click()
  await expect(page.getByText(billedMessage, { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole("row").filter({ hasText: "FICTIONAL-BILLED-TIME" })).toBeVisible()
})

test("A rejected manual duration retains its description, project and duration", async ({ page }) => {
  await page.getByRole("button").filter({ hasText: "0.0h" }).first().click()
  const dialog = page.getByRole("dialog")
  await expect(dialog.locator("#manualProj")).toHaveValue(/ctimeintegrityproject/)
  await dialog.getByLabel("Heures", { exact: true }).fill("999999")
  await dialog.getByLabel("Description", { exact: true }).fill("Unsaved fictional manual time")
  await dialog.getByRole("button", { name: "Enregistrer", exact: true }).click()
  await expect(page.getByText("Saisie invalide : vérifiez la durée, la date et la description.", { exact: true })).toBeVisible()
  await expect(dialog.getByLabel("Heures", { exact: true })).toHaveValue("999999")
  await expect(dialog.getByLabel("Description", { exact: true })).toHaveValue("Unsaved fictional manual time")
  await expect(dialog.locator("#manualProj")).toHaveValue(/ctimeintegrityproject/)
})

test("An inaccessible stored timer is refused without resetting its elapsed time", async ({ page }, info) => {
  const projectId = `ctimeintegrityinvalid${info.project.name}`
  await page.evaluate(projectId => sessionStorage.setItem("crm-timer-storage", JSON.stringify({ state: { elapsed: 120, isRunning: false, projectId }, version: 0 })), projectId)
  await page.reload()
  await expect(page.getByText("00:02:00", { exact: true })).toBeVisible()
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click()
  await expect(page.getByText("Projet introuvable", { exact: true })).toBeVisible()
  await expect(page.getByText("00:02:00", { exact: true })).toBeVisible()
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem("crm-timer-storage") ?? "{}").state)).toEqual({ elapsed: 120, isRunning: false, projectId })
})
