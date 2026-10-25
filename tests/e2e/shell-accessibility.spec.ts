import { expect, test } from "@playwright/test"

for (const width of [320, 393]) {
  test(`le lien d’évitement garde la page stable à ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 852 })
    await page.goto("/dashboard")
    const main = page.locator("#dashboard-main")
    await expect(main.getByRole("heading", { name: "Vue d’ensemble", exact: true })).toBeVisible()
    const before = await main.boundingBox()
    await page.getByRole("button", { name: "Ouvrir la navigation", exact: true }).focus()
    await page.keyboard.press("Shift+Tab")
    const skip = page.getByRole("link", { name: "Aller au contenu", exact: true })
    await expect(skip).toBeFocused()
    await expect(skip).toHaveCSS("position", "fixed")
    const after = await main.boundingBox()
    expect(after?.x).toBe(before?.x)
    expect(after?.width).toBe(before?.width)
    expect((await skip.boundingBox())?.height).toBeLessThan(60)
    await skip.press("Enter")
    await expect(main).toBeFocused()
  })

  test(`la recherche conserve sa cible dans l’en-tête à ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 852 })
    await page.goto("/dashboard")
    const search = page.getByRole("button", { name: "Ouvrir la recherche globale", exact: true })
    await expect(search).toBeVisible()
    const bounds = await search.boundingBox()
    expect(bounds?.width).toBeGreaterThanOrEqual(44)
    expect(bounds?.height).toBeGreaterThanOrEqual(44)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    await search.click()
    await expect(page.getByRole("dialog", { name: "Recherche globale", exact: true })).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(search).toBeFocused()
  })
}

test("le menu mobile annonce la rubrique active", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 })
  await page.goto("/dashboard/clients")
  await page.getByRole("button", { name: "Ouvrir la navigation", exact: true }).click()
  const navigation = page.getByRole("dialog", { name: "Menu principal", exact: true })
  await expect(navigation.getByRole("link", { name: "Clients", exact: true })).toHaveAttribute("aria-current", "page")
  await page.keyboard.press("Escape")
  await expect(page.getByRole("button", { name: "Ouvrir la navigation", exact: true })).toBeFocused()
})
