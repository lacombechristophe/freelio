"use client"

import { useCallback, useEffect, useRef, useState, useTransition, type FormEvent } from "react"
import dynamic from "next/dynamic"
import { AlertOctagon, CheckCircle2, CloudDownload, CloudOff, FileImage, FileText, Loader2, MapPin, PackageMinus, Plus, ReceiptText, RefreshCw, Save, Send, ShieldCheck, Trash2, Wifi } from "lucide-react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  cacheFieldResources,
  clearFieldOfflineData,
  deleteFieldDraft,
  getFieldDraft,
  getFieldSnapshot,
  listFieldDrafts,
  saveFieldDraft,
  saveFieldSnapshot,
  type FieldAssignment,
  type FieldDraft,
  type FieldExpenseDraft,
  type FieldMaterialDraft,
  type FieldReservationDraft,
  type FieldSnapshot,
  type OfflinePhoto,
} from "@/lib/field/offline"

const SignatureCanvas = dynamic(() => import("@/components/shared/signature-canvas").then((module) => module.SignatureCanvas), { ssr: false })

const STATUS_LABELS: Record<string, string> = { PLANNED: "Planifiée", EN_ROUTE: "En route", IN_PROGRESS: "En cours", COMPLETED: "Terminée" }
const EXPENSE_LABELS: Record<FieldExpenseDraft["category"], string> = { TRAVEL: "Déplacement", TOLL: "Péage", PARKING: "Stationnement", MEAL: "Repas", SUPPLIES: "Fournitures", OTHER: "Autre" }
const RESERVATION_LABELS: Record<FieldReservationDraft["severity"], string> = { MINOR: "Mineure", MAJOR: "Majeure", BLOCKING: "Bloquante" }

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
}

function siteAddress(assignment: FieldAssignment) {
  return [assignment.site.address1, assignment.site.address2, assignment.site.postalCode, assignment.site.city].filter(Boolean).join(" · ")
}

async function uploadDraftPhotos(draft: FieldDraft) {
  for (const photo of draft.photos) {
    const formData = new FormData()
    formData.set("file", new File([photo.blob], photo.name, { type: photo.type }))
    const response = await fetch(`/api/files/intervention/${draft.interventionId}`, { method: "POST", body: formData })
    const result = await response.json()
    if (!response.ok) throw new Error(result?.error || `Envoi impossible : ${photo.name}`)
  }
}

async function uploadDraftExpenseReceipts(draft: FieldDraft, mappings: Array<{ id: string; sourceId: string }>) {
  for (const expense of draft.expenses) {
    if (!expense.receipt) continue
    const mapping = mappings.find((item) => item.sourceId === expense.id)
    if (!mapping) throw new Error(`Frais introuvable après clôture : ${expense.label}`)
    const formData = new FormData()
    formData.set("file", new File([expense.receipt.blob], expense.receipt.name, { type: expense.receipt.type }))
    const response = await fetch(`/api/files/expense/${mapping.id}`, { method: "POST", body: formData })
    const result = await response.json()
    if (!response.ok) throw new Error(result?.error || `Justificatif impossible : ${expense.receipt.name}`)
  }
}

async function submitDraft(draft: FieldDraft) {
  await uploadDraftPhotos(draft)
  const response = await fetch(`/api/field/interventions/${draft.interventionId}/complete`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      report: draft.report,
      laborMinutes: draft.laborMinutes,
      customerName: draft.customerName,
      customerApproval: draft.customerApproval,
      customerSignatureData: draft.customerSignatureData,
      materials: draft.materials.map(({ warehouseId, productId, quantity }) => ({ warehouseId, productId, quantity })),
      expenses: draft.expenses.map((expense) => ({ sourceId: expense.id, label: expense.label, category: expense.category, amountCents: expense.amountCents, tvaCents: expense.tvaCents, notes: expense.notes })),
      reservations: draft.reservations.map((reservation) => ({ sourceId: reservation.id, title: reservation.title, details: reservation.details, severity: reservation.severity })),
    }),
  })
  const result = await response.json()
  if (!response.ok) throw new Error(result?.error || "Clôture impossible")
  await uploadDraftExpenseReceipts(draft, result.expenses || [])
  return result
}

function emptyDraft(interventionId: string): FieldDraft {
  return { interventionId, report: "", laborMinutes: 60, customerName: "", customerApproval: false, customerSignatureData: "", photos: [], materials: [], expenses: [], reservations: [], pendingCompletion: false, updatedAt: new Date().toISOString() }
}

function normalizeDraft(stored: FieldDraft | undefined, interventionId: string): FieldDraft {
  const base = emptyDraft(interventionId)
  return stored ? { ...base, ...stored, customerSignatureData: stored.customerSignatureData || "", materials: stored.materials || [], expenses: stored.expenses || [], reservations: stored.reservations || [] } : base
}

export function TerrainWorkspace({ initialSnapshot }: { initialSnapshot: FieldSnapshot }) {
  const router = useRouter()
  const [snapshot, setSnapshot] = useState(initialSnapshot)
  const [online, setOnline] = useState(true)
  const [offlineEnabled, setOfflineEnabled] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [isPending, startTransition] = useTransition()
  const flushing = useRef(false)

  const refreshPendingCount = useCallback(async () => {
    const drafts = await listFieldDrafts().catch(() => [])
    setPendingCount(drafts.filter((draft) => draft.pendingCompletion).length)
  }, [])

  const markCompleted = useCallback(async (interventionId: string) => {
    const completedAt = new Date().toISOString()
    setSnapshot((current) => {
      const next = { ...current, assignments: current.assignments.map((item) => item.id === interventionId ? { ...item, status: "COMPLETED" } : item) }
      if (offlineEnabled) void saveFieldSnapshot({ ...next, cachedAt: completedAt, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString() })
      return next
    })
  }, [offlineEnabled])

  const syncDraft = useCallback(async (draft: FieldDraft) => {
    await submitDraft(draft)
    await deleteFieldDraft(draft.interventionId)
    await markCompleted(draft.interventionId)
    await refreshPendingCount()
  }, [markCompleted, refreshPendingCount])

  const flushPending = useCallback(async () => {
    if (flushing.current || !navigator.onLine) return
    flushing.current = true
    try {
      const drafts = (await listFieldDrafts()).filter((draft) => draft.pendingCompletion)
      let synced = 0
      for (const draft of drafts) {
        try {
          await syncDraft(draft)
          synced += 1
        } catch {
          break
        }
      }
      if (synced) {
        toast.success(`${synced} rapport${synced > 1 ? "s" : ""} synchronisé${synced > 1 ? "s" : ""}.`)
        router.refresh()
      }
    } finally {
      flushing.current = false
    }
  }, [router, syncDraft])

  useEffect(() => {
    const updateOnline = () => {
      setOnline(navigator.onLine)
      if (navigator.onLine) void flushPending()
    }
    setOnline(navigator.onLine)
    void getFieldSnapshot().then((cached) => {
      const currentOnline = navigator.onLine
      if (!cached) {
        if (!currentOnline) setSnapshot({ ...initialSnapshot, assignments: [] })
        return
      }
      const valid = new Date(cached.expiresAt) > new Date()
      setOfflineEnabled(valid)
      if (!valid) {
        setSnapshot(currentOnline ? initialSnapshot : { ...cached, assignments: [] })
        void clearFieldOfflineData()
        return
      }
      if (!currentOnline) setSnapshot(cached)
      if (currentOnline) void saveFieldSnapshot(initialSnapshot)
    }).catch(() => {})
    void refreshPendingCount()
    window.addEventListener("online", updateOnline)
    window.addEventListener("offline", updateOnline)
    return () => {
      window.removeEventListener("online", updateOnline)
      window.removeEventListener("offline", updateOnline)
    }
  }, [flushPending, initialSnapshot, refreshPendingCount])

  function enableOffline() {
    startTransition(async () => {
      try {
        await Promise.all([saveFieldSnapshot(initialSnapshot), cacheFieldResources()])
        setOfflineEnabled(true)
        toast.success("Interventions et écran terrain disponibles hors connexion pendant 24 h.")
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Activation hors ligne impossible")
      }
    })
  }

  const active = snapshot.assignments.filter((item) => item.status !== "COMPLETED")
  const completed = snapshot.assignments.filter((item) => item.status === "COMPLETED")

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${online ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}>{online ? <Wifi className="size-4" /> : <CloudOff className="size-4" />}</span>
          <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{online ? "Connexion disponible" : "Mode hors ligne"}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{offlineEnabled ? `Copie locale valable jusqu’au ${formatDate(snapshot.expiresAt)}. Les brouillons restent sur cet appareil.` : "Activez la copie locale avant le départ. Elle expire automatiquement après 24 h."}</p></div>
          <div className="flex flex-wrap gap-2">
            {pendingCount ? <Badge variant="outline">{pendingCount} rapport{pendingCount > 1 ? "s" : ""} en attente</Badge> : null}
            <Button variant="outline" onClick={enableOffline} disabled={isPending || !online}>{isPending ? <Loader2 className="animate-spin" /> : <CloudDownload />}{offlineEnabled ? "Actualiser la copie" : "Activer hors ligne"}</Button>
            {online && pendingCount ? <Button onClick={() => void flushPending()} disabled={isPending}><RefreshCw />Synchroniser</Button> : null}
          </div>
        </CardContent>
      </Card>

      <section className="overflow-hidden rounded-xl border bg-card">
        <div className="border-b px-5 py-4"><h2 className="text-sm font-semibold">Interventions à exécuter</h2><p className="mt-1 text-xs text-muted-foreground">{active.length} intervention{active.length > 1 ? "s" : ""} dans la fenêtre des 60 prochains jours</p></div>
        {active.length ? <div className="divide-y">{active.map((assignment) => <FieldAssignmentEditor key={assignment.id} assignment={assignment} products={snapshot.products || []} warehouses={snapshot.warehouses || []} online={online} onDraftChange={refreshPendingCount} onSync={syncDraft} />)}</div> : <p className="px-5 py-12 text-center text-sm text-muted-foreground">Aucune intervention active dans la copie terrain.</p>}
      </section>

      {completed.length ? <section className="overflow-hidden rounded-xl border bg-card"><div className="border-b px-5 py-4"><h2 className="text-sm font-semibold">Clôturées récemment</h2></div><div className="divide-y">{completed.map((assignment) => <div key={assignment.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center"><CheckCircle2 className="size-4 shrink-0 text-success" /><div className="min-w-0 flex-1"><p className="text-sm font-medium">{assignment.title}</p><p className="mt-1 text-xs text-muted-foreground">{assignment.site.clientName} · {assignment.site.label}</p></div><a className={buttonVariants({ variant: "outline", size: "sm" })} href={`/api/pdf/intervention/${assignment.id}`} target="_blank" rel="noreferrer"><FileText />Rapport PDF</a></div>)}</div></section> : null}
    </div>
  )
}

function FieldAssignmentEditor({ assignment, products, warehouses, online, onDraftChange, onSync }: { assignment: FieldAssignment; products: FieldSnapshot["products"]; warehouses: FieldSnapshot["warehouses"]; online: boolean; onDraftChange: () => Promise<void>; onSync: (draft: FieldDraft) => Promise<void> }) {
  const [draft, setDraft] = useState<FieldDraft>(() => emptyDraft(assignment.id))
  const draftRef = useRef(draft)
  const [draftReady, setDraftReady] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    void getFieldDraft(assignment.id).then((stored) => {
      if (cancelled) return
      const normalized = normalizeDraft(stored, assignment.id)
      draftRef.current = normalized
      setDraft(normalized)
    }).catch(() => {}).finally(() => {
      if (!cancelled) setDraftReady(true)
    })
    return () => { cancelled = true }
  }, [assignment.id])

  function change(patch: Partial<FieldDraft>) {
    const next = { ...draftRef.current, ...patch, pendingCompletion: false }
    draftRef.current = next
    setDraft(next)
  }

  function addMaterial() {
    const line: FieldMaterialDraft = { id: crypto.randomUUID(), warehouseId: warehouses[0]?.id || "", productId: "", quantity: 1 }
    change({ materials: [...draftRef.current.materials, line] })
  }

  function updateMaterial(id: string, patch: Partial<FieldMaterialDraft>) {
    change({ materials: draftRef.current.materials.map((item) => item.id === id ? { ...item, ...patch } : item) })
  }

  function addExpense() {
    const line: FieldExpenseDraft = { id: crypto.randomUUID(), label: "", category: "OTHER", amountCents: 0, tvaCents: 0, notes: "", receipt: null }
    change({ expenses: [...draftRef.current.expenses, line] })
  }

  function updateExpense(id: string, patch: Partial<FieldExpenseDraft>) {
    change({ expenses: draftRef.current.expenses.map((item) => item.id === id ? { ...item, ...patch } : item) })
  }

  function addReservation() {
    const line: FieldReservationDraft = { id: crypto.randomUUID(), title: "", details: "", severity: "MINOR" }
    change({ reservations: [...draftRef.current.reservations, line] })
  }

  function updateReservation(id: string, patch: Partial<FieldReservationDraft>) {
    change({ reservations: draftRef.current.reservations.map((item) => item.id === id ? { ...item, ...patch } : item) })
  }

  async function persist(next = draftRef.current) {
    setSaving(true)
    try {
      const stored = { ...next, updatedAt: new Date().toISOString() }
      draftRef.current = stored
      await saveFieldDraft(stored)
      setDraft(stored)
      await onDraftChange()
      toast.success("Brouillon conservé sur cet appareil.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Sauvegarde locale impossible")
    } finally {
      setSaving(false)
    }
  }

  async function addPhotos(input: HTMLInputElement) {
    const files = [...(input.files || [])]
    input.value = ""
    if (!files.length) return
    const nextPhotos: OfflinePhoto[] = files.map((file) => ({ id: crypto.randomUUID(), name: file.name, type: file.type, blob: file }))
    const current = draftRef.current
    const photos = [...current.photos, ...nextPhotos]
    if (photos.length > 8 || photos.reduce((sum, photo) => sum + photo.blob.size, 0) > 50 * 1024 * 1024) {
      toast.error("Maximum 8 photos et 50 Mo par intervention hors ligne.")
      return
    }
    await persist({ ...current, photos })
  }

  function addExpenseReceipt(expenseId: string, input: HTMLInputElement) {
    const file = input.files?.[0]
    input.value = ""
    if (!file) return
    if (file.size > 10 * 1024 * 1024) return toast.error("Le justificatif ne doit pas dépasser 10 Mo.")
    updateExpense(expenseId, { receipt: { id: crypto.randomUUID(), name: file.name, type: file.type, blob: file } })
  }

  async function complete(event: FormEvent) {
    event.preventDefault()
    const current = draftRef.current
    if (current.report.trim().length < 3 || current.customerName.trim().length < 2 || !current.customerApproval || !current.customerSignatureData) {
      toast.error("Compte rendu, client présent, accord et signature manuscrite sont requis.")
      return
    }
    if (current.materials.some((item) => !item.warehouseId || !item.productId || item.quantity < 1)) return toast.error("Complétez chaque ligne de matériel.")
    if (current.expenses.some((item) => item.label.trim().length < 2 || item.amountCents < 1 || item.tvaCents > item.amountCents)) return toast.error("Complétez les frais et contrôlez leur montant de TVA.")
    if (current.reservations.some((item) => item.title.trim().length < 2)) return toast.error("Donnez un titre à chaque réserve.")
    const queued = { ...current, pendingCompletion: true, updatedAt: new Date().toISOString() }
    draftRef.current = queued
    await saveFieldDraft(queued)
    setDraft(queued)
    await onDraftChange()
    if (!online) {
      toast.success("Rapport placé dans la file de synchronisation.")
      return
    }
    setSaving(true)
    try {
      await onSync(queued)
      toast.success("Rapport, stock, frais, réserves et signature synchronisés.")
    } catch (error) {
      toast.error(`${error instanceof Error ? error.message : "Synchronisation impossible"}. Le brouillon reste en attente.`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <article className="px-5 py-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{STATUS_LABELS[assignment.status] || assignment.status}</Badge><span className="text-xs font-medium tabular-nums">{formatDate(assignment.scheduledStart)}</span>{draft.pendingCompletion ? <Badge variant="secondary">À synchroniser</Badge> : null}</div><h3 className="mt-2 text-sm font-semibold">{assignment.title}</h3><p className="mt-1 text-xs text-muted-foreground">{assignment.site.clientName} · {assignment.site.label}{assignment.ticketNumber ? ` · ${assignment.ticketNumber}` : ""}</p><p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="size-3.5" />{siteAddress(assignment)}</p></div>{assignment.technician ? <span className="text-xs text-muted-foreground">{assignment.technician}</span> : null}</div>
      <form onSubmit={complete} className="mt-5 space-y-4 border-t pt-4" aria-busy={!draftReady}>
        <fieldset disabled={!draftReady} className="contents">
        <div><Label htmlFor={`report-${assignment.id}`}>Compte rendu terrain</Label><textarea id={`report-${assignment.id}`} className="mt-1.5 min-h-28 w-full rounded-[10px] border bg-background p-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/20" value={draft.report} onChange={(event) => change({ report: event.target.value })} /></div>
        <div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor={`minutes-${assignment.id}`}>Temps passé (minutes)</Label><Input id={`minutes-${assignment.id}`} className="mt-1.5" type="number" min="0" max="10080" value={draft.laborMinutes} onChange={(event) => change({ laborMinutes: Number(event.target.value) })} /></div><div><Label htmlFor={`customer-${assignment.id}`}>Client présent</Label><Input id={`customer-${assignment.id}`} className="mt-1.5" value={draft.customerName} onChange={(event) => change({ customerName: event.target.value })} /></div></div>
        <div className="flex flex-wrap items-center gap-2"><label className={buttonVariants({ variant: "outline", size: "sm" })}><FileImage />Ajouter des photos<input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" multiple onChange={(event) => void addPhotos(event.currentTarget)} /></label>{draft.photos.map((photo) => <span key={photo.id} className="inline-flex items-center gap-1 rounded-lg bg-muted px-2 py-1.5 text-xs"><span className="max-w-40 truncate">{photo.name}</span><button type="button" aria-label={`Retirer ${photo.name}`} onClick={() => change({ photos: draftRef.current.photos.filter((item) => item.id !== photo.id) })}><Trash2 className="size-3.5 text-danger" /></button></span>)}</div>

        <div className="rounded-xl border">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/25 px-4 py-3"><div><p className="flex items-center gap-2 text-sm font-semibold"><PackageMinus className="size-4 text-primary" />Matériel consommé</p><p className="mt-1 text-xs text-muted-foreground">La sortie de stock sera atomique avec la clôture.</p></div><Button type="button" size="sm" variant="outline" onClick={addMaterial} disabled={!warehouses.length || !products.length}><Plus />Ajouter</Button></div>
          {draft.materials.length ? <div className="divide-y">{draft.materials.map((material) => { const warehouse = warehouses.find((item) => item.id === material.warehouseId); const inventory = warehouse?.items || []; return <div key={material.id} className="grid gap-3 p-4 sm:grid-cols-[minmax(130px,0.8fr)_minmax(180px,1fr)_100px_36px] sm:items-end"><label className="space-y-1.5 text-sm font-medium">Dépôt<select aria-label="Dépôt du matériel" value={material.warehouseId} onChange={(event) => updateMaterial(material.id, { warehouseId: event.target.value, productId: "" })} className="h-10 w-full rounded-[10px] border bg-background px-3 text-sm">{warehouses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="space-y-1.5 text-sm font-medium">Produit<select aria-label="Produit consommé" value={material.productId} onChange={(event) => updateMaterial(material.id, { productId: event.target.value })} className="h-10 w-full rounded-[10px] border bg-background px-3 text-sm"><option value="">Sélectionner…</option>{inventory.map((item) => { const product = products.find((candidate) => candidate.id === item.productId); return product ? <option key={product.id} value={product.id}>{product.sku} · {product.label} · dispo {item.availableQuantity}</option> : null })}</select></label><div><Label>Quantité</Label><Input aria-label="Quantité de matériel" className="mt-1.5" type="number" min="1" step="1" value={material.quantity} onChange={(event) => updateMaterial(material.id, { quantity: Number(event.target.value) })} /></div><Button type="button" size="icon-sm" variant="ghost" aria-label="Retirer le matériel" onClick={() => change({ materials: draft.materials.filter((item) => item.id !== material.id) })}><Trash2 className="text-danger" /></Button></div>})}</div> : <p className="px-4 py-5 text-xs text-muted-foreground">Aucun matériel ajouté.</p>}
        </div>

        <div className="rounded-xl border">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/25 px-4 py-3"><div><p className="flex items-center gap-2 text-sm font-semibold"><ReceiptText className="size-4 text-primary" />Frais terrain</p><p className="mt-1 text-xs text-muted-foreground">Péage, parking, repas ou achat ponctuel avec justificatif hors ligne.</p></div><Button type="button" size="sm" variant="outline" onClick={addExpense}><Plus />Ajouter</Button></div>
          {draft.expenses.length ? <div className="divide-y">{draft.expenses.map((expense) => <div key={expense.id} className="space-y-3 p-4"><div className="grid gap-3 sm:grid-cols-[minmax(160px,1fr)_140px_110px_110px_36px] sm:items-end"><div><Label>Libellé</Label><Input aria-label="Libellé du frais" className="mt-1.5" value={expense.label} onChange={(event) => updateExpense(expense.id, { label: event.target.value })} /></div><label className="space-y-1.5 text-sm font-medium">Catégorie<select aria-label="Catégorie du frais" value={expense.category} onChange={(event) => updateExpense(expense.id, { category: event.target.value as FieldExpenseDraft["category"] })} className="h-10 w-full rounded-[10px] border bg-background px-3 text-sm">{Object.entries(EXPENSE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><div><Label>Montant TTC</Label><Input aria-label="Montant TTC du frais" className="mt-1.5" type="number" min="0.01" step="0.01" value={expense.amountCents ? expense.amountCents / 100 : ""} onChange={(event) => updateExpense(expense.id, { amountCents: Math.round(Number(event.target.value) * 100) })} /></div><div><Label>Dont TVA</Label><Input aria-label="TVA du frais" className="mt-1.5" type="number" min="0" step="0.01" value={expense.tvaCents ? expense.tvaCents / 100 : ""} onChange={(event) => updateExpense(expense.id, { tvaCents: Math.round(Number(event.target.value) * 100) })} /></div><Button type="button" size="icon-sm" variant="ghost" aria-label="Retirer le frais" onClick={() => change({ expenses: draft.expenses.filter((item) => item.id !== expense.id) })}><Trash2 className="text-danger" /></Button></div><div className="flex flex-wrap items-center gap-2"><label className={buttonVariants({ variant: "outline", size: "sm" })}><FileImage />{expense.receipt ? "Remplacer le justificatif" : "Ajouter un justificatif"}<input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" capture="environment" onChange={(event) => addExpenseReceipt(expense.id, event.currentTarget)} /></label>{expense.receipt ? <Badge variant="secondary">{expense.receipt.name}</Badge> : <Badge variant="outline">À justifier</Badge>}</div></div>)}</div> : <p className="px-4 py-5 text-xs text-muted-foreground">Aucun frais ajouté.</p>}
        </div>

        <div className="rounded-xl border">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/25 px-4 py-3"><div><p className="flex items-center gap-2 text-sm font-semibold"><AlertOctagon className="size-4 text-warning" />Réserves et reprises</p><p className="mt-1 text-xs text-muted-foreground">Chaque réserve restera ouverte dans le dossier jusqu’à sa résolution.</p></div><Button type="button" size="sm" variant="outline" onClick={addReservation}><Plus />Ajouter</Button></div>
          {draft.reservations.length ? <div className="divide-y">{draft.reservations.map((reservation) => <div key={reservation.id} className="grid gap-3 p-4 sm:grid-cols-[minmax(180px,1fr)_140px_minmax(180px,1fr)_36px] sm:items-end"><div><Label>Titre</Label><Input aria-label="Titre de la réserve" className="mt-1.5" value={reservation.title} onChange={(event) => updateReservation(reservation.id, { title: event.target.value })} /></div><label className="space-y-1.5 text-sm font-medium">Sévérité<select aria-label="Sévérité de la réserve" value={reservation.severity} onChange={(event) => updateReservation(reservation.id, { severity: event.target.value as FieldReservationDraft["severity"] })} className="h-10 w-full rounded-[10px] border bg-background px-3 text-sm">{Object.entries(RESERVATION_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><div><Label>Détail</Label><Input aria-label="Détail de la réserve" className="mt-1.5" value={reservation.details} onChange={(event) => updateReservation(reservation.id, { details: event.target.value })} /></div><Button type="button" size="icon-sm" variant="ghost" aria-label="Retirer la réserve" onClick={() => change({ reservations: draft.reservations.filter((item) => item.id !== reservation.id) })}><Trash2 className="text-danger" /></Button></div>)}</div> : <p className="px-4 py-5 text-xs text-muted-foreground">Aucune réserve signalée.</p>}
        </div>

        <div className="space-y-3 rounded-xl border p-4"><div><p className="text-sm font-semibold">Signature manuscrite du client</p><p className="mt-1 text-xs text-muted-foreground">La signature est conservée dans le rapport et incluse dans son empreinte d’intégrité.</p></div><SignatureCanvas disabled={!draftReady || saving} onSave={(customerSignatureData) => change({ customerSignatureData })} onClear={() => change({ customerSignatureData: "" })} />{draft.customerSignatureData ? <Badge variant="secondary" className="w-fit"><ShieldCheck />Signature capturée</Badge> : <Badge variant="outline" className="w-fit">Signature requise</Badge>}</div>
        <label className="flex items-start gap-3 rounded-[10px] border p-3 text-sm"><input type="checkbox" className="mt-0.5 size-4" checked={draft.customerApproval} onChange={(event) => change({ customerApproval: event.target.checked })} /><span><strong className="block">Accord du client présent</strong><span className="mt-1 block text-xs leading-5 text-muted-foreground">Le compte rendu sera horodaté et scellé lors de la synchronisation.</span></span></label>
        <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={saving} onClick={() => void persist()}>{saving ? <Loader2 className="animate-spin" /> : <Save />}Conserver le brouillon</Button><Button type="submit" disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : online ? <Send /> : <CloudOff />}{online ? "Clôturer et synchroniser" : "Mettre en attente"}</Button>{assignment.files.length ? <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><ShieldCheck className="size-3.5" />{assignment.files.length} pièce{assignment.files.length > 1 ? "s" : ""} déjà archivée{assignment.files.length > 1 ? "s" : ""}</span> : null}</div>
        </fieldset>
      </form>
    </article>
  )
}
