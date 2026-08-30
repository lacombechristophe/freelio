import { notFound, redirect } from "next/navigation"
import { getContractById } from "@/actions/contrats"
import { getClientsMinimal } from "@/actions/clients"
import { ContractForm } from "../../contract-form"
import { PageHeader } from "@/components/shared/page-header"

export default async function EditContractPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [contract, clients] = await Promise.all([
    getContractById(id),
    getClientsMinimal(),
  ])
  if (!contract) notFound()
  if (contract.kind !== "STANDARD") redirect(`/dashboard/contrats/${contract.id}`)
  if (contract.status === "SIGNED") {
    return (
      <div className="p-8 text-sm text-muted-foreground">
        Un contrat signé ne peut pas être modifié.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Contrat modifiable" title={`Modifier ${contract.number}`} description="Mettez à jour le contenu avant la signature des parties." />
      <ContractForm
        contract={{
          id: contract.id,
          clientId: contract.clientId,
          title: contract.title,
          content: contract.content,
          validFrom: contract.validFrom,
          validUntil: contract.validUntil,
        }}
        clients={clients ?? []}
      />
    </div>
  )
}
