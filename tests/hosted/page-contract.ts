import { expect, type Page } from "@playwright/test"

export const hostedModules = [
  ["/dashboard", "Vue d’ensemble"],
  ["/dashboard/clients", "Clients"], ["/dashboard/devis", "Devis"],
  ["/dashboard/factures", "Factures"], ["/dashboard/depenses", "Dépenses"],
  ["/dashboard/crm", "Clients et relations"], ["/dashboard/sales", "Transformer les projets en commandes"],
  ["/dashboard/revenue", "Facturation et trésorerie"], ["/dashboard/marketing/overview", "Acquisition et engagement"],
  ["/dashboard/service", "SAV et fidélisation"], ["/dashboard/contacts", "Contacts"],
  ["/dashboard/leads", "Prospects entrants"], ["/dashboard/pipeline", "Cycle de vente"],
  ["/dashboard/projets", "Chantiers"], ["/dashboard/contrats", "Contrats"],
  ["/dashboard/communications", "Communications"],
  ["/dashboard/communications?tab=compose", "Communications", "Nouvel e-mail"],
  ["/dashboard/communications?tab=drafts", "Communications", "Brouillons"],
  ["/dashboard/communications?tab=recovery", "Communications", "Envois à vérifier"],
  ["/dashboard/communications?tab=integrations", "Communications", "Intégrations"],
  ["/dashboard/marketing", "Qualification & segments"], ["/dashboard/campagnes", "Campagnes"],
  ["/dashboard/automatisations", "Automatisations & e-mails"], ["/dashboard/catalogue", "Catalogue"],
  ["/dashboard/operations", "Centre des opérations"],
  ["/dashboard/operations?tab=orders", "Centre des opérations"],
  ["/dashboard/operations?tab=stock", "Centre des opérations"],
  ["/dashboard/operations?tab=assets", "Centre des opérations"],
  ["/dashboard/operations?tab=planning", "Centre des opérations"],
  ["/dashboard/operations?tab=sav", "Centre des opérations"],
  ["/dashboard/operations?tab=maintenance", "Centre des opérations"],
  ["/dashboard/operations/fournisseurs", "Fournisseurs"],
  ["/dashboard/comptabilite", "Finance & comptabilité"],
  ["/dashboard/comptabilite/banque", "Rapprochement bancaire"],
  ["/dashboard/factures/recurrentes", "Facturation récurrente"],
  ["/dashboard/factures/temps-non-facture", "Temps non facturé"],
  ["/dashboard/organisation", "Organisation"], ["/dashboard/temps", "Suivi des temps"],
  ["/dashboard/terrain", "Terrain hors ligne"],
  ["/dashboard/service/help-desk", "Centre de support"],
  ["/dashboard/service/customer-success", "Portefeuille clients"],
  ["/dashboard/service/analytics", "Analyses Service"],
  ["/dashboard/service/diagnostics", "Guides de diagnostic"],
  ["/dashboard/service/macros", "Macros de réponse"],
  ["/dashboard/service/connaissance", "Base de connaissances"],
  ["/dashboard/service/satisfaction", "Satisfaction client"],
  ["/dashboard/reports", "Rapports de direction"], ["/dashboard/notifications", "Notifications"],
  ["/dashboard/data", "Qualité et gouvernance"], ["/dashboard/migrations", "Migration des données"],
  ["/dashboard/equipe", "Équipe"], ["/dashboard/billing", "Abonnement et capacité"],
  ["/dashboard/settings", "Paramètres"], ["/dashboard/settings/properties", "Propriétés personnalisées"],
  ["/dashboard/settings/agencies", "Agences, équipes et dépôts"], ["/dashboard/help", "Aide & conformité"],
] as const

export async function assertHostedModule(page: Page, heading: string, tab?: string, timeout = 45_000) {
  const main = page.locator("#dashboard-main")
  await expect(main).toBeVisible({ timeout })
  // Error boundaries also render a main and can arrive in an HTTP 200 stream.
  await expect(main.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout })
  await expect(page.locator("body")).not.toContainText(/Impossible de charger cette page|Application error|Une erreur inattendue est survenue/)
  await expect(main.getByRole("heading", { level: 1, name: heading, exact: true })).toBeVisible({ timeout })
  if (tab) await expect(main.getByRole("tab", { name: tab, exact: true })).toHaveAttribute("aria-selected", "true", { timeout })
}
