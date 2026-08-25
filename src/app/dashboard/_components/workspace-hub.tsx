import Link from "next/link"
import { ArrowRight, CircleAlert, type LucideIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/shared/page-header"

export type WorkspaceMetric = { label: string; value: string | number; detail: string; alert?: boolean }
export type WorkspaceLink = { name: string; href: string; description: string; icon: LucideIcon; badge?: string }
export type WorkspaceSection = { title: string; description: string; links: WorkspaceLink[] }

export function WorkspaceHub({ eyebrow, title, description, metrics, sections, primaryAction }: { eyebrow: string; title: string; description: string; metrics: WorkspaceMetric[]; sections: WorkspaceSection[]; primaryAction?: WorkspaceLink }) {
  return <div className="space-y-7">
    <PageHeader eyebrow={eyebrow} title={title} description={description} actions={primaryAction ? <Button render={<Link href={primaryAction.href} />}><primaryAction.icon />{primaryAction.name}</Button> : undefined} />

    <section aria-label="Indicateurs" className="grid overflow-hidden rounded-xl border bg-card sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric, index) => <div key={metric.label} className={`p-5 ${index > 0 ? "border-t sm:border-t-0 sm:border-l" : ""} ${index > 1 ? "sm:border-t xl:border-t-0" : ""}`}><div className="flex items-center gap-2"><p className="text-xs font-medium text-muted-foreground">{metric.label}</p>{metric.alert && <CircleAlert className="size-3.5 text-warning" />}</div><p className="mt-2 text-2xl font-semibold tabular-nums">{metric.value}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{metric.detail}</p></div>)}
    </section>

    <div className="grid gap-6 xl:grid-cols-2">{sections.map((section) => <section key={section.title} className="overflow-hidden rounded-xl border bg-card"><header className="border-b bg-muted/25 px-5 py-4"><h2 className="text-base font-semibold">{section.title}</h2><p className="mt-1 text-sm text-muted-foreground">{section.description}</p></header><div className="divide-y">{section.links.map((item) => <Link key={item.href} href={item.href} className="group flex min-h-20 items-center gap-4 px-5 py-3 transition-colors hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><item.icon className="size-4" /></span><span className="min-w-0 flex-1"><span className="flex items-center gap-2"><span className="text-sm font-semibold">{item.name}</span>{item.badge && <Badge variant="outline">{item.badge}</Badge>}</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{item.description}</span></span><ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" /></Link>)}</div></section>)}</div>
  </div>
}

export function formatWorkspaceEuro(cents: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(cents / 100)
}
