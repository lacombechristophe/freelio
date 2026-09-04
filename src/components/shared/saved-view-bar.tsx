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
  const [pending, startTransition] = React.useTransition()
  const router = useRouter()
  const [selectedId, setSelectedId] = React.useState(views.find((view) => view.isDefault)?.id || "")
  const selected = views.find((view) => view.id === selectedId)

  function run(task: () => Promise<unknown>, success: string) {
    startTransition(() => void task().then(() => { toast.success(success); router.refresh() }).catch((error) => toast.error(error instanceof Error ? error.message : "Action impossible.")))
  }

  return <div className="workspace-panel flex flex-col gap-2.5 p-2.5 sm:flex-row sm:items-center">
    <div className="flex min-w-0 flex-1 items-center gap-2"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/8 text-primary"><Bookmark className="size-4" /></span><Label className="sr-only" htmlFor={`saved-view-${resource}`}>Vue enregistrée</Label><select id={`saved-view-${resource}`} value={selectedId} onChange={(event) => { const id = event.target.value; setSelectedId(id); const next = views.find((view) => view.id === id); if (next) { onApply(next.config); toast.success("Vue appliquée.") } }} className="h-9 min-w-0 flex-1 rounded-[9px] border border-input bg-card px-3 text-sm font-medium outline-none focus:border-ring focus:ring-3 focus:ring-ring/20"><option value="">Vue actuelle · tous les éléments</option>{views.map((view) => <option key={view.id} value={view.id}>{view.name}{view.isDefault ? " · par défaut" : ""}</option>)}</select>{selected?.visibility === "TEAM" && <Badge variant="secondary">Équipe</Badge>}</div>
    <div className="flex min-w-0 flex-1 items-center gap-2 sm:max-w-xl"><Label className="sr-only" htmlFor={`new-view-${resource}`}>Enregistrer la vue actuelle</Label><Input id={`new-view-${resource}`} value={name} onChange={(event) => setName(event.target.value)} className="h-9" placeholder="Nommer et enregistrer cette vue…" maxLength={80} /><Button type="button" variant="outline" size="sm" disabled={pending || name.trim().length < 2} onClick={() => run(() => saveSavedView({ resource, name, visibility: "PERSONAL", isDefault: false, config }), "Vue enregistrée.")} aria-label="Enregistrer la vue"><Plus />Enregistrer</Button></div>
    {selected && <Button type="button" variant="ghost" size="icon" disabled={pending} onClick={() => run(() => deleteSavedView(selected.id), "Vue supprimée.")} aria-label="Supprimer la vue"><Trash2 className="text-danger" /></Button>}
  </div>
}
