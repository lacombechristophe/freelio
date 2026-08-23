import { getTimeEntries } from "@/actions/temps"
import { getProjects } from "@/actions/projets"
import { TempsView } from "./temps-view"

export default async function TempsPage() {
  const [timeEntries, projects] = await Promise.all([
    getTimeEntries(),
    getProjects(),
  ])

  return <TempsView timeEntries={timeEntries ?? []} projects={projects ?? []} />
}
