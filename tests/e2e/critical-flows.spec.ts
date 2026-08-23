import { expect, test, type Page } from "@playwright/test"
import { mkdir } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

const QA_EMAIL = "christophelacombe25@gmail.com"
const evidenceDir = path.join(os.tmpdir(), "freelio-e2e-evidence")

async function login(page: Page) {
  await page.goto("/auth/login")
  await page.getByLabel("Adresse e-mail professionnelle").fill(QA_EMAIL)
  await page.getByRole("button", { name: "Continuer avec mon e-mail" }).click()
  await page.waitForURL(/\/(dashboard|onboarding)/)
  if (page.url().includes("/onboarding")) await page.goto("/dashboard")
  await expect(page.getByRole("heading", { name: "Vue d’ensemble" })).toBeVisible()
}

async function assertHealthy(page: Page, pathName: string, heading: string) {
  await page.goto(pathName)
  await expect(page.getByRole("heading", { name: heading })).toBeVisible()
  await expect(page.locator("html[data-app-hydrated='true']")).toHaveCount(1)
  await expect(page.getByText("Erreur de chargement")).toHaveCount(0)
  await expect(page.getByText("Runtime Error")).toHaveCount(0)
  await expect(page.getByText("Console Error")).toHaveCount(0)
}

test.beforeEach(async ({ page }) => {
  const consoleErrors: string[] = []
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text())
  })
  await login(page)
  await expect(page.locator("html[data-app-hydrated='true']")).toHaveCount(1)
  ;(page as Page & { consoleErrors?: string[] }).consoleErrors = consoleErrors
})

test.afterEach(async ({ page }) => {
  const errors = (page as Page & { consoleErrors?: string[] }).consoleErrors ?? []
  expect(errors.filter((message) => !message.includes("favicon"))).toEqual([])
})

test("new local-first surfaces load and their primary controls respond", async ({ page }, testInfo) => {
  await mkdir(evidenceDir, { recursive: true })

  await assertHealthy(page, "/dashboard/factures/recurrentes", "Facturation récurrente")
  await page.getByRole("button", { name: "Nouvelle récurrence" }).click()
  await expect(page.getByRole("heading", { name: "Nouvelle récurrence" })).toBeVisible()
  await page.getByRole("button", { name: "Annuler" }).click()

  await assertHealthy(page, "/dashboard/comptabilite/banque", "Rapprochement bancaire")
  await page.locator('input[type="file"]').setInputFiles({
    name: "releve-test.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("Date,Libellé,Montant,Reference\n06/07/2026,QA lecture CSV,42.50,QA-001\n"),
  })
  await expect(page.getByText("1 ligne(s) valide(s) sur 1")).toBeVisible()

  await assertHealthy(page, "/dashboard/organisation", "Organisation")
  await page.getByRole("button", { name: "Nouvelle tâche" }).click()
  await expect(page.getByRole("heading", { name: "Nouvelle tâche" })).toBeVisible()
  await page.getByLabel("Récurrence", { exact: true }).selectOption("WEEKLY")
  await expect(page.getByLabel("Tous les")).toBeEnabled()
  await page.getByRole("button", { name: "Annuler" }).click()

  await assertHealthy(page, "/dashboard/migrations", "Migration des données")
  await expect(page.getByText("Connecter une source")).toBeVisible()
  await expect(page.getByText("Déposer des exports")).toBeVisible()

  await assertHealthy(page, "/dashboard/clients", "Clients")
  const clientLink = page.locator('a[href^="/dashboard/clients/"]')
  expect(await clientLink.count()).toBeGreaterThan(0)
  await clientLink.first().click()
  await expect(page.getByText("Prochaine action")).toBeVisible()
  await page.getByRole("button", { name: "Ajouter" }).first().click()
  await expect(page.getByRole("heading", { name: "Nouveau contact" })).toBeVisible()
  await page.getByRole("button", { name: "Annuler" }).click()

  await assertHealthy(page, "/dashboard/projets", "Projets")
  const projectLink = page.locator('a[href^="/dashboard/projets/"]')
  expect(await projectLink.count()).toBeGreaterThan(0)
  await projectLink.first().click()
  await expect(page.getByText("Registre technique")).toBeVisible()
  await page.getByRole("button", { name: "Modifier" }).click()
  await expect(page.getByRole("heading", { name: "Registre technique" })).toBeVisible()
  await page.getByRole("button", { name: "Annuler" }).click()

  await assertHealthy(page, "/dashboard/devis", "Devis")
  const quoteLinks = page.locator('a[href^="/dashboard/devis/"]:not([href$="/edit"]):not([href$="/new"])')
  expect(await quoteLinks.count()).toBeGreaterThan(0)
  const quoteHref = await quoteLinks.first().getAttribute("href")
  expect(quoteHref).toBeTruthy()
  await quoteLinks.first().click()
  await expect(page.getByText("Studio documentaire")).toBeVisible()
  await expect(page.getByText("Qualité", { exact: true })).toBeVisible()
  const quotePreview = await page.request.get(`${quoteHref?.replace("/dashboard", "/api/pdf")}?screen=1`)
  expect(quotePreview.ok()).toBeTruthy()
  expect(await quotePreview.text()).toContain("DOCTYPE html")

  await assertHealthy(page, "/dashboard/contrats", "Contrats")
  const contractLinks = page.locator('a[href^="/dashboard/contrats/"]:not([href$="/edit"]):not([href$="/new"]):not([href$="/sign"])')
  if ((await contractLinks.count()) > 0) {
    const contractHref = await contractLinks.first().getAttribute("href")
    expect(contractHref).toBeTruthy()
    await contractLinks.first().click()
    await expect(page.getByText("Qualité contractuelle")).toBeVisible()
    const contractPreview = await page.request.get(`${contractHref?.replace("/dashboard/contrats", "/api/pdf/contrat")}?screen=1`)
    expect(contractPreview.ok()).toBeTruthy()
    expect(await contractPreview.text()).toContain("Contrat")
  } else {
    testInfo.annotations.push({
      type: "note",
      description: "Aucun contrat local disponible pour tester le PDF contrat via E2E.",
    })
  }

  const ics = await page.request.get("/api/organisation/calendar.ics")
  expect(ics.ok()).toBeTruthy()
  expect(ics.headers()["content-type"]).toContain("text/calendar")

  await page.goto("/dashboard")
  await page.screenshot({ path: path.join(evidenceDir, `${testInfo.project.name}-dashboard.png`), fullPage: false })
})

test("pipeline scroll navigation replaces the horizontal scrollbar", async ({ page }, testInfo) => {
  await assertHealthy(page, "/dashboard/pipeline", "Pipeline")

  const viewport = page.locator("[data-pipeline-scroll-viewport]")
  await expect(viewport).toHaveCount(1)

  const initialState = await viewport.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollLeft: element.scrollLeft,
    scrollWidth: element.scrollWidth,
    scrollbarWidth: getComputedStyle(element).scrollbarWidth,
  }))
  expect(initialState.scrollWidth).toBeGreaterThan(initialState.clientWidth)
  expect(initialState.scrollbarWidth).toBe("none")

  if (testInfo.project.name === "mobile") {
    const nextControl = page.getByRole("button", { name: "Afficher les étapes suivantes" })
    await expect(nextControl).toBeEnabled()
    await nextControl.click()
  } else {
    const bounds = await viewport.boundingBox()
    expect(bounds).not.toBeNull()
    await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2)
    await page.mouse.wheel(0, 520)
  }

  await expect.poll(() => viewport.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0)
  const afterWheel = await viewport.evaluate((element) => element.scrollLeft)

  await page.getByRole("button", { name: "Afficher les étapes précédentes" }).click()
  await expect.poll(() => viewport.evaluate((element) => element.scrollLeft)).toBeLessThan(afterWheel)
})
