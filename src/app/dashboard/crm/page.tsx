import { Building2, CalendarClock, Inbox, Kanban, UserRoundSearch, Users } from "lucide-react"

import { getWorkspaceOverview } from "@/actions/workspaces"
import { formatWorkspaceDate, WorkspaceHub } from "@/app/dashboard/_components/workspace-hub"
import { WorkspaceDistributionPanel, WorkspaceTrendPanel } from "@/app/dashboard/_components/workspace-insights"
import { OnboardingRequired } from "@/components/shared/onboarding-required"

export default async function CrmWorkspacePage() {
  const data = await getWorkspaceOverview("CRM")
  if (!data) return <OnboardingRequired title="Configurez votre espace" description="Créez le profil entreprise avant d’utiliser le CRM." />

  return (
    <WorkspaceHub
      eyebrow="Espace CRM"
      title="Clients et relations"
      description="Retrouvez les personnes, entreprises, demandes et conversations qui nécessitent une action."
      primaryAction={{ name: "Ajouter un client", href: "/dashboard/clients", icon: Building2, description: "Créer une fiche" }}
      metrics={[
        { label: "Clients", value: data.clients, detail: `${data.contacts} contact(s) associé(s)`, icon: Users, tone: "blue" },
        { label: "Prospects actifs", value: data.activeLeads, detail: "Hors spam et archives", icon: UserRoundSearch, tone: "teal" },
        { label: "Affaires ouvertes", value: data.openDeals, detail: "Opportunités non closes", icon: Kanban, tone: "amber" },
        { label: "Messages non lus", value: data.unreadEmail, detail: "Dans la boîte partagée", icon: Inbox, tone: "red", alert: data.unreadEmail > 0 },
      ]}
      featured={<div className="grid gap-3 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.7fr)]"><WorkspaceTrendPanel title="Activité relationnelle" description="Prospects, interactions CRM et e-mails enregistrés sur les 30 derniers jours." labels={data.activitySeries.labels} series={data.activitySeries.series} href="/dashboard/reports" linkLabel="Ouvrir le reporting CRM" /><WorkspaceDistributionPanel title="Santé du portefeuille" description="Répartition réelle des clients par score relationnel." items={[{ label: "Relation saine", value: data.clientHealth.healthy }, { label: "À surveiller", value: data.clientHealth.watch }, { label: "À risque", value: data.clientHealth.risk }]} href="/dashboard/service/customer-success" linkLabel="Analyser le portefeuille" /></div>}
      panels={[
        {
          title: "Référentiel CRM",
          description: "Derniers dossiers actifs et qualité de la relation.",
          rows: data.recentClients.map((client) => ({
            title: client.name,
            detail: `${client._count.contacts} contact(s) · ${client._count.projects} projet(s)`,
            meta: client.nextActionLabel || `Santé ${client.relationScore}/100`,
            status: client.relationScore < 60 ? "À risque" : client.relationScore < 80 ? "À suivre" : "À jour",
            tone: client.relationScore < 60 ? "red" : client.relationScore < 80 ? "amber" : "teal",
            href: `/dashboard/clients/${client.id}`,
            icon: Building2,
          })),
          empty: "Aucun client enregistré.",
          href: "/dashboard/clients",
          linkLabel: "Voir tous les clients",
        },
        {
          title: "À relancer aujourd’hui",
          description: "Tâches prioritaires issues du CRM et des dossiers en cours.",
          rows: data.priorityTasks.map((task) => ({
            title: task.title,
            detail: task.client?.name || task.project?.name || "Sans rattachement",
            meta: formatWorkspaceDate(task.dueDate),
            status: task.priority === 1 ? "Prioritaire" : task.status,
            tone: task.priority === 1 ? "red" : "blue",
            href: "/dashboard/organisation",
            icon: CalendarClock,
          })),
          empty: "Aucune relance prioritaire pour le moment.",
          href: "/dashboard/organisation",
          linkLabel: "Voir toutes les actions",
        },
        {
          title: "Prospects récents",
          description: "Dernières demandes entrantes à qualifier.",
          rows: data.recentLeads.map((lead) => ({ title: `${lead.firstName} ${lead.lastName}`, detail: lead.projectType || lead.city || lead.source, meta: `${lead.score} pts`, status: lead.status, tone: lead.score >= 70 ? "teal" : lead.score >= 40 ? "amber" : "blue", href: "/dashboard/leads", icon: UserRoundSearch })),
          empty: "Aucun prospect récent.",
          href: "/dashboard/leads",
          linkLabel: "Voir tous les prospects",
        },
        {
          title: "Conversations",
          description: "Échanges ouverts classés par activité récente.",
          rows: data.conversations.map((thread) => ({ title: thread.client?.name || (thread.leadCapture ? `${thread.leadCapture.firstName} ${thread.leadCapture.lastName}` : "Conversation"), detail: thread.subject, meta: formatWorkspaceDate(thread.lastMessageAt), status: thread.unreadCount ? `${thread.unreadCount} non lu(s)` : "Lu", tone: thread.unreadCount ? "red" : "blue", href: "/dashboard/communications", icon: Inbox })),
          empty: "Aucune conversation ouverte.",
          href: "/dashboard/communications",
          linkLabel: "Ouvrir la boîte de réception",
        },
      ]}
      sections={[
        {
          title: "Portefeuille clients",
          description: "Les dossiers, interlocuteurs et informations qui font vivre la relation.",
          links: [
            { name: "Clients", href: "/dashboard/clients", icon: Building2, description: "Fiches, documents, projets, portail et données financières." },
            { name: "Contacts", href: "/dashboard/contacts", icon: Users, description: "Interlocuteurs, coordonnées, fonction et client associé." },
          ],
        },
        {
          title: "Parcours commercial",
          description: "De la première demande à l’affaire gagnée, avec tout le contexte utile.",
          links: [
            { name: "Prospects", href: "/dashboard/leads", icon: UserRoundSearch, description: "Qualifier les demandes, consentements et prochaines actions." },
            { name: "Affaires", href: "/dashboard/pipeline", icon: Kanban, description: "Piloter étapes, valeur, probabilité et date de clôture." },
            { name: "Communications", href: "/dashboard/communications", icon: Inbox, description: "Lire les échanges et répondre avec le contexte client." },
          ],
        },
      ]}
    />
  )
}
