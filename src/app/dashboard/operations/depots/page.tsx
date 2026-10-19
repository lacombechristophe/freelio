import { getWarehouseDirectory } from "@/actions/warehouses"
import { PageHeader } from "@/components/shared/page-header"
import { WarehouseDirectory } from "./warehouse-directory"

export default async function WarehousesPage() {
  const data = await getWarehouseDirectory()
  return <div className="workspace-page">
    <PageHeader eyebrow="Logistique" title="Dépôts" description="Coordonnées et activité des dépôts accessibles." />
    <WarehouseDirectory initialData={data} />
  </div>
}
