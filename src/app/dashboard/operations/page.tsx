import { getOperationsDashboard } from "@/actions/operations"
import { PageHeader } from "@/components/shared/page-header"

import { OperationsCenter } from "./operations-center"

export default async function OperationsPage() {
  const data = await getOperationsDashboard()
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Exécution terrain" title="Centre des opérations" description="Pilotez en temps réel les chantiers, équipes, achats, stocks et interventions." />
      <OperationsCenter initialData={data} />
    </div>
  )
}
