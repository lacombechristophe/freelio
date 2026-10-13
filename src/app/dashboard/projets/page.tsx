import { getProjectTemplates } from "@/actions/projets"
import { getProjectDirectory } from "@/actions/projets/directory"
import { ProjetsGrid } from "./projets-grid"
import { PageHeader } from "@/components/shared/page-header"
import { getActiveAgencies } from "@/actions/agencies"

export default async function ProjetsPage() {
  const [initial, templates, agencies] = await Promise.all([
    getProjectDirectory(),
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
      {initial && <ProjetsGrid initial={initial} templates={templates ?? []} agencies={agencies ?? []} />}
    </div>
  )
}
