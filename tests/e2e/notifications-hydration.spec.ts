import { expect, test } from "@playwright/test"

test("hydrates notification ages with a browser clock ninety seconds ahead", async ({ page }, info) => {
  const errors: string[] = []
  page.on("pageerror", error => errors.push(error.message))
  await page.addInitScript(() => {
    const originalNow = Date.now.bind(Date)
    Date.now = () => originalNow() + 90_000
  })
  await page.goto("/dashboard/notifications")
  await expect(page.getByRole("heading", { name: "Notifications", exact: true })).toBeVisible()
  const fixture = page.locator("#dashboard-main").getByText(`UIQA Notification hydration ${info.project.name}`, { exact: true })
  await expect(fixture).toBeVisible()
  await page.getByRole("button", { name: "Ouvrir les notifications", exact: true }).click()
  await expect(page.getByText("Voir toutes", { exact: true })).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(fixture).toBeVisible()
  expect(errors).toEqual([])
})
