import { getClientsMinimal } from "@/actions/clients"
import { ContractForm } from "../contract-form"
import { PageHeader } from "@/components/shared/page-header"

export default async function NewContractPage() {
  const clients = await getClientsMinimal()
  return (
    <div className="workspace-page">
      <PageHeader className="workspace-page-header" eyebrow="Nouvel engagement" title="Nouveau contrat" description="Cadrez la mission, les parties et les conditions avant de préparer la signature." />
      <ContractForm clients={clients ?? []} />
    </div>
  )
}
