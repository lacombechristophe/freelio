import { getAutomationDashboard } from "@/actions/automations"
import { AutomationCenter } from "@/app/dashboard/automatisations/automation-center"
import { OnboardingRequired } from "@/components/shared/onboarding-required"
import { PageHeader } from "@/components/shared/page-header"

export default async function AutomationsPage() {
  const data = await getAutomationDashboard()
  if (!data) return <OnboardingRequired title="Configurez votre espace" description="Créez d’abord le profil entreprise avant de préparer des automatisations." />
  return (
    <div className="space-y-7">
      <PageHeader eyebrow="Relation client" title="Automatisations & e-mails" description="Préparez des modèles, orchestrez des séquences consenties et déclenchez des actions CRM traçables." />
      <AutomationCenter initialData={data} />
    </div>
  )
}
