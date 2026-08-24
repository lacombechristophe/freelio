import { getPublicContractForSigning } from "@/actions/contrats"
import { ClientSignView } from "@/app/dashboard/contrats/[id]/sign/client-sign-view"
import { AppBrand } from "@/components/shared/app-brand"
import { sanitizeContractHtml } from "@/lib/contracts/html"
import { notFound } from "next/navigation"

export default async function PublicContractSigningPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const contract = await getPublicContractForSigning(token)
  if (!contract) notFound()
  const { company, ...signableContract } = contract

  return (
    <main className="min-h-screen bg-background px-4 py-8 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-5xl space-y-7">
        <header className="flex items-center justify-between gap-4 border-b border-border pb-4">
          <AppBrand href="/" brand={company} />
          <span className="rounded-md bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">Signature sécurisée</span>
        </header>
        <div className="rounded-xl bg-primary/5 p-4 text-sm leading-6 text-muted-foreground">
          En signant, vous acceptez le contenu affiché. L'horodatage, l'adresse réseau et l'empreinte du document seront conservés dans la piste d'audit.
        </div>
        <ClientSignView
          token={token}
          contract={{
            ...signableContract,
            content: sanitizeContractHtml(signableContract.content),
            validFrom: signableContract.validFrom ? new Date(signableContract.validFrom).toLocaleDateString("fr-FR") : null,
            validUntil: signableContract.validUntil ? new Date(signableContract.validUntil).toLocaleDateString("fr-FR") : null,
          }}
        />
      </div>
    </main>
  )
}
