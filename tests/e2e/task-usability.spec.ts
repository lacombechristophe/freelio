import { expect, test, type Locator } from "@playwright/test"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { captureScrollablePage } from "./helpers/visual-evidence"

async function expectHorizontallyContained(locator: Locator, width: number) {
  await expect(locator).toBeVisible()
  const bounds = await locator.boundingBox()
  expect(bounds).not.toBeNull()
  expect(bounds!.x).toBeGreaterThanOrEqual(0)
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1)
}

test("les états vides et leur action restent lisibles sans défilement latéral", async ({ page }) => {
  for (const [route, search] of [["contrats", "Rechercher un contrat"], ["factures", "Rechercher une facture"]]) {
    await page.goto(`/dashboard/${route}`)
    await page.getByRole("textbox", { name: search, exact: true }).fill("AUCUN-DOSSIER-POUR-CETTE-RECHERCHE-UX")
    const empty = page.locator('[data-slot="empty-state"]')
    await expectHorizontallyContained(empty, page.viewportSize()!.width)
    const action = empty.getByRole("button").or(empty.getByRole("link"))
    await expectHorizontallyContained(action, page.viewportSize()!.width)
  }
})

test("l’enregistrement d’une vue ne gêne pas la consultation", async ({ page }) => {
  await page.goto("/dashboard/clients")
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
})

test("la messagerie donne accès aux échanges avant les statistiques", async ({ page }, testInfo) => {
  await page.goto("/dashboard/communications")
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
    await page.goto(`/dashboard/${route}`)
    const headings = await page.locator("#dashboard-main h2").allTextContents()
    expect(headings[0]).toBe(heading)
  }
})

test("un canevas de devis est facultatif et préserve les lignes déjà saisies", async ({ page }) => {
  await page.goto("/dashboard/devis/new")
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
  await page.goto("/dashboard/service/help-desk")
  const filters = page.locator("details").filter({ has: page.locator("summary").filter({ hasText: "Ajuster les filtres" }) })
  await expect(filters).not.toHaveAttribute("open")
  await filters.locator("summary").click()
  await filters.getByRole("link", { name: "Tous", exact: true }).first().click()
  await expect(page).toHaveURL(/status=ALL/)
  await expect(page.getByText("Tous les statuts · Toutes les priorités", { exact: true })).toBeVisible()
  await expect(page.getByRole("link", { name: "Nouveau ticket", exact: true })).toHaveAttribute("href", "/dashboard/operations?tab=sav&create=1")
})

test("preuves des onglets secondaires et de la création produit", async ({ page }, testInfo) => {
  test.skip(process.env.E2E_FULL_UI_AUDIT !== "true", "Captures détaillées activées avec l’audit visuel")
  test.setTimeout(10 * 60_000)
  const directory = path.join(process.cwd(), "test-results", "task-usability", testInfo.project.name)
  await mkdir(directory, { recursive: true })
  const evidence: Array<{ route: string; state: string } & Awaited<ReturnType<typeof captureScrollablePage>>> = []
  const scenarios = [
    { route: "automatisations", tabs: ["Vue d’ensemble", "Séquences", "Workflows", "Modèles", "Journal"] },
    { route: "operations", tabs: ["Vue opérations", "SAV", "Planning", "Entretien", "Commandes", "Stock & achats", "Sites & parc"] },
    { route: "communications", tabs: ["Boîte de réception", "Nouvel e-mail", "Statistiques", "Intégrations"] },
    { route: "settings", tabs: ["Entreprise", "Facturation", "Service", "Intégrations", "Sécurité", "Compte"] },
    { route: "catalogue", tabs: ["Produits & configurations", "Prestations"] },
  ]
  for (const scenario of scenarios) {
    await page.goto(`/dashboard/${scenario.route}`)
    for (const [index, label] of scenario.tabs.entries()) {
      const trigger = page.locator("#dashboard-main").getByRole("tab", { name: new RegExp(`^${label}`) })
      await trigger.click()
      await expect(trigger).toHaveAttribute("aria-selected", "true")
      await expect(page.getByRole("tabpanel")).toBeVisible()
      await page.waitForLoadState("networkidle")
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
