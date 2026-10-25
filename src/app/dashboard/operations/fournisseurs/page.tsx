import { getSupplierDirectory } from "@/actions/suppliers"
import { PageHeader } from "@/components/shared/page-header"
import { SupplierDirectory } from "./supplier-directory"

export default async function SuppliersPage() {
  const data = await getSupplierDirectory()
  return <div className="workspace-page">
    <PageHeader eyebrow="Approvisionnement" title="Fournisseurs" description="Annuaire des fournisseurs de la société." />
    <SupplierDirectory initialData={data} />
  </div>
}
