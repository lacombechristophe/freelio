import { getServiceDiagnosticGuides } from "@/actions/service-diagnostics"
import { PageHeader } from "@/components/shared/page-header"

import { ServiceDiagnosticsManager } from "./service-diagnostics-manager"

export default async function ServiceDiagnosticsPage() {
  const guides = await getServiceDiagnosticGuides()
  return <div className="space-y-7">
    <PageHeader
      eyebrow="Service"
      title="Guides de diagnostic"
      description="Structurez les contrôles par gamme, fabricant, symptôme et contexte de garantie, sans remplacer le jugement du technicien."
    />
    <ServiceDiagnosticsManager guides={guides} />
  </div>
}
