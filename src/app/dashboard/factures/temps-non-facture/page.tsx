import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { getUnbilledTimeEntries } from "@/actions/factures"
import { Button } from "@/components/ui/button"
import { OnboardingRequired } from "@/components/shared/onboarding-required"
import { UnbilledTimeView } from "./unbilled-time-view"
import { PageHeader } from "@/components/shared/page-header"

export const dynamic = "force-dynamic"

export default async function UnbilledTimePage() {
  const data = await getUnbilledTimeEntries()

  if (!data) {
    return (
      <OnboardingRequired
        title="Configurez votre suivi du temps"
        description="Terminez l’onboarding pour transformer vos heures facturables en factures brouillon."
      />
    )
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
          <Link href="/dashboard/factures">
            <Button variant="ghost" size="sm" className="gap-2 px-0">
              <ArrowLeft className="h-4 w-4" />
              Retour aux factures
            </Button>
          </Link>
          <PageHeader eyebrow="À convertir" title="Temps non facturé" description="Sélectionnez les heures validées et transformez-les en facture brouillon sans ressaisie." />
      </div>

      <UnbilledTimeView data={data} />
    </div>
  )
}
