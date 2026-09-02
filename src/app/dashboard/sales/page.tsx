import { CalendarDays, FileSignature, FileText, Kanban, Package, Target } from "lucide-react"

import { getWorkspaceOverview } from "@/actions/workspaces"
import { formatWorkspaceDate, formatWorkspaceEuro, WorkspaceHub } from "@/app/dashboard/_components/workspace-hub"
import { SalesPipelineBoard } from "@/app/dashboard/_components/workspace-insights"
import { OnboardingRequired } from "@/components/shared/onboarding-required"

export default async function SalesWorkspacePage() {
  const data = await getWorkspaceOverview("SALES")
  if (!data) return <OnboardingRequired title="Configurez votre espace" description="Créez le profil entreprise avant de piloter les ventes." />

  return (
    <WorkspaceHub
      eyebrow="Espace ventes"
      title="Transformer les projets en commandes"
      description="Une vue commerciale centrée sur les affaires, les rendez-vous, les offres et la signature."
      primaryAction={{ name: "Nouveau devis", href: "/dashboard/devis/new", icon: FileText, description: "Préparer une proposition" }}
      metrics={[
        { label: "Pipeline ouvert", value: formatWorkspaceEuro(data.openDealValueCents), detail: `${data.openDeals} affaire(s)`, icon: Kanban, tone: "blue" },
        { label: "Prospects actifs", value: data.activeLeads, detail: "À qualifier ou relancer", icon: Target, tone: "teal" },
        { label: "Devis", value: data.quotes, detail: "Tous statuts hors archives", icon: FileText, tone: "amber" },
        { label: "Actions sous 48 h", value: data.dueTasks, detail: "Tâches non terminées", icon: CalendarDays, tone: "red", alert: data.dueTasks > 0 },
      ]}
      featured={<SalesPipelineBoard opportunities={data.opportunities} />}
      panels={[
        {
          title: "Pipeline commercial",
          description: "Affaires ouvertes classées par date de clôture.",
          rows: data.opportunities.map((opportunity) => ({
            title: opportunity.client.name,
            detail: opportunity.title,
            meta: `${formatWorkspaceEuro(opportunity.valueCents)} · ${opportunity.probability}%`,
            status: opportunity.status,
            tone: opportunity.probability >= 70 ? "teal" : opportunity.probability >= 40 ? "amber" : "blue",
            href: `/dashboard/pipeline/${opportunity.id}`,
            icon: Kanban,
          })),
          empty: "Aucune affaire ouverte.",
          href: "/dashboard/pipeline",
          linkLabel: "Voir toutes les affaires",
        },
        {
          title: "Priorités commerciales",
          description: "Actions proches ou haute priorité à sécuriser.",
          rows: data.priorityTasks.map((task) => ({
            title: task.title,
            detail: task.client?.name || task.project?.name || "Sans rattachement",
            meta: formatWorkspaceDate(task.dueDate),
            status: task.priority === 1 ? "Urgent" : task.status,
            tone: task.priority === 1 ? "red" : "amber",
            href: "/dashboard/organisation",
            icon: CalendarDays,
          })),
          empty: "Aucune action commerciale prioritaire.",
          href: "/dashboard/organisation",
          linkLabel: "Voir toutes les actions",
        },
        {
          title: "Devis récents",
          description: "Propositions à suivre, valider ou relancer.",
          rows: data.recentQuotes.map((quote) => ({ title: `${quote.number} · ${quote.client.name}`, detail: quote.object, meta: formatWorkspaceEuro(quote.versions[0]?.totalTtcCents ?? 0), status: quote.status, tone: quote.status === "ACCEPTED" ? "teal" : quote.status === "REJECTED" ? "red" : quote.status === "SENT" ? "amber" : "blue", href: `/dashboard/devis/${quote.id}`, icon: FileText })),
          empty: "Aucun devis récent.",
          href: "/dashboard/devis",
          linkLabel: "Voir tous les devis",
        },
      ]}
      sections={[
        {
          title: "Pipeline commercial",
          description: "Qualifier, prioriser et faire avancer chaque opportunité.",
          links: [
            { name: "Espace prospects", href: "/dashboard/leads", icon: Target, description: "Demandes entrantes, score et consentements." },
            { name: "Pipeline", href: "/dashboard/pipeline", icon: Kanban, description: "Étapes, responsables, probabilités et forecast." },
            { name: "Rendez-vous et tâches", href: "/dashboard/organisation", icon: CalendarDays, description: "Agenda opérationnel et file de travail." },
          ],
        },
        {
          title: "Offre commerciale",
          description: "Configurer, proposer et contractualiser sans rupture de contexte.",
          links: [
            { name: "Devis", href: "/dashboard/devis", icon: FileText, description: "Versions, configurations, marge et PDF." },
            { name: "Contrats", href: "/dashboard/contrats", icon: FileSignature, description: "Modèles, clauses et signature électronique." },
            { name: "Catalogue", href: "/dashboard/catalogue", icon: Package, description: "Gammes, variantes, options et tarifs." },
          ],
        },
      ]}
    />
  )
}
