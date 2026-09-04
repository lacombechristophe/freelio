import { Database, Repeat2, Settings, ShieldCheck, Sparkles } from "lucide-react"

import { getWorkspaceOverview } from "@/actions/workspaces"
import { WorkspaceHub } from "@/app/dashboard/_components/workspace-hub"
import { OnboardingRequired } from "@/components/shared/onboarding-required"

export default async function DataWorkspacePage() {
  const data = await getWorkspaceOverview()
  if (!data) return <OnboardingRequired title="Configurez votre espace" description="Créez le profil entreprise avant de gérer les données." />

  return (
    <WorkspaceHub
      eyebrow="Espace données"
      title="Qualité et gouvernance"
      description="Contrôlez les sources, migrations, droits et réglages qui rendent les données fiables."
      primaryAction={{ name: "Centre de migration", href: "/dashboard/migrations", icon: Repeat2, description: "Importer une source" }}
      metrics={[
        { label: "Clients", value: data.clients, detail: `${data.contacts} contact(s)`, icon: Database, tone: "blue", href: "/dashboard/clients" },
        { label: "Connexions actives", value: data.activeConnections, detail: "Sources de migration", icon: Sparkles, tone: "teal", status: data.activeConnections ? "Connectées" : "À configurer", href: "/dashboard/migrations" },
        { label: "Lots de migration", value: data.migrationRuns, detail: "Historique des reprises", icon: Repeat2, tone: "amber", href: "/dashboard/migrations" },
        { label: "Membres actifs", value: data.teamMembers, detail: "Accès à l’espace", icon: ShieldCheck, tone: "blue", href: "/dashboard/equipe" },
      ]}
      sections={[
        {
          title: "Entrées et intégrations",
          description: "Faire entrer les données sans perdre leur provenance.",
          links: [
            { name: "Migrations", href: "/dashboard/migrations", icon: Repeat2, description: "HubSpot, Extrabat, fichiers et rapports de rapprochement." },
            { name: "Canaux et intégrations", href: "/dashboard/communications?tab=integrations", icon: Sparkles, description: "Messagerie et services externes." },
          ],
        },
        {
          title: "Administration",
          description: "Gouverner l’identité, les droits et la conformité.",
          links: [
            { name: "Équipe et permissions", href: "/dashboard/equipe", icon: ShieldCheck, description: "Rôles, invitations, capacité et coûts." },
            { name: "Paramètres", href: "/dashboard/settings", icon: Settings, description: "Entreprise, documents, fiscalité et sauvegardes." },
            { name: "Référentiel", href: "/dashboard/crm", icon: Database, description: "Contrôler clients, contacts et prospects." },
          ],
        },
      ]}
    />
  )
}
