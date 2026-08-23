import { getContracts } from "@/actions/contrats"
import { ContratsTable } from "./contrats-table"
import { PageHeader } from "@/components/shared/page-header"

export default async function ContratsPage() {
  const contracts = await getContracts()

  return (
    <div className="space-y-7">
      <PageHeader eyebrow="Engagements" title="Contrats" description="Conservez les conditions, signatures et documents contractuels reliés à chaque mission." />
      <ContratsTable contracts={(contracts ?? []) as any} />
    </div>
  )
}
