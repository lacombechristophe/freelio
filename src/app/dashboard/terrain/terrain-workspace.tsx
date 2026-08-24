"use client"

import { useCallback, useEffect, useRef, useState, useTransition, type FormEvent } from "react"
import { CheckCircle2, CloudDownload, CloudOff, FileImage, FileText, Loader2, MapPin, RefreshCw, Save, Send, ShieldCheck, Trash2, Wifi } from "lucide-react"
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
  type FieldSnapshot,
  type OfflinePhoto,
} from "@/lib/field/offline"

const STATUS_LABELS: Record<string, string> = { PLANNED: "Planifiée", EN_ROUTE: "En route", IN_PROGRESS: "En cours", COMPLETED: "Terminée" }

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

async function submitDraft(draft: FieldDraft) {
  await uploadDraftPhotos(draft)
  const response = await fetch(`/api/field/interventions/${draft.interventionId}/complete`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ report: draft.report, laborMinutes: draft.laborMinutes, customerName: draft.customerName, customerApproval: draft.customerApproval }),
  })
  const result = await response.json()
  if (!response.ok) throw new Error(result?.error || "Clôture impossible")
  return result
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
        {active.length ? <div className="divide-y">{active.map((assignment) => <FieldAssignmentEditor key={assignment.id} assignment={assignment} online={online} onDraftChange={refreshPendingCount} onSync={syncDraft} />)}</div> : <p className="px-5 py-12 text-center text-sm text-muted-foreground">Aucune intervention active dans la copie terrain.</p>}
      </section>

      {completed.length ? <section className="overflow-hidden rounded-xl border bg-card"><div className="border-b px-5 py-4"><h2 className="text-sm font-semibold">Clôturées récemment</h2></div><div className="divide-y">{completed.map((assignment) => <div key={assignment.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center"><CheckCircle2 className="size-4 shrink-0 text-success" /><div className="min-w-0 flex-1"><p className="text-sm font-medium">{assignment.title}</p><p className="mt-1 text-xs text-muted-foreground">{assignment.site.clientName} · {assignment.site.label}</p></div><a className={buttonVariants({ variant: "outline", size: "sm" })} href={`/api/pdf/intervention/${assignment.id}`} target="_blank" rel="noreferrer"><FileText />Rapport PDF</a></div>)}</div></section> : null}
    </div>
  )
}

function FieldAssignmentEditor({ assignment, online, onDraftChange, onSync }: { assignment: FieldAssignment; online: boolean; onDraftChange: () => Promise<void>; onSync: (draft: FieldDraft) => Promise<void> }) {
  const [draft, setDraft] = useState<FieldDraft>({ interventionId: assignment.id, report: "", laborMinutes: 60, customerName: "", customerApproval: false, photos: [], pendingCompletion: false, updatedAt: new Date().toISOString() })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    void getFieldDraft(assignment.id).then((stored) => { if (stored) setDraft(stored) }).catch(() => {})
  }, [assignment.id])

  async function persist(next = draft) {
    setSaving(true)
    try {
      const stored = { ...next, updatedAt: new Date().toISOString() }
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
    const photos = [...draft.photos, ...nextPhotos]
    if (photos.length > 8 || photos.reduce((sum, photo) => sum + photo.blob.size, 0) > 50 * 1024 * 1024) {
      toast.error("Maximum 8 photos et 50 Mo par intervention hors ligne.")
      return
    }
    await persist({ ...draft, photos })
  }

  async function complete(event: FormEvent) {
    event.preventDefault()
    if (draft.report.trim().length < 3 || draft.customerName.trim().length < 2 || !draft.customerApproval) {
      toast.error("Compte rendu, client présent et accord sont requis.")
      return
    }
    const queued = { ...draft, pendingCompletion: true, updatedAt: new Date().toISOString() }
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
      toast.success("Rapport, photos et accord client synchronisés.")
    } catch (error) {
      toast.error(`${error instanceof Error ? error.message : "Synchronisation impossible"}. Le brouillon reste en attente.`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <article className="px-5 py-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{STATUS_LABELS[assignment.status] || assignment.status}</Badge><span className="text-xs font-medium tabular-nums">{formatDate(assignment.scheduledStart)}</span>{draft.pendingCompletion ? <Badge variant="secondary">À synchroniser</Badge> : null}</div><h3 className="mt-2 text-sm font-semibold">{assignment.title}</h3><p className="mt-1 text-xs text-muted-foreground">{assignment.site.clientName} · {assignment.site.label}{assignment.ticketNumber ? ` · ${assignment.ticketNumber}` : ""}</p><p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="size-3.5" />{siteAddress(assignment)}</p></div>{assignment.technician ? <span className="text-xs text-muted-foreground">{assignment.technician}</span> : null}</div>
      <form onSubmit={complete} className="mt-5 space-y-4 border-t pt-4">
        <div><Label htmlFor={`report-${assignment.id}`}>Compte rendu terrain</Label><textarea id={`report-${assignment.id}`} className="mt-1.5 min-h-28 w-full rounded-[10px] border bg-background p-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/20" value={draft.report} onChange={(event) => setDraft({ ...draft, report: event.target.value, pendingCompletion: false })} /></div>
        <div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor={`minutes-${assignment.id}`}>Temps passé (minutes)</Label><Input id={`minutes-${assignment.id}`} className="mt-1.5" type="number" min="0" max="10080" value={draft.laborMinutes} onChange={(event) => setDraft({ ...draft, laborMinutes: Number(event.target.value), pendingCompletion: false })} /></div><div><Label htmlFor={`customer-${assignment.id}`}>Client présent</Label><Input id={`customer-${assignment.id}`} className="mt-1.5" value={draft.customerName} onChange={(event) => setDraft({ ...draft, customerName: event.target.value, pendingCompletion: false })} /></div></div>
        <div className="flex flex-wrap items-center gap-2"><label className={buttonVariants({ variant: "outline", size: "sm" })}><FileImage />Ajouter des photos<input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" multiple onChange={(event) => void addPhotos(event.currentTarget)} /></label>{draft.photos.map((photo) => <span key={photo.id} className="inline-flex items-center gap-1 rounded-lg bg-muted px-2 py-1.5 text-xs"><span className="max-w-40 truncate">{photo.name}</span><button type="button" aria-label={`Retirer ${photo.name}`} onClick={() => setDraft({ ...draft, photos: draft.photos.filter((item) => item.id !== photo.id), pendingCompletion: false })}><Trash2 className="size-3.5 text-danger" /></button></span>)}</div>
        <label className="flex items-start gap-3 rounded-[10px] border p-3 text-sm"><input type="checkbox" className="mt-0.5 size-4" checked={draft.customerApproval} onChange={(event) => setDraft({ ...draft, customerApproval: event.target.checked, pendingCompletion: false })} /><span><strong className="block">Accord du client présent</strong><span className="mt-1 block text-xs leading-5 text-muted-foreground">Le compte rendu sera horodaté et scellé lors de la synchronisation.</span></span></label>
        <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={saving} onClick={() => void persist()}>{saving ? <Loader2 className="animate-spin" /> : <Save />}Conserver le brouillon</Button><Button type="submit" disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : online ? <Send /> : <CloudOff />}{online ? "Clôturer et synchroniser" : "Mettre en attente"}</Button>{assignment.files.length ? <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><ShieldCheck className="size-3.5" />{assignment.files.length} pièce{assignment.files.length > 1 ? "s" : ""} déjà archivée{assignment.files.length > 1 ? "s" : ""}</span> : null}</div>
      </form>
    </article>
  )
}
