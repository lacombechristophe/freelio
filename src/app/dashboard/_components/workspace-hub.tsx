import type { ReactNode } from "react"
import Link from "next/link"
import { Activity, ArrowRight, CircleAlert, type LucideIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/shared/page-header"

export type WorkspaceMetric = {
  label: string
  value: string | number
  detail: string
  alert?: boolean
  icon?: LucideIcon
  tone?: "blue" | "teal" | "amber" | "red"
}
export type WorkspaceLink = { name: string; href: string; description: string; icon: LucideIcon; badge?: string }
export type WorkspaceSection = { title: string; description: string; links: WorkspaceLink[] }
export type WorkspacePanelRow = { title: string; detail: string; meta?: string; status?: string; href: string; icon?: LucideIcon; tone?: "blue" | "teal" | "amber" | "red" }
export type WorkspacePanel = { title: string; description: string; rows: WorkspacePanelRow[]; empty: string; href: string; linkLabel: string }

export function WorkspaceHub({ eyebrow, title, description, metrics, featured, panels, sections, primaryAction }: { eyebrow: string; title: string; description: string; metrics: WorkspaceMetric[]; featured?: ReactNode; panels?: WorkspacePanel[]; sections: WorkspaceSection[]; primaryAction?: WorkspaceLink }) {
  return <div className="workspace-page">
    <PageHeader className="workspace-page-header" eyebrow={eyebrow} title={title} description={description} actions={primaryAction ? <Button nativeButton={false} render={<Link href={primaryAction.href} />}><primaryAction.icon />{primaryAction.name}</Button> : undefined} />

    <section aria-label="Indicateurs clés" className="workspace-metrics grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric) => <WorkspaceMetricCard key={metric.label} metric={metric} />)}
    </section>

    {featured}

    {panels?.length ? <div className="grid gap-3 xl:grid-cols-2">{panels.map((panel) => <WorkspaceDataPanel key={panel.title} panel={panel} />)}</div> : null}

    <div className="grid gap-3 xl:grid-cols-2">{sections.map((section, sectionIndex) => <section key={section.title} className={sections.length % 2 === 1 && sectionIndex === sections.length - 1 ? "workspace-directory overflow-hidden rounded-xl border bg-card xl:col-span-2" : "workspace-directory overflow-hidden rounded-xl border bg-card"}><header className="flex items-start justify-between gap-4 border-b px-4.5 py-3.5"><div><h2 className="text-[15px] font-semibold">{section.title}</h2><p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">{section.description}</p></div><span className="rounded-md bg-muted px-2 py-1 text-xs font-semibold tabular-nums text-muted-foreground">{section.links.length}</span></header><div className="divide-y">{section.links.map((item) => <Link key={`${item.href}-${item.name}`} href={item.href} className="group flex min-h-[68px] items-center gap-3 px-4.5 py-3 transition-colors hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"><span className="grid size-8.5 shrink-0 place-items-center rounded-lg bg-primary/9 text-primary"><item.icon className="size-4" /></span><span className="min-w-0 flex-1"><span className="flex items-center gap-2"><span className="text-sm font-semibold">{item.name}</span>{item.badge && <Badge variant="outline">{item.badge}</Badge>}</span><span className="mt-0.5 block line-clamp-1 text-[13px] leading-5 text-muted-foreground">{item.description}</span></span><ArrowRight className="size-4 shrink-0 text-muted-foreground/60 transition-[color,transform] group-hover:translate-x-0.5 group-hover:text-primary" /></Link>)}</div></section>)}</div>
  </div>
}

function WorkspaceDataPanel({ panel }: { panel: WorkspacePanel }) {
  return (
    <section className="workspace-panel overflow-hidden rounded-xl border bg-card">
      <header className="flex items-start justify-between gap-4 border-b px-4.5 py-3.5">
        <div><h2 className="text-[15px] font-semibold">{panel.title}</h2><p className="mt-0.5 text-[13px] text-muted-foreground">{panel.description}</p></div>
        <Badge variant="secondary">{panel.rows.length}</Badge>
      </header>
      {panel.rows.length ? <div className="divide-y">{panel.rows.map((row) => {
        const Icon = row.icon ?? Activity
        const tone = row.tone ?? "blue"
        const tones = { blue: "bg-blue-50 text-blue-600", teal: "bg-teal-50 text-teal-600", amber: "bg-amber-50 text-amber-600", red: "bg-red-50 text-red-600" }[tone]
        return <Link key={`${row.href}-${row.title}`} href={row.href} className="workspace-row group flex items-center gap-3 px-4.5 py-2.5 transition-colors hover:bg-muted/35"><span className={`grid size-8 shrink-0 place-items-center rounded-lg ${tones}`}><Icon className="size-3.5" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{row.title}</span><span className="mt-0.5 block truncate text-[13px] text-muted-foreground">{row.detail}</span></span>{row.meta ? <span className="hidden max-w-32 truncate text-right text-xs text-muted-foreground sm:block">{row.meta}</span> : null}{row.status ? <Badge variant={tone === "red" ? "destructive" : "outline"} className="shrink-0">{row.status}</Badge> : null}<ArrowRight className="size-3.5 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5" /></Link>
      })}</div> : <p className="workspace-empty text-sm text-muted-foreground">{panel.empty}</p>}
      <Link href={panel.href} className="workspace-link flex items-center justify-center gap-1.5 border-t text-[13px] font-semibold text-primary transition-colors hover:bg-primary/5">{panel.linkLabel}<ArrowRight className="size-3.5" /></Link>
    </section>
  )
}

function WorkspaceMetricCard({ metric }: { metric: WorkspaceMetric }) {
  const Icon = metric.icon ?? Activity
  const tone = metric.alert ? "red" : metric.tone ?? "blue"
  const tones = {
    blue: "bg-blue-50 text-blue-600 dark:bg-blue-500/12 dark:text-blue-300",
    teal: "bg-teal-50 text-teal-600 dark:bg-teal-500/12 dark:text-teal-300",
    amber: "bg-amber-50 text-amber-600 dark:bg-amber-500/12 dark:text-amber-300",
    red: "bg-red-50 text-red-600 dark:bg-red-500/12 dark:text-red-300",
  }[tone]

  return (
    <article className="workspace-metric min-h-[128px] rounded-xl border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-foreground/85">{metric.label}</p>
          <p className="mt-2 text-[25px] font-semibold leading-none tracking-[-0.02em] tabular-nums text-foreground">{metric.value}</p>
        </div>
        <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${tones}`}>
          {metric.alert ? <CircleAlert className="size-4" /> : <Icon className="size-4" />}
        </span>
      </div>
      <div className="mt-5 flex items-center gap-2 border-t border-border/70 pt-2.5">
        <span aria-hidden="true" className={`size-1.5 rounded-full ${metric.alert ? "bg-danger" : "bg-success"}`} />
        <p className="truncate text-xs text-muted-foreground">{metric.detail}</p>
      </div>
    </article>
  )
}

export function formatWorkspaceEuro(cents: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(cents / 100)
}

export function formatWorkspaceDate(value: Date | string | null | undefined) {
  return value ? new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short" }).format(new Date(value)) : "Sans date"
}
