import { createHash, randomBytes } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { expect, test, type Locator, type Page } from "@playwright/test"
import { createDatabaseClient } from "@/lib/database-client"
import { hashPassword } from "@/lib/auth/password-core"
import { contrast } from "./helpers/contrast"

const database = createDatabaseClient()
test.afterAll(async () => { await database.$disconnect() })

function requireRecipe() {
  if (process.env.RECIPE_ISOLATED !== "true" || !process.env.DATABASE_URL?.startsWith("file:") || process.env.PLAYWRIGHT_BASE_URL) throw new Error("La recette exige une SQLite fictive isolée")
}

async function capture(page: Page, heading: Locator, output: string, name: string) {
  await expect(heading).toBeVisible()
  expect(await contrast(heading)).toBeGreaterThanOrEqual(4.5)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width + 1)
  await page.screenshot({ path: path.join(output, `${name}.jpg`), fullPage: true, type: "jpeg", quality: 65, scale: "css" })
}

test("a valid invitation stays readable without accepting or changing a membership", async ({ page }, info) => {
  requireRecipe()
  const output = path.resolve("test-results", "public-document-layout", info.project.name, "invitation")
  await mkdir(output, { recursive: true })
  const company = await database.company.findUniqueOrThrow({ where: { id: "ce2ecompany000000000000001" }, select: { id: true, name: true, logo: true } })
  const user = await database.user.findUniqueOrThrow({ where: { email: process.env.E2E_USER_EMAIL || "qa-crm@example.com" }, select: { id: true, email: true } })
  const token = randomBytes(32).toString("base64url")
  const longEmail = "camille.demonstration+maintenance-preventive@ateliers-bassins.example.test"
  const companyName = "👩🏽‍💻 Atelier des Bassins — Installation et maintenance des piscines et équipements extérieurs"
  const errors: string[] = []
  page.on("pageerror", error => errors.push(error.message))
  const invitation = await database.companyInvitation.create({ data: { companyId: company.id, email: user.email!, role: "VIEWER", invitedById: user.id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3_600_000) } })
  try {
    await database.company.update({ where: { id: company.id }, data: { name: companyName, logo: "/missing-invitation-logo.png" } })
    for (const theme of ["light", "dark"]) {
      await page.goto(`/join/${token}`)
      await page.evaluate(value => localStorage.setItem("theme", value), theme)
      for (const width of [320, 1440]) {
        await page.setViewportSize({ width, height: 900 })
        await database.companyInvitation.update({ where: { id: invitation.id }, data: { email: user.email! } })
        await page.goto(`/join/${token}`)
        await expect(page.locator("html")).toHaveClass(new RegExp(`\\b${theme}\\b`))
        await expect(page.getByRole("button", { name: "Accepter l'invitation", exact: true })).toBeEnabled()
        await expect(page.getByText(/rôle « Lecture seule »/)).toBeVisible()
        await expect(page.locator("main img")).toHaveCount(0)
        await capture(page, page.getByText(`Rejoindre ${companyName}`, { exact: true }), output, `${theme}-${width}-matching`)
        await database.companyInvitation.update({ where: { id: invitation.id }, data: { email: longEmail } })
        await page.reload()
        await expect(page.getByRole("button", { name: "Accepter l'invitation", exact: true })).toBeDisabled()
        const address = page.getByText(longEmail, { exact: true })
        expect(await address.evaluate(element => element.getBoundingClientRect().right <= element.closest("p")!.getBoundingClientRect().right + 1)).toBe(true)
        await capture(page, address, output, `${theme}-${width}-different-address`)
      }
    }
    expect((await database.companyInvitation.findUniqueOrThrow({ where: { id: invitation.id } })).acceptedAt).toBeNull()
    expect(errors).toEqual([])
  } finally {
    await database.company.update({ where: { id: company.id }, data: { name: company.name, logo: company.logo } })
    await database.companyInvitation.delete({ where: { id: invitation.id } })
    await writeFile(path.join(output, "report.json"), JSON.stringify({ project: info.project.name, themes: ["light", "dark"], widths: [320, 1440], invitationAccepted: false, pageErrors: errors }, null, 2))
  }
})

test("all onboarding steps remain readable without completing company setup", async ({ browser, baseURL }, info) => {
  requireRecipe()
  const output = path.resolve("test-results", "public-document-layout", info.project.name, "onboarding")
  await mkdir(output, { recursive: true })
  const email = `onboarding-layout-${info.project.name}-${Date.now()}@example.test`
  const password = "OnboardingFictif2026!"
  const user = await database.user.create({ data: { email, name: "Camille Démonstration", emailVerified: new Date(), passwordHash: await hashPassword(password) } })
  const context = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] }, isMobile: info.project.use.isMobile, hasTouch: info.project.use.hasTouch, userAgent: info.project.use.userAgent })
  const errors: string[] = []
  const steps: Array<{ theme: string; step: number; width: number }> = []
  try {
    await context.route("**/*", route => new URL(route.request().url()).origin === baseURL ? route.continue() : route.abort())
    const page = await context.newPage()
    page.on("pageerror", error => errors.push(error.message))
    await page.goto("/auth/login")
    await page.getByLabel("Adresse e-mail professionnelle").fill(email)
    await page.getByLabel("Mot de passe", { exact: true }).fill(password)
    await page.getByRole("button", { name: "Se connecter", exact: true }).click()
    await page.waitForURL(url => url.pathname === "/onboarding")
    for (const theme of ["light", "dark"]) {
      await page.evaluate(value => localStorage.setItem("theme", value), theme)
      await page.goto("/onboarding")
      await expect(page.locator("html")).toHaveClass(new RegExp(`\\b${theme}\\b`))
      await page.getByLabel("Nom commercial / Raison sociale").fill("Atelier des Bassins — préparation fictive")
      await page.getByLabel("Prénom & Nom").fill("Camille Démonstration")
      await page.getByLabel("SIRET", { exact: true }).fill("99999999900024")
      await page.getByLabel("Adresse du siège").fill("7 rue des Essais, 44000 Nantes")
      for (let step = 1; step <= 5; step++) {
        if (step === 2) await page.getByLabel("Email professionnel").fill(email)
        if (step === 5) await page.getByLabel("Nom du client (optionnel)").fill("Résidence Les Amandiers — exemple fictif")
        for (const width of [320, 1440]) {
          await page.setViewportSize({ width, height: 900 })
          await capture(page, page.locator('[data-slot="card-title"]').first(), output, `${theme}-step-${step}-${width}`)
          const label = page.locator("label:visible").first()
          if (await label.count()) expect(await contrast(label)).toBeGreaterThanOrEqual(4.5)
          steps.push({ theme, step, width })
        }
        if (step < 5) await page.getByRole("button", { name: "Continuer", exact: true }).click()
      }
      await expect(page.getByRole("button", { name: "Terminer", exact: true })).toBeEnabled()
    }
    expect((await database.user.findUniqueOrThrow({ where: { id: user.id } })).companyId).toBeNull()
    expect(errors).toEqual([])
  } finally {
    await context.close()
    await database.user.delete({ where: { id: user.id } })
    await writeFile(path.join(output, "report.json"), JSON.stringify({ project: info.project.name, steps, companySetupSubmitted: false, pageErrors: errors }, null, 2))
  }
})
