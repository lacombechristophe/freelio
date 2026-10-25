import { getMarketingIntelligenceDashboard } from "@/actions/marketing"
import { MarketingIntelligence } from "./marketing-intelligence"
import { OnboardingRequired } from "@/components/shared/onboarding-required"
import { PageHeader } from "@/components/shared/page-header"

export default async function MarketingPage() {
  const data = await getMarketingIntelligenceDashboard()
  if (!data) return <OnboardingRequired title="Configurez votre espace" description="Créez le profil entreprise avant de définir la qualification." />
  return <div className="workspace-page"><PageHeader eyebrow="Qualification" title="Qualification & segments" description="Priorisez les prospects avec des règles explicables et créez des listes actives pour vos séquences." /><MarketingIntelligence initialData={data} /></div>
}
