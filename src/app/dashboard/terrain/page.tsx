import { getFieldWorkspace } from "@/actions/terrain"
import { TerrainWorkspace } from "@/app/dashboard/terrain/terrain-workspace"
import { OnboardingRequired } from "@/components/shared/onboarding-required"
import { PageHeader } from "@/components/shared/page-header"

export default async function TerrainPage() {
  const snapshot = await getFieldWorkspace()
  if (!snapshot) return <OnboardingRequired title="Configurez votre espace" description="Le profil entreprise est requis pour préparer le terrain hors ligne." />
  return (
    <div className="workspace-page">
      <PageHeader eyebrow="Application terrain" title="Terrain hors ligne" description="Préparez les interventions avant le départ, conservez les brouillons sur l’appareil et synchronisez les rapports dès le retour du réseau." />
      <TerrainWorkspace initialSnapshot={snapshot} />
    </div>
  )
}
