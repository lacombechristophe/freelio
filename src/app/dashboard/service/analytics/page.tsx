import { Activity, BarChart3, CheckCircle2, ClipboardCheck, Clock3, Download, Gauge, Headphones, Tickets, UsersRound } from "lucide-react"

import { getServiceAnalytics } from "@/actions/service-analytics"
import { PageHeader } from "@/components/shared/page-header"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { HelpTip } from "@/components/ui/help-tip"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

const controlClass = "h-10 w-full rounded-[10px] border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/20"
const priorityLabels: Record<string, string> = { URGENT: "Urgente", HIGH: "Haute", NORMAL: "Normale", LOW: "Faible" }
const statusLabels: Record<string, string> = { OPEN: "Ouvert", QUALIFIED: "Qualifié", PLANNED: "Planifié", WAITING: "En attente", RESOLVED: "Résolu", CLOSED: "Clos" }
const healthLabels: Record<string, string> = { HEALTHY: "Sains", WATCH: "À surveiller", RISK: "À risque" }

function value(param: string | string[] | undefined) {
  return Array.isArray(param) ? param[0] : param
}

function percent(value: number | null) {
  return value === null ? "—" : `${value}%`
}

function duration(minutes: number | null) {
  if (minutes === null) return "—"
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const remaining = minutes % 60
  return remaining ? `${hours} h ${remaining.toString().padStart(2, "0")}` : `${hours} h`
}

function shortDate(date: Date | string) {
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short" }).format(new Date(date))
}

function Metric({ icon: Icon, label, value, detail, alert = false }: { icon: typeof Tickets; label: string; value: string | number; detail: string; alert?: boolean }) {
  return <div className="border-t p-5 first:border-t-0 sm:border-l sm:border-t-0 sm:first:border-l-0"><div className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><Icon className={`size-4 ${alert ? "text-destructive" : "text-primary"}`} />{label}</div><p className={`mt-2 text-2xl font-semibold tabular-nums ${alert ? "text-destructive" : ""}`}>{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div>
}

function SlaBadge({ value }: { value: number | null }) {
  return <Badge variant={value === null ? "outline" : value >= 90 ? "secondary" : value >= 75 ? "outline" : "destructive"}>{percent(value)}</Badge>
}

export default async function ServiceAnalyticsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams
  const days = Number(value(query.days) || 90)
  const assignedMembershipId = value(query.assignedMembershipId) || undefined
  const priority = value(query.priority) || undefined
  const data = await getServiceAnalytics({ days, assignedMembershipId, priority })
  const maxTrend = Math.max(1, ...data.trend.flatMap((item) => [item.created, item.closed]))
  const maxStatus = Math.max(1, ...data.statusCounts.map((item) => item.count))
  const maxDiagnostic = Math.max(1, ...data.topDiagnostics.map((item) => item.count))
  const exportParams = new URLSearchParams({ days: String(data.filters.days) })
  if (data.filters.assignedMembershipId) exportParams.set("assignedMembershipId", data.filters.assignedMembershipId)
  if (data.filters.priority) exportParams.set("priority", data.filters.priority)

  return <div className="workspace-page">
    <PageHeader eyebrow="Service" title="Analyses Service" description="Mesurez le volume, les délais, la qualité des diagnostics et les risques clients sans masquer les dossiers en retard." />

    <form className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 xl:grid-cols-[180px_minmax(220px,1fr)_180px_auto] xl:items-end">
      <label className="space-y-1.5"><span className="block text-xs font-semibold">Période</span><select name="days" defaultValue={data.filters.days} className={controlClass}><option value="30">30 jours</option><option value="90">90 jours</option><option value="180">180 jours</option><option value="365">365 jours</option></select></label>
      <label className="space-y-1.5"><span className="block text-xs font-semibold">Responsable</span><select name="assignedMembershipId" defaultValue={data.filters.assignedMembershipId || ""} className={controlClass}><option value="">Toute l’équipe</option>{data.members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
      <label className="space-y-1.5"><span className="block text-xs font-semibold">Priorité</span><select name="priority" defaultValue={data.filters.priority || ""} className={controlClass}><option value="">Toutes</option>{Object.entries(priorityLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <div className="flex flex-wrap gap-2"><Button type="submit"><BarChart3 />Appliquer</Button><a href={`/api/service/analytics/export?${exportParams}`} className={buttonVariants({ variant: "outline" })}><Download />Exporter l’analyse</a></div>
    </form>

    <section className="record-metrics grid grid-cols-2 overflow-hidden rounded-xl border bg-card sm:grid-cols-2 xl:grid-cols-6">
      <Metric icon={Tickets} label="Tickets créés" value={data.summary.created} detail={`Depuis le ${shortDate(data.startAt)}`} />
      <Metric icon={CheckCircle2} label="Tickets clos" value={data.summary.closed} detail="Clôturés dans la période" />
      <Metric icon={Activity} label="Backlog actif" value={data.summary.backlog} detail="Ouverts, qualifiés, planifiés ou en attente" alert={data.summary.backlog > 0} />
      <Metric icon={Clock3} label="SLA première réponse" value={percent(data.summary.firstResponsePercent)} detail={`${data.summary.firstResponseMet}/${data.summary.firstResponseEligible} objectifs évalués`} alert={data.summary.firstResponsePercent !== null && data.summary.firstResponsePercent < 75} />
      <Metric icon={Gauge} label="SLA résolution" value={percent(data.summary.resolutionPercent)} detail={`${data.summary.resolutionMet}/${data.summary.resolutionEligible} objectifs évalués`} alert={data.summary.resolutionPercent !== null && data.summary.resolutionPercent < 75} />
      <Metric icon={UsersRound} label="Satisfaction globale" value={percent(data.summary.satisfactionPercent)} detail={`${data.summary.satisfactionResponses} réponse(s), sans filtre d’agent`} />
    </section>

    <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
      <Card>
        <CardHeader><div className="flex items-center gap-2"><CardTitle className="text-base">Flux hebdomadaire</CardTitle><HelpTip label="Lecture du graphique">Bleu : tickets créés. Vert : tickets clos. Les dossiers actifs plus anciens restent comptés dans le backlog mais pas dans les créations.</HelpTip></div><CardDescription>Créations et clôtures, semaine par semaine.</CardDescription></CardHeader>
        <CardContent><div className="flex min-h-56 items-end gap-2 overflow-x-auto border-b pb-3">{data.trend.map((item) => <div key={new Date(item.startAt).toISOString()} className="flex min-w-12 flex-1 flex-col items-center gap-2" title={`${shortDate(item.startAt)} : ${item.created} créé(s), ${item.closed} clos`}><div className="flex h-40 items-end gap-1"><span className="w-3 rounded-t bg-primary" style={{ height: `${Math.max(item.created ? 6 : 0, item.created / maxTrend * 100)}%` }} /><span className="w-3 rounded-t bg-success" style={{ height: `${Math.max(item.closed ? 6 : 0, item.closed / maxTrend * 100)}%` }} /></div><span className="text-[10px] text-muted-foreground">{shortDate(item.startAt)}</span></div>)}</div><div className="mt-3 flex gap-4 text-xs text-muted-foreground"><span className="flex items-center gap-1.5"><i className="size-2.5 rounded-sm bg-primary" />Créés</span><span className="flex items-center gap-1.5"><i className="size-2.5 rounded-sm bg-success" />Clos</span></div></CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Temps moyens</CardTitle><CardDescription>Calculés en heures ouvrées selon la politique Service.</CardDescription></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1"><div className="rounded-xl border p-4"><p className="text-xs text-muted-foreground">Première réponse</p><p className="mt-2 text-2xl font-semibold tabular-nums">{duration(data.summary.averageFirstResponseMinutes)}</p></div><div className="rounded-xl border p-4"><p className="text-xs text-muted-foreground">Résolution des tickets clos</p><p className="mt-2 text-2xl font-semibold tabular-nums">{duration(data.summary.averageResolutionMinutes)}</p></div><div className="rounded-xl border p-4"><p className="text-xs text-muted-foreground">Couverture diagnostic</p><p className="mt-2 text-2xl font-semibold tabular-nums">{percent(data.summary.diagnosticCoveragePercent)}</p><p className="mt-1 text-[11px] text-muted-foreground">{data.summary.diagnosedTickets} ticket(s) créé(s) avec diagnostic</p></div><div className="rounded-xl border p-4"><p className="text-xs text-muted-foreground">Santé moyenne</p><p className="mt-2 text-2xl font-semibold tabular-nums">{data.summary.averageHealthScore ?? "—"}<span className="text-sm text-muted-foreground">/100</span></p></div></CardContent>
      </Card>
    </div>

    <Card>
      <CardHeader><CardTitle className="text-base">Performance de l’équipe</CardTitle><CardDescription>Charge, clôtures et respect des objectifs sur le périmètre filtré.</CardDescription></CardHeader>
      <CardContent className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Responsable</TableHead><TableHead className="text-right">Créés</TableHead><TableHead className="text-right">Clos</TableHead><TableHead className="text-right">Backlog</TableHead><TableHead className="text-right">Première réponse</TableHead><TableHead className="text-right">Résolution</TableHead><TableHead className="text-right">Temps résolution</TableHead></TableRow></TableHeader><TableBody>{data.byAssignee.length ? data.byAssignee.map((row) => <TableRow key={row.key}><TableCell className="font-medium">{row.name}</TableCell><TableCell className="text-right tabular-nums">{row.created}</TableCell><TableCell className="text-right tabular-nums">{row.closed}</TableCell><TableCell className="text-right tabular-nums">{row.backlog}</TableCell><TableCell className="text-right"><SlaBadge value={row.firstResponsePercent} /></TableCell><TableCell className="text-right"><SlaBadge value={row.resolutionPercent} /></TableCell><TableCell className="text-right tabular-nums">{duration(row.averageResolutionMinutes)}</TableCell></TableRow>) : <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">Aucun ticket sur ce périmètre.</TableCell></TableRow>}</TableBody></Table></CardContent>
    </Card>

    <div className="grid gap-6 xl:grid-cols-3">
      <Card><CardHeader><CardTitle className="text-base">SLA par priorité</CardTitle><CardDescription>Les urgences restent visibles séparément des demandes normales.</CardDescription></CardHeader><CardContent className="space-y-3">{data.byPriority.length ? data.byPriority.map((row) => <div key={row.key} className="rounded-lg border p-3"><div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold">{priorityLabels[row.key] || row.key}</p><span className="text-xs text-muted-foreground">{row.created} créé(s) · {row.backlog} actif(s)</span></div><div className="mt-3 grid grid-cols-2 gap-2 text-xs"><span>Réponse <strong className="float-right">{percent(row.firstResponsePercent)}</strong></span><span>Résolution <strong className="float-right">{percent(row.resolutionPercent)}</strong></span></div></div>) : <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Aucune priorité à analyser.</p>}</CardContent></Card>
      <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><ClipboardCheck className="size-4 text-primary" />Diagnostics utilisés</CardTitle><CardDescription>Guides consignés dans la période et sur le périmètre filtré.</CardDescription></CardHeader><CardContent className="space-y-3">{data.topDiagnostics.length ? data.topDiagnostics.map((item) => <div key={item.name}><div className="flex justify-between gap-3 text-xs"><span className="truncate font-medium">{item.name}</span><span className="tabular-nums text-muted-foreground">{item.count}</span></div><div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${item.count / maxDiagnostic * 100}%` }} /></div></div>) : <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Aucun diagnostic consigné sur cette période.</p>}</CardContent></Card>
      <Card><CardHeader><CardTitle className="text-base">Santé du portefeuille</CardTitle><CardDescription>Distribution globale actuelle, indépendante du filtre d’agent.</CardDescription></CardHeader><CardContent className="space-y-3">{data.healthDistribution.map((item) => <div key={item.status} className="flex items-center justify-between rounded-lg border p-3"><span className="text-sm font-medium">{healthLabels[item.status]}</span><Badge variant={item.status === "RISK" ? "destructive" : item.status === "HEALTHY" ? "secondary" : "outline"}>{item.count}</Badge></div>)}</CardContent></Card>
    </div>

    <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Headphones className="size-4 text-primary" />Répartition du backlog</CardTitle><CardDescription>État actuel des tickets chargés par le périmètre.</CardDescription></CardHeader><CardContent>{data.statusCounts.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{data.statusCounts.map((item) => <div key={item.status} className="rounded-lg border p-3"><div className="flex justify-between gap-2 text-sm"><span className="font-medium">{statusLabels[item.status] || item.status}</span><span className="tabular-nums text-muted-foreground">{item.count}</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${item.count / maxStatus * 100}%` }} /></div></div>)}</div> : <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Aucun ticket dans ce périmètre.</p>}</CardContent></Card>
  </div>
}
