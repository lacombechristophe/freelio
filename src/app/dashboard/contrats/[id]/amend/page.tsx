import { notFound, redirect } from "next/navigation"

import { getContractById } from "@/actions/contrats"
import { ContractAmendmentForm } from "./contract-amendment-form"

export default async function ContractAmendmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const contract = await getContractById(id)
  if (!contract) notFound()
  if (contract.status !== "SIGNED" || contract.kind === "MAINTENANCE_RENEWAL") redirect(`/dashboard/contrats/${contract.id}`)

  return <ContractAmendmentForm baseContract={{ id: contract.id, number: contract.number, title: contract.title, clientName: contract.client.name }} />
}
