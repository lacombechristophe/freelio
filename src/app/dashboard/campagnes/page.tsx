import { getCampaignDashboard } from "@/actions/campaigns"
import { OnboardingRequired } from "@/components/shared/onboarding-required"
import { PageHeader } from "@/components/shared/page-header"
import { CampaignCenter } from "./campaign-center"

export default async function CampaignsPage({ searchParams }: { searchParams: Promise<{ search?: string | string[]; page?: string | string[] }> }) {
  const query = await searchParams
  const page = typeof query.page === "string" ? Math.max(1, Math.min(100000, Math.floor(Number(query.page) || 1))) : 1
  const data = await getCampaignDashboard({ page, search: typeof query.search === "string" ? query.search.slice(0, 200) : "" })
  if (!data) return <OnboardingRequired title="Configurez votre espace" description="Créez le profil entreprise avant de planifier une campagne." />
  return <div className="workspace-page"><PageHeader eyebrow="Marketing" title="Campagnes" description="Planifiez les audiences, canaux, contenus, responsables et résultats dans un dossier de campagne unique." /><CampaignCenter initialData={data} /></div>
}
