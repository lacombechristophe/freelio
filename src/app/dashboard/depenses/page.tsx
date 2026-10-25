import { getExpenseDirectory } from "@/actions/depenses"
import { DepensesView } from "./depenses-view"

export default async function DepensesPage() {
  const directory = await getExpenseDirectory()
  return (
    <div>
      <DepensesView
        initial={directory}
      />
      <div className="mt-7 rounded-xl border border-border bg-card px-5 py-4 text-sm text-muted-foreground">
        <p className="mb-1 font-semibold text-foreground">Repère comptable</p>
        En micro-entreprise avec franchise en base, les dépenses restent informatives et la TVA n’est pas récupérable.
      </div>
    </div>
  )
}
