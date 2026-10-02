import { expect, test } from "@playwright/test"

test("les intitulés métier restent en français sur ordinateur et mobile", async ({ page }) => {
  await page.goto("/dashboard/pipeline")
  await expect(page.getByRole("heading", { name: "Cycle de vente", exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "Configurer les cycles de vente" })).toBeVisible()

  await page.goto("/dashboard/marketing")
  await expect(page.getByRole("heading", { name: "Qualification & segments", exact: true })).toBeVisible()

  await page.goto("/dashboard/automatisations")
  await page.getByRole("tab", { name: /^Scénarios\b/ }).click()
  await expect(page.getByRole("button", { name: "Nouveau scénario", exact: true })).toBeVisible()
  await expect(page.getByRole("tab", { name: "Workflows", exact: true })).toHaveCount(0)

  for (const route of ["crm", "sales", "marketing/overview", "service"]) {
    await page.goto(`/dashboard/${route}`)
    const main = page.locator("#dashboard-main")
    await expect(main).toBeVisible()
    await expect(main).not.toContainText(/\b(?:TODO|DRAFT|ACTIVE|PAUSED|CONTACTED|LEAD_CREATED)\b/)
    expect(await main.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
  }
})
