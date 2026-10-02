import { expect, test, type Locator, type Page } from "@playwright/test"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { captureScrollablePage } from "./helpers/visual-evidence"

test.use({ actionTimeout: 15_000 })

async function openWorkspace(page: Page, route: string) {
  await page.goto(route)
  await expect(page.locator("html[data-app-hydrated='true']")).toHaveCount(1)
}

async function expectHorizontallyContained(locator: Locator, width: number) {
  await expect(locator).toBeVisible()
  const bounds = await locator.boundingBox()
  expect(bounds).not.toBeNull()
  expect(bounds!.x).toBeGreaterThanOrEqual(0)
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1)
}

test("les états vides et leur action restent lisibles sans défilement latéral", async ({ page }) => {
  for (const [route, search] of [["contrats", "Rechercher un contrat"], ["factures", "Rechercher une facture"]]) {
    await openWorkspace(page, `/dashboard/${route}`)
    await page.getByRole("textbox", { name: search, exact: true }).fill("AUCUN-DOSSIER-POUR-CETTE-RECHERCHE-UX")
    const empty = page.locator('[data-slot="empty-state"]')
    await expectHorizontallyContained(empty, page.viewportSize()!.width)
    const action = empty.getByRole("button").or(empty.getByRole("link"))
    await expectHorizontallyContained(action, page.viewportSize()!.width)
  }
})

test("l’enregistrement d’une vue ne gêne pas la consultation", async ({ page }) => {
  await openWorkspace(page, "/dashboard/clients")
  await expect(page.getByLabel("Enregistrer la vue actuelle", { exact: true })).toHaveCount(0)
  const save = page.getByRole("button", { name: "Enregistrer cette vue", exact: true })
  await save.click()
  await expect(save).toHaveAttribute("aria-expanded", "true")
  const name = page.getByLabel("Enregistrer la vue actuelle", { exact: true })
  await expect(name).toBeFocused()
  await name.fill("Vue non enregistrée")
  await page.locator('[id^="save-view-form-"]').getByRole("button", { name: "Annuler", exact: true }).click()
  await expect(name).toHaveCount(0)
  await expect(save).toHaveAttribute("aria-expanded", "false")
  await expect(save).toBeFocused()
})

test("les bibliothèques SAV restent prioritaires et conservent le brouillon replié", async ({ page }, testInfo) => {
  for (const [route, title] of [["macros", "Créer une macro"], ["diagnostics", "Créer un guide"]]) {
    await openWorkspace(page, `/dashboard/service/${route}`)
    const trigger = page.locator("summary").filter({ hasText: title })
    const creation = page.locator("details").filter({ has: trigger })
    const library = page.getByRole("heading", { name: "Bibliothèque active", exact: true })
    await expect(library).toBeInViewport()
    await expect(creation).not.toHaveAttribute("open")
    const name = creation.getByLabel("Nom interne", { exact: true })
    await expect(name).not.toBeVisible()
    await expectHorizontallyContained(trigger, page.viewportSize()!.width)
    await trigger.focus()
    await page.keyboard.press("Enter")
    await expect(creation).toHaveAttribute("open")
    await name.fill("Brouillon de recette à conserver")
    await expect(page.getByRole("tooltip")).toHaveCount(0)
    await expectHorizontallyContained(name, page.viewportSize()!.width)
    await trigger.focus()
    await page.keyboard.press("Enter")
    await expect(name).not.toBeVisible()
    await expect(trigger).toBeFocused()
    await page.keyboard.press("Enter")
    await expect(name).toHaveValue("Brouillon de recette à conserver")
    const directory = path.join(process.cwd(), "test-results", "task-usability", testInfo.project.name)
    await captureScrollablePage(page, directory, `${route}-creation`)
    await trigger.click()
    await captureScrollablePage(page, directory, `${route}-library`)
  }
})

test("les aides restent lisibles hors des cartes et se ferment avec Échap", async ({ page }, testInfo) => {
  await openWorkspace(page, "/dashboard/service/macros")
  await page.locator("summary").filter({ hasText: "Créer une macro" }).click()
  const help = page.getByRole("button", { name: "Variables disponibles", exact: true })
  if (testInfo.project.name === "mobile") await help.tap()
  else {
    await page.keyboard.press("Tab")
    await expect(help).toBeFocused()
  }
  const tooltip = page.getByRole("tooltip")
  await expect(tooltip).toBeVisible()
  await expect(tooltip).toContainText("ticket.number")
  await expectHorizontallyContained(tooltip, page.viewportSize()!.width)
  const bounds = await tooltip.boundingBox()
  expect(bounds!.y).toBeGreaterThanOrEqual(0)
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1)
  await expect(help).toHaveAttribute("aria-describedby", await tooltip.getAttribute("id") as string)
  expect(await tooltip.evaluate((element) => element.closest("details"))).toBeNull()
  await page.keyboard.press("Escape")
  await expect(tooltip).not.toBeVisible()
})

test("la satisfaction présente les réponses avant la configuration", async ({ page }, testInfo) => {
  await openWorkspace(page, "/dashboard/service/satisfaction")
  const trigger = page.locator("summary").filter({ hasText: "Créer une enquête ou une invitation" })
  const creation = page.locator("details").filter({ has: trigger })
  await expect(creation).not.toHaveAttribute("open")
  await expect(page.getByText("Toutes échelles confondues")).toHaveCount(0)
  await expect(page.getByText("Enquêtes actives", { exact: true })).toBeVisible()
  const history = page.getByText("Réponses et invitations", { exact: true })
  const surveys = page.getByText("Enquêtes disponibles", { exact: true })
  expect(await history.evaluate((element, other) => Boolean(element.compareDocumentPosition(other!) & Node.DOCUMENT_POSITION_FOLLOWING), await surveys.elementHandle())).toBe(true)
  await trigger.click()
  const name = creation.getByLabel("Nom interne", { exact: true })
  await name.fill("Enquête brouillon de recette")
  await creation.getByRole("combobox", { name: "Indicateur", exact: true }).selectOption("NPS")
  await expect(creation.getByLabel("Maximum", { exact: true })).not.toBeVisible()
  await trigger.click()
  await trigger.click()
  await expect(name).toHaveValue("Enquête brouillon de recette")
  await expect(creation.getByRole("combobox", { name: "Indicateur", exact: true })).toHaveValue("NPS")
  await trigger.click()
  const capture = await captureScrollablePage(page, path.join(process.cwd(), "test-results", "task-usability", testInfo.project.name), "satisfaction-results")
  expect(capture.complete).toBe(true)
})

test("un favori invisible n’intercepte pas un clic sur la navigation", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Les favoris appartiennent à la navigation bureau")
  await openWorkspace(page, "/dashboard/clients")
  const navigation = page.getByRole("navigation", { name: "Navigation principale" })
  const favorite = navigation.getByRole("button", { name: "Ajouter Clients aux favoris", exact: true })
  await expect(favorite).toHaveCSS("pointer-events", "none")
  await navigation.getByRole("link", { name: "Clients", exact: true }).hover()
  await expect(favorite).toHaveCSS("opacity", "1")
  await expect(favorite).toHaveCSS("pointer-events", "auto")
  await favorite.click()
  await expect(navigation.getByRole("link", { name: "Clients", exact: true })).toHaveCount(2)
  await navigation.getByRole("button", { name: "Retirer Clients des favoris", exact: true }).first().click()
  await expect(navigation.getByRole("link", { name: "Clients", exact: true })).toHaveCount(1)
})

test("la navigation mobile garde le focus et le restitue à la fermeture", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Navigation compacte")
  await openWorkspace(page, "/dashboard/clients")
  const trigger = page.getByRole("button", { name: "Ouvrir la navigation" })
  await trigger.click()
  const menu = page.getByRole("dialog", { name: "Menu principal" })
  await expect(menu).toBeVisible()
  const close = menu.getByRole("button", { name: "Fermer la navigation" })
  await close.focus()
  for (let index = 0; index < 24; index += 1) {
    await page.keyboard.press("Tab")
    await expect.poll(() => menu.evaluate((element) => element.contains(document.activeElement))).toBe(true)
  }
  await page.keyboard.press("Escape")
  await expect(menu).not.toBeVisible()
  await expect(trigger).toBeFocused()
  await trigger.click()
  await menu.getByRole("link", { name: "Contacts", exact: true }).click()
  await expect(page).toHaveURL(/\/dashboard\/contacts$/)
  await expect(menu).not.toBeVisible()
  await expect(trigger).toBeFocused()
})

test("la messagerie donne accès aux échanges avant les statistiques", async ({ page }, testInfo) => {
  await openWorkspace(page, "/dashboard/communications")
  await expect(page.getByRole("tab", { name: /^Boîte de réception/ })).toHaveAttribute("aria-selected", "true")
  await expect(page.getByRole("region", { name: "Indicateurs des communications" })).toHaveCount(0)
  const conversation = page.locator('button[data-selected]').first()
  await expect(conversation).toBeVisible()
  await expectHorizontallyContained(conversation, page.viewportSize()!.width)
  await expectHorizontallyContained(page.getByRole("button", { name: "Actualiser les conversations" }), page.viewportSize()!.width)
  await conversation.click()
  await expect(page.getByRole("button", { name: "Répondre", exact: true })).toBeVisible()
  if (testInfo.project.name === "mobile") {
    const back = page.getByRole("button", { name: "Retour aux conversations" })
    await expect(back).toBeFocused()
    await expect(conversation).not.toBeVisible()
    await back.click()
    await expect(conversation).toBeFocused()
    await expect(back).not.toBeVisible()
  }
  await page.getByRole("tab", { name: "Statistiques", exact: true }).click()
  await expect(page.getByRole("region", { name: "Indicateurs des communications" })).toBeVisible()
})

test("les actions métier précèdent les analyses dans les espaces de suivi", async ({ page }) => {
  for (const [route, heading] of [["crm", "Portefeuille clients"], ["service", "File SAV prioritaire"], ["revenue", "Encaissements à sécuriser"]]) {
    await openWorkspace(page, `/dashboard/${route}`)
    await expect(page.locator("#dashboard-main h2").first()).toHaveText(heading)
  }
})

test("un canevas de devis est facultatif et préserve les lignes déjà saisies", async ({ page }) => {
  await openWorkspace(page, "/dashboard/devis/new")
  const line = page.getByRole("textbox", { name: "Libellé de la ligne 1", exact: true })
  await line.fill("Prestation déjà saisie")
  const price = page.getByRole("spinbutton", { name: "Prix unitaire hors taxes de la ligne 1", exact: true })
  await price.fill("97.55")
  const preset = page.getByRole("button", { name: /^Fourniture & pose/ })
  await expect(preset).not.toBeVisible()
  await page.locator("summary").filter({ hasText: "Utiliser une structure métier" }).click()
  await preset.click()
  await expect(line).toHaveValue("Prestation déjà saisie")
  await expect(price).toHaveValue("97.55")
  await expect(page.locator("[data-billing-line-label]")).toHaveCount(5)
  await expect(page.getByRole("textbox", { name: "Libellé de la ligne 2", exact: true })).toBeFocused()
  await expect(preset).not.toBeVisible()
})

test("le filtre Tous du SAV inclut réellement les statuts clos", async ({ page }) => {
  await openWorkspace(page, "/dashboard/service/help-desk")
  const filters = page.locator("details").filter({ has: page.locator("summary").filter({ hasText: "Ajuster les filtres" }) })
  await expect(filters).not.toHaveAttribute("open")
  await filters.locator("summary").click()
  await filters.getByRole("link", { name: "Tous", exact: true }).first().click()
  await expect(page).toHaveURL(/status=ALL/)
  await expect(page.getByText("Tous les statuts · Toutes les priorités", { exact: true })).toBeVisible()
  await page.getByRole("button", { name: "Nouveau ticket", exact: true }).click()
  await expect(page).toHaveURL(/\/dashboard\/operations\?tab=sav&create=1/)
  const composer = page.getByTestId("operation-composer")
  await expect(composer).toHaveAttribute("open")
  await expect(composer.getByRole("combobox", { name: "Type d’opération" })).toContainText("Ticket SAV")
  await expect(composer.getByRole("textbox", { name: "Objet *", exact: true })).toBeVisible()
})

test("preuves des onglets secondaires et de la création produit", async ({ page }, testInfo) => {
  test.skip(process.env.E2E_FULL_UI_AUDIT !== "true", "Captures détaillées activées avec l’audit visuel")
  test.setTimeout(10 * 60_000)
  const directory = path.join(process.cwd(), "test-results", "task-usability", testInfo.project.name)
  await mkdir(directory, { recursive: true })
  const evidence: Array<{ route: string; state: string } & Awaited<ReturnType<typeof captureScrollablePage>>> = []
  const scenarios = [
    { route: "automatisations", tabs: ["Vue d’ensemble", "Séquences", "Scénarios", "Modèles", "Journal"] },
    { route: "operations", tabs: ["Vue opérations", "SAV", "Planning", "Entretien", "Commandes", "Stock & achats", "Sites & parc"] },
    { route: "communications", tabs: ["Boîte de réception", "Nouvel e-mail", "Statistiques", "Intégrations"] },
    { route: "settings", tabs: ["Entreprise", "Facturation", "Service", "Intégrations", "Sécurité", "Compte"] },
    { route: "catalogue", tabs: ["Produits & configurations", "Prestations"] },
  ]
  for (const scenario of scenarios) {
    await openWorkspace(page, `/dashboard/${scenario.route}`)
    for (const [index, label] of scenario.tabs.entries()) {
      console.log(`Recette ${testInfo.project.name} : ${scenario.route} / ${label}`)
      const trigger = page.locator("#dashboard-main").getByRole("tab", { name: new RegExp(`^${label}`) })
      await trigger.click({ timeout: 15_000 })
      await expect(trigger).toHaveAttribute("aria-selected", "true")
      const panel = page.getByRole("tabpanel", { name: new RegExp(`^${label}`) })
      await expect(panel).toBeVisible()
      await expect(panel.locator(":scope > *").first()).toBeVisible()
      // An isolated srcDoc email preview need not reach global networkidle.
      // Assert its rendered content instead of waiting on unrelated connections.
      for (const frame of await panel.locator("iframe").all()) {
        await expect(frame.contentFrame().locator("body")).toBeVisible()
      }
      const capture = await captureScrollablePage(page, directory, `${scenario.route}-${index + 1}`)
      evidence.push({ route: scenario.route, state: label, ...capture })
      expect(capture.complete).toBe(true)
    }
  }
  await page.getByRole("button", { name: "Nouveau produit", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "Nouveau produit ou variante" })
  await expect(dialog).toBeVisible()
  await expectHorizontallyContained(dialog, page.viewportSize()!.width)
  const capture = await captureScrollablePage(page, directory, "catalogue-product-dialog", dialog)
  evidence.push({ route: "catalogue", state: "Nouveau produit", ...capture })
  expect(capture.complete).toBe(true)
  await dialog.getByRole("button", { name: "Créer et configurer" }).click()
  await expect(dialog.locator("input:invalid").first()).toBeFocused()
  await dialog.getByRole("button", { name: "Annuler", exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await writeFile(path.join(directory, "evidence.json"), JSON.stringify(evidence, null, 2))
})

test("les fiches client et documents gardent une synthèse compacte et lisible", async ({ page }, testInfo) => {
  const directory = path.join(process.cwd(), "test-results", "task-usability", testInfo.project.name)
  await mkdir(directory, { recursive: true })
  for (const [route, label, count] of [
    ["clients", "Synthèse du client", 3],
    ["devis", "Montants du devis", 3],
    ["factures", "Montants de la facture", 4],
  ] as const) {
    await openWorkspace(page, `/dashboard/${route}`)
    const record = page.locator(`#dashboard-main a[href^="/dashboard/${route}/"]:not([href$="/new"]):not([href$="/edit"]):not([href$="/recurrentes"]):not([href$="/temps-non-facture"])`).first()
    await expect(record).toBeVisible()
    await record.click()
    const summary = page.locator(`dl[aria-label="${label}"]`)
    await expect(summary.locator("dt")).toHaveCount(count)
    await expectHorizontallyContained(summary, page.viewportSize()!.width)
    for (const value of await summary.locator("dd").all()) {
      await expectHorizontallyContained(value, page.viewportSize()!.width)
      await expect(value).not.toBeEmpty()
    }
    expect((await summary.boundingBox())!.height).toBeLessThan(235)
    if (route === "factures") {
      expect((await page.getByRole("heading", { level: 1 }).boundingBox())!.height).toBeLessThan(70)
      await expect(page.locator("#dashboard-main")).not.toContainText("NOT_READY")
      await expect(page.locator("#dashboard-main")).not.toContainText("DRAFT")
    }
    if (route === "clients") {
      const nextAction = page.getByRole("textbox", { name: "Prochaine action", exact: true })
      const properties = page.getByText("Propriétés métier", { exact: true })
      if (await properties.count()) {
        expect(await nextAction.evaluate((element, other) => Boolean(element.compareDocumentPosition(other!) & Node.DOCUMENT_POSITION_FOLLOWING), await properties.elementHandle())).toBe(true)
      }
    }
    const capture = await captureScrollablePage(page, directory, `${route}-record-summary`)
    expect(capture.complete).toBe(true)
  }
})

test("les contrôles documentaires restent indicatifs et la mise en page est progressive", async ({ page }, testInfo) => {
  const directory = path.join(process.cwd(), "test-results", "task-usability", testInfo.project.name)
  await mkdir(directory, { recursive: true })
  for (const route of ["devis", "factures", "contrats"] as const) {
    await openWorkspace(page, `/dashboard/${route}`)
    const record = page.locator(`#dashboard-main a[href^="/dashboard/${route}/"]:not([href$="/new"]):not([href$="/edit"]):not([href$="/recurrentes"]):not([href$="/temps-non-facture"]):not([href$="/sign"])`).first()
    await record.click()
    const checks = page.locator("details").filter({ has: page.getByText("Vérifications du document", { exact: true }) })
    await expect(checks.locator("summary")).toContainText("sans validation juridique ni fiscale")
    await expect(checks).not.toContainText(/Prêt à envoyer|Prêt pour signature|\/100/)
    if ((await checks.locator("summary").innerText()).includes("0 erreur(s)") || (await checks.locator("summary").innerText()).includes("Aucune anomalie")) {
      await expect(checks).not.toHaveAttribute("open")
    } else {
      await expect(checks).toHaveAttribute("open", "")
    }
    if (route !== "contrats") {
      const studio = page.locator("#document-studio")
      const settings = studio.locator("details").filter({ has: page.locator("summary", { hasText: "Mise en page" }) })
      await expect(settings).not.toHaveAttribute("open")
      const frame = studio.locator("iframe")
      await expect(frame.contentFrame().locator("body")).toBeVisible()
      await expectHorizontallyContained(frame, page.viewportSize()!.width)
      await settings.locator("summary").click()
      await settings.getByRole("button", { name: /^Compact/ }).click()
      await expect(settings.getByRole("button", { name: /^Compact/ })).toHaveAttribute("aria-pressed", "true")
      await settings.getByRole("switch", { name: "Afficher la référence répétée" }).click()
      const download = studio.getByRole("link", { name: /^Télécharger/ })
      await expect(download).toHaveAttribute("href", /density=COMPACT/)
      await expect(download).toHaveAttribute("href", /reference=0/)
      await settings.locator("summary").click()
      await expect(settings).not.toHaveAttribute("open")
      await expect(frame.contentFrame().locator("body")).toContainText(await page.getByRole("heading", { level: 1 }).innerText())
      await frame.contentFrame().locator("body").evaluate(async () => { await document.fonts.ready })
      const paper = frame.contentFrame().locator(".page")
      await expect.poll(() => paper.evaluate((element) => element.getBoundingClientRect().width)).toBeGreaterThan(790)
      await expect.poll(() => paper.evaluate((element) => element.getBoundingClientRect().width)).toBeLessThan(796)
      const previewOverflow = await paper.evaluate((element) => {
        const bounds = element.getBoundingClientRect()
        return Array.from(element.querySelectorAll("th, td, h1")).filter((cell) => {
          const rect = cell.getBoundingClientRect()
          return rect.right > bounds.right + 1 || rect.left < bounds.left - 1
        }).length
      })
      expect(previewOverflow).toBe(0)
      if (route === "devis") {
        const fulfillment = page.getByText("Suite du dossier", { exact: true })
        expect(await studio.evaluate((element, other) => Boolean(element.compareDocumentPosition(other!) & Node.DOCUMENT_POSITION_FOLLOWING), await fulfillment.elementHandle())).toBe(true)
      }
    } else {
      await expect(page.getByRole("document", { name: /^Contenu du contrat/ })).toBeVisible()
    }
    const capture = await captureScrollablePage(page, directory, `${route}-document-checks`)
    expect(capture.complete).toBe(true)
  }
})

test("un doublon de modèle est expliqué sans perdre le contenu saisi", async ({ page }, testInfo) => {
  await openWorkspace(page, "/dashboard/automatisations")
  await page.getByRole("tab", { name: /^Modèles/ }).click()
  const panel = page.getByRole("tabpanel", { name: /^Modèles/ })
  const name = `Doublon UX ${testInfo.project.name} ${Date.now()}`
  const content = "<p>Bonjour Camille, préparons ensemble votre entretien annuel.</p>"
  await panel.getByRole("button", { name: "Nouveau modèle", exact: true }).click()
  await panel.getByLabel("Nom interne").fill(name)
  await panel.getByLabel("Objet", { exact: true }).fill("Visite annuelle")
  await panel.getByLabel("Contenu HTML").fill(content)
  await panel.getByRole("button", { name: "Créer le modèle", exact: true }).click()
  await expect(panel.getByRole("button", { name: new RegExp(`^${name} `) })).toHaveCount(1)

  await panel.getByRole("button", { name: "Nouveau modèle", exact: true }).click()
  await panel.getByLabel("Nom interne").fill(name)
  await panel.getByLabel("Objet", { exact: true }).fill("Nouvelle proposition à conserver")
  await panel.getByLabel("Contenu HTML").fill(content)
  const serverErrors: number[] = []
  page.on("response", (response) => { if (response.status() >= 500) serverErrors.push(response.status()) })
  await panel.getByRole("button", { name: "Créer le modèle", exact: true }).click()
  await expect(panel.getByRole("alert")).toContainText("déjà ce nom")
  await expect(panel.getByLabel("Nom interne")).toHaveValue(name)
  await expect(panel.getByLabel("Objet", { exact: true })).toHaveValue("Nouvelle proposition à conserver")
  await expect(panel.getByLabel("Contenu HTML")).toHaveValue(content)
  await expect(panel.getByRole("button", { name: new RegExp(`^${name} `) })).toHaveCount(1)
  expect(serverErrors).toEqual([])

  await panel.getByLabel("Nom interne").fill(`${name} corrigé`)
  await panel.getByRole("button", { name: "Créer le modèle", exact: true }).click()
  await expect(panel.getByRole("button", { name: new RegExp(`^${name} corrigé `) })).toBeVisible()
  await expect(panel.getByRole("alert")).toHaveCount(0)
})
