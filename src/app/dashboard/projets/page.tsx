import { getProjects, getProjectTemplates } from "@/actions/projets"
import { getClientsMinimal } from "@/actions/clients"
import { ProjetsGrid } from "./projets-grid"
import { PageHeader } from "@/components/shared/page-header"
import { getActiveAgencies } from "@/actions/agencies"

export default async function ProjetsPage() {
  const [projects, clients, templates, agencies] = await Promise.all([
    getProjects(),
    getClientsMinimal(),
    getProjectTemplates(),
    getActiveAgencies(),
  ])

  return (
    <div className="workspace-page">
      <PageHeader
        className="workspace-page-header"
        eyebrow="Opérations"
        title="Chantiers"
        description="Pilotez les budgets, le temps consommé et l’avancement de chaque chantier actif."
      />
      <ProjetsGrid projects={projects ?? []} clients={clients ?? []} templates={templates ?? []} agencies={agencies ?? []} />
    </div>
  )
}
