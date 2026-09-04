"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Bookmark, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { deleteSavedView, saveSavedView } from "@/actions/views"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type View = Awaited<ReturnType<typeof import("@/actions/views").getSavedViews>>[number]
type ViewConfig = View["config"]

export function SavedViewBar({ resource, views, config, onApply }: { resource: string; views: View[]; config: ViewConfig; onApply: (config: ViewConfig) => void }) {
  const [name, setName] = React.useState("")
  const [naming, setNaming] = React.useState(false)
  const [pending, startTransition] = React.useTransition()
  const router = useRouter()
  const [selectedId, setSelectedId] = React.useState(views.find((view) => view.isDefault)?.id || "")
  const selected = views.find((view) => view.id === selectedId)

  function run(task: () => Promise<unknown>, success: string, onSuccess?: () => void) {
    startTransition(async () => {
      try {
        await task()
        onSuccess?.()
        toast.success(success)
        router.refresh()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Action impossible.")
      }
    })
  }

  return <div className="space-y-2">
    <div className="flex flex-wrap items-center gap-2">
      <Bookmark className="size-4 shrink-0 text-muted-foreground" />
      <Label className="sr-only" htmlFor={`saved-view-${resource}`}>Vue enregistrée</Label>
      <select id={`saved-view-${resource}`} value={selectedId} onChange={(event) => {
        const id = event.target.value
        setSelectedId(id)
        const next = views.find((view) => view.id === id)
        if (next) { onApply(next.config); toast.success("Vue appliquée.") }
      }} className="h-9 min-w-0 max-w-xs flex-1 rounded-lg border border-input bg-card px-3 text-sm font-medium outline-none focus:border-ring focus:ring-3 focus:ring-ring/20">
        <option value="">Vue actuelle</option>
        {views.map((view) => <option key={view.id} value={view.id}>{view.name}{view.isDefault ? " · par défaut" : ""}</option>)}
      </select>
      {selected?.visibility === "TEAM" && <Badge variant="secondary">Équipe</Badge>}
      <Button type="button" variant="ghost" size="sm" aria-expanded={naming} aria-controls={`save-view-form-${resource}`} onClick={() => setNaming(!naming)}><Plus />Enregistrer cette vue</Button>
      {selected && <Button type="button" variant="ghost" size="icon" disabled={pending} onClick={() => run(() => deleteSavedView(selected.id), "Vue supprimée.", () => setSelectedId(""))} aria-label="Supprimer la vue"><Trash2 className="text-danger" /></Button>}
    </div>
    {naming && <form id={`save-view-form-${resource}`} className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3" onSubmit={(event) => {
      event.preventDefault()
      if (pending || name.trim().length < 2) return
      run(() => saveSavedView({ resource, name: name.trim(), visibility: "PERSONAL", isDefault: false, config }), "Vue enregistrée.", () => { setName(""); setNaming(false) })
    }}>
      <Label htmlFor={`new-view-${resource}`}>Enregistrer la vue actuelle</Label>
      <Input id={`new-view-${resource}`} autoFocus value={name} onChange={(event) => setName(event.target.value)} className="h-9 min-w-40 flex-1" placeholder="Ex. Clients à relancer" required minLength={2} maxLength={80} disabled={pending} />
      <Button type="submit" variant="outline" size="sm" disabled={pending || name.trim().length < 2} aria-label="Enregistrer la vue">{pending ? "Enregistrement…" : "Enregistrer"}</Button>
      <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => setNaming(false)}>Annuler</Button>
    </form>}
  </div>
}
