import { expect, test, type Page } from "@playwright/test"
function row(page: Page, subject: string) { return page.locator("div.border-b").filter({ has: page.getByText(subject, { exact: true }) }) }

test("repairs known acceptance without resending or exposing hidden recipients", async ({ page }, info) => {
  const subject = `UIQA Recovery Accepted ${info.project.name}`
  await page.goto("/dashboard/communications?tab=recovery")
  await page.getByRole("tab", { name: "Envois à vérifier", exact: true }).click()
  await expect(row(page, subject)).toContainText("Acceptation confirmée")
  await expect(page.getByText("hidden-recovery@example.test", { exact: true })).toHaveCount(0)
  await row(page, subject).getByRole("button", { name: "Réparer l’historique", exact: true }).click()
  await expect(page.getByRole("status").filter({ hasText: "Historique réparé sans nouvel envoi" })).toBeVisible()
  await expect(page.getByText(subject, { exact: true })).toHaveCount(0)
  await page.getByRole("tab", { name: "Boîte de réception" }).click()
  await page.getByLabel("Recherche", { exact: true }).fill(subject)
  await page.getByRole("button", { name: "Rechercher", exact: true }).click()
  await expect(page.getByRole("button").filter({ hasText: subject })).toBeVisible()
})

test("keeps unknown results explicit, paginates commands and confirms classification without retry", async ({ page }, info) => {
  const subject = `UIQA Recovery Unknown ${info.project.name}`
  await page.goto("/dashboard/communications?tab=recovery")
  await page.getByRole("tab", { name: "Envois à vérifier", exact: true }).click()
  await page.getByRole("button", { name: "Page suivante", exact: true }).click()
  await expect(row(page, subject)).toContainText("Résultat inconnu")
  await expect(row(page, subject).getByRole("button", { name: "Réparer l’historique", exact: true })).toBeDisabled()
  await expect(row(page, subject).getByRole("button", { name: "Classer sans relance", exact: true })).toBeDisabled()
  await row(page, subject).getByRole("button", { name: "Vérifier le résultat", exact: true }).click()
  await expect(page.getByRole("status").filter({ hasText: "Résultat inconnu" })).toBeVisible()
  await row(page, subject).getByLabel("Motif du classement").fill("Fictional deliberate classification")
  await row(page, subject).getByRole("button", { name: "Classer sans relance", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "Classer cette commande sans relance ?" })
  await expect(dialog).toContainText("ne prouve pas une absence d’envoi")
  await dialog.getByRole("button", { name: "Classer sans relance", exact: true }).click()
  await expect(page.getByRole("status").filter({ hasText: "Commande classée sans relance" })).toBeVisible()
  await expect(page.getByText(subject, { exact: true })).toHaveCount(0)
  await page.getByRole("tab", { name: "Brouillons", exact: true }).click()
  await expect(page.getByText(subject, { exact: true })).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth))
})
