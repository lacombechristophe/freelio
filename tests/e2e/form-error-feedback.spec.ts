import { expect, test } from "@playwright/test"

test("un refus de création Client reste relisible sans effacer la saisie", async ({ page }) => {
  await page.goto("/dashboard/clients")
  await page.getByRole("button", { name: "Ajouter un client", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "Nouveau client", exact: true })
  await expect(dialog.getByRole("combobox", { name: "Type *", exact: true })).toBeVisible()
  await dialog.getByLabel("Nom *", { exact: true }).fill("X")
  await dialog.getByLabel("Adresse *", { exact: true }).fill("1 rue des Tests — adresse fictive")
  await dialog.getByRole("button", { name: "Créer", exact: true }).click()
  await expect(dialog.getByRole("alert")).toBeVisible()
  await expect(dialog.getByRole("alert")).toBeFocused()
  await expect(dialog.getByLabel("Nom *", { exact: true })).toHaveValue("X")
  await page.keyboard.press("Tab")
  await expect(dialog.getByRole("alert")).toBeVisible()
})
