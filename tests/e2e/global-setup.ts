import { chromium, type FullConfig } from "@playwright/test"
import { mkdir } from "node:fs/promises"
import path from "node:path"

const QA_EMAIL = process.env.E2E_USER_EMAIL || "qa-crm@example.com"
const QA_PASSWORD = process.env.E2E_USER_PASSWORD || "RecetteSolide2026"

export default async function globalSetup(config: FullConfig) {
  const baseURL = String(config.projects[0]?.use.baseURL || "http://127.0.0.1:3000")
  // Playwright clears its output directory before a run. Keep authentication
  // state outside `test-results` so workers never race that cleanup.
  const statePath = path.resolve(process.cwd(), "playwright", ".auth", "user.json")
  await mkdir(path.dirname(statePath), { recursive: true })

  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ baseURL })
    await page.goto("/auth/login")
    await page.getByLabel("Adresse e-mail professionnelle").fill(QA_EMAIL)
    await page.getByLabel("Mot de passe", { exact: true }).fill(QA_PASSWORD)
    await page.getByRole("button", { name: "Se connecter" }).click()
    // Existing seeded users briefly pass through /onboarding, whose server
    // component then redirects to the authenticated workspace. Let that
    // navigation settle instead of cancelling it with a competing page.goto().
    await page.waitForURL((url) => url.pathname === "/dashboard", { timeout: 60_000 })
    // Authentication setup must depend on the application shell, not dashboard
    // wording that legitimately evolves with product and UX iterations.
    try {
      await page.locator("#dashboard-main").waitFor()
    } catch (error) {
      const body = (await page.locator("body").innerText().catch(() => "")).slice(0, 1_500)
      throw new Error(`Le shell authentifié ne s’est pas chargé (${page.url()}).\n${body}`, { cause: error })
    }
    await page.context().storageState({ path: statePath })
  } finally {
    await browser.close()
  }
}
