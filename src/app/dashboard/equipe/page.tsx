import { getTeamOverview } from "@/actions/team"
import { TeamClient } from "./team-client"
import { PageHeader } from "@/components/shared/page-header"

export default async function TeamPage() {
  const data = await getTeamOverview()

  return (
    <div className="workspace-page">
      <PageHeader
        eyebrow="Accès et responsabilités"
        title="Équipe"
        description="Invitez les collaborateurs et limitez chaque accès à son rôle opérationnel."
      />
      <TeamClient initialData={data} />
    </div>
  )
}
