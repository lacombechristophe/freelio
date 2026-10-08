import Link from "next/link"
import { Button } from "@/components/ui/button"
import { getOperationsDashboard } from "@/actions/operations"
import { PageHeader } from "@/components/shared/page-header"

import { OperationsCenter } from "./operations-center"

export default async function OperationsPage() {
  const data = await getOperationsDashboard()
  return (
    <div className="workspace-page">
      <PageHeader className="workspace-page-header" eyebrow="Exécution terrain" title="Centre des opérations" description="Pilotez en temps réel les chantiers, équipes, achats, stocks et interventions." actions={<Button variant="outline" render={<Link href="/dashboard/operations/fournisseurs" />}>Fournisseurs</Button>} />
      <OperationsCenter initialData={data} />
    </div>
  )
}
