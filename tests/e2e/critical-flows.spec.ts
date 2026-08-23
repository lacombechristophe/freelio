import { expect, test, type Page } from "@playwright/test"
import { mkdir } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

const QA_EMAIL = process.env.E2E_USER_EMAIL || "qa-diskoov@example.com"
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
  await expect(page.getByText("Relevé technique bassin & pose")).toBeVisible()
  await page.getByRole("button", { name: "Modifier" }).click()
  await expect(page.getByRole("heading", { name: "Relevé technique bassin & pose" })).toBeVisible()
  await page.getByLabel("État du relevé").selectOption("SURVEYED")
  await page.getByLabel("Date du relevé").fill("2026-08-23")
  await page.getByLabel("Technicien").fill("QA Diskoov")
  await page.getByLabel("Forme").fill("Rectangle")
  await page.getByLabel("Longueur").fill("8000")
  await page.getByLabel("Largeur", { exact: true }).fill("4000")
  await page.getByRole("button", { name: "Enregistrer le relevé" }).click()
  await expect(page.getByText("Relevé technique enregistré.")).toBeVisible()
  await expect(page.getByText("8000 mm")).toBeVisible()

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

test("pipeline scroll navigation replaces the horizontal scrollbar", async ({ page }) => {
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

  const nextControl = page.getByRole("button", { name: "Afficher les étapes suivantes" })
  await expect(nextControl).toBeEnabled()
  await nextControl.click()

  await expect.poll(() => viewport.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0)
  const afterWheel = await viewport.evaluate((element) => element.scrollLeft)

  await page.getByRole("button", { name: "Afficher les étapes précédentes" }).click()
  await expect.poll(() => viewport.evaluate((element) => element.scrollLeft)).toBeLessThan(afterWheel)
})

test("Diskoov lead, order, billing and reserved stock flow", async ({ page }) => {
  test.setTimeout(90_000)
  const leadResponse = await page.request.post("/api/public/leads", {
    headers: { Origin: "https://diskoov.fr" },
    data: {
      firstName: "Alex",
      lastName: "Bassin QA",
      email: "alex.bassin.qa@example.com",
      phone: "+33601020304",
      postalCode: "44000",
      city: "Nantes",
      projectType: "Couverture de piscine",
      message: "Demande E2E Diskoov",
      privacyAccepted: true,
      marketingOptIn: false,
      source: "E2E",
    },
  })
  expect(leadResponse.status()).toBe(201)

  await assertHealthy(page, "/dashboard/leads", "Prospects entrants")
  await expect(page.getByText("Alex Bassin QA")).toBeVisible()
  await expect(page.getByText("Service uniquement")).toBeVisible()

  await page.goto("/dashboard/devis")
  await page.getByRole("link", { name: "DEV-2026-900" }).click()
  await page.getByRole("button", { name: "Créer la commande" }).click()
  await page.waitForURL(/\/dashboard\/operations\?tab=orders/)
  const ordersPanel = page.getByRole("tabpanel", { name: "Commandes" })
  await expect(ordersPanel.getByText("Client QA Piscine")).toBeVisible()
  await expect(ordersPanel.getByText(/CMD-2026-/).first()).toBeVisible()

  await page.getByRole("button", { name: "Facturer le solde" }).first().click()
  await page.waitForURL(/\/dashboard\/factures\//)
  await expect(page.getByText(/Solde de la commande CMD-2026-/).first()).toBeVisible()

  await page.goto("/dashboard/operations?tab=orders")
  const operationType = page.getByRole("combobox", { name: "Type d’opération" })
  await operationType.click()
  await page.keyboard.press("End")
  await page.keyboard.press("ArrowUp")
  await page.keyboard.press("Enter")
  await expect(operationType).toContainText("Réservation de stock")
  await page.getByLabel("Dépôt").selectOption({ label: "Dépôt QA" })
  await page.getByLabel("Produit").selectOption({ label: "QA-COVER · Couverture de test" })
  await page.getByLabel("Commande client").selectOption({ index: 1 })
  await page.getByLabel("Quantité").fill("1")
  await page.getByRole("button", { name: "Enregistrer" }).click()
  await expect(page.getByText("Réservation de stock enregistré.")).toBeVisible()
  await expect(page.getByText("Couverture de test").last()).toBeVisible()

  await page.getByRole("button", { name: "Consommer" }).click()
  await expect(page.getByText("Stock consommé pour le dossier.")).toBeVisible()
  await page.getByRole("tab", { name: "Stock & achats" }).click()
  await expect(page.getByText("4 disponibles")).toBeVisible()
})

test("Diskoov field report and maintenance contract flow", async ({ page }) => {
  test.setTimeout(90_000)
  await assertHealthy(page, "/dashboard/operations", "Opérations Diskoov")

  await page.getByRole("tab", { name: "Planning" }).click()
  const intervention = page.getByRole("tabpanel", { name: "Planning" }).getByText("Intervention QA terrain").locator("..")
  await expect(intervention).toBeVisible()
  await page.getByRole("button", { name: "Clôturer" }).click()
  await page.getByLabel("Compte rendu terrain").fill("Pose contrôlée, essais fonctionnels conformes et zone nettoyée.")
  await page.getByLabel("Temps passé (minutes)").fill("75")
  await page.getByLabel("Nom du client présent").fill("Camille Piscine")
  await page.getByText("Le client confirme le compte rendu").click()
  await page.getByRole("button", { name: "Valider la clôture" }).click()
  await expect(page.getByText("Intervention clôturée et accord client scellé.")).toBeVisible()
  await expect(page.getByText(/Compte rendu : Pose contrôlée/)).toBeVisible()

  const operationType = page.getByRole("combobox", { name: "Type d’opération" })
  await operationType.click()
  await page.getByRole("option", { name: "Contrat d’entretien" }).click()
  await page.getByLabel("Client").selectOption({ label: "Client QA Piscine" })
  await page.locator("select#siteId").selectOption({ label: "Client QA Piscine · Bassin QA" })
  await page.getByLabel("Libellé du contrat").fill("Entretien annuel couverture QA")
  await page.getByLabel("Équipement couvert").selectOption({ label: "Client QA Piscine · Couverture QA installée" })
  await page.getByLabel("Début").fill("2026-09-01")
  await page.getByLabel("Prochaine visite").fill("2027-09-01")
  await page.getByLabel("Prix (€)").fill("240")
  await page.getByRole("button", { name: "Enregistrer" }).click()
  await expect(page.getByText("Contrat d’entretien enregistré.")).toBeVisible()
  await page.getByRole("tab", { name: "Entretien" }).click()
  await expect(page.getByText("Entretien annuel couverture QA")).toBeVisible()
  await expect(page.getByText(/ENT-2026-/)).toBeVisible()
})
