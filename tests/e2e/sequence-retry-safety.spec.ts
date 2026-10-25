import { expect, test } from "@playwright/test"

test("refuses retry of an expired uncertain delivery and preserves the refusal after reload", async ({ page }, info) => {
  const subject = `UIQA Expired Retry ${info.project.name}`
  const message = "Résultat fournisseur incertain : vérifiez le résultat avant toute relance."
  const open = async () => {
    await page.goto("/dashboard/automatisations")
    await page.getByRole("tab", { name: /^Journal/ }).click()
    await page.getByRole("tab", { name: /E-mails/ }).click()
    await page.getByRole("button").filter({ has: page.getByText(subject, { exact: true }) }).click()
  }
  await open()
  const dialog = page.getByRole("dialog", { name: subject, exact: true })
  await dialog.getByRole("button", { name: "Réessayer", exact: true }).click()
  await expect(page.getByText(message, { exact: true })).toBeVisible()
  await page.keyboard.press("Escape")
  await open()
  await expect(dialog).toContainText("À reprendre")
  await dialog.getByRole("button", { name: "Réessayer", exact: true }).click()
  await expect(page.getByText(message, { exact: true })).toBeVisible()
})
