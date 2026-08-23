import { getMigrationDashboard } from "@/actions/migrations"
import { PageHeader } from "@/components/shared/page-header"
import { MigrationCenter } from "./migration-center"

export default async function MigrationsPage() {
  const data = await getMigrationDashboard()
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Reprise contrôlée"
        title="Migration des données"
        description="Conservez une copie brute de HubSpot et d'Extrabat, vérifiez chaque lot, puis importez sans doublons."
      />
      <MigrationCenter initialData={data} />
    </div>
  )
}
