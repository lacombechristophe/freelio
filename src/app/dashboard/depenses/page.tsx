import { getExpenses } from "@/actions/depenses"
import { DepensesView } from "./depenses-view"
import { getProjects } from "@/actions/projets"

export default async function DepensesPage() {
  const [expenses, projects] = await Promise.all([getExpenses(), getProjects(undefined, 200)])
  return (
    <div>
      <DepensesView
        expenses={(expenses ?? []) as any}
        projects={(projects ?? []).map((project) => ({ id: project.id, name: project.name, clientId: project.clientId }))}
      />
      <div className="mt-7 rounded-xl border border-border bg-card px-5 py-4 text-sm text-muted-foreground">
        <p className="mb-1 font-semibold text-foreground">Repère comptable</p>
        En micro-entreprise avec franchise en base, les dépenses restent informatives et la TVA n’est pas récupérable.
      </div>
    </div>
  )
}
