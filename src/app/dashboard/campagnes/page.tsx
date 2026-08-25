import { getCampaignDashboard } from "@/actions/campaigns"
import { OnboardingRequired } from "@/components/shared/onboarding-required"
import { PageHeader } from "@/components/shared/page-header"
import { CampaignCenter } from "./campaign-center"

export default async function CampaignsPage() {
  const data = await getCampaignDashboard()
  if (!data) return <OnboardingRequired title="Configurez votre espace" description="Créez le profil entreprise avant de planifier une campagne." />
  return <div className="space-y-7"><PageHeader eyebrow="Marketing" title="Campagnes" description="Planifiez les audiences, canaux, contenus, responsables et résultats dans un dossier de campagne unique." /><CampaignCenter initialData={data} /></div>
}
