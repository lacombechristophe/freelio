import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"
import { chromium, expect } from "@playwright/test"
import puppeteer from "puppeteer"

const baseURL = process.env.PUBLIC_APP_URL
const origin = new URL(baseURL)
const mobile = process.argv.includes("--mobile")
if (!["127.0.0.1", "localhost"].includes(origin.hostname)) throw Error("Cette recette est réservée à un serveur local explicite")
if (!process.env.PUBLIC_DEMO_PASSWORD) throw Error("PUBLIC_DEMO_PASSWORD requis")
const report = { schema: "freelio.readonly-recipe.v1", startedAt: new Date().toISOString(), baseURL, viewport: mobile ? "mobile-390" : "desktop-1440", checks: [], pageErrors: [], externalRequestsBlocked: 0 }
const browser = await chromium.launch({ executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || await puppeteer.executablePath(), args: ["--disable-background-networking"] })
try {
  const context = await browser.newContext({ baseURL, viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 }, reducedMotion: "reduce" })
  await context.route("**/*", route => {
    const url = new URL(route.request().url())
    if (url.origin === origin.origin || ["data:", "about:", "blob:"].includes(url.protocol)) return route.continue()
    report.externalRequestsBlocked++
    return route.abort()
  })
  const page = await context.newPage()
  page.setDefaultTimeout(30_000)
  page.on("pageerror", error => report.pageErrors.push(error.message))
  for (const [route, method] of [["/api/automations/process", "GET"], ["/api/integrations/email/oauth/start", "GET"], ["/api/backup/export", "GET"], ["/api/public/leads", "POST"], ["/auth/register", "GET"], ["/dashboard/devis/new", "GET"], ["/api/future-route", "POST"]]) {
    const response = await context.request.fetch(route, { method })
    assert.equal(response.status(), 403, `${method} ${route}`)
  }
  report.checks.push("Hidden, mutation and unknown entry points return 403 before authentication")
  await page.goto("/")
  await expect(page.getByRole("link", { name: "Ouvrir la démonstration", exact: true }).first()).toHaveAttribute("href", "/auth/login")
  await page.goto("/auth/login")
  await expect(page.getByRole("button", { name: "Utiliser un lien de connexion", exact: true })).toBeDisabled()
  await expect(page.getByRole("link", { name: "Créer mon espace", exact: true })).toHaveAttribute("aria-disabled", "true")
  await expect(page.getByRole("link", { name: "Mot de passe oublié ?", exact: true })).toHaveAttribute("aria-disabled", "true")
  report.checks.push("Public entry opens the demo; registration, reset and email login are disabled")
  await page.getByLabel("Adresse e-mail professionnelle").fill("direction@atelier-des-bassins.example.test")
  await page.getByLabel("Mot de passe", { exact: true }).fill(process.env.PUBLIC_DEMO_PASSWORD)
  await page.getByRole("button", { name: "Se connecter", exact: true }).click()
  await page.waitForURL(url => url.pathname === "/dashboard")
  await expect(page.getByText("Démonstration en lecture seule — données fictives", { exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "Export de réversibilité", exact: true })).toBeDisabled()
  report.checks.push("Production password login and read-only notice")
  for (const [route, command] of [["/dashboard/clients", "Ajouter un client"], ["/dashboard/devis", "Nouveau devis"], ["/dashboard/factures", "Nouvelle facture"], ["/dashboard/depenses", "Ajouter une dépense"]]) {
    const response = await page.goto(route)
    assert.equal(response.status(), 200, route)
    await expect(page.getByRole("button", { name: command, exact: true })).toBeDisabled()
  }
  report.checks.push("Client, quote, invoice and expense mutation commands disabled")
  await page.goto("/dashboard/devis")
  const quoteLink = page.locator('a[href^="/dashboard/devis/"]').filter({ hasText: /^DEMO-DEV-/ }).first()
  const quoteId = (await quoteLink.getAttribute("href")).split("/").pop()
  const pdf = await context.request.get(`/api/pdf/devis/${quoteId}`)
  assert.equal(pdf.status(), 200)
  assert.equal((await pdf.body()).subarray(0, 5).toString(), "%PDF-")
  report.checks.push("Authenticated quote PDF remains available")
  await page.locator('#dashboard-main input[placeholder*="Rechercher"]').first().fill("introuvable-de-demo")
  await expect(page.getByText("Aucun devis trouvé", { exact: true })).toBeVisible()
  report.checks.push("Server read action filters still work")
  await context.request.post("/api/files/expense/fake", { data: "forbidden" }).then(response => assert.equal(response.status(), 403))
  await context.request.get("/api/billing/stripe").then(response => assert.equal(response.status(), 403))
  report.checks.push("Authenticated uploads and billing denied")
  await page.goto("/dashboard")
  if (mobile) {
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "Pas de débordement horizontal global")
    await page.getByRole("button", { name: "Ouvrir la navigation", exact: true }).click()
    await expect(page.getByRole("button", { name: "Fermer la navigation", exact: true })).toBeVisible()
    await page.getByRole("button", { name: "Fermer la navigation", exact: true }).click()
    report.checks.push("Navigation mobile et largeur globale vérifiées")
  }
  await page.screenshot({ path: path.resolve(process.env.RECIPE_EVIDENCE_DIR || "test-results", mobile ? "readonly-dashboard-mobile.png" : "readonly-dashboard.png"), fullPage: true })
  await page.getByRole("button", { name: "Ouvrir le menu du compte" }).click()
  await page.getByRole("menuitem", { name: "Déconnexion", exact: true }).click()
  await page.waitForURL(url => url.pathname === "/auth/login")
  report.checks.push("Logout remains available")
  assert.deepEqual(report.pageErrors, [])
} finally {
  await browser.close()
  const output = path.resolve(process.env.RECIPE_EVIDENCE_DIR || "test-results")
  await fs.mkdir(output, { recursive: true })
  await fs.writeFile(path.join(output, mobile ? "public-demo-mobile.json" : "public-demo.json"), JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ checksPassed: report.checks.length, pageErrors: report.pageErrors.length }))
}
