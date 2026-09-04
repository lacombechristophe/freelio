import { expect, test } from "@playwright/test"

const workspaceEntrances = [
  { path: "/dashboard", heading: "Vue d’ensemble" },
  { path: "/dashboard/crm", heading: "Clients et relations" },
  { path: "/dashboard/sales", heading: "Transformer les projets en commandes" },
  { path: "/dashboard/marketing/overview", heading: "Acquisition et engagement" },
  { path: "/dashboard/operations", heading: "Centre des opérations" },
  { path: "/dashboard/service", heading: "SAV et fidélisation" },
  { path: "/dashboard/revenue", heading: "Facturation et trésorerie" },
  { path: "/dashboard/clients", heading: "Clients" },
  { path: "/dashboard/contacts", heading: "Contacts" },
  { path: "/dashboard/leads", heading: "Prospects entrants" },
  { path: "/dashboard/devis", heading: "Devis" },
  { path: "/dashboard/factures", heading: "Factures" },
  { path: "/dashboard/projets", heading: "Chantiers" },
  { path: "/dashboard/catalogue", heading: "Catalogue" },
  { path: "/dashboard/communications", heading: "Communications" },
  { path: "/dashboard/automatisations", heading: "Automatisations & e-mails" },
  { path: "/dashboard/devis/new", heading: "Nouveau devis" },
  { path: "/dashboard/factures/new", heading: "Nouvelle facture" },
  { path: "/dashboard/contrats/new", heading: "Nouveau contrat" },
  { path: "/dashboard/organisation", heading: "Organisation" },
  { path: "/dashboard/migrations", heading: "Migration des données" },
  { path: "/dashboard/settings", heading: "Paramètres" },
  { path: "/dashboard/terrain", heading: "Terrain hors ligne" },
] as const

test("le nouveau shell et les cockpits métier restent cohérents", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Contrôle visuel de référence sur le viewport bureau")
  await page.setViewportSize({ width: 1600, height: 1000 })

  for (const entrance of workspaceEntrances) {
    await page.goto(entrance.path)
    await expect(page.getByRole("heading", { name: entrance.heading, exact: true })).toBeVisible()
    await expect(page.getByRole("button", { name: "Ouvrir le menu de création" })).toBeVisible()
    await page.evaluate(async () => {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    })
    await expect(page.getByText("Chronomètre", { exact: true })).toHaveCount(0)
    const screenshotName = entrance.path === "/dashboard"
      ? "overview"
      : entrance.path.split("/").filter(Boolean).slice(1).join("-")
    await page.screenshot({ path: `test-results/${screenshotName}-visual-direction.png`, fullPage: true })
  }
})
