import { getProjects } from "@/actions/projets"
import { getClientsMinimal } from "@/actions/clients"
import { ProjetsGrid } from "./projets-grid"
import { PageHeader } from "@/components/shared/page-header"

export default async function ProjetsPage() {
  const [projects, clients] = await Promise.all([
    getProjects(),
    getClientsMinimal(),
  ])

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Missions"
        title="Projets"
        description="Pilotez les budgets, le temps consommé et l’avancement de chaque chantier actif."
      />
      <ProjetsGrid projects={projects ?? []} clients={clients ?? []} />
    </div>
  )
}
