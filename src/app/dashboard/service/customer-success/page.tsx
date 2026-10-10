import { getCustomerSuccessWorkspace } from "@/actions/customer-success"
import { PageHeader } from "@/components/shared/page-header"
import { parseDirectoryQuery } from "@/lib/directory-query"

import { CustomerSuccessCenter } from "./customer-success-center"

export default async function CustomerSuccessPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { search, status, page } = parseDirectoryQuery((await searchParams).view ?? null)
  const data = await getCustomerSuccessWorkspace({ search, status: ["ALL", "HEALTHY", "WATCH", "RISK"].includes(status) ? status : "ALL", page })
  return <div className="workspace-page">
    <PageHeader
      eyebrow="Service"
      title="Portefeuille clients"
      description="Détectez les risques, préparez les renouvellements et transformez chaque score en prochaine action vérifiable."
    />
    <CustomerSuccessCenter initialData={data} />
  </div>
}
