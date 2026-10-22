"use client"

import { useEffect, useState, useTransition } from "react"
import { Navigation } from "lucide-react"
import { getOperationsPlanningSummary } from "@/actions/operations"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

type Summary = Awaited<ReturnType<typeof getOperationsPlanningSummary>>

export function PlanningOverview({ agencyId, revision }: { agencyId: string; revision: string }) {
  const [retry, setRetry] = useState(0)
  const [, startTransition] = useTransition()
  const key = JSON.stringify([agencyId, revision, retry])
  const [result, setResult] = useState<{ key: string; data: Summary | null } | null>(null)
  useEffect(() => {
    let current = true
    startTransition(async () => {
      try {
        const data = await getOperationsPlanningSummary({ agencyId: agencyId === "ALL" ? undefined : agencyId })
        if (current) setResult({ key, data })
      } catch { if (current) setResult({ key, data: null }) }
    })
    return () => { current = false }
  }, [agencyId, key])
  const data = result?.key === key ? result.data : undefined
  if (!data) return <section className="rounded-xl border bg-card px-5 py-4" aria-label="Synthèse du planning" role="status">
    <p className="text-sm text-muted-foreground">{data === null ? "Synthèse du planning indisponible." : "Actualisation du planning…"}</p>
    {data === null ? <Button variant="outline" className="mt-3" onClick={() => setRetry(value => value + 1)}>Réessayer le planning</Button> : null}
  </section>
  return <>
    <section className="overflow-hidden rounded-xl border bg-card" aria-label="Capacité de la semaine">
      <div className="flex flex-col gap-2 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-sm font-semibold">Capacité de la semaine</h2><p className="mt-1 text-xs text-muted-foreground">Charge complète du lundi au dimanche dans le fuseau {data.timeZone} ; minimum de 15 min par créneau, ou 1 h sans heure de fin.</p></div>{data.unassigned ? <Badge variant="outline">{data.unassigned} non affectée{data.unassigned > 1 ? "s" : ""}</Badge> : null}</div>
      {data.members.length ? <div className="divide-y">{data.members.map(row => <div key={row.id} className="grid gap-3 px-5 py-3 sm:grid-cols-[minmax(160px,0.7fr)_minmax(220px,1fr)_150px] sm:items-center">
        <div><p className="truncate text-sm font-medium">{row.name}</p><p className="text-xs text-muted-foreground">{row.interventions} intervention{row.interventions > 1 ? "s" : ""}</p></div>
        {row.utilization === null ? <p className="text-xs text-muted-foreground">Charge indisponible</p> : <div className="h-2 overflow-hidden rounded-full bg-muted" aria-label={`${row.utilization} % de capacité utilisée`}><div className={`h-full rounded-full ${row.utilization > 100 ? "bg-danger" : row.utilization >= 80 ? "bg-warning" : "bg-primary"}`} style={{ width: `${Math.min(row.utilization, 100)}%` }} /></div>}
        <p className="text-xs tabular-nums text-muted-foreground">{row.plannedMinutes === null ? "Charge indisponible" : `${(row.plannedMinutes / 60).toFixed(1)} h / ${(row.capacity / 60).toFixed(1)} h`}</p>
      </div>)}</div> : <p className="px-5 py-5 text-sm text-muted-foreground">Aucun intervenant dans ce périmètre.</p>}
    </section>
    <section className="overflow-hidden rounded-xl border bg-card" aria-label="Tournées à venir">
      <div className="border-b px-5 py-4"><h2 className="flex items-center gap-2 text-sm font-semibold"><Navigation className="size-4 text-primary" />Tournées à venir</h2><p className="mt-1 text-xs text-muted-foreground">Les 14 prochaines journées avec intervention, avec six aperçus par jour. Totaux, conflits et distances portent sur chaque journée complète du périmètre accessible. Les autres calendriers ne sont pas contrôlés ici. Distances à vol d’oiseau ; les trajets routiers restent à confirmer.</p></div>
      {data.days.length ? <div className="grid gap-4 p-4 xl:grid-cols-2">{data.days.map(day => <article key={day.key} className="overflow-hidden rounded-xl border">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/25 px-4 py-3"><div><p className="text-sm font-semibold capitalize">{new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${day.key}T12:00:00Z`))}</p><p className="mt-0.5 text-xs text-muted-foreground">{day.count} intervention{day.count > 1 ? "s" : ""} · {day.items.length} affichée{day.items.length > 1 ? "s" : ""}{day.totalLegs ? ` · ${day.distanceKm.toFixed(1)} km estimés (${day.measuredLegs}/${day.totalLegs} tronçons)` : ""}</p></div>
          {day.invalidSlots ? <Badge variant="destructive">{day.invalidSlots} créneau{day.invalidSlots > 1 ? "x" : ""} à vérifier</Badge> : day.conflicts ? <Badge variant="destructive">{day.conflicts} créneau{day.conflicts > 1 ? "x" : ""} en conflit</Badge> : <Badge variant="secondary">Pas de conflit détecté</Badge>}
        </div>
        <div className="divide-y">{day.items.map(item => <div key={item.id} className="grid grid-cols-[72px_minmax(0,1fr)] gap-3 px-4 py-3"><p className="text-xs font-semibold tabular-nums">{new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: data.timeZone }).format(new Date(item.scheduledStart))}</p><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-xs font-medium">{item.title}</p>{item.conflict ? <Badge variant="destructive">Conflit</Badge> : null}</div><p className="mt-1 text-xs text-muted-foreground">{item.clientName} · {item.siteLabel} · {item.assignedName}</p></div></div>)}</div>
      </article>)}</div> : <p className="px-5 py-5 text-sm text-muted-foreground">Aucune tournée à venir dans ce périmètre.</p>}
    </section>
  </>
}
