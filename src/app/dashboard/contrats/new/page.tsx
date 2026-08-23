import { getClientsMinimal } from "@/actions/clients"
import { ContractForm } from "../contract-form"
import { PageHeader } from "@/components/shared/page-header"

export default async function NewContractPage() {
  const clients = await getClientsMinimal()
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Nouvel engagement" title="Nouveau contrat" description="Cadrez la mission, les parties et les conditions avant de préparer la signature." />
      <ContractForm clients={clients ?? []} />
    </div>
  )
}
