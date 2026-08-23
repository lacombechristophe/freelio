import { getOrganisationDashboardData } from "@/actions/organisation"
import { OrganisationView } from "./organisation-view"
import { OnboardingRequired } from "@/components/shared/onboarding-required"

export const dynamic = "force-dynamic"

export default async function OrganisationPage() {
  const data = await getOrganisationDashboardData()

  if (!data) {
    return (
      <OnboardingRequired
        title="Configurez votre organisation"
        description="Terminez l’onboarding pour planifier vos priorités, vos objectifs et vos tâches."
      />
    )
  }

  return <OrganisationView data={data} />
}
