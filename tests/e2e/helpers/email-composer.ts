import { expect, type Page } from "@playwright/test"

/** Existing delivery tests exercise exact HTML; select that explicit authoring mode. */
export async function emailHtmlField(page: Page) {
  const field = page.getByLabel("Contenu HTML", { exact: true })
  if (!await field.isVisible()) await page.getByRole("button", { name: "HTML avancé", exact: true }).click()
  await expect(field).toBeVisible()
  return field
}
