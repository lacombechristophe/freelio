import { BarChart3, BookOpen, CalendarDays, ClipboardCheck, Gauge, Headphones, Inbox, MessageSquareHeart, MessageSquareText, Repeat2, SlidersHorizontal, Tickets } from "lucide-react"

import { getWorkspaceOverview } from "@/actions/workspaces"
import { formatWorkspaceDate, WorkspaceHub } from "@/app/dashboard/_components/workspace-hub"
import { WorkspaceDistributionPanel } from "@/app/dashboard/_components/workspace-insights"
import { OnboardingRequired } from "@/components/shared/onboarding-required"

export default async function ServiceWorkspacePage() {
  const data = await getWorkspaceOverview("SERVICE")
  if (!data) return <OnboardingRequired title="Configurez votre espace" description="Créez le profil entreprise avant de gérer le service client." />

  return (
    <WorkspaceHub
      eyebrow="Espace service"
      title="SAV et fidélisation"
      description="Priorisez les demandes, interventions, garanties et échéances qui protègent la satisfaction client."
      primaryAction={{ name: "Nouveau ticket", href: "/dashboard/operations?create=1", icon: Headphones, description: "Ouvrir une demande" }}
      metrics={[
        { label: "Tickets ouverts", value: data.openTickets, detail: "À diagnostiquer ou résoudre", icon: Tickets, tone: "blue", alert: data.openTickets > 0, status: data.openTickets ? "À traiter" : "À jour", href: "/dashboard/service/help-desk" },
        { label: "Interventions", value: data.scheduledInterventions, detail: "Planifiées ou en cours", icon: CalendarDays, tone: "teal", href: "/dashboard/operations?tab=planning" },
        { label: "Contrats actifs", value: data.maintenanceContracts, detail: "Entretien et maintenance", icon: Repeat2, tone: "amber", href: "/dashboard/operations?tab=maintenance" },
        { label: "Messages non lus", value: data.unreadEmail, detail: "Conversations ouvertes", icon: Inbox, tone: "red", alert: data.unreadEmail > 0, status: data.unreadEmail ? "À lire" : "À jour", href: "/dashboard/communications" },
      ]}
      featured={<div className="grid gap-3 xl:grid-cols-2"><WorkspaceDistributionPanel title="Couverture relationnelle" description="Répartition du portefeuille selon le score de santé calculé." items={[{ label: "Relation saine", value: data.clientHealth.healthy }, { label: "À surveiller", value: data.clientHealth.watch }, { label: "À risque", value: data.clientHealth.risk }]} href="/dashboard/service/customer-success" linkLabel="Ouvrir l’analyse de santé" /><WorkspaceDistributionPanel title="Répartition de la file SAV" description="Volume ouvert par niveau de priorité." items={["URGENT", "HIGH", "NORMAL", "LOW"].map((priority) => ({ label: priority === "URGENT" ? "Urgent" : priority === "HIGH" ? "Haute" : priority === "NORMAL" ? "Normale" : "Faible", value: data.priorityTickets.filter((ticket) => ticket.priority === priority).length }))} href="/dashboard/service/help-desk" linkLabel="Ouvrir le centre de support" /></div>}
      panels={[
        {
          title: "File SAV prioritaire",
          description: "Tickets ouverts triés par criticité et activité récente.",
          rows: data.priorityTickets.map((ticket) => ({
            title: `${ticket.number} · ${ticket.client.name}`,
            detail: ticket.title,
            meta: formatWorkspaceDate(ticket.dueAt),
            status: ticket.priority === "URGENT" ? "Urgent" : ticket.status,
            tone: ticket.priority === "URGENT" ? "red" : ticket.priority === "HIGH" ? "amber" : "blue",
            href: `/dashboard/service/tickets/${ticket.id}`,
            icon: Tickets,
          })),
          empty: "Aucun ticket SAV ouvert.",
          href: "/dashboard/service/help-desk",
          linkLabel: "Voir tous les tickets",
        },
        {
          title: "Dossiers clients suivis",
          description: "Clients récemment actifs, classés par score relationnel.",
          rows: [...data.recentClients].sort((left, right) => left.relationScore - right.relationScore).map((client) => ({
            title: client.name,
            detail: client.nextActionLabel || `${client._count.projects} projet(s) · ${client._count.contacts} contact(s)`,
            meta: `${client.relationScore}/100`,
            status: client.relationScore < 60 ? "À risque" : client.relationScore < 80 ? "À suivre" : "Sain",
            tone: client.relationScore < 60 ? "red" : client.relationScore < 80 ? "amber" : "teal",
            href: `/dashboard/clients/${client.id}`,
            icon: Gauge,
          })),
          empty: "Aucun client à analyser.",
          href: "/dashboard/service/customer-success",
          linkLabel: "Voir l’analyse complète",
        },
      ]}
      sections={[
        {
          title: "Outils SAV",
          description: "Répondre, diagnostiquer et résoudre avec les engagements visibles.",
          links: [
            { name: "Centre de support", href: "/dashboard/service/help-desk", icon: Tickets, description: "Files, priorités, engagements de résolution et affectations." },
            { name: "Guides de diagnostic", href: "/dashboard/service/diagnostics", icon: ClipboardCheck, description: "Contrôles guidés par gamme, symptôme et garantie." },
            { name: "Macros de réponse", href: "/dashboard/service/macros", icon: MessageSquareText, description: "Réponses validées et personnalisées avant envoi." },
            { name: "Boîte de réception", href: "/dashboard/communications", icon: Inbox, description: "Conversations et historique client." },
          ],
        },
        {
          title: "Fidélisation et qualité",
          description: "Capitaliser les réponses, suivre le parc et mesurer la qualité perçue.",
          links: [
            { name: "Portefeuille clients", href: "/dashboard/service/customer-success", icon: Gauge, description: "Santé, risques, plans de succès et renouvellements." },
            { name: "Analyses Service", href: "/dashboard/service/analytics", icon: BarChart3, description: "SLA, charge, diagnostics et satisfaction." },
            { name: "Base de connaissances", href: "/dashboard/service/connaissance", icon: BookOpen, description: "Procédures internes, FAQ et portail." },
            { name: "Satisfaction client", href: "/dashboard/service/satisfaction", icon: MessageSquareHeart, description: "Enquêtes CSAT, NPS et verbatims." },
            { name: "Parc installé", href: "/dashboard/operations?tab=assets", icon: SlidersHorizontal, description: "Produits posés, séries, garanties et état." },
          ],
        },
      ]}
    />
  )
}
