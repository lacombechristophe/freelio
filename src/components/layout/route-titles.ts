const EXACT_TITLES: Record<string, string> = {
  "/dashboard": "Vue d’ensemble",
  "/dashboard/automatisations": "Automatisations & e-mails",
  "/dashboard/billing": "Abonnement",
  "/dashboard/campagnes": "Campagnes marketing",
  "/dashboard/catalogue": "Catalogue produits",
  "/dashboard/clients": "Clients",
  "/dashboard/communications": "Communications",
  "/dashboard/comptabilite": "Comptabilité",
  "/dashboard/comptabilite/banque": "Rapprochement bancaire",
  "/dashboard/contacts": "Contacts",
  "/dashboard/contrats": "Contrats",
  "/dashboard/contrats/new": "Nouveau contrat",
  "/dashboard/crm": "Vue CRM",
  "/dashboard/data": "Données & intégrations",
  "/dashboard/depenses": "Dépenses",
  "/dashboard/devis": "Devis",
  "/dashboard/devis/new": "Nouveau devis",
  "/dashboard/equipe": "Équipe",
  "/dashboard/factures": "Factures",
  "/dashboard/factures/new": "Nouvelle facture",
  "/dashboard/factures/recurrentes": "Factures récurrentes",
  "/dashboard/factures/temps-non-facture": "Temps non facturé",
  "/dashboard/help": "Centre d’aide",
  "/dashboard/leads": "Prospects",
  "/dashboard/marketing": "Marketing",
  "/dashboard/marketing/overview": "Vue marketing",
  "/dashboard/migrations": "Migration des données",
  "/dashboard/notifications": "Notifications",
  "/dashboard/operations": "Centre des opérations",
  "/dashboard/organisation": "Planning",
  "/dashboard/pipeline": "Pipeline commercial",
  "/dashboard/projets": "Chantiers",
  "/dashboard/reports": "Rapports",
  "/dashboard/revenue": "Facturation & trésorerie",
  "/dashboard/sales": "Espace ventes",
  "/dashboard/service": "SAV & fidélisation",
  "/dashboard/service/analytics": "Analyses SAV",
  "/dashboard/service/connaissance": "Base de connaissances",
  "/dashboard/service/customer-success": "Suivi client",
  "/dashboard/service/diagnostics": "Diagnostics",
  "/dashboard/service/help-desk": "Centre de support",
  "/dashboard/service/macros": "Macros SAV",
  "/dashboard/service/satisfaction": "Satisfaction client",
  "/dashboard/settings": "Paramètres",
  "/dashboard/settings/agencies": "Agences & dépôts",
  "/dashboard/settings/properties": "Propriétés CRM",
  "/dashboard/temps": "Temps & pointage",
  "/dashboard/terrain": "Application terrain",
}

const PREFIX_TITLES: Array<[string, string]> = [
  ["/dashboard/catalogue/produits/", "Fiche produit"],
  ["/dashboard/clients/", "Fiche client"],
  ["/dashboard/contacts/", "Fiche contact"],
  ["/dashboard/contrats/", "Détail du contrat"],
  ["/dashboard/devis/", "Détail du devis"],
  ["/dashboard/factures/", "Détail de la facture"],
  ["/dashboard/migrations/", "Détail de la migration"],
  ["/dashboard/operations/achats/", "Détail de l’achat"],
  ["/dashboard/operations/fournisseurs/", "Fiche fournisseur"],
  ["/dashboard/pipeline/", "Détail de l’opportunité"],
  ["/dashboard/projets/", "Détail du chantier"],
  ["/dashboard/service/equipements/", "Fiche équipement"],
  ["/dashboard/service/interventions/", "Détail de l’intervention"],
  ["/dashboard/service/tickets/", "Détail du ticket SAV"],
]

export function titleForPath(pathname: string) {
  const exact = EXACT_TITLES[pathname]
  if (exact) return exact
  return PREFIX_TITLES.find(([prefix]) => pathname.startsWith(prefix))?.[1] ?? "Espace de travail"
}

export function documentTitleForPath(pathname: string, heading?: string | null) {
  const routeTitle = titleForPath(pathname)
  const normalizedHeading = heading?.trim().replace(/\s+/g, " ")
  const contextualTitle = normalizedHeading && normalizedHeading !== routeTitle
    ? `${normalizedHeading.slice(0, 64)} · ${routeTitle}`
    : routeTitle

  return `${contextualTitle} | Freelio`
}
