import { expect, test, type Page } from "@playwright/test"
import { mkdir } from "node:fs/promises"
import path from "node:path"
import { captureScrollablePage } from "./helpers/visual-evidence"

const domains = [
  { url: "/dashboard/sales", denied: "Accès commercial requis" },
  { url: "/dashboard/revenue", denied: "Accès Finance requis" },
  { url: "/dashboard/marketing/overview", denied: "Accès Automatisations requis" },
] as const

async function login(page: Page, role: string, surface: string) {
  await page.goto("/auth/login")
  await page.getByLabel("Adresse e-mail professionnelle").fill(`analytics-${role}-${surface}@example.test`)
  await page.getByLabel("Mot de passe", { exact: true }).fill(process.env.E2E_USER_PASSWORD || "RecetteSolide2026")
  await page.getByRole("button", { name: "Se connecter", exact: true }).click()
  await page.waitForURL(url => url.pathname === "/dashboard", { timeout: 60_000 })
}

for (const role of ["sales", "accounting"]) {
  test(`Service workspace refuses the ${role} role`, async ({ page }, info) => {
    await login(page, role, info.project.name)
    await page.goto("/dashboard/service")
    await expect(page.getByRole("heading", { name: "Accès Service requis", exact: true })).toBeVisible()
    await expect(page.locator(".workspace-metrics")).toHaveCount(0)
    await expect(page.getByText("Fictional other ticket", { exact: true })).toHaveCount(0)
    await capture(page, info.project.name, role, "service-denied")
  })
}

async function capture(page: Page, surface: string, role: string, state: string) {
  const directory = path.join(process.cwd(), "test-results", "workspace-permissions", surface, role)
  await mkdir(directory, { recursive: true })
  expect((await captureScrollablePage(page, directory, state)).complete).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual((page.viewportSize()?.width ?? 0) + 1)
}

for (const role of ["owner", "technician", "service", "viewer"]) {
  test(`workspace domains and CRM metrics respect permissions for ${role}`, async ({ page }, info) => {
    await login(page, role, info.project.name)
    for (const domain of domains) {
      await page.goto(domain.url)
      const denied = role === "technician" || (role === "service" && domain.url !== "/dashboard/marketing/overview") || (role === "viewer" && domain.url === "/dashboard/marketing/overview")
      if (denied) {
        await expect(page.getByRole("heading", { name: domain.denied, exact: true })).toBeVisible()
        await expect(page.getByText("Votre rôle ne permet pas de consulter cet espace.", { exact: true })).toBeVisible()
        await expect(page.locator(".workspace-metrics")).toHaveCount(0)
        await expect(page.getByText("WORKSPACE-other", { exact: true })).toHaveCount(0)
      } else {
        await expect(page.locator(".workspace-metrics")).toBeVisible()
        await expect(page.getByRole("heading", { name: domain.denied, exact: true })).toHaveCount(0)
        if (domain.url === "/dashboard/revenue") {
          const unpaid = page.locator(".workspace-metric").filter({ hasText: "Reste à encaisser" })
          await expect(unpaid).toContainText(role === "owner" ? "300" : "100")
          await expect(page.getByText("WORKSPACE-local", { exact: true }).first()).toBeVisible()
          if (role === "viewer") await expect(page.getByText("WORKSPACE-other", { exact: true })).toHaveCount(0)
        }
      }
      await capture(page, info.project.name, role, domain.url.split("/").at(-1)!)
    }
    await page.goto("/dashboard/crm")
    const deals = page.locator(".workspace-metric").filter({ hasText: "Affaires ouvertes" })
    await expect(deals).toContainText(role === "owner" || role === "viewer" ? "0" : "Accès commercial requis")
    const client = page.locator(".workspace-panel .workspace-row").filter({ hasText: "Fictional assets client" })
    await expect(client).toContainText(`${role === "owner" ? 2 : 1} projet(s)`)
    await capture(page, info.project.name, role, "crm")
  })
}
