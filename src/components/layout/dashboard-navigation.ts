import {
  Activity,
  BarChart3,
  Bell,
  BriefcaseBusiness,
  Building2,
  Calculator,
  CalendarDays,
  ChartNoAxesCombined,
  CircleDollarSign,
  ClipboardList,
  ContactRound,
  Database,
  FileSignature,
  FileText,
  Gauge,
  Handshake,
  HardHat,
  Headphones,
  HelpCircle,
  Inbox,
  BookOpen,
  MessageSquareHeart,
  MessageSquareText,
  Kanban,
  LayoutDashboard,
  Megaphone,
  Package,
  Receipt,
  Repeat2,
  Settings,
  ShieldCheck,
  ShoppingCart,
  SlidersHorizontal,
  Sparkles,
  Target,
  TabletSmartphone,
  Tickets,
  Timer,
  UserRoundSearch,
  Users,
  Wallet,
  Workflow,
  Wrench,
  type LucideIcon,
} from "lucide-react"

export type DashboardNavItem = {
  name: string
  href: string
  icon: LucideIcon
  description?: string
  activeMatch?: boolean
  exactMatch?: boolean
  requireEmptyQuery?: boolean
}

export type DashboardNavGroup = {
  name: string
  icon: LucideIcon
  description: string
  items: DashboardNavItem[]
}

export const dashboardHome: DashboardNavItem = { name: "Accueil", href: "/dashboard", icon: LayoutDashboard }

export const dashboardNavGroups: DashboardNavGroup[] = [
  {
    name: "CRM",
    icon: ContactRound,
    description: "Clients, prospects et interactions",
    items: [
      { name: "Vue CRM", href: "/dashboard/crm", icon: LayoutDashboard, description: "Priorités et activité relationnelle" },
      { name: "Clients", href: "/dashboard/clients", icon: Building2, description: "Entreprises et particuliers" },
      { name: "Contacts", href: "/dashboard/contacts", icon: Users, description: "Interlocuteurs et coordonnées" },
      { name: "Prospects", href: "/dashboard/leads", icon: UserRoundSearch, description: "Demandes à qualifier" },
      { name: "Communications", href: "/dashboard/communications", icon: Inbox, description: "Boîte partagée et e-mails" },
    ],
  },
  {
    name: "Marketing",
    icon: Megaphone,
    description: "Acquisition, audiences et engagement",
    items: [
      { name: "Vue marketing", href: "/dashboard/marketing/overview", icon: ChartNoAxesCombined, description: "Performance et actions prioritaires" },
      { name: "Campagnes", href: "/dashboard/campagnes", icon: Megaphone, description: "Planification et performance multicanale" },
      { name: "Segments & scoring", href: "/dashboard/marketing", icon: Gauge, description: "Audiences et qualification" },
      { name: "Automatisations", href: "/dashboard/automatisations", icon: Workflow, description: "Déclencheurs et actions" },
    ],
  },
  {
    name: "Ventes",
    icon: Handshake,
    description: "Prospection, devis et signature",
    items: [
      { name: "Espace commercial", href: "/dashboard/sales", icon: Target, description: "File d'actions et objectifs" },
      { name: "Pipeline", href: "/dashboard/pipeline", icon: Kanban, description: "Affaires et prévisions" },
      { name: "Rendez-vous", href: "/dashboard/organisation", icon: CalendarDays, description: "Agenda et tâches" },
      { name: "Devis", href: "/dashboard/devis", icon: FileText, description: "Configurations et propositions" },
      { name: "Contrats", href: "/dashboard/contrats", icon: FileSignature, description: "Documents et signatures" },
      { name: "Catalogue", href: "/dashboard/catalogue", icon: Package, description: "Produits, options et tarifs" },
    ],
  },
  {
    name: "Opérations",
    icon: HardHat,
    description: "Chantiers, achats et terrain",
    items: [
      { name: "Centre opérationnel", href: "/dashboard/operations", icon: HardHat, description: "Commandes, stock et interventions", requireEmptyQuery: true },
      { name: "Chantiers", href: "/dashboard/projets", icon: BriefcaseBusiness, description: "Dossiers, jalons et budgets" },
      { name: "Achats fournisseurs", href: "/dashboard/operations?tab=stock", icon: ShoppingCart, description: "Commandes et réceptions" },
      { name: "Planning", href: "/dashboard/operations?tab=planning", icon: CalendarDays, description: "Affectations et capacité" },
      { name: "Terrain", href: "/dashboard/terrain", icon: TabletSmartphone, description: "Interventions hors ligne" },
      { name: "Temps", href: "/dashboard/temps", icon: Timer, description: "Pointage et facturable" },
    ],
  },
  {
    name: "Service",
    icon: Headphones,
    description: "SAV, parc et fidélisation",
    items: [
      { name: "Vue service", href: "/dashboard/service", icon: Headphones, description: "Tickets, urgences et contrats", exactMatch: true },
      { name: "Centre de support", href: "/dashboard/service/help-desk", icon: Inbox, description: "Files, délais et affectations" },
      { name: "Macros SAV", href: "/dashboard/service/macros", icon: MessageSquareText, description: "Réponses validées et personnalisables" },
      { name: "Base de connaissances", href: "/dashboard/service/connaissance", icon: BookOpen, description: "Procédures internes et portail" },
      { name: "Satisfaction", href: "/dashboard/service/satisfaction", icon: MessageSquareHeart, description: "CSAT, NPS et verbatims" },
      { name: "Tickets SAV", href: "/dashboard/operations?tab=sav", icon: Tickets, description: "Demandes et résolutions" },
      { name: "Interventions", href: "/dashboard/operations?tab=planning", icon: Wrench, description: "Planning et comptes rendus", activeMatch: false },
      { name: "Parc installé", href: "/dashboard/operations?tab=assets", icon: SlidersHorizontal, description: "Équipements et garanties" },
      { name: "Contrats d'entretien", href: "/dashboard/operations?tab=maintenance", icon: Repeat2, description: "Échéances et renouvellements" },
    ],
  },
  {
    name: "Revenus",
    icon: CircleDollarSign,
    description: "Facturation, paiements et trésorerie",
    items: [
      { name: "Vue revenus", href: "/dashboard/revenue", icon: CircleDollarSign, description: "Encaissements et alertes" },
      { name: "Factures", href: "/dashboard/factures", icon: Receipt, description: "Émission et règlements" },
      { name: "Récurrences", href: "/dashboard/factures/recurrentes", icon: Repeat2, description: "Abonnements et échéances" },
      { name: "Dépenses", href: "/dashboard/depenses", icon: Wallet, description: "Achats et justificatifs" },
      { name: "Banque", href: "/dashboard/comptabilite/banque", icon: Activity, description: "Import et rapprochement" },
      { name: "Comptabilité", href: "/dashboard/comptabilite", icon: Calculator, description: "Journaux et exports" },
    ],
  },
  {
    name: "Données",
    icon: Database,
    description: "Qualité, imports et gouvernance",
    items: [
      { name: "Vue données", href: "/dashboard/data", icon: Database, description: "Qualité et connexions" },
      { name: "Migration", href: "/dashboard/migrations", icon: Repeat2, description: "HubSpot, Extrabat et archives" },
      { name: "Intégrations", href: "/dashboard/communications?tab=integrations", icon: Sparkles, description: "Canaux et services externes", activeMatch: false },
      { name: "Équipe & droits", href: "/dashboard/equipe", icon: ShieldCheck, description: "Membres, rôles et capacités" },
      { name: "Paramètres", href: "/dashboard/settings", icon: Settings, description: "Entreprise et conformité" },
    ],
  },
  {
    name: "Reporting",
    icon: BarChart3,
    description: "Pilotage, objectifs et rentabilité",
    items: [
      { name: "Tableaux de bord", href: "/dashboard/reports", icon: BarChart3, description: "Indicateurs transverses" },
      { name: "Objectifs", href: "/dashboard/organisation", icon: Target, description: "Priorités et progression", activeMatch: false },
      { name: "Prévisions commerciales", href: "/dashboard/pipeline", icon: ChartNoAxesCombined, description: "Forecast pondéré", activeMatch: false },
      { name: "Exports", href: "/dashboard/comptabilite", icon: ClipboardList, description: "Comptabilité et données", activeMatch: false },
    ],
  },
]

export const dashboardUtilityItems: DashboardNavItem[] = [
  { name: "Notifications", href: "/dashboard/notifications", icon: Bell },
  { name: "Aide", href: "/dashboard/help", icon: HelpCircle },
]

export function navigationPath(href: string) {
  return href.split("?")[0]
}

export function navigationItemIsActive(pathname: string, item: DashboardNavItem, currentQuery = "") {
  if (item.activeMatch === false) return false
  const path = navigationPath(item.href)
  const itemQuery = item.href.split("?")[1]
  if (itemQuery) {
    if (pathname !== path) return false
    const expected = new URLSearchParams(itemQuery)
    const current = new URLSearchParams(currentQuery)
    return [...expected.entries()].every(([key, value]) => current.get(key) === value)
  }
  if (item.requireEmptyQuery && currentQuery) return false
  if (item.exactMatch) return pathname === path
  if (path === "/dashboard") return pathname === path
  return pathname === path || pathname.startsWith(`${path}/`)
}
