import { Download } from "lucide-react"

import { getExecutiveReport } from "@/actions/reports"
import { ReportingCenter } from "@/app/dashboard/reports/reporting-center"
import { OnboardingRequired } from "@/components/shared/onboarding-required"
import { PageHeader } from "@/components/shared/page-header"
import { buttonVariants } from "@/components/ui/button"
import { normalizeReportPeriod } from "@/lib/reporting"
import { cn } from "@/lib/utils"

type ReportsPageProps = {
  searchParams: Promise<{ period?: string }>
}

export default async function ReportsWorkspacePage({ searchParams }: ReportsPageProps) {
  const query = await searchParams
  const period = normalizeReportPeriod(query.period)
  const data = await getExecutiveReport(period)
  if (!data) return <OnboardingRequired title="Configurez votre espace" description="Créez le profil entreprise avant de consulter les rapports." />

  return (
    <div className="workspace-page">
      <PageHeader
        eyebrow="Pilotage"
        title="Rapports de direction"
        description="Ventes, encaissements, chantiers et service réunis dans une lecture courte, comparable et actionnable."
        actions={
          <a href={`/api/reports/export?period=${period}`} className={cn(buttonVariants({ variant: "outline" }), "gap-2")}>
            <Download className="size-4" />
            Exporter en CSV
          </a>
        }
      />
      <ReportingCenter report={data} />
    </div>
  )
}
