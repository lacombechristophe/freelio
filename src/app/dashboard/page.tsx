import Link from "next/link"
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  CalendarCheck,
  ChevronRight,
  Clock,
  Download,
  Euro,
  FileText,
  Gauge,
  Receipt,
  Target,
  Timer,
  Wrench,
} from "lucide-react"

import { auth } from "@/auth"
import { getDashboardStats, getOperationsCockpitData } from "@/actions/accounting"
import { getNotifications } from "@/actions/notifications"
import { Button, buttonVariants } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatCentsToEuro } from "@/lib/billing"
import { cn } from "@/lib/utils"
import { PageHeader } from "@/components/shared/page-header"
import { EmptyState as GuidedEmptyState } from "@/components/shared/empty-state"

export const revalidate = 60

type CockpitData = NonNullable<Awaited<ReturnType<typeof getOperationsCockpitData>>>

function formatMinutes(minutes: number) {
  if (minutes <= 0) return "0h"
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (!hours) return `${rest} min`
  return rest ? `${hours}h${rest.toString().padStart(2, "0")}` : `${hours}h`
}

function formatSeconds(seconds: number) {
  return formatMinutes(Math.round(seconds / 60))
}

function shortDate(value: string | null | undefined) {
  if (!value) return "Sans date"
  return new Date(value).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
  })
}

function actionToneClass(tone: CockpitData["suggestedActions"][number]["tone"]) {
  return {
    danger: "border-danger/30 bg-danger/10 text-danger",
    warning: "border-warning/30 bg-warning/10 text-warning",
    primary: "border-primary/30 bg-primary/10 text-primary",
    neutral: "border-border bg-muted/50 text-muted-foreground",
  }[tone]
}

function riskToneClass(level: CockpitData["projectRisks"][number]["risk"]["level"]) {
  return {
    critical: "border-danger/30 bg-danger/10 text-danger",
    warning: "border-warning/30 bg-warning/10 text-warning",
    normal: "border-border bg-muted/50 text-muted-foreground",
  }[level]
}

export default async function DashboardPage() {
  const [session, stats, notifications, cockpit] = await Promise.all([
    auth(),
    getDashboardStats(),
    getNotifications(),
    getOperationsCockpitData(),
  ])

  if (!stats) {
    return (
      <GuidedEmptyState
        icon={Gauge}
        title="Votre cockpit est presque prêt"
        description="Terminez la configuration initiale pour activer les indicateurs, les documents et le pilotage de votre activité."
        action={<Link href="/onboarding" className={buttonVariants({ size: "lg" })}>Démarrer ma configuration</Link>}
        className="min-h-[60vh] justify-center"
      />
    )
  }

  return (
    <div className="workspace-page">
      <PageHeader
        className="workspace-page-header"
        eyebrow="Cockpit du jour"
        title="Vue d’ensemble"
        description={`Bonjour ${session?.user?.name?.split(" ")[0] ?? ""} 👋 Voici les priorités, les montants et les risques qui demandent une décision aujourd’hui.`}
        actions={
          <>
          <Link href="/dashboard/organisation">
            <Button variant="outline" className="gap-2">
              <CalendarCheck className="h-4 w-4" />
              Organiser
            </Button>
          </Link>
          <a href="/api/backup/export" className={cn(buttonVariants({ variant: "outline" }), "gap-2")}>
            <Download className="h-4 w-4" />
            Export de réversibilité
          </a>
          </>
        }
      />

      <div className="workspace-metrics grid gap-3 min-[380px]:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={Euro}
          label="CA encaissé"
          value={formatCentsToEuro(stats.totalRevenueCents)}
          detail={`Factures payées HT en ${stats.currentYear}`}
          tone="primary"
        />
        <MetricCard
          icon={Receipt}
          label="Encours"
          value={formatCentsToEuro(stats.totalEncoursCents)}
          detail="À encaisser sur factures émises"
          tone={stats.totalEncoursCents > 0 ? "danger" : "neutral"}
        />
        <MetricCard
          icon={Boxes}
          label="Commandes à traiter"
          value={stats.openOrdersCount.toString()}
          detail="Confirmées ou en préparation"
          tone={stats.openOrdersCount > 0 ? "warning" : "success"}
        />
        <MetricCard
          icon={Wrench}
          label="Tickets SAV"
          value={stats.openServiceTicketsCount.toString()}
          detail="Ouverts, qualifiés ou planifiés"
          tone={stats.openServiceTicketsCount > 0 ? "danger" : "success"}
        />
      </div>

      {cockpit && <OperationsCockpit cockpit={cockpit} />}

      <div className="grid gap-6 lg:grid-cols-7">
        <Card className="workspace-panel bg-card lg:col-span-4">
          <CardHeader>
            <CardTitle>Exécution opérationnelle</CardTitle>
            <CardDescription>Signaux directs issus des commandes, chantiers, stocks et interventions.</CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Interventions à suivre</p>
                <div className="flex items-center gap-2">
                  <Wrench className="h-4 w-4 text-primary" />
                  <span className="text-lg font-bold tabular-nums">{stats.upcomingInterventionsCount}</span>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Alertes de stock</p>
                <p className={cn("text-lg font-bold tabular-nums", stats.lowStockCount ? "text-danger" : "text-success")}>{stats.lowStockCount}</p>
              </div>
              <div className="space-y-1 border-t pt-4 sm:border-t">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Projets actifs</p>
                <p className="text-lg font-bold tabular-nums">{stats.activeProjectsCount}</p>
              </div>
              <div className="space-y-1 border-t pt-4 sm:text-right">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Marge directe {stats.currentYear}</p>
                <p className={cn("text-lg font-bold tabular-nums", stats.directMarginCents >= 0 ? "text-success" : "text-danger")}>{formatCentsToEuro(stats.directMarginCents)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="workspace-panel bg-card lg:col-span-3">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Notifications</CardTitle>
              <Link href="/dashboard/notifications">
                <Button variant="ghost" size="sm" className="text-xs font-bold uppercase tracking-wider text-primary">
                  Tout voir
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="grid divide-y">
              {notifications.length > 0 ? (
                notifications.slice(0, 5).map((notification) => (
                  <div key={notification.id} className="flex items-start gap-4 p-4 transition-colors hover:bg-muted/30">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Clock className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="truncate text-sm font-bold leading-none">{notification.title}</p>
                      <p className="line-clamp-1 text-xs text-muted-foreground">{notification.message}</p>
                      <p className="text-xs font-bold uppercase tracking-tight text-muted-foreground/70">
                        {new Date(notification.createdAt).toLocaleDateString("fr-FR")}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/40" />
                  </div>
                ))
              ) : (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  Aucune notification récente.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-4 border-t border-border/80 pt-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <h2 className="text-lg font-bold">Actions rapides</h2>
          <p className="text-sm text-muted-foreground">Créer une opportunité commerciale ou transformer du travail en cash.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/dashboard/devis/new">
            <Button variant="outline" className="gap-2">
              <FileText className="h-4 w-4" />
              Nouveau devis
            </Button>
          </Link>
          <Link href="/dashboard/factures/temps-non-facture">
            <Button variant="outline" className="gap-2">
              <Timer className="h-4 w-4" />
              Temps non facturé
            </Button>
          </Link>
          <Link href="/dashboard/factures/new">
            <Button className="gap-2">
              <Receipt className="h-4 w-4" />
              Créer facture
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: React.ElementType
  label: string
  value: string
  detail: string
  tone: "primary" | "success" | "danger" | "warning" | "neutral"
}) {
  const toneClass = {
    primary: "bg-primary/10 text-primary",
    success: "bg-success/10 text-success",
    danger: "bg-danger/10 text-danger",
    warning: "bg-warning/10 text-warning",
    neutral: "bg-muted text-muted-foreground",
  }[tone]

  return (
    <Card className="workspace-metric min-h-[128px] bg-card">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
        <CardTitle className="text-[13px] font-medium text-foreground/85">{label}</CardTitle>
        <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg", toneClass)}>
          <Icon className="h-4 w-4" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-[25px] font-semibold leading-none tracking-[-0.02em] tabular-nums">{value}</div>
        <div className="mt-5 flex items-center gap-2 border-t pt-2.5">
          <span className={cn("size-1.5 rounded-full", tone === "danger" ? "bg-danger" : tone === "warning" ? "bg-warning" : "bg-success")} />
          <p className="truncate text-xs text-muted-foreground">{detail}</p>
        </div>
      </CardContent>
    </Card>
  )
}

function OperationsCockpit({ cockpit }: { cockpit: CockpitData }) {
  const relanceCount = cockpit.relances.invoices.length + cockpit.relances.quotes.length

  return (
    <section className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
      <Card className="workspace-panel bg-card">
        <CardHeader className="border-b pb-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" />
                Cockpit du jour
              </CardTitle>
              <CardDescription>
                Priorités opérationnelles, relances et cash à récupérer.
              </CardDescription>
            </div>
            <Badge variant="outline">{shortDate(cockpit.today.date)}</Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-6 pt-4 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Priorités</h2>
              <span className="text-xs text-muted-foreground">{cockpit.today.tasks.length} ouverte(s)</span>
            </div>
            {cockpit.today.tasks.length === 0 ? (
              <EmptyState text="Aucune priorité aujourd'hui. Tu peux planifier ta journée depuis Organisation." />
            ) : (
            <div className="divide-y overflow-hidden rounded-lg border">
              {cockpit.today.tasks.slice(0, 5).map((task) => (
                <Link
                    key={task.id}
                    href="/dashboard/organisation"
                    className="block px-3.5 py-3 transition-colors hover:bg-muted/40"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="line-clamp-2 text-sm font-semibold">{task.title}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {task.project?.name ?? task.client?.name ?? task.goal?.title ?? "Sans rattachement"}
                        </p>
                      </div>
                      <Badge variant={task.priority === 1 ? "destructive" : "outline"} className="shrink-0">
                        P{task.priority}
                      </Badge>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                      <span>{task.category}</span>
                      <span>{task.estimateMin ? formatMinutes(task.estimateMin) : "Non estimé"}</span>
                      <span>{shortDate(task.scheduledDate ?? task.dueDate)}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Décisions rapides</h2>
            <CockpitMiniStat
              icon={Timer}
              label="Temps non facturé"
              value={formatCentsToEuro(cockpit.unbilled.estimatedCents)}
              detail={`${cockpit.unbilled.entryCount} entrée(s), ${formatSeconds(cockpit.unbilled.durationSec)}`}
              href="/dashboard/factures/temps-non-facture"
            />
            <CockpitMiniStat
              icon={AlertTriangle}
              label="Relances"
              value={relanceCount.toString()}
              detail={`${cockpit.relances.invoices.length} facture(s), ${cockpit.relances.quotes.length} devis`}
              href={relanceCount > 0 ? "/dashboard/factures" : "/dashboard/organisation"}
            />
            <CockpitMiniStat
              icon={CalendarCheck}
              label="Charge semaine"
              value={formatMinutes(cockpit.week.plannedMinutes)}
              detail={`${cockpit.week.openTasks} tâche(s), ${cockpit.week.highPriorityTasks} haute priorité`}
              href="/dashboard/organisation"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="workspace-panel bg-card">
        <CardHeader className="border-b pb-4">
          <CardTitle className="flex items-center gap-2">
            <Gauge className="h-4 w-4 text-primary" />
            Ce qui mérite attention
          </CardTitle>
          <CardDescription>Actions générées à partir des données CRM.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 pt-4">
            <div className="divide-y rounded-lg border">
            {cockpit.suggestedActions.length === 0 ? (
              <EmptyState text="Rien d'urgent détecté. Bon moment pour vendre ou documenter." />
            ) : (
              cockpit.suggestedActions.map((action) => (
                <Link
                  key={action.id}
                  href={action.href}
                  className="flex items-center justify-between gap-3 px-3.5 py-3 transition-colors hover:bg-muted/40"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full border", actionToneClass(action.tone))} />
                    <span className="min-w-0">
                    <span className="block text-sm font-bold">{action.label}</span>
                    <span className="block truncate text-xs opacity-80">{action.detail}</span>
                    </span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0" />
                </Link>
              ))
            )}
          </div>

          <div className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Projets à risque</h2>
            {cockpit.projectRisks.length === 0 ? (
              <EmptyState text="Aucun projet actif en zone de risque." />
            ) : (
              <div className="divide-y rounded-lg border">{cockpit.projectRisks.map((project) => (
                <Link
                  key={project.id}
                  href={`/dashboard/projets/${project.id}`}
                  className="block px-3.5 py-3 transition-colors hover:bg-muted/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">{project.name}</p>
                      <p className="mt-1 text-xs opacity-80">{project.clientName}</p>
                    </div>
                    <span className={cn("rounded-md border px-2 py-0.5 text-xs font-semibold tabular-nums", riskToneClass(project.risk.level))}>{project.risk.budgetUsagePct}%</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className={cn("h-full rounded-full", project.risk.level === "critical" ? "bg-danger" : project.risk.level === "warning" ? "bg-warning" : "bg-success")} style={{ width: `${Math.min(project.risk.budgetUsagePct, 100)}%` }} /></div>
                  <p className="mt-1.5 line-clamp-1 text-xs text-muted-foreground">
                    {project.risk.reasons.join(" · ") || "À surveiller"}
                  </p>
                </Link>
              ))}</div>
            )}
          </div>
        </CardContent>
      </Card>
    </section>
  )
}

function CockpitMiniStat({
  icon: Icon,
  label,
  value,
  detail,
  href,
}: {
  icon: React.ElementType
  label: string
  value: string
  detail: string
  href: string
}) {
  return (
    <Link href={href} className="flex items-center gap-3 border-b px-1 py-3 transition-colors last:border-b-0 hover:bg-muted/30">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="mt-1 text-lg font-black tabular-nums">{value}</p>
        <p className="truncate text-xs text-muted-foreground">{detail}</p>
      </div>
    </Link>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed bg-background/50 px-3 py-4 text-center text-sm text-muted-foreground">
      {text}
    </div>
  )
}
