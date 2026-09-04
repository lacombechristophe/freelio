import Link from "next/link"
import { ArrowRight, ChartNoAxesCombined, Kanban } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { formatWorkspaceEuro, WorkspaceEmptyState } from "./workspace-hub"

type TrendSeries = { name: string; values: number[] }

const CHART_COLORS = ["#0879f9", "#0aa38f", "#f59e0b", "#ef4444"]

function chartPoints(values: number[], max: number, width: number, height: number) {
  return values.map((value, index) => ({
    x: values.length <= 1 ? 0 : index / (values.length - 1) * width,
    y: height - value / Math.max(1, max) * height,
  }))
}

function smoothPath(points: Array<{ x: number; y: number }>) {
  if (!points.length) return ""
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`
  return points.reduce((path, point, index) => {
    if (!index) return `M ${point.x} ${point.y}`
    const previous = points[index - 1]
    const middleX = (previous.x + point.x) / 2
    return `${path} C ${middleX} ${previous.y}, ${middleX} ${point.y}, ${point.x} ${point.y}`
  }, "")
}

export function WorkspaceTrendPanel({ title, description, labels, series, valueSuffix, href, linkLabel }: { title: string; description: string; labels: string[]; series: TrendSeries[]; valueSuffix?: string; href: string; linkLabel: string }) {
  const width = 760
  const height = 180
  const allValues = series.flatMap((item) => item.values)
  const max = Math.max(1, ...allValues)
  const midpoint = max <= 1 ? max / 2 : Math.round(max / 2)
  const total = allValues.reduce((sum, value) => sum + value, 0)
  const activeDays = labels.reduce((count, _label, index) => count + (series.some((item) => (item.values[index] ?? 0) > 0) ? 1 : 0), 0)
  const latestTotal = series.reduce((sum, item) => sum + (item.values.at(-1) ?? 0), 0)
  const hasReliableTrend = total > 0 && activeDays >= 3

  return (
    <section className="workspace-trend overflow-hidden rounded-xl border bg-card">
      <header className="flex flex-col gap-3 border-b px-4.5 py-3.5 sm:flex-row sm:items-start sm:justify-between">
        <div><h2 className="text-[15px] font-semibold">{title}</h2><p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p></div>
        <div className="flex flex-wrap gap-3">{series.map((item, index) => <span key={item.name} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><span aria-hidden="true" className="size-2 rounded-full" style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} />{item.name}<strong className="font-semibold text-foreground">{item.values.reduce((sum, value) => sum + value, 0).toLocaleString("fr-FR")}{valueSuffix}</strong></span>)}</div>
      </header>
      <div className="px-4.5 py-3.5">
        {hasReliableTrend ? (
          <>
            <div className="mb-3 grid gap-2 sm:grid-cols-2">
              <div className="rounded-lg bg-muted/45 px-3 py-2.5">
                <p className="text-xs font-medium text-muted-foreground">Activité enregistrée</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">{total.toLocaleString("fr-FR")}{valueSuffix}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{activeDays} jour{activeDays > 1 ? "s" : ""} actif{activeDays > 1 ? "s" : ""} sur {labels.length}</p>
              </div>
              <div className="rounded-lg border border-border/70 px-3 py-2.5">
                <p className="text-xs font-medium text-muted-foreground">Dernier point</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">{latestTotal.toLocaleString("fr-FR")}{valueSuffix}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">À la date la plus récente</p>
              </div>
            </div>
            <div className="overflow-hidden">
              <svg viewBox={`0 0 ${width} ${height + 28}`} role="img" aria-label={`${title}, évolution sur ${labels.length} jours`} className="h-auto min-h-52 w-full overflow-visible">
                {[0, 0.25, 0.5, 0.75, 1].map((ratio) => <line key={ratio} x1="0" x2={width} y1={height * ratio} y2={height * ratio} stroke="currentColor" className="text-border" strokeDasharray="3 5" />)}
                <text x="0" y="10" fill="currentColor" className="text-[10px] text-muted-foreground">{max.toLocaleString("fr-FR")}</text>
                <text x="0" y={height / 2 + 4} fill="currentColor" className="text-[10px] text-muted-foreground">{midpoint.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}</text>
                <text x="0" y={height + 4} fill="currentColor" className="text-[10px] text-muted-foreground">0</text>
                {series.map((item, index) => {
                  const points = chartPoints(item.values, max, width, height - 10)
                  const path = smoothPath(points)
                  return <g key={item.name}><path d={path} fill="none" stroke={CHART_COLORS[index % CHART_COLORS.length]} strokeWidth="2.4" strokeLinecap="round" vectorEffect="non-scaling-stroke" />{points.map((point, pointIndex) => item.values[pointIndex] > 0 ? <circle key={pointIndex} cx={point.x} cy={point.y} r="2.5" fill={CHART_COLORS[index % CHART_COLORS.length]} /> : null)}</g>
                })}
                {[0, Math.floor((labels.length - 1) / 2), labels.length - 1].filter((value, index, array) => array.indexOf(value) === index).map((index) => <text key={index} x={index === 0 ? 0 : index === labels.length - 1 ? width : width / 2} y={height + 24} textAnchor={index === 0 ? "start" : index === labels.length - 1 ? "end" : "middle"} fill="currentColor" className="text-[10px] text-muted-foreground">{labels[index]}</text>)}
              </svg>
            </div>
          </>
        ) : <WorkspaceEmptyState icon={ChartNoAxesCombined} title={total ? "Tendance encore fragile" : "Pas encore assez d’historique"} description={total ? `${total.toLocaleString("fr-FR")}${valueSuffix ?? ""} enregistré${total > 1 ? "s" : ""} sur ${activeDays} jour${activeDays > 1 ? "s" : ""}. Trois jours actifs sont nécessaires avant d’afficher une courbe interprétable.` : "La tendance apparaîtra après trois jours d’activité réelle, sans extrapolation artificielle."} href={href} actionLabel={linkLabel} compact />}
      </div>
      {hasReliableTrend ? <Link href={href} className="workspace-link flex items-center justify-center gap-1.5 border-t text-[13px] font-semibold text-primary transition-colors hover:bg-primary/5">{linkLabel}<ArrowRight className="size-3.5" /></Link> : null}
    </section>
  )
}

export function WorkspaceDistributionPanel({ title, description, items, href, linkLabel }: { title: string; description: string; items: Array<{ label: string; value: number; detail?: string }>; href: string; linkLabel: string }) {
  const max = Math.max(1, ...items.map((item) => item.value))
  const total = items.reduce((sum, item) => sum + item.value, 0)
  return <section className="workspace-distribution overflow-hidden rounded-xl border bg-card"><header className="border-b px-4.5 py-3.5"><h2 className="text-[15px] font-semibold">{title}</h2><p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p></header>{total > 0 ? <div className="space-y-4 px-4.5 py-4">{items.map((item, index) => <div key={item.label}><div className="mb-1.5 flex items-center justify-between gap-3 text-[13px]"><span className="truncate font-medium">{item.label}</span><span className="shrink-0 tabular-nums text-muted-foreground">{item.value} · {Math.round(item.value / total * 100)} %</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${item.value / max * 100}%`, backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} /></div>{item.detail ? <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p> : null}</div>)}</div> : <WorkspaceEmptyState icon={ChartNoAxesCombined} title="Aucune répartition exploitable" description="Ajoutez ou importez des données qualifiées pour obtenir une analyse fiable." href={href} actionLabel={linkLabel} compact />}{total > 0 ? <Link href={href} className="workspace-link flex items-center justify-center gap-1.5 border-t text-[13px] font-semibold text-primary transition-colors hover:bg-primary/5">{linkLabel}<ArrowRight className="size-3.5" /></Link> : null}</section>
}

export function SalesPipelineBoard({ opportunities }: { opportunities: Array<{ id: string; title: string; status: string; valueCents: number; probability: number; client: { name: string } }> }) {
  const stages = ["PROSPECT", "CONTACTED", "QUALIFIED", "PROPOSAL", "NEGOTIATION"]
  const labels: Record<string, string> = { PROSPECT: "À qualifier", CONTACTED: "Contacté", QUALIFIED: "Qualifié", PROPOSAL: "Devis envoyé", NEGOTIATION: "Négociation" }
  const visibleStages = [...new Set([...stages, ...opportunities.map((item) => item.status)])]
  return <section className="workspace-pipeline overflow-hidden rounded-xl border bg-card"><header className="flex items-start justify-between gap-3 border-b px-4.5 py-3.5"><div><h2 className="flex items-center gap-2 text-[15px] font-semibold"><Kanban className="size-4 text-primary" />Pipeline commercial</h2><p className="mt-0.5 text-[13px] text-muted-foreground">Valeur, probabilité et dossiers ouverts par étape.</p></div>{opportunities.length ? <Link href="/dashboard/pipeline" className="text-[13px] font-semibold text-primary">Ouvrir le pipeline</Link> : null}</header>{opportunities.length ? <div className="overflow-x-auto"><div className="grid min-w-[840px] grid-cols-5 divide-x">{visibleStages.slice(0, 5).map((stage, index) => { const items = opportunities.filter((item) => item.status === stage); return <div key={stage} className="min-w-0 p-3"><div className="mb-3 flex items-center justify-between gap-2"><span className="flex items-center gap-1.5 text-[13px] font-semibold"><span className="size-2 rounded-full" style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} />{labels[stage] || stage}</span><span className="text-xs tabular-nums text-muted-foreground">{formatWorkspaceEuro(items.reduce((sum, item) => sum + item.valueCents, 0))}</span></div><div className="space-y-2">{items.length ? items.slice(0, 4).map((item) => <Link key={item.id} href={`/dashboard/pipeline/${item.id}`} className="block rounded-lg border bg-background p-3 transition-[border-color,background-color] hover:border-primary/30 hover:bg-primary/[0.025]"><p className="truncate text-[13px] font-semibold">{item.client.name}</p><p className="mt-1 line-clamp-2 text-xs leading-4 text-muted-foreground">{item.title}</p><div className="mt-3 flex items-center justify-between gap-2"><Badge variant="secondary">{item.probability} %</Badge><span className="text-xs font-semibold tabular-nums">{formatWorkspaceEuro(item.valueCents)}</span></div></Link>) : <div className="grid min-h-28 place-items-center rounded-lg border border-dashed text-xs text-muted-foreground">Aucune affaire</div>}</div></div>})}</div></div> : <WorkspaceEmptyState icon={Kanban} title="Le pipeline est prêt à être utilisé" description="Créez une première affaire pour suivre sa valeur, sa probabilité et sa prochaine étape commerciale." href="/dashboard/pipeline" actionLabel="Créer une affaire" />}</section>
}
