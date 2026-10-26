import { expect, test } from "@playwright/test"
import { createHash } from "node:crypto"

test("le choix du thème reste disponible sur mobile et respecte la préférence explicite", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 })
  await page.emulateMedia({ colorScheme: "dark" })
  const response = await page.goto("/dashboard")
  const scripts = await page.locator("script:not([src])").allTextContents()
  const bootstrap = scripts.find(script => script.includes("localStorage") && script.includes("theme"))
  expect(bootstrap).toBeTruthy()
  const hash = createHash("sha256").update(bootstrap!).digest("base64")
  expect(response?.headers()["content-security-policy"]).toContain(`'sha256-${hash}'`)
  // The default remains light until the user chooses a different preference.
  await expect(page.locator("html")).toHaveClass(/light/)
  const choose = async (name: string) => {
    await page.getByRole("button", { name: "Ouvrir le menu du compte", exact: true }).click()
    await page.getByRole("menuitemradio", { name, exact: true }).click()
    await page.keyboard.press("Escape")
    await expect(page.getByRole("menu")).toBeHidden()
  }
  await choose("Système")
  await expect(page.locator("html")).toHaveClass(/dark/)
  await page.emulateMedia({ colorScheme: "light" })
  await expect(page.locator("html")).toHaveClass(/light/)
  await choose("Sombre")
  await page.reload()
  await expect(page.locator("html")).toHaveClass(/dark/)
  await page.goto("/dashboard/clients")
  await expect(page.locator("html")).toHaveClass(/dark/)
  await choose("Clair")
  await expect(page.locator("html")).toHaveClass(/light/)
})
