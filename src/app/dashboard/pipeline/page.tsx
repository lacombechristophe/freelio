import { getPipeline } from "@/actions/pipeline"
import { getClientsMinimal } from "@/actions/clients"
import { PipelineBoard } from "./pipeline-board"
import { PageHeader } from "@/components/shared/page-header"

export default async function PipelinePage({ searchParams }: PageProps<"/dashboard/pipeline">) {
  const query = await searchParams
  const pipelineId = typeof query.pipeline === "string" ? query.pipeline : undefined
  const [pipeline, clients] = await Promise.all([
    getPipeline(pipelineId),
    getClientsMinimal(),
  ])

  return (
    <div className="flex h-[calc(100dvh-128px)] flex-col space-y-6">
      <PageHeader
        eyebrow="Développement commercial"
        title="Pipeline"
        description="Visualisez les opportunités en cours et la valeur pondérée de votre prochain chiffre d’affaires."
        className="shrink-0"
      />
      <PipelineBoard pipeline={pipeline} clients={clients ?? []} />
    </div>
  )
}
