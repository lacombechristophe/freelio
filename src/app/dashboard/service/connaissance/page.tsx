import { getServiceContentDashboard } from "@/actions/service-content"
import { OnboardingRequired } from "@/components/shared/onboarding-required"
import { PageHeader } from "@/components/shared/page-header"
import { KnowledgeCenter } from "./knowledge-center"

export default async function KnowledgePage() {
  const data = await getServiceContentDashboard()
  if (!data) return <OnboardingRequired title="Configurez votre espace" description="Créez le profil entreprise avant de publier une base de connaissances." />
  return <div className="workspace-page"><PageHeader eyebrow="Service" title="Base de connaissances" description="Centralisez les procédures internes et publiez uniquement les réponses validées dans l’espace client." /><KnowledgeCenter initialData={data} /></div>
}

