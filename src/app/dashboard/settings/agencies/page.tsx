import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { getAgencyManagement } from "@/actions/agencies"
import { AgencyManagement } from "@/app/dashboard/settings/agencies/agency-management"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/shared/page-header"

export default async function AgenciesSettingsPage() {
  const data = await getAgencyManagement()

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Organisation"
        title="Agences, équipes et dépôts"
        description="Structurez vos magasins, secteurs de pose et équipes SAV sans fragmenter l’entreprise légale ni la numérotation des documents."
        actions={<Button nativeButton={false} variant="outline" render={<Link href="/dashboard/settings" />}><ArrowLeft />Paramètres</Button>}
      />
      <AgencyManagement initialData={data} />
    </div>
  )
}
