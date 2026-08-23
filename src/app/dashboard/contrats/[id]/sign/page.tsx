import { redirect } from "next/navigation"

interface SignPageProps {
  params: Promise<{ id: string }>
}

export default async function ContractSignPage({ params }: SignPageProps) {
  const { id } = await params
  redirect(`/dashboard/contrats/${id}`)
}
