import { expect, test } from "@playwright/test"
import { mkdir } from "node:fs/promises"
import path from "node:path"
import { captureScrollablePage } from "./helpers/visual-evidence"

for (const role of ["owner", "admin", "technician", "service", "sales", "accounting", "viewer"]) {
  test(`project documents respect domain permissions for ${role}`, async ({ page }, info) => {
    const surface = info.project.name
    await page.context().clearCookies()
    await page.goto("/auth/login")
    await page.getByLabel("Adresse e-mail professionnelle").fill(`project-readers-${role}-${surface}@example.test`)
    await page.getByLabel("Mot de passe", { exact: true }).fill(process.env.E2E_USER_PASSWORD || "RecetteSolide2026")
    await page.getByRole("button", { name: "Se connecter", exact: true }).click()
    await page.waitForURL(url => url.pathname === "/dashboard", { timeout: 60_000 })
    await page.goto(`/dashboard/projets/cprojectreaders${surface}local`)
    await expect(page.getByRole("heading", { name: "Fictional scoped reader project", exact: true })).toBeVisible()
    await expect(page.getByText("Fictional reader time", { exact: true })).toBeVisible()
    await expect(page.getByText("1h 00m", { exact: true })).toBeVisible()
    const budget = page.locator('[data-slot="card"]').filter({ has: page.getByText("Budget", { exact: true }) })
    await expect(budget).toContainText(/500,00\s*€/)
    await expect(budget).toContainText(/50,00\s*€/)
    const sales = role !== "technician" && role !== "service"
    const finance = ["owner", "admin", "accounting", "viewer"].includes(role)
    if (sales) {
      await expect(page.getByRole("link", { name: "READER-QUOTE", exact: true })).toBeVisible()
      await expect(page.getByText("Devis (1)", { exact: true })).toBeVisible()
    } else {
      await expect(page.getByText("Accès commercial requis", { exact: true })).toBeVisible()
      await expect(page.getByRole("link", { name: "READER-QUOTE", exact: true })).toHaveCount(0)
      await expect(page.getByText(/^Devis \(/)).toHaveCount(0)
    }
    if (finance) {
      await expect(page.getByRole("link", { name: "READER-INVOICE", exact: true })).toBeVisible()
      await expect(page.getByText("Factures (1)", { exact: true })).toBeVisible()
    } else {
      await expect(page.getByText("Accès Finance requis", { exact: true })).toBeVisible()
      await expect(page.getByRole("link", { name: "READER-INVOICE", exact: true })).toHaveCount(0)
      await expect(page.getByText(/^Factures \(/)).toHaveCount(0)
    }
    await expect(page.getByText(/READER-INCONSISTENT/)).toHaveCount(0)
    const directory = path.join(process.cwd(), "test-results", "project-reader-permissions", surface, role)
    await mkdir(directory, { recursive: true })
    expect((await captureScrollablePage(page, directory, "detail")).complete).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual((page.viewportSize()?.width ?? 0) + 1)
    await page.goto(`/dashboard/projets/cprojectreaders${surface}inconsistent`)
    await expect(page.getByRole("heading", { name: "Cette page n’existe pas.", exact: true })).toBeVisible()
    await expect(page.getByText("Fictional foreign project reader client", { exact: true })).toHaveCount(0)
  })
}
