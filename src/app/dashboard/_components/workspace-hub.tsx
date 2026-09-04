import type { ReactNode } from "react"
import Link from "next/link"
import { Activity, ArrowRight, ArrowUpRight, CircleAlert, CircleDashed, type LucideIcon } from "lucide-react"

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
  href?: string
  status?: string
}
export type WorkspaceLink = { name: string; href: string; description: string; icon: LucideIcon; badge?: string }
export type WorkspaceSection = { title: string; description: string; links: WorkspaceLink[] }
export type WorkspacePanelRow = { title: string; detail: string; meta?: string; status?: string; href: string; icon?: LucideIcon; tone?: "blue" | "teal" | "amber" | "red" }
export type WorkspacePanel = { title: string; description: string; rows: WorkspacePanelRow[]; empty: string; href: string; linkLabel: string }

export function WorkspaceHub({ eyebrow, title, description, metrics, featured, featuredPosition = "before-panels", panels, sections, primaryAction }: { eyebrow: string; title: string; description: string; metrics: WorkspaceMetric[]; featured?: ReactNode; featuredPosition?: "before-panels" | "after-panels"; panels?: WorkspacePanel[]; sections: WorkspaceSection[]; primaryAction?: WorkspaceLink }) {
  return <div className="workspace-page">
    <PageHeader className="workspace-page-header" eyebrow={eyebrow} title={title} description={description} actions={primaryAction ? <Button nativeButton={false} render={<Link href={primaryAction.href} />}><primaryAction.icon />{primaryAction.name}</Button> : undefined} />

    <section aria-label="Indicateurs clés" className="workspace-metrics grid gap-3 min-[380px]:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric) => <WorkspaceMetricCard key={metric.label} metric={metric} />)}
    </section>

    {featuredPosition === "before-panels" ? featured : null}

    {panels?.length ? <div className="grid gap-3 xl:grid-cols-2">{panels.map((panel) => <WorkspaceDataPanel key={panel.title} panel={panel} />)}</div> : null}

    {featuredPosition === "after-panels" ? featured : null}

    <div className="grid gap-3 xl:grid-cols-2">{sections.map((section, sectionIndex) => <section key={section.title} className={sections.length % 2 === 1 && sectionIndex === sections.length - 1 ? "workspace-directory overflow-hidden rounded-xl border bg-card xl:col-span-2" : "workspace-directory overflow-hidden rounded-xl border bg-card"}><header className="flex items-start justify-between gap-4 border-b px-4.5 py-3.5"><div><h2 className="text-[15px] font-semibold">{section.title}</h2><p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">{section.description}</p></div><span className="rounded-md bg-muted px-2 py-1 text-xs font-semibold tabular-nums text-muted-foreground">{section.links.length}</span></header><div className="divide-y">{section.links.map((item) => <Link key={`${item.href}-${item.name}`} href={item.href} className="group flex min-h-[68px] items-center gap-3 px-4.5 py-3 transition-colors hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"><span className="grid size-8.5 shrink-0 place-items-center rounded-lg bg-primary/9 text-primary"><item.icon className="size-4" /></span><span className="min-w-0 flex-1"><span className="flex items-center gap-2"><span className="text-sm font-semibold">{item.name}</span>{item.badge && <Badge variant="outline">{item.badge}</Badge>}</span><span className="mt-0.5 block line-clamp-2 text-[13px] leading-5 text-muted-foreground sm:line-clamp-1">{item.description}</span></span><ArrowRight className="size-4 shrink-0 text-muted-foreground/60 transition-[color,transform] group-hover:translate-x-0.5 group-hover:text-primary" /></Link>)}</div></section>)}</div>
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
      })}</div> : <WorkspaceEmptyState title={panel.empty} description="Commencez depuis l’espace dédié ; les prochains éléments apparaîtront ici avec leur statut." href={panel.href} actionLabel={panel.linkLabel} compact />}
      {panel.rows.length ? <Link href={panel.href} className="workspace-link flex items-center justify-center gap-1.5 border-t text-[13px] font-semibold text-primary transition-colors hover:bg-primary/5">{panel.linkLabel}<ArrowRight className="size-3.5" /></Link> : null}
    </section>
  )
}

export function WorkspaceMetricCard({ metric }: { metric: WorkspaceMetric }) {
  const Icon = metric.icon ?? Activity
  const tone = metric.alert ? "red" : metric.tone ?? "blue"
  const tones = {
    blue: "bg-blue-50 text-blue-600 dark:bg-blue-500/12 dark:text-blue-300",
    teal: "bg-teal-50 text-teal-600 dark:bg-teal-500/12 dark:text-teal-300",
    amber: "bg-amber-50 text-amber-600 dark:bg-amber-500/12 dark:text-amber-300",
    red: "bg-red-50 text-red-600 dark:bg-red-500/12 dark:text-red-300",
  }[tone]

  const content = <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="line-clamp-2 text-[13px] font-medium leading-4 text-foreground/85">{metric.label}</p>
          <p className="mt-2.5 break-words text-[22px] font-semibold leading-tight tracking-[-0.025em] tabular-nums text-foreground sm:text-[26px]">{metric.value}</p>
        </div>
        <span className={`hidden size-9 shrink-0 place-items-center rounded-lg sm:grid ${tones}`}>
          {metric.alert ? <CircleAlert className="size-4" /> : <Icon className="size-4" />}
        </span>
      </div>
      <div className="relative z-10 mt-3 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 border-t border-border/70 pt-2.5 sm:mt-5">
        <span aria-hidden="true" className="size-1.5 rounded-full bg-[var(--metric-accent)]" />
        <p className="line-clamp-2 text-xs leading-4 text-muted-foreground">{metric.detail}</p>
        {metric.status ? <span className="text-[11px] font-semibold text-[var(--metric-ink)] sm:ml-auto dark:text-[var(--metric-accent)]">{metric.status}</span> : null}
        {metric.href ? <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground/60 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" /> : null}
      </div>
    </>

  return metric.href ? (
    <Link href={metric.href} className="workspace-metric group block min-h-[128px] rounded-xl border bg-card p-4 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/25" data-tone={tone} aria-label={`${metric.label} : ${metric.value}. ${metric.detail}`}>
      {content}
    </Link>
  ) : <article className="workspace-metric min-h-[128px] rounded-xl border bg-card p-4" data-tone={tone}>{content}</article>
}

export function WorkspaceEmptyState({ title, description, href, actionLabel, icon: Icon = CircleDashed, compact = false }: { title: string; description: string; href?: string; actionLabel?: string; icon?: LucideIcon; compact?: boolean }) {
  return <div className={`workspace-empty ${compact ? "workspace-empty-compact" : ""}`}><div className="flex min-w-0 flex-col items-center gap-3 text-center sm:flex-row sm:flex-wrap sm:text-left"><span className="grid size-9 shrink-0 place-items-center rounded-lg border bg-card text-muted-foreground"><Icon className="size-4" /></span><div className="min-w-0 flex-1 sm:basis-56"><p className="text-sm font-semibold text-foreground">{title}</p><p className="mt-0.5 max-w-2xl text-xs leading-5 text-muted-foreground">{description}</p></div>{href && actionLabel ? <Button nativeButton={false} variant="outline" size="sm" render={<Link href={href} />} className="shrink-0 sm:ml-auto">{actionLabel}<ArrowRight /></Button> : null}</div></div>
}

export function formatWorkspaceEuro(cents: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(cents / 100)
}

export function formatWorkspaceDate(value: Date | string | null | undefined) {
  return value ? new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short" }).format(new Date(value)) : "Sans date"
}
