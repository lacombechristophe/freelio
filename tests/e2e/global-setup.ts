import { chromium, type FullConfig } from "@playwright/test"
import { mkdir } from "node:fs/promises"
import path from "node:path"

const QA_EMAIL = process.env.E2E_USER_EMAIL || "qa-crm@example.com"
const QA_PASSWORD = process.env.E2E_USER_PASSWORD || "RecetteSolide2026"

export default async function globalSetup(config: FullConfig) {
  const baseURL = String(config.projects[0]?.use.baseURL || "http://127.0.0.1:3000")
  const statePath = path.resolve(process.cwd(), "test-results", ".auth", "user.json")
  await mkdir(path.dirname(statePath), { recursive: true })

  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ baseURL })
    await page.goto("/auth/login")
    await page.getByLabel("Adresse e-mail professionnelle").fill(QA_EMAIL)
    await page.getByLabel("Mot de passe", { exact: true }).fill(QA_PASSWORD)
    await page.getByRole("button", { name: "Se connecter" }).click()
    await page.waitForURL(/\/(dashboard|onboarding)/)
    if (page.url().includes("/onboarding")) await page.goto("/dashboard")
    await page.getByRole("heading", { name: "Vue d’ensemble" }).waitFor()
    await page.context().storageState({ path: statePath })
  } finally {
    await browser.close()
  }
}
