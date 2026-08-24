import { expect, test, type Page } from "@playwright/test"
import { mkdir } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

const QA_EMAIL = process.env.E2E_USER_EMAIL || "qa-crm@example.com"
const evidenceDir = path.join(os.tmpdir(), "crm-e2e-evidence")

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

  await page.goto("/")
  await expect(page.getByRole("heading", { name: "Freelio. Tout votre business freelance, enfin relié." })).toBeVisible()
  await expect(page.locator("#workflow")).toHaveCount(1)
  await expect(page.getByRole("link", { name: "Essayer gratuitement" }).first()).toBeVisible()
  await page.goto("/fonctionnalites")
  await expect(page.getByRole("heading", { name: "Un seul produit pour faire avancer toute la mission." })).toBeVisible()

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

  await assertHealthy(page, "/dashboard/terrain", "Terrain hors ligne")
  await expect(page.getByText("Interventions à exécuter")).toBeVisible()

  await assertHealthy(page, "/dashboard/clients", "Clients")
  const clientLink = page.locator('a[href^="/dashboard/clients/"]')
  expect(await clientLink.count()).toBeGreaterThan(0)
  await clientLink.first().click()
  await page.waitForURL(/\/dashboard\/clients\/[^/]+$/)
  await expect(page.getByText("Prochaine action")).toBeVisible()
  await page.getByRole("button", { name: "Ajouter" }).first().click()
  await expect(page.getByRole("heading", { name: "Nouveau contact" })).toBeVisible()
  await page.getByRole("button", { name: "Annuler" }).click()

  await assertHealthy(page, "/dashboard/projets", "Projets")
  const projectLink = page.locator('a[href^="/dashboard/projets/"]')
  expect(await projectLink.count()).toBeGreaterThan(0)
  await projectLink.first().click()
  await page.waitForURL(/\/dashboard\/projets\/[^/]+$/)
  await expect(page.getByText("Relevé technique bassin & pose")).toBeVisible()
  await page.getByRole("button", { name: "Modifier" }).click()
  await expect(page.getByRole("heading", { name: "Relevé technique bassin & pose" })).toBeVisible()
  await page.getByLabel("État du relevé").selectOption("SURVEYED")
  await page.getByLabel("Date du relevé").fill("2026-08-23")
  await page.getByLabel("Technicien").fill("Technicien QA")
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

  const accountingExport = await page.request.get("/api/accounting/export")
  expect(accountingExport.ok()).toBeTruthy()
  expect(accountingExport.headers()["content-type"]).toContain("application/zip")
  expect((await accountingExport.body()).subarray(0, 2).toString("ascii")).toBe("PK")

  const reversibilityExport = await page.request.get("/api/backup/export")
  expect(reversibilityExport.ok()).toBeTruthy()
  const reversibility = await reversibilityExport.json()
  expect(reversibility.schema).toBe("crm.reversibility-export.v4")
  expect(reversibility.manifest.payloadSha256).toMatch(/^[a-f0-9]{64}$/)
  expect(JSON.stringify(reversibility)).not.toContain("credentialsEncrypted")
  expect(JSON.stringify(reversibility)).not.toContain('"secret"')

  const removedLanding = await page.request.get("/v2")
  expect(removedLanding.status()).toBe(404)

  await page.goto("/dashboard")
  await page.screenshot({ path: path.join(evidenceDir, `${testInfo.project.name}-dashboard.png`), fullPage: false })
})

test("pipeline scroll navigation replaces the horizontal scrollbar", async ({ page }, testInfo) => {
  await assertHealthy(page, "/dashboard/pipeline", "Pipeline")

  if (testInfo.project.name === "desktop") {
    await page.getByRole("button", { name: "Nouvelle Opportunité" }).click()
    await page.getByLabel("Titre").fill("Prévision commerciale QA")
    await page.getByLabel("Client").click()
    await page.getByRole("option", { name: "Client QA Piscine" }).click()
    await page.getByLabel("Valeur (€)").fill("10000")
    await page.getByLabel("Probabilité (%)").fill("40")
    await page.getByLabel("Responsable commercial").click()
    await page.getByRole("option", { name: "Utilisateur QA" }).click()
    const forecastDate = `${new Date().toISOString().slice(0, 7)}-28`
    await page.getByLabel("Clôture prévue").fill(forecastDate)
    await page.getByRole("button", { name: "Créer", exact: true }).click()
    await expect(page.getByText("Opportunité créée.")).toBeVisible()
    const forecastCard = page.locator("[data-slot=card]").filter({ hasText: "Prévision commerciale QA" })
    await expect(forecastCard).toContainText("Utilisateur QA")
    await expect(page.getByText("Prévu ce mois").locator("..")).toContainText("4 000 €")

    await forecastCard.getByRole("button", { name: "Ouvrir les actions de l’opportunité" }).click()
    await page.getByRole("menuitem", { name: "Marquer perdu avec un motif" }).click()
    await page.getByLabel("Motif de perte").fill("Budget reporté après arbitrage")
    await page.getByRole("button", { name: "Enregistrer" }).click()
    await expect(page.getByText("Opportunité mise à jour.")).toBeVisible()
    const lostCard = page.locator("[data-slot=card]").filter({ hasText: "Prévision commerciale QA" })
    await expect(lostCard).toContainText("Budget reporté après arbitrage")
    await lostCard.getByRole("button", { name: "Ouvrir les actions de l’opportunité" }).click()
    await page.getByRole("menuitem", { name: "Déplacer → Besoin qualifié" }).click()
    await expect(page.getByText("Étape mise à jour.")).toBeVisible()
    const reopenedCard = page.locator("[data-slot=card]").filter({ hasText: "Prévision commerciale QA" })
    await expect(reopenedCard).toContainText("Utilisateur QA")
    await expect(reopenedCard).not.toContainText("Budget reporté après arbitrage")
  }

  const viewport = page.locator("[data-pipeline-scroll-viewport]")
  await expect(viewport).toHaveCount(1)
  await viewport.evaluate((element) => {
    element.scrollLeft = 0
    element.dispatchEvent(new Event("scroll"))
  })
  await expect.poll(() => viewport.evaluate((element) => element.scrollLeft)).toBe(0)

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

test("field workspace installs and reloads from its bounded offline cache", async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop" || process.env.E2E_USE_PRODUCTION_SERVER !== "true", "La coupure réseau est validée sur le serveur de production ; le rendu terrain reste couvert ailleurs.")
  await assertHealthy(page, "/dashboard/terrain", "Terrain hors ligne")
  const manifest = await page.request.get("/manifest.webmanifest")
  expect(manifest.ok()).toBeTruthy()
  await expect(manifest.json()).resolves.toMatchObject({ name: "CRM & opérations", start_url: "/dashboard/terrain", display: "standalone" })
  expect((await page.request.get("/sw.js")).ok()).toBeTruthy()

  await page.getByRole("button", { name: "Activer hors ligne" }).click()
  await expect(page.getByText("Interventions et écran terrain disponibles hors connexion pendant 24 h.")).toBeVisible()
  await expect.poll(() => page.evaluate(async () => (await caches.keys()).includes("crm-field-v1-field"))).toBe(true)

  await context.setOffline(true)
  try {
    await page.reload({ waitUntil: "domcontentloaded" })
    await expect(page.getByRole("heading", { name: "Terrain hors ligne" })).toBeVisible()
    await expect(page.getByText("Mode hors ligne", { exact: true })).toBeVisible()
    await expect(page.getByText("Intervention QA terrain")).toBeVisible()
  } finally {
    await context.setOffline(false)
  }
  const expectedOfflineErrors = (page as Page & { consoleErrors?: string[] }).consoleErrors ?? []
  expect(expectedOfflineErrors.every((message) => message.includes("ERR_INTERNET_DISCONNECTED"))).toBe(true)
  expectedOfflineErrors.length = 0
})

test("configures an email sequence and a lead automation", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "La configuration est créée une fois ; la page reste couverte sur mobile par les tests de surfaces.")
  await assertHealthy(page, "/dashboard/automatisations", "Automatisations & e-mails")

  await page.getByRole("tab", { name: "Modèles" }).click()
  const templatePanel = page.getByRole("tabpanel", { name: "Modèles" })
  await templatePanel.locator('input[name="name"]').fill("Suivi projet QA")
  await templatePanel.locator('input[name="subject"]').fill("Votre projet {{lead.projectType}}")
  await templatePanel.locator('textarea[name="bodyHtml"]').fill("<p>Bonjour {{contact.firstName}},</p><p>Nous restons disponibles pour votre projet.</p>")
  await templatePanel.getByRole("button", { name: "Enregistrer" }).click()
  await expect(page.getByText("Modèle enregistré.")).toBeVisible()

  await page.getByRole("tab", { name: "Séquences" }).click()
  const sequencePanel = page.getByRole("tabpanel", { name: "Séquences" })
  const createSequenceForm = sequencePanel.locator("form").first()
  await createSequenceForm.locator('input[name="name"]').fill("Nurturing QA")
  await createSequenceForm.locator('input[name="description"]').fill("Séquence de recette")
  await createSequenceForm.getByRole("button", { name: "Créer" }).click()
  await expect(page.getByText("Séquence créée.")).toBeVisible()
  const sequenceCard = page.locator("[data-slot=card]").filter({ hasText: "Nurturing QA" }).last()
  await sequenceCard.locator('select[name="templateId"]').selectOption({ label: "Suivi projet QA" })
  await sequenceCard.locator('input[name="delayHours"]').fill("24")
  await sequenceCard.getByRole("button", { name: "Ajouter l’étape" }).click()
  await expect(page.getByText("Étape ajoutée.")).toBeVisible()
  await sequenceCard.getByRole("button", { name: "Activer" }).click()
  await expect(page.getByText("Séquence activée.")).toBeVisible()

  await page.getByRole("tab", { name: "Règles" }).click()
  const workflowPanel = page.getByRole("tabpanel", { name: "Règles" })
  const workflowForm = workflowPanel.locator("form").first()
  await workflowForm.locator('input[name="name"]').fill("Inscription nouveaux leads QA")
  await workflowForm.locator('input[name="source"]').fill("E2E")
  await workflowForm.locator('select[name="actionType"]').selectOption("ENROLL_SEQUENCE")
  await workflowForm.locator('select[name="sequenceId"]').selectOption({ label: "Nurturing QA" })
  await workflowForm.getByRole("button", { name: "Créer la règle" }).click()
  await expect(page.getByText("Règle créée en brouillon.")).toBeVisible()
  const workflowCard = page.locator("[data-slot=card]").filter({ hasText: "Inscription nouveaux leads QA" }).last()
  await workflowCard.getByRole("button", { name: "Activer" }).click()
  await expect(page.getByText("Règle activée.")).toBeVisible()
})

test("lead, consent withdrawal, order, billing and reserved stock flow", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Les mutations destructives sont validées une fois ; les surfaces restent testées sur mobile.")
  test.setTimeout(180_000)
  const leadResponse = await page.request.post("/api/public/leads", {
    headers: { Origin: "https://example.test" },
    data: {
      firstName: "Alex",
      lastName: "Bassin QA",
      email: "alex.bassin.qa@example.com",
      phone: "+33601020304",
      postalCode: "44000",
      city: "Nantes",
      projectType: "Couverture de piscine",
      message: "Demande E2E CRM",
      privacyAccepted: true,
      marketingOptIn: true,
      source: "E2E",
    },
  })
  expect(leadResponse.status()).toBe(201)

  await assertHealthy(page, "/dashboard/leads", "Prospects entrants")
  const leadCard = page.locator("article").filter({ hasText: "Alex Bassin QA" })
  await expect(leadCard).toBeVisible()
  await expect(leadCard.getByText("Marketing accepté")).toBeVisible()
  await assertHealthy(page, "/dashboard/automatisations", "Automatisations & e-mails")
  await expect(page.locator("p").filter({ hasText: /^Alex Bassin QA$/ }).first()).toBeVisible()
  await assertHealthy(page, "/dashboard/leads", "Prospects entrants")
  const refreshedLeadCard = page.locator("article").filter({ hasText: "Alex Bassin QA" })
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"])
  await refreshedLeadCard.getByRole("button", { name: "Copier le lien de désinscription" }).click()
  await expect(page.getByText("Lien de désinscription copié.")).toBeVisible()
  const withdrawalUrl = await page.evaluate(() => navigator.clipboard.readText())
  expect(withdrawalUrl).toContain("/consent/withdraw/")
  const token = withdrawalUrl.split("/").at(-1)
  expect(token).toBeTruthy()
  await page.goto(withdrawalUrl)
  await page.getByRole("button", { name: "Confirmer ma désinscription" }).click()
  await expect(page.getByText("Préférence enregistrée", { exact: true })).toBeVisible()
  const replay = await page.request.post("/api/public/consent/withdraw", { data: { token } })
  expect(replay.ok()).toBeTruthy()
  await expect(replay.json()).resolves.toMatchObject({ success: true, alreadyWithdrawn: true })
  await assertHealthy(page, "/dashboard/leads", "Prospects entrants")
  await expect(page.locator("article").filter({ hasText: "Alex Bassin QA" }).getByText("Service uniquement")).toBeVisible()

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
  await page.getByRole("option", { name: "Réservation de stock" }).focus()
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

  await operationType.click()
  await page.getByRole("option", { name: "Bon de livraison" }).click()
  await page.getByLabel("Commande client").selectOption({ index: 1 })
  await page.getByLabel("Ligne livrée").selectOption({ index: 1 })
  await page.getByLabel("Quantité").fill("1")
  await page.getByLabel("Réceptionnaire").fill("Camille Piscine")
  await page.getByRole("button", { name: "Enregistrer" }).click()
  await expect(page.getByText("Bon de livraison enregistré.")).toBeVisible()
  await page.getByRole("tab", { name: "Commandes" }).click()
  const deliverySection = page.getByText("Derniers bons de livraison").locator("..").locator("..")
  await deliverySection.getByRole("button", { name: "Faire signer" }).click()
  await page.getByLabel("Nom du réceptionnaire").fill("Camille Piscine")
  await page.getByText("Le réceptionnaire confirme les quantités indiquées").click()
  await page.getByRole("button", { name: "Signer et sceller" }).click()
  await expect(page.getByText("Bon de livraison signé et scellé.")).toBeVisible()
  const deliveryPdfHref = await deliverySection.getByRole("link", { name: "PDF" }).getAttribute("href")
  expect(deliveryPdfHref).toBeTruthy()
  const deliveryPdf = await page.request.get(deliveryPdfHref!)
  expect(deliveryPdf.ok()).toBeTruthy()
  expect((await deliveryPdf.body()).subarray(0, 4).toString("ascii")).toBe("%PDF")
})

test("field report and maintenance contract flow", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Les mutations destructives sont validées une fois ; les surfaces restent testées sur mobile.")
  test.setTimeout(180_000)
  await assertHealthy(page, "/dashboard/equipe", "Équipe")
  await page.getByLabel("Coût horaire interne en euros").fill("40")
  await page.getByTitle("Enregistrer capacité et coût").click()
  await expect(page.getByText("Capacité et coût horaire mis à jour.")).toBeVisible()
  await assertHealthy(page, "/dashboard/operations", "Opérations")

  await page.getByRole("tab", { name: "Planning" }).click()
  await expect(page.getByText("Capacité de la semaine")).toBeVisible()
  const planningPanel = page.getByRole("tabpanel", { name: "Planning" })
  await expect(planningPanel.getByText("Utilisateur QA", { exact: true }).first()).toBeVisible()
  const intervention = planningPanel.locator("article").filter({ hasText: "Intervention QA terrain" })
  await expect(intervention).toBeVisible()
  await intervention.getByRole("button", { name: "Matériel utilisé" }).click()
  await page.getByLabel("Dépôt").selectOption({ label: "Dépôt QA" })
  await page.getByLabel("Produit").selectOption({ label: "QA-COVER · Couverture de test" })
  await page.getByLabel("Quantité consommée").fill("1")
  await page.getByRole("button", { name: "Consommer", exact: true }).click()
  await expect(page.getByText("Matériel consommé et coût réel mis à jour.")).toBeVisible()
  await expect(intervention.getByText("Matériel 50,00 €")).toBeVisible()
  await intervention.getByLabel("Ajouter une pièce à Intervention QA terrain").setInputFiles({
    name: "photo-fin-qa.png",
    mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQMcAAAAASUVORK5CYII=", "base64"),
  })
  await expect(page.getByText("Pièce d’intervention ajoutée et contrôlée.")).toBeVisible()
  const evidenceLink = intervention.getByRole("link", { name: "photo-fin-qa.png" })
  await expect(evidenceLink).toBeVisible()
  const evidenceHref = await evidenceLink.getAttribute("href")
  expect(evidenceHref).toBeTruthy()
  const evidenceResponse = await page.request.get(evidenceHref!)
  expect(evidenceResponse.ok()).toBeTruthy()
  expect(evidenceResponse.headers()["content-type"]).toContain("image/png")
  await page.getByRole("button", { name: "Clôturer" }).click()
  await page.getByLabel("Compte rendu terrain").fill("Pose contrôlée, essais fonctionnels conformes et zone nettoyée.")
  await page.getByLabel("Temps passé (minutes)").fill("75")
  await page.getByLabel("Nom du client présent").fill("Camille Piscine")
  await page.getByText("Le client confirme le compte rendu").click()
  await page.getByRole("button", { name: "Valider la clôture" }).click()
  await expect(page.getByText("Intervention clôturée et accord client scellé.")).toBeVisible()
  await expect(page.getByText(/Compte rendu : Pose contrôlée/)).toBeVisible()
  await expect(intervention.getByText("100,00 €", { exact: true })).toBeVisible()
  const reportHref = await intervention.getByRole("link", { name: "Rapport PDF" }).getAttribute("href")
  expect(reportHref).toBeTruthy()
  const reportResponse = await page.request.get(reportHref!)
  expect(reportResponse.ok()).toBeTruthy()
  expect((await reportResponse.body()).subarray(0, 4).toString("ascii")).toBe("%PDF")
  const reportPreview = await page.request.get(`${reportHref}?screen=1`)
  expect(reportPreview.ok()).toBeTruthy()
  expect(await reportPreview.text()).toContain("Couverture de test")

  const operationType = page.getByRole("combobox", { name: "Type d’opération" })
  await operationType.click()
  await page.getByRole("option", { name: "Contrat d’entretien" }).click()
  await page.getByLabel("Client").selectOption({ label: "Client QA Piscine" })
  await page.locator("select#siteId").selectOption({ label: "Client QA Piscine · Bassin QA" })
  await page.getByLabel("Libellé du contrat").fill("Entretien annuel couverture QA")
  await page.getByLabel("Équipement couvert").selectOption({ label: "Client QA Piscine · Couverture QA installée" })
  await page.getByLabel("Début").fill("2026-08-20")
  await page.getByLabel("Prochaine visite").fill("2026-08-20")
  await page.getByLabel("Prix HT (€)").fill("240")
  await page.getByText("Facturation automatique").click()
  await page.getByRole("button", { name: "Enregistrer" }).click()
  await expect(page.getByText("Contrat d’entretien enregistré.")).toBeVisible()
  await page.getByRole("tab", { name: "Entretien" }).click()
  await expect(page.getByText("Entretien annuel couverture QA")).toBeVisible()
  await expect(page.getByText(/ENT-2026-/)).toBeVisible()
  const schedulerSecret = process.env.SCHEDULER_CRON_SECRET
  if (schedulerSecret) {
    const firstRun = await page.request.post("/api/scheduling/process", { headers: { authorization: `Bearer ${schedulerSecret}` } })
    expect(firstRun.ok()).toBeTruthy()
    await expect(firstRun.json()).resolves.toMatchObject({ recurringInvoices: { generated: 1 }, maintenanceVisits: { scheduled: 1 } })
    const replay = await page.request.post("/api/scheduling/process", { headers: { authorization: `Bearer ${schedulerSecret}` } })
    expect(replay.ok()).toBeTruthy()
    await expect(replay.json()).resolves.toMatchObject({ recurringInvoices: { generated: 0 }, maintenanceVisits: { scheduled: 0 } })
    await page.goto("/dashboard/operations")
    await page.getByRole("tab", { name: "Planning" }).click()
    await expect(page.getByText("Entretien · Entretien annuel couverture QA")).toBeVisible()
    await page.goto("/dashboard/factures")
    const maintenanceInvoiceRow = page.getByRole("row").filter({ hasText: "288,00 €" })
    await expect(maintenanceInvoiceRow).toBeVisible()
    await maintenanceInvoiceRow.getByRole("link", { name: /FACT-2026-/ }).click()
    await expect(page.getByText(/Contrat d’entretien ENT-2026-/)).toBeVisible()
  }
})
