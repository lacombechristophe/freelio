import { getServiceContentDashboard } from "@/actions/service-content"
import { OnboardingRequired } from "@/components/shared/onboarding-required"
import { PageHeader } from "@/components/shared/page-header"
import { SatisfactionCenter } from "./satisfaction-center"

export default async function SatisfactionPage() {
  const data = await getServiceContentDashboard()
  if (!data) return <OnboardingRequired title="Configurez votre espace" description="Créez le profil entreprise avant de mesurer la satisfaction." />
  return <div className="space-y-7"><PageHeader eyebrow="Service" title="Satisfaction client" description="Mesurez le CSAT, le NPS et l’effort client avec des invitations sécurisées rattachées aux dossiers réels." /><SatisfactionCenter initialData={data} /></div>
}

