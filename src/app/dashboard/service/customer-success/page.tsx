import { getCustomerSuccessWorkspace } from "@/actions/customer-success"
import { PageHeader } from "@/components/shared/page-header"

import { CustomerSuccessCenter } from "./customer-success-center"

export default async function CustomerSuccessPage() {
  const data = await getCustomerSuccessWorkspace()
  return <div className="workspace-page">
    <PageHeader
      eyebrow="Service"
      title="Portefeuille clients"
      description="Détectez les risques, préparez les renouvellements et transformez chaque score en prochaine action vérifiable."
    />
    <CustomerSuccessCenter initialData={data} />
  </div>
}
