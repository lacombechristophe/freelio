"use client"
import { useEffect, useState, useTransition } from "react"
import { getAutomationRunDetails, getAutomationRunJournal } from "@/actions/automations"
import { ACTION_LABELS, controlClass, formatAutomationDate, STATUS_LABELS, TRIGGER_LABELS } from "./automation-model"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"

export function WorkflowRunJournal({ onCount }: { onCount: (total: number) => void }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof getAutomationRunJournal>> | null>(null)
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof getAutomationRunDetails>> | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null), [search, setSearch] = useState(""), [status, setStatus] = useState("ALL"), [page, setPage] = useState(1)
  const [attempt, setAttempt] = useState(0), [error, setError] = useState(""), [detailError, setDetailError] = useState("")
  const [pending, startTransition] = useTransition()
  useEffect(() => {
    let active = true
    startTransition(async () => { try {
      const result = await getAutomationRunJournal({ page, search, status })
      if (active) { setData(result); setError(""); if (result) onCount(result.total) }
    } catch { if (active) setError("Impossible de charger les exécutions") } })
    return () => { active = false }
  }, [page, search, status, attempt, onCount])
  useEffect(() => {
    if (!selectedId) return
    let active = true
    startTransition(async () => { try {
      const result = await getAutomationRunDetails(selectedId)
      if (active) { setDetail(result); setDetailError(result ? "" : "Exécution inaccessible") }
    } catch { if (active) setDetailError("Impossible de charger le détail") } })
    return () => { active = false }
  }, [selectedId, attempt])
  useEffect(() => {
    if (!data?.rows.some(row => ["WAITING", "RUNNING"].includes(row.status))) return
    const timer = window.setInterval(() => { if (!document.hidden) setAttempt(value => value + 1) }, 5_000)
    return () => window.clearInterval(timer)
  }, [data])
  return <div className="space-y-3">
    <div className="flex flex-col gap-3 sm:flex-row"><Input aria-label="Rechercher une exécution" maxLength={200} value={search} onChange={event => { setSearch(event.target.value); setPage(1) }} /><select aria-label="État des exécutions" className={`${controlClass} sm:w-52`} value={status} onChange={event => { setStatus(event.target.value); setPage(1) }}><option value="ALL">Tous les états</option>{["RUNNING", "WAITING", "PAUSED", "COMPLETED", "SKIPPED", "FAILED", "DEAD_LETTER"].map(value => <option key={value} value={value}>{STATUS_LABELS[value]}</option>)}</select></div>
    {error ? <p role="alert" className="text-sm">{error}</p> : null}
    <div className="overflow-hidden rounded-xl border bg-card"><div className="hidden grid-cols-[minmax(0,1fr)_minmax(190px,0.7fr)_150px_120px] gap-4 border-b bg-muted/35 px-4 py-3 text-xs font-semibold text-muted-foreground md:grid"><span>Scénario</span><span>Événement</span><span>Date</span><span>Résultat</span></div>
      {data?.rows.map(row => <div key={row.id} data-workflow-run={row.id} className="grid gap-2 border-b px-4 py-3.5 last:border-b-0 md:grid-cols-[minmax(0,1fr)_minmax(190px,0.7fr)_150px_120px] md:items-center md:gap-4"><span className="min-w-0"><span className="block truncate text-sm font-medium">{row.workflowName}</span><span className="block truncate text-xs text-muted-foreground">{TRIGGER_LABELS[row.trigger] || row.trigger}</span></span><span className="truncate text-xs text-muted-foreground">{row.event} · {row.subjectModel}</span><time className="text-xs text-muted-foreground">{formatAutomationDate(row.startedAt)}</time><div className="space-y-2"><Badge variant={["FAILED", "DEAD_LETTER"].includes(row.status) ? "destructive" : row.status === "COMPLETED" ? "secondary" : "outline"}>{STATUS_LABELS[row.status] || row.status}</Badge>{row.wakeAt ? <p className="text-xs">Reprise : {formatAutomationDate(row.wakeAt)}</p> : null}<Button size="sm" variant="outline" onClick={() => { setDetail(null); setDetailError(""); setSelectedId(row.id) }}>Détails</Button></div></div>)}
      {data && !data.rows.length ? <p className="p-5 text-sm text-muted-foreground">Aucune exécution pour ces critères.</p> : null}
    </div>
    {data ? <div className="flex flex-wrap items-center gap-2 text-xs"><Button size="sm" variant="outline" aria-label="Page précédente : exécutions" disabled={pending || data.page <= 1} onClick={() => setPage(data.page - 1)}>Page précédente</Button><span>{data.total} exécution(s) · Page {data.page} sur {data.pageCount}</span><Button size="sm" variant="outline" aria-label="Page suivante : exécutions" disabled={pending || data.page >= data.pageCount} onClick={() => setPage(data.page + 1)}>Page suivante</Button></div> : null}
    <Dialog open={!!selectedId} onOpenChange={open => { if (!open) { setSelectedId(null); setDetail(null); setDetailError("") } }}><DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>Détails de l’exécution</DialogTitle><DialogDescription>{detail?.name || "Journal des actions enregistrées"}</DialogDescription></DialogHeader>
      {detailError ? <p role="alert">{detailError}</p> : null}
      {detail ? <div className="space-y-3"><p className="text-sm">{STATUS_LABELS[detail.status] || detail.status} · Version {detail.workflowVersion ?? "historique non renseignée"}</p>{detail.wakeAt ? <p className="text-sm">Reprise : {formatAutomationDate(detail.wakeAt)}</p> : null}
        {detail.historicalUnavailable ? <p className="text-sm">Historique détaillé indisponible : aucune action attestée.</p> : null}{detail.inconsistent ? <p role="alert" className="text-sm">Journal historique incohérent : contrôle administrateur requis.</p> : null}
        {detail.actions.map(action => <div key={action.id} className="space-y-1 rounded-lg border p-3 text-xs"><p className="font-semibold">{action.position + 1}. {ACTION_LABELS[action.type] || "Action historique"} · {STATUS_LABELS[action.status] || action.status}</p><p>{action.summary}</p>{action.startedAt ? <p>Début : {formatAutomationDate(action.startedAt)}</p> : null}{action.scheduledAt ? <p>Échéance : {formatAutomationDate(action.scheduledAt)}</p> : null}{action.completedAt ? <p>Fin : {formatAutomationDate(action.completedAt)}</p> : null}</div>)}
      </div> : !detailError ? <p className="text-sm" role="status">Chargement du détail…</p> : null}
    </DialogContent></Dialog>
  </div>
}
