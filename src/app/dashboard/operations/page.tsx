import { getOperationsDashboard } from "@/actions/operations"
import { PageHeader } from "@/components/shared/page-header"

import { OperationsCenter } from "./operations-center"

export default async function OperationsPage() {
  const data = await getOperationsDashboard()
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Exécution terrain" title="Opérations Diskoov" description="Chantiers, achats, stock, parc installé, interventions et SAV dans un même référentiel." />
      <OperationsCenter initialData={data} />
    </div>
  )
}
