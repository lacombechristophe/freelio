import { ChartNoAxesCombined, Gauge, Inbox, Megaphone, Workflow } from "lucide-react"

import { getWorkspaceOverview } from "@/actions/workspaces"
import { formatWorkspaceEuro, WorkspaceHub } from "@/app/dashboard/_components/workspace-hub"
import { WorkspaceDistributionPanel, WorkspaceTrendPanel } from "@/app/dashboard/_components/workspace-insights"
import { OnboardingRequired } from "@/components/shared/onboarding-required"

export default async function MarketingWorkspacePage() {
  const data = await getWorkspaceOverview("MARKETING")
  if (!data) return <OnboardingRequired title="Configurez votre espace" description="Créez le profil entreprise avant de piloter le marketing." />

  return (
    <WorkspaceHub
      eyebrow="Espace marketing"
      title="Acquisition et engagement"
      description="Structurez les audiences, messages et automatisations qui transforment les demandes en projets qualifiés."
      primaryAction={{ name: "Créer une campagne", href: "/dashboard/campagnes", icon: Megaphone, description: "Préparer une campagne" }}
      metrics={[
        { label: "Prospects actifs", value: data.activeLeads, detail: "À qualifier ou nourrir", icon: ChartNoAxesCombined, tone: "blue", href: "/dashboard/leads" },
        { label: "Segments", value: data.activeSegments, detail: "Audiences actives", icon: Gauge, tone: "teal", href: "/dashboard/marketing" },
        { label: "Automatisations", value: data.activeWorkflows, detail: "Règles en production", icon: Workflow, tone: "amber", href: "/dashboard/automatisations" },
        { label: "Réponses non lues", value: data.unreadEmail, detail: "Conversations à traiter", icon: Inbox, tone: "red", alert: data.unreadEmail > 0, status: data.unreadEmail ? "À traiter" : "À jour", href: "/dashboard/communications" },
      ]}
      featured={<div className="grid gap-3 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.75fr)]"><WorkspaceTrendPanel title="Performance d’acquisition" description="Demandes, interactions et e-mails enregistrés sur les 30 derniers jours." labels={data.activitySeries.labels} series={data.activitySeries.series} href="/dashboard/reports" linkLabel="Voir le détail d’acquisition" /><WorkspaceDistributionPanel title="Sources des demandes" description="Origine déclarée ou UTM des prospects sur 90 jours." items={data.leadSources.map((source) => ({ label: source.name, value: source.value }))} href="/dashboard/leads" linkLabel="Analyser les prospects" /></div>}
      panels={[
        {
          title: "Campagnes actives",
          description: "Budgets, objectifs et contenus à piloter.",
          rows: data.campaigns.map((campaign) => ({
            title: campaign.name,
            detail: `${campaign.objective} · ${campaign._count.assets} contenu(s)`,
            meta: formatWorkspaceEuro(campaign.budgetCents),
            status: campaign.status,
            tone: campaign.status === "ACTIVE" ? "teal" : campaign.status === "PAUSED" ? "amber" : "blue",
            href: "/dashboard/campagnes",
            icon: Megaphone,
          })),
          empty: "Aucune campagne préparée.",
          href: "/dashboard/campagnes",
          linkLabel: "Voir toutes les campagnes",
        },
        {
          title: "Séquences et automatisations",
          description: "Parcours publiés et exécutions disponibles.",
          rows: [...data.sequences.map((sequence) => ({ title: sequence.name, detail: `${sequence._count.steps} étape(s) · ${sequence._count.enrollments} inscrit(s) · ${sequence._count.deliveries} envoi(s)`, status: sequence.status, tone: sequence.status === "ACTIVE" ? "teal" as const : sequence.status === "PAUSED" ? "amber" as const : "blue" as const, href: "/dashboard/automatisations", icon: Megaphone })), ...data.workflows.map((workflow) => ({ title: workflow.name, detail: `${workflow.trigger} · ${workflow._count.runs} exécution(s)`, status: workflow.status, tone: workflow.status === "ACTIVE" ? "teal" as const : workflow.status === "PAUSED" ? "amber" as const : "blue" as const, href: "/dashboard/automatisations", icon: Workflow }))].slice(0, 6),
          empty: "Aucune automatisation configurée.",
          href: "/dashboard/automatisations",
          linkLabel: "Ouvrir le centre d’automatisation",
        },
      ]}
      sections={[
        {
          title: "Performance d’acquisition",
          description: "Comprendre les demandes et activer les bonnes audiences.",
          links: [
            { name: "Campagnes", href: "/dashboard/campagnes", icon: Megaphone, description: "Planification, diffusion, budget et performance multicanale." },
            { name: "Segments et scoring", href: "/dashboard/marketing", icon: Gauge, description: "Scores explicables, listes actives et priorités." },
            { name: "Prospects entrants", href: "/dashboard/leads", icon: ChartNoAxesCombined, description: "Sources, consentements et qualification." },
          ],
        },
        {
          title: "Engagement et séquences",
          description: "Préparer les messages, automatiser le suivi et traiter les réponses.",
          links: [
            { name: "Séquences et modèles", href: "/dashboard/automatisations", icon: Megaphone, description: "Contenus, étapes, délais et inscriptions." },
            { name: "Workflows", href: "/dashboard/automatisations", icon: Workflow, description: "Déclencheurs, conditions, actions et journal." },
            { name: "Communications", href: "/dashboard/communications", icon: Inbox, description: "Réponses, événements et performance e-mail." },
          ],
        },
      ]}
    />
  )
}
