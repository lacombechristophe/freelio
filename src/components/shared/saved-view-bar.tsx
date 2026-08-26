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

  return <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 sm:flex-row sm:items-end">
    <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><Bookmark className="size-4 text-primary" /><Label htmlFor={`saved-view-${resource}`}>Vue enregistrée</Label>{selected?.visibility === "TEAM" && <Badge variant="secondary">Équipe</Badge>}</div><select id={`saved-view-${resource}`} value={selectedId} onChange={(event) => { const id = event.target.value; setSelectedId(id); const next = views.find((view) => view.id === id); if (next) { onApply(next.config); toast.success("Vue appliquée.") } }} className="mt-1.5 h-10 w-full rounded-[10px] border border-input bg-background px-3 text-sm"><option value="">Filtres actuels</option>{views.map((view) => <option key={view.id} value={view.id}>{view.name}{view.isDefault ? " · par défaut" : ""}</option>)}</select></div>
    <div className="flex min-w-0 flex-1 items-end gap-2"><div className="min-w-0 flex-1"><Label htmlFor={`new-view-${resource}`}>Enregistrer la vue actuelle</Label><Input id={`new-view-${resource}`} value={name} onChange={(event) => setName(event.target.value)} className="mt-1.5" placeholder="Mes devis à relancer" maxLength={80} /></div><Button type="button" variant="outline" size="icon" disabled={pending || name.trim().length < 2} onClick={() => run(() => saveSavedView({ resource, name, visibility: "PERSONAL", isDefault: false, config }), "Vue enregistrée.")} aria-label="Enregistrer la vue"><Plus /></Button></div>
    {selected && <Button type="button" variant="ghost" size="icon" disabled={pending} onClick={() => run(() => deleteSavedView(selected.id), "Vue supprimée.")} aria-label="Supprimer la vue"><Trash2 className="text-danger" /></Button>}
  </div>
}
