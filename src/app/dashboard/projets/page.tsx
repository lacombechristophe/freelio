import { getProjectTemplates } from "@/actions/projets"
import { getProjectDirectory } from "@/actions/projets/directory"
import { ProjetsGrid } from "./projets-grid"
import { PageHeader } from "@/components/shared/page-header"
import { getActiveAgencies } from "@/actions/agencies"
import { resolveAuthContext } from "@/lib/auth-wrapper"
import { hasPermission } from "@/lib/permissions"

export default async function ProjetsPage() {
  const [initial, templates, agencies, context] = await Promise.all([
    getProjectDirectory(),
    getProjectTemplates(),
    getActiveAgencies(),
    resolveAuthContext(),
  ])

  return (
    <div className="workspace-page">
      <PageHeader
        className="workspace-page-header"
        eyebrow="Opérations"
        title="Chantiers"
        description="Pilotez les budgets, le temps consommé et l’avancement de chaque chantier actif."
      />
      {initial && <ProjetsGrid initial={initial} templates={templates ?? []} agencies={agencies ?? []} canManageTemplates={Boolean(context && hasPermission(context.role, "operations.write"))} />}
    </div>
  )
}
