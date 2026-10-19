"use client"

import { useEffect, useState, useTransition } from "react"
import { getWarehouseDirectory, setWarehouseActive, updateWarehouse } from "@/actions/warehouses"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DirectoryPagination } from "@/components/shared/directory-pagination"

type Directory = Awaited<ReturnType<typeof getWarehouseDirectory>>
type Warehouse = Directory["items"][number]
const fields = [["name", "Nom", 120], ["code", "Code", 30], ["address", "Adresse", 2_000]] as const
type Editor = { warehouse: Warehouse; name: string; code: string; address: string }

export function WarehouseDirectory({ initialData }: { initialData: Directory }) {
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState("ALL")
  const [page, setPage] = useState(1)
  const [retry, setRetry] = useState(0)
  const [loading, startLoading] = useTransition()
  const [loadError, setLoadError] = useState(false)
  const key = JSON.stringify([search, status, page, retry])
  const [result, setResult] = useState({ key: JSON.stringify(["", "ALL", 1, 0]), data: initialData })
  // Editing belongs to a captured revision, independently of directory refreshes.
  const [editor, setEditor] = useState<Editor | null>(null)
  const [confirmation, setConfirmation] = useState<Warehouse | null>(null)
  const [saveError, setSaveError] = useState("")
  const [saving, startSaving] = useTransition()
  useEffect(() => {
    if (key === result.key) return
    let current = true
    const timer = setTimeout(() => startLoading(async () => {
      try {
        const data = await getWarehouseDirectory({ search, status, page })
        if (current) { setResult({ key, data }); setLoadError(false) }
      } catch { if (current) setLoadError(true) }
    }), 200)
    return () => { current = false; clearTimeout(timer) }
  }, [key, search, status, page, result.key])
  const fresh = result.key === key
  const busy = loading || (!fresh && !loadError)
  function refresh() { setLoadError(false); setRetry(value => value + 1) }
  function edit(warehouse: Warehouse) {
    setSaveError("")
    setEditor({ warehouse, name: warehouse.name, code: warehouse.code, address: warehouse.address ?? "" })
  }
  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editor) return
    const { warehouse, ...values } = editor
    startSaving(async () => {
      try {
        await updateWarehouse({ ...values, warehouseId: warehouse.id, expectedUpdatedAt: warehouse.updatedAt })
        setEditor(null); setSaveError(""); refresh()
      } catch (error) { setSaveError(error instanceof Error ? error.message : "Modification impossible.") }
    })
  }
  function toggle() {
    if (!confirmation) return
    const warehouse = confirmation
    startSaving(async () => {
      try {
        await setWarehouseActive({ warehouseId: warehouse.id, active: !warehouse.active, expectedUpdatedAt: warehouse.updatedAt })
        setConfirmation(null); setSaveError(""); refresh()
      } catch (error) { setSaveError(error instanceof Error ? error.message : "Modification impossible.") }
    })
  }
  return <section className="space-y-4">
    <div className="flex flex-wrap gap-3">
      <Input aria-label="Rechercher un dépôt" placeholder="Nom, code ou adresse" maxLength={200} className="max-w-sm" value={search} onChange={event => { setSearch(event.target.value); setPage(1); setLoadError(false) }} />
      <select aria-label="Activité des dépôts" value={status} onChange={event => { setStatus(event.target.value); setPage(1); setLoadError(false) }} className="h-10 rounded-[10px] border bg-background px-3 text-sm">
        <option value="ALL">Tous</option><option value="ACTIVE">Actifs</option><option value="INACTIVE">Inactifs</option>
      </select>
    </div>
    <DirectoryPagination total={result.data.total} page={fresh ? result.data.page : page} pending={busy} error={loadError} onPage={next => { setPage(next); setLoadError(false) }} onRetry={refresh} />
    <div className="divide-y overflow-hidden rounded-xl border bg-card" aria-busy={busy}>
      {fresh && !loadError ? result.data.items.map(warehouse => <article key={warehouse.id} aria-label={warehouse.name} className="flex flex-wrap items-center gap-3 p-4">
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{warehouse.name}</p>
          <p className="text-xs text-muted-foreground">{warehouse.code} · {warehouse.agency?.name ?? "Sans agence"}</p>
          {warehouse.address ? <p className="mt-1 whitespace-pre-wrap break-words text-xs text-muted-foreground">{warehouse.address}</p> : null}
        </div>
        <Badge variant={warehouse.active ? "secondary" : "outline"}>{warehouse.active ? "Actif" : "Inactif"}</Badge>
        {result.data.canManage ? <div className="flex flex-wrap gap-2">
          <Button demoMutation variant="outline" disabled={saving} onClick={() => edit(warehouse)}>Modifier</Button>
          <Button demoMutation variant="outline" disabled={saving} onClick={() => { setSaveError(""); setConfirmation(warehouse) }}>{warehouse.active ? "Désactiver" : "Réactiver"}</Button>
        </div> : null}
      </article>) : null}
      {fresh && !loadError && !result.data.items.length ? <p className="p-5 text-sm text-muted-foreground">Aucun dépôt trouvé.</p> : null}
    </div>
    <Dialog open={editor !== null} onOpenChange={open => { if (!open && !saving) setEditor(null) }}>
      <DialogContent><DialogHeader><DialogTitle>Modifier le dépôt</DialogTitle><DialogDescription>Les mouvements et les rattachements existants seront conservés.</DialogDescription></DialogHeader>
        {editor ? <form onSubmit={save} className="space-y-4">
          {fields.map(([field, label, maxLength]) => <div key={field} className="space-y-1.5">
            <Label htmlFor={`warehouse-${field}`}>{label}</Label>
            <Input id={`warehouse-${field}`} name={field} required={field !== "address"} minLength={field === "name" ? 2 : undefined} maxLength={maxLength} value={editor[field]} disabled={saving} onChange={event => { const value = event.target.value; setEditor(current => current ? { ...current, [field]: value } : null) }} />
          </div>)}
          <p className="text-xs text-muted-foreground">Agence : {editor.warehouse.agency?.name ?? "Sans agence"}</p>
          {saveError ? <p role="alert" className="text-sm text-danger">{saveError}</p> : null}
          <DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={() => setEditor(null)}>Annuler</Button><Button demoMutation type="submit" disabled={saving}>Enregistrer</Button></DialogFooter>
        </form> : null}
      </DialogContent>
    </Dialog>
    <Dialog open={confirmation !== null} onOpenChange={open => { if (!open && !saving) setConfirmation(null) }}>
      <DialogContent><DialogHeader><DialogTitle>{confirmation?.active ? "Désactiver ce dépôt ?" : "Réactiver ce dépôt ?"}</DialogTitle>
        <DialogDescription>{confirmation?.active ? "Le dépôt doit être vide et sans réservation active. L’historique sera conservé ; aucun nouveau mouvement ne pourra utiliser ce dépôt désactivé." : "Ce dépôt pourra de nouveau être utilisé pour les mouvements et réservations."}</DialogDescription>
      </DialogHeader>
        {saveError ? <p role="alert" className="text-sm text-danger">{saveError}</p> : null}
        <DialogFooter><Button variant="outline" disabled={saving} onClick={() => setConfirmation(null)}>Annuler</Button><Button demoMutation disabled={saving} onClick={toggle}>{confirmation?.active ? "Désactiver le dépôt" : "Réactiver le dépôt"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </section>
}
