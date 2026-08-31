import Link from "next/link"
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Banknote,
  BriefcaseBusiness,
  CheckCircle2,
  CircleDollarSign,
  Factory,
  Gauge,
  HardHat,
  MailCheck,
  Target,
  UsersRound,
  Wrench,
  type LucideIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { REPORT_PERIODS, type ExecutiveReport } from "@/lib/reporting"
import { cn } from "@/lib/utils"

const money = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })
const integer = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 })

function euro(cents: number) {
  return money.format(cents / 100)
}

function percentage(value: number | null) {
  return value === null ? "—" : `${integer.format(value)} %`
}

function duration(minutes: number) {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return hours ? `${hours} h${rest ? ` ${rest} min` : ""}` : `${rest} min`
}

export function ReportingCenter({ report }: { report: ExecutiveReport }) {
  const headlineMetrics = [
    report.access.finance && { icon: Banknote, label: "Encaissé", value: euro(report.finance.collectedCents), detail: `${euro(report.finance.invoicedCents)} facturés`, delta: report.finance.collectedDeltaPercent, href: "/dashboard/revenue" },
    report.access.sales && { icon: Target, label: "Pipeline ouvert", value: euro(report.sales.openPipelineCents), detail: `${euro(report.sales.weightedPipelineCents)} pondérés`, delta: report.sales.wonDeltaPercent, href: "/dashboard/pipeline" },
    report.access.operations && { icon: HardHat, label: "Chantiers actifs", value: integer.format(report.operations.activeProjects), detail: `${percentage(report.operations.budgetUsagePercent)} du budget consommé`, delta: null, href: "/dashboard/projets" },
    report.access.service && { icon: Wrench, label: "Backlog SAV", value: integer.format(report.service.backlog), detail: `${report.service.overdueTickets} hors délai`, delta: null, href: "/dashboard/service/help-desk" },
    report.access.crm && { icon: UsersRound, label: "Demandes entrantes", value: integer.format(report.acquisition.leads), detail: `${report.acquisition.newLeads} à qualifier`, delta: report.acquisition.deltaPercent, href: "/dashboard/leads" },
  ].filter((item): item is { icon: LucideIcon; label: string; value: string; detail: string; delta: number | null; href: string } => Boolean(item))

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 border-y py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold">Période analysée</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Comparaison automatique avec la période précédente de même durée.</p>
        </div>
        <div className="flex w-fit rounded-lg border bg-card p-1" aria-label="Période du rapport">
          {REPORT_PERIODS.map((period) => (
            <Link key={period} href={`/dashboard/reports?period=${period}`} aria-current={report.period.days === period ? "page" : undefined} className={cn("rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", report.period.days === period && "bg-primary text-primary-foreground hover:text-primary-foreground")}>
              {period === 365 ? "1 an" : `${period} j`}
            </Link>
          ))}
        </div>
      </div>

      <section className="grid overflow-hidden rounded-xl border bg-card sm:grid-cols-2 xl:grid-cols-5" aria-label="Indicateurs essentiels">
        {headlineMetrics.map((metric, index) => (
          <Link key={metric.label} href={metric.href} className={cn("group min-w-0 p-5 transition-colors hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring", index > 0 && "border-t sm:border-l sm:border-t-0")}>
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><metric.icon className="size-4 text-primary" />{metric.label}</span>
              {metric.delta !== null && <Delta value={metric.delta} />}
            </div>
            <p className="mt-3 truncate text-2xl font-semibold tabular-nums">{metric.value}</p>
            <span className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground"><span className="truncate">{metric.detail}</span><ArrowRight className="size-3.5 shrink-0 opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" /></span>
          </Link>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(340px,0.75fr)]">
        <Card>
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2 text-base"><Gauge className="size-4 text-primary" />Flux de la période</CardTitle>
            <CardDescription>Une même chronologie pour les entrées commerciales, les gains, les encaissements et les demandes SAV.</CardDescription>
          </CardHeader>
          <CardContent className="divide-y p-0">
            {report.trend.map((bucket) => <TrendRow key={bucket.startAt} bucket={bucket} report={report} />)}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2 text-base"><AlertTriangle className="size-4 text-primary" />Décisions à prendre</CardTitle>
            <CardDescription>Les signaux concrets qui méritent une action, sans multiplier les alertes.</CardDescription>
          </CardHeader>
          <CardContent className="divide-y p-0">
            {report.insights.map((insight) => (
              <Link key={insight.id} href={insight.href} className="group flex items-start gap-3 p-4 transition-colors hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                <span className={cn("mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg", insight.tone === "danger" && "bg-destructive/10 text-destructive", insight.tone === "warning" && "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200", insight.tone === "info" && "bg-primary/10 text-primary", insight.tone === "success" && "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200")}>
                  {insight.tone === "success" ? <CheckCircle2 className="size-4" /> : <AlertTriangle className="size-4" />}
                </span>
                <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{insight.label}</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{insight.detail}</span></span>
                <ArrowRight className="mt-2 size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
              </Link>
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        {report.access.sales && <DomainPanel icon={BriefcaseBusiness} title="Acquisition et ventes" description="De la demande entrante à l’affaire gagnée." href="/dashboard/pipeline"><StatRows rows={[["Demandes reçues", report.acquisition.leads], ["Opportunités ouvertes", report.sales.openOpportunities], ["Affaires gagnées", report.sales.won], ["Affaires perdues", report.sales.lost], ["Taux de gain", percentage(report.sales.winRatePercent)], ["Acceptation des devis", percentage(report.sales.quoteAcceptancePercent)]]} /></DomainPanel>}
        {report.access.finance && <DomainPanel icon={CircleDollarSign} title="Revenus et trésorerie" description="Ce qui a été émis, encaissé et reste à récupérer." href="/dashboard/revenue"><StatRows rows={[["Facturé TTC", euro(report.finance.invoicedCents)], ["Encaissé", euro(report.finance.collectedCents)], ["Dépenses enregistrées", euro(report.finance.expenseCents)], ["Flux net de la période", euro(report.finance.operatingCashCents)], ["À encaisser", euro(report.finance.outstandingCents)], ["Factures échues", report.finance.overdueInvoices]]} /></DomainPanel>}
        {report.access.operations && <DomainPanel icon={Factory} title="Chantiers et exécution" description="Engagement fournisseur, consommation et production terrain." href="/dashboard/operations"><StatRows rows={[["Chantiers actifs", report.operations.activeProjects], ["Budget actif", euro(report.operations.activeProjectBudgetCents)], ["Consommé", euro(report.operations.activeProjectConsumedCents)], ["Commandes fournisseurs ouvertes", report.operations.openPurchaseOrders], ["Commandes en retard", report.operations.latePurchaseOrders], ["Temps terrain terminé", duration(report.operations.laborMinutes)]]} /></DomainPanel>}
        {report.access.service && <DomainPanel icon={Wrench} title="Service et fidélisation" description="Volume entrant, résolution et pression du backlog." href="/dashboard/service/analytics"><StatRows rows={[["Tickets créés", report.service.createdTickets], ["Tickets clos", report.service.closedTickets], ["Taux de clôture", percentage(report.service.closureRatePercent)], ["Backlog actuel", report.service.backlog], ["Hors délai", report.service.overdueTickets], ["Urgences ouvertes", report.service.urgentTickets]]} /></DomainPanel>}
        {report.access.marketing && <DomainPanel icon={MailCheck} title="E-mails et engagement" description="Délivrabilité et interactions issues des séquences." href="/dashboard/automatisations"><StatRows rows={[["E-mails suivis", report.marketing.sentEmails], ["Délivrés", report.marketing.deliveredEmails], ["Ouverts", report.marketing.openedEmails], ["Cliqués", report.marketing.clickedEmails], ["Taux d’ouverture", percentage(report.marketing.openRatePercent)], ["Échecs et plaintes", report.marketing.failedEmails]]} /></DomainPanel>}
      </section>

      {report.truncatedSources.length > 0 && <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100"><AlertTriangle className="mt-0.5 size-4 shrink-0" /><p>Le volume dépasse la borne de lecture pour : {report.truncatedSources.join(", ")}. Réduisez la période ou utilisez l’export spécialisé pour un rapprochement exhaustif.</p></div>}
    </div>
  )
}

function Delta({ value }: { value: number }) {
  const positive = value >= 0
  return <Badge variant="outline" className={cn("gap-1 border-0 px-1.5", positive ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200" : "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-200")}>{positive ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}{Math.abs(value)} %</Badge>
}

function TrendRow({ bucket, report }: { bucket: ExecutiveReport["trend"][number]; report: ExecutiveReport }) {
  const maxLeads = Math.max(1, ...report.trend.map((item) => item.leads))
  const maxWon = Math.max(1, ...report.trend.map((item) => item.won))
  const maxCash = Math.max(1, ...report.trend.map((item) => item.collectedCents))
  const maxTickets = Math.max(1, ...report.trend.map((item) => item.tickets))
  const rows: Array<{ label: string; value: string | number; width: number; color: string; hasValue: boolean }> = []
  if (report.access.crm) rows.push({ label: "Demandes", value: bucket.leads, width: bucket.leads / maxLeads * 100, color: "bg-blue-500", hasValue: bucket.leads > 0 })
  if (report.access.sales) rows.push({ label: "Gagnées", value: bucket.won, width: bucket.won / maxWon * 100, color: "bg-emerald-500", hasValue: bucket.won > 0 })
  if (report.access.finance) rows.push({ label: "Encaissé", value: euro(bucket.collectedCents), width: bucket.collectedCents / maxCash * 100, color: "bg-violet-500", hasValue: bucket.collectedCents > 0 })
  if (report.access.service) rows.push({ label: "Tickets", value: bucket.tickets, width: bucket.tickets / maxTickets * 100, color: "bg-amber-500", hasValue: bucket.tickets > 0 })
  return <div className="grid gap-3 px-4 py-4 sm:grid-cols-[120px_minmax(0,1fr)] sm:px-5"><time className="text-xs font-medium text-muted-foreground">{bucket.label}</time><div className="grid gap-2 sm:grid-cols-2">{rows.map((row) => <div key={row.label} className="grid grid-cols-[70px_minmax(0,1fr)_auto] items-center gap-2"><span className="text-[11px] text-muted-foreground">{row.label}</span><span className="h-1.5 overflow-hidden rounded-full bg-muted"><span className={cn("block h-full rounded-full", row.color)} style={{ width: `${Math.max(row.hasValue ? 4 : 0, row.width)}%` }} /></span><span className="min-w-8 text-right text-xs font-semibold tabular-nums">{row.value}</span></div>)}</div></div>
}

function DomainPanel({ icon: Icon, title, description, href, children }: { icon: LucideIcon; title: string; description: string; href: string; children: React.ReactNode }) {
  return <Card><CardHeader className="border-b"><div className="flex items-start justify-between gap-4"><div><CardTitle className="flex items-center gap-2 text-base"><Icon className="size-4 text-primary" />{title}</CardTitle><CardDescription className="mt-1">{description}</CardDescription></div><Link href={href} aria-label={`Ouvrir ${title}`} className="rounded-md p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><ArrowRight className="size-4" /></Link></div></CardHeader><CardContent className="p-0">{children}</CardContent></Card>
}

function StatRows({ rows }: { rows: Array<[string, string | number]> }) {
  return <dl className="grid sm:grid-cols-2">{rows.map(([label, value], index) => <div key={label} className={cn("flex items-center justify-between gap-4 px-4 py-3", index >= 2 && "border-t", index % 2 === 1 && "sm:border-l", index === 1 && "border-t sm:border-t-0")}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="text-sm font-semibold tabular-nums">{value}</dd></div>)}</dl>
}
