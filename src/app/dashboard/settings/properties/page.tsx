import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { getCrmPropertyDefinitions } from "@/actions/crm-properties"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/shared/page-header"
import { PropertyDefinitionsManager } from "./property-definitions-manager"

export default async function CrmPropertiesSettingsPage() {
  const definitions = await getCrmPropertyDefinitions(undefined, true)

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Données CRM"
        title="Propriétés personnalisées"
        description="Adaptez les fiches à votre activité avec des champs typés, contrôlés et historisés, sans modifier le code."
        actions={<Button nativeButton={false} variant="outline" render={<Link href="/dashboard/settings" />}><ArrowLeft />Paramètres</Button>}
      />
      <PropertyDefinitionsManager initialDefinitions={definitions ?? []} />
    </div>
  )
}
