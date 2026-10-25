import { expect, test, type Page } from "@playwright/test"
import { mkdir, readFile } from "node:fs/promises"
import path from "node:path"
import { captureScrollablePage } from "./helpers/visual-evidence"

const unavailable = "Historique global indisponible"
const clientName = "Fictional assets client"

async function login(page: Page, role: string, surface: string) {
  await page.context().clearCookies()
  await page.goto("/auth/login")
  await page.getByLabel("Adresse e-mail professionnelle").fill(`analytics-${role}-${surface}@example.test`)
  await page.getByLabel("Mot de passe", { exact: true }).fill(process.env.E2E_USER_PASSWORD || "RecetteSolide2026")
  await page.getByRole("button", { name: "Se connecter", exact: true }).click()
  await page.waitForURL(url => url.pathname === "/dashboard", { timeout: 60_000 })
}

async function capture(page: Page, surface: string, role: string, state: string) {
  const directory = path.join(process.cwd(), "test-results", "shared-health-permissions", surface, role)
  await mkdir(directory, { recursive: true })
  expect((await captureScrollablePage(page, directory, state)).complete).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual((page.viewportSize()?.width ?? 0) + 1)
}

for (const role of ["owner", "technician", "service", "viewer"]) {
  test(`client directory, CSV and detail protect global health for ${role}`, async ({ page }, info) => {
    await login(page, role, info.project.name)
    await page.goto("/dashboard/clients")
    const row = page.getByRole("row").filter({ hasText: clientName })
    const score = row.locator('[data-column="relation"]')
    if (role === "owner") await expect(score).toHaveText("37%")
    else {
      await expect(score).toHaveText(unavailable)
      await expect(score.locator('[style*="width"]')).toHaveCount(0)
    }
    await capture(page, info.project.name, role, "directory")
    const downloaded = page.waitForEvent("download")
    await page.getByRole("button", { name: "Exporter", exact: true }).click()
    const csv = await readFile((await (await downloaded).path())!, "utf8")
    expect(csv).toContain('"Score relation"')
    expect(csv).toContain(clientName)
    if (role === "owner") { expect(csv).toContain('"37"'); expect(csv).not.toContain(unavailable) }
    else { expect(csv).toContain(unavailable); expect(csv).not.toContain('"37"') }
    await row.locator('a[href^="/dashboard/clients/"]').click()
    const summary = page.locator('dl[aria-label="Synthèse du client"]')
    const health = summary.locator(":scope > div").filter({ has: page.getByText("Score relation", { exact: true }) })
    if (role === "owner") await expect(summary).toContainText("37 %")
    else {
      await expect(summary).toContainText(unavailable)
      await expect(health).not.toContainText("37")
    }
    await capture(page, info.project.name, role, "detail")
  })

  test(`CRM and Service health cards respect global access for ${role}`, async ({ page }, info) => {
    await login(page, role, info.project.name)
    for (const [url, title, state] of [["/dashboard/crm", "Santé du portefeuille", "crm"], ["/dashboard/service", "Couverture relationnelle", "service"]]) {
      await page.goto(url)
      const health = page.locator(".workspace-distribution").filter({ has: page.getByRole("heading", { name: title, exact: true }) })
      if (role === "owner") {
        await expect(health).toContainText("À risque")
        await expect(health).toContainText("100 %")
        await expect(health).not.toContainText(unavailable)
      } else {
        await expect(health).toContainText(unavailable)
        await expect(health).not.toContainText("À risque")
        await expect(health.locator('[style*="width"]')).toHaveCount(0)
      }
      if (state === "crm") {
        const clients = page.locator(".workspace-panel").filter({ has: page.getByRole("heading", { name: "Portefeuille clients", exact: true }) })
        if (role === "owner") await expect(clients).toContainText("Santé 37/100")
        else { await expect(clients).toContainText(unavailable); await expect(clients).not.toContainText("À risque"); await expect(clients).not.toContainText("37/100") }
      }
      await capture(page, info.project.name, role, state)
    }
  })
}

for (const role of ["owner", "service"]) {
  test(`health simulation and client choices preserve permissions for ${role}`, async ({ page }, info) => {
    await login(page, role, info.project.name)
    await page.goto("/dashboard/automatisations")
    await page.getByRole("tab", { name: "Scénarios" }).click()
    const studio = page.getByRole("tabpanel", { name: "Scénarios" })
    const detail = studio.getByRole("heading", { name: "Fictional health permission simulation", exact: true }).locator("xpath=ancestor::section")
    const client = detail.getByRole("combobox")
    const option = client.locator("option").filter({ hasText: clientName })
    if (role === "owner") {
      await expect(option).toHaveText(`${clientName} · 37/100`)
      await client.selectOption({ label: `${clientName} · 37/100` })
      await detail.getByRole("button", { name: "Simuler", exact: true }).click()
      await expect(detail).toContainText("Conditions remplies")
    } else {
      await expect(option).toHaveText(`${clientName} · ${unavailable}`)
      await expect(detail.getByRole("button", { name: "Simuler", exact: true })).toBeDisabled()
      await expect(detail).toContainText("simulation de santé réservée à un accès Finance sur toute la société")
      await expect(detail).not.toContainText("37/100")
    }
    await capture(page, info.project.name, role, "simulation")
  })
}
