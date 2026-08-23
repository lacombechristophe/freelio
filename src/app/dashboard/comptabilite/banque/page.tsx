import { getBankingDashboard } from "@/actions/bank"
import { BankingView } from "./banking-view"
import { OnboardingRequired } from "@/components/shared/onboarding-required"

export const dynamic = "force-dynamic"

export default async function BankingPage() {
  const data = await getBankingDashboard()

  if (!data) {
    return (
      <OnboardingRequired
        title="Configurez le rapprochement bancaire"
        description="Terminez l’onboarding avant d’importer et de rapprocher vos transactions."
      />
    )
  }

  return <BankingView data={data} />
}
