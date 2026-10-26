import { expect, test } from "@playwright/test"

test("les critères Marketing présentent des choix métier et sérialisent leurs valeurs", async ({ page }) => {
  await page.goto("/dashboard/marketing")
  await page.getByRole("tab", { name: "Règles de score", exact: true }).click()
  const field = page.getByLabel("Champ", { exact: true })
  const value = page.getByLabel("Valeur", { exact: true })
  await field.selectOption("status")
  await value.selectOption({ label: "Qualifié" })
  await expect(value).toHaveValue("QUALIFIED")
  await field.selectOption("marketingOptIn")
  await value.selectOption({ label: "Refusé" })
  await expect(value).toHaveValue("false")
  await page.getByLabel("Opérateur", { exact: true }).selectOption("EXISTS")
  await expect(value).toHaveCount(0)
  const stored = await field.evaluate(element => new FormData((element as HTMLSelectElement).form!).get("value"))
  expect(stored).toBe("")
  await page.getByLabel("Opérateur", { exact: true }).selectOption("EQUALS")
  await field.selectOption("city")
  await expect(value).toHaveValue("")
  await value.fill("Nantes")
  await expect(value).toHaveValue("Nantes")
})

for (const [path, id] of [
  ["/dashboard/organisation#objectifs", "objectifs"],
  ["/dashboard/pipeline#previsions", "previsions"],
  ["/dashboard/comptabilite#export-comptable", "export-comptable"],
]) {
  test(`le raccourci ${path} atteint sa section`, async ({ page }) => {
    await page.goto(path)
    await expect(page.locator(`#${id}`)).toBeInViewport()
    if (id === "objectifs") {
      await page.locator("#dashboard-main").evaluate(element => { element.scrollTop = 0 })
      await page.reload()
      await expect(page.locator(`#${id}`)).toBeInViewport()
    }
  })
}
