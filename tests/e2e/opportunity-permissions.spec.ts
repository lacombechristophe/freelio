import { expect, test, type Locator, type Page } from "@playwright/test"
import { mkdir } from "node:fs/promises"
import path from "node:path"
import { captureScrollablePage } from "./helpers/visual-evidence"

async function capture(page: Page, surface: string, role: string, state: string, scrollContainer: Locator = page.locator("#dashboard-main")) {
  const directory = path.join(process.cwd(), "test-results", "opportunity-permissions", surface, role)
  await mkdir(directory, { recursive: true })
  await expect(scrollContainer).toBeVisible()
  expect((await captureScrollablePage(page, directory, state, scrollContainer)).complete).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual((page.viewportSize()?.width ?? 0) + 1)
}

for (const role of ["owner", "admin", "sales", "viewer"]) {
  test(`opportunity references respect company and agency scope for ${role}`, async ({ page }, info) => {
    const surface = info.project.name
    await page.context().clearCookies()
    await page.goto("/auth/login")
    await page.getByLabel("Adresse e-mail professionnelle").fill(`opportunity-${role}-${surface}@example.test`)
    await page.getByLabel("Mot de passe", { exact: true }).fill(process.env.E2E_USER_PASSWORD || "RecetteSolide2026")
    await page.getByRole("button", { name: "Se connecter", exact: true }).click()
    await page.waitForURL(url => url.pathname === "/dashboard", { timeout: 60_000 })
    await page.goto(`/dashboard/pipeline/copportunity${surface}local`)
    await expect(page.getByRole("heading", { name: "Fictional scoped opportunity", exact: true })).toBeVisible()
    await expect(page.getByRole("link", { name: /OPP-LOCAL/ })).toBeVisible()
    await expect(page.getByText("Fictional local opportunity project", { exact: true })).toBeVisible()
    await expect(page.getByText(/OPP-FOREIGN/)).toHaveCount(0)
    if (role === "owner" || role === "admin") {
      await expect(page.getByRole("link", { name: /OPP-OTHER/ })).toBeVisible()
      await expect(page.getByText("Fictional other opportunity project", { exact: true })).toBeVisible()
    } else {
      await expect(page.getByText(/OPP-OTHER/)).toHaveCount(0)
      await expect(page.getByText("Fictional other opportunity project", { exact: true })).toHaveCount(0)
    }
    await capture(page, surface, role, "detail")
    await page.goto(`/dashboard/pipeline/copportunity${surface}inconsistent`)
    await expect(page.getByRole("heading", { name: "Cette page n’existe pas.", exact: true })).toBeVisible()
    await expect(page.getByText("Fictional foreign opportunity client", { exact: true })).toHaveCount(0)
    await capture(page, surface, role, "inconsistent-client", page.locator("html"))
  })
}
