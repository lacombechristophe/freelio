"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Circle,
  Clock3,
  Flag,
  Goal,
  Kanban,
  Link2,
  Plus,
  Receipt,
  Rocket,
  Target,
  Timer,
  Trash2,
  Download,
} from "lucide-react"
import { toast } from "sonner"

import {
  createOrganisationGoal,
  createOrganisationTask,
  createTimeEntryFromOrganisationTask,
  deleteOrganisationGoal,
  deleteOrganisationTask,
  updateOrganisationGoalStatus,
  updateOrganisationTaskStatus,
} from "@/actions/organisation"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { useConfirm } from "@/components/shared/confirm-provider"
import { formatCentsToEuro } from "@/lib/billing"
import { cn } from "@/lib/utils"
import { PageHeader } from "@/components/shared/page-header"

type TaskStatus = "TODO" | "IN_PROGRESS" | "DONE" | "BLOCKED"
type GoalScope = "DAY" | "WEEK" | "MONTH" | "YEAR"
type TaskCategory = "DEV" | "ADMIN" | "SALES" | "SUPPORT" | "LEARNING"

type OrganisationData = {
  generatedAt: string
  periods: {
    todayStart: string
    tomorrowStart: string
    weekStart: string
    weekEnd: string
    monthStart: string
    monthEnd: string
    yearStart: string
    yearEnd: string
  }
  goals: Array<{
    id: string
    title: string
    description: string | null
    scope: string
    status: string
    priority: number
    periodStart: string | null
    periodEnd: string | null
    createdAt: string
    updatedAt: string
    taskCount: number
    doneTaskCount: number
  }>
  tasks: Array<{
    id: string
    title: string
    notes: string | null
    status: string
    priority: number
    category: string
    estimateMin: number | null
    isBillable: boolean
    dueDate: string | null
    scheduledDate: string | null
    createdAt: string
    updatedAt: string
    client: { id: string; name: string } | null
    project: { id: string; name: string; client: { id: string; name: string } } | null
    goal: { id: string; title: string; scope: string } | null
    recurrence: string | null
    recurrenceInterval: number
    recurrenceEnd: string | null
  }>
  projects: Array<{
    id: string
    name: string
    status: string
    budgetCents: number
    consumedCents: number
    endDate: string | null
    client: { id: string; name: string }
  }>
  clients: Array<{ id: string; name: string }>
  weekTimeEntries: Array<{
    id: string
    date: string
    durationSec: number
    isBillable: boolean
    project: { id: string; name: string; client: { id: string; name: string } }
  }>
  watchlist: {
    invoices: Array<{
      id: string
      number: string
      object: string
      status: string
      dueDate: string
      totalTtcCents: number
      paidAmountCents: number
      client: { id: string; name: string }
    }>
    quotes: Array<{
      id: string
      number: string
      object: string
      status: string
      validUntil: string | null
      totalTtcCents: number
      client: { id: string; name: string }
    }>
    milestones: Array<{
      id: string
      title: string
      status: string
      dueDate: string | null
      project: { id: string; name: string; client: { id: string; name: string } }
    }>
  }
}

const statusLabels: Record<TaskStatus, string> = {
  TODO: "À faire",
  IN_PROGRESS: "En cours",
  DONE: "Terminé",
  BLOCKED: "Bloqué",
}

const scopeLabels: Record<GoalScope, string> = {
  DAY: "Jour",
  WEEK: "Semaine",
  MONTH: "Mois",
  YEAR: "Année",
}

const categoryLabels: Record<TaskCategory, string> = {
  DEV: "Dev",
  ADMIN: "Admin",
  SALES: "Vente",
  SUPPORT: "Support",
  LEARNING: "Veille",
}

const priorityLabels: Record<number, string> = {
  1: "Haute",
  2: "Normale",
  3: "Basse",
}

function dateKey(value: string | Date | null | undefined) {
  if (!value) return ""
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-")
}

function inputDate(value: string | null | undefined) {
  return value ? dateKey(value) : ""
}

function displayDate(value: string | null | undefined, fallback = "Sans date") {
  if (!value) return fallback
  return new Date(value).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
  })
}

function displayLongDate(value: string | null | undefined) {
  if (!value) return "Non planifié"
  return new Date(value).toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  })
}

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return `${h}h${m.toString().padStart(2, "0")}`
}

function formatMinutes(minutes: number | null) {
  if (!minutes) return "Non estimé"
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h}h${m.toString().padStart(2, "0")}` : `${h}h`
}

function getStatus(value: string): TaskStatus {
  return TASK_STATUSES.includes(value as TaskStatus) ? (value as TaskStatus) : "TODO"
}

function getScope(value: string): GoalScope {
  return GOAL_SCOPES.includes(value as GoalScope) ? (value as GoalScope) : "WEEK"
}

function getCategory(value: string): TaskCategory {
  return TASK_CATEGORIES.includes(value as TaskCategory) ? (value as TaskCategory) : "DEV"
}

function isOpenStatus(status: string) {
  return status !== "DONE"
}

function compareByPriority<T extends { priority: number; dueDate?: string | null; scheduledDate?: string | null }>(a: T, b: T) {
  if (a.priority !== b.priority) return a.priority - b.priority
  const aDate = a.scheduledDate ?? a.dueDate ?? "9999-12-31"
  const bDate = b.scheduledDate ?? b.dueDate ?? "9999-12-31"
  return aDate.localeCompare(bDate)
}

const TASK_STATUSES: TaskStatus[] = ["TODO", "IN_PROGRESS", "DONE", "BLOCKED"]
const GOAL_SCOPES: GoalScope[] = ["DAY", "WEEK", "MONTH", "YEAR"]
const TASK_CATEGORIES: TaskCategory[] = ["DEV", "ADMIN", "SALES", "SUPPORT", "LEARNING"]

export function OrganisationView({ data }: { data: OrganisationData }) {
  const router = useRouter()
  const confirm = useConfirm()
  const [taskDialogOpen, setTaskDialogOpen] = React.useState(false)
  const [goalDialogOpen, setGoalDialogOpen] = React.useState(false)
  const [pendingKey, setPendingKey] = React.useState<string | null>(null)

  const todayKey = dateKey(data.periods.todayStart)
  const weekStart = React.useMemo(() => new Date(data.periods.weekStart), [data.periods.weekStart])
  const weekDays = React.useMemo(() => {
    return Array.from({ length: 7 }, (_, index) => {
      const day = new Date(weekStart)
      day.setDate(weekStart.getDate() + index)
      return day
    })
  }, [weekStart])

  const openTasks = data.tasks
    .filter((task) => isOpenStatus(task.status))
    .sort(compareByPriority)

  const todayTasks = openTasks.filter((task) => {
    const scheduled = dateKey(task.scheduledDate)
    const due = dateKey(task.dueDate)
    return scheduled === todayKey || due === todayKey || (!scheduled && !due)
  })

  const activeGoals = data.goals.filter((goal) => isOpenStatus(goal.status))
  const dayGoals = activeGoals.filter((goal) => getScope(goal.scope) === "DAY")
  const weekGoals = activeGoals.filter((goal) => getScope(goal.scope) === "WEEK")
  const monthGoals = activeGoals.filter((goal) => getScope(goal.scope) === "MONTH")
  const yearGoals = activeGoals.filter((goal) => getScope(goal.scope) === "YEAR")

  const weekSeconds = data.weekTimeEntries.reduce((sum, entry) => sum + entry.durationSec, 0)
  const billableWeekSeconds = data.weekTimeEntries
    .filter((entry) => entry.isBillable)
    .reduce((sum, entry) => sum + entry.durationSec, 0)
  const doneThisWeek = data.tasks.filter((task) => {
    const updated = new Date(task.updatedAt)
    return task.status === "DONE" && updated >= new Date(data.periods.weekStart) && updated < new Date(data.periods.weekEnd)
  }).length

  const overdueInvoices = data.watchlist.invoices.filter((invoice) => {
    return invoice.status === "OVERDUE" || (invoice.status !== "PAID" && dateKey(invoice.dueDate) < todayKey)
  })
  const urgentCount = overdueInvoices.length + openTasks.filter((task) => task.status === "BLOCKED").length
  const weeklyFocusProgress = openTasks.length + doneThisWeek === 0
    ? 0
    : Math.round((doneThisWeek / (openTasks.length + doneThisWeek)) * 100)

  async function runAction(key: string, action: () => Promise<unknown>, success: string) {
    setPendingKey(key)
    try {
      await action()
      toast.success(success)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erreur.")
    } finally {
      setPendingKey(null)
    }
  }

  async function handleDeleteTask(id: string) {
    if (!(await confirm({
      title: "Supprimer cette tâche ?",
      confirmLabel: "Supprimer",
      destructive: true,
    }))) return
    await runAction(`delete-task-${id}`, () => deleteOrganisationTask(id), "Tâche supprimée.")
  }

  async function handleDeleteGoal(id: string) {
    if (!(await confirm({
      title: "Supprimer cet objectif ?",
      description: "Les tâches liées seront conservées mais détachées de l'objectif.",
      confirmLabel: "Supprimer",
      destructive: true,
    }))) return
    await runAction(`delete-goal-${id}`, () => deleteOrganisationGoal(id), "Objectif supprimé.")
  }

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Planification"
        title="Organisation"
        description="Transformez les priorités, objectifs et échéances de votre activité en un plan de travail réaliste."
        actions={<>
          <a href="/api/organisation/calendar.ics">
            <Button variant="outline" className="gap-2"><Download className="h-4 w-4" /> Calendrier ICS</Button>
          </a>
          <Button variant="outline" className="gap-2" onClick={() => setGoalDialogOpen(true)}>
            <Target className="h-4 w-4" />
            Nouvel objectif
          </Button>
          <Button className="gap-2" onClick={() => setTaskDialogOpen(true)}>
            <Plus className="h-4 w-4" />
            Nouvelle tâche
          </Button>
        </>}
      />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={Rocket}
          label="Focus du jour"
          value={`${Math.min(todayTasks.length, 3)} priorités`}
          detail={`${openTasks.length} tâche(s) ouvertes`}
          tone="primary"
        />
        <MetricCard
          icon={Timer}
          label="Temps semaine"
          value={formatDuration(weekSeconds)}
          detail={`${formatDuration(billableWeekSeconds)} facturable`}
          tone="success"
        />
        <MetricCard
          icon={CheckCircle2}
          label="Exécution"
          value={`${weeklyFocusProgress}%`}
          detail={`${doneThisWeek} élément(s) terminés cette semaine`}
          tone="neutral"
        />
        <MetricCard
          icon={AlertTriangle}
          label="À surveiller"
          value={`${urgentCount} point(s)`}
          detail={`${overdueInvoices.length} facture(s) en retard`}
          tone={urgentCount > 0 ? "danger" : "neutral"}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1.35fr)]">
        <Card className="bg-card">
          <CardHeader className="border-b pb-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Flag className="h-4 w-4 text-primary" />
                  Aujourd'hui
                </CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  Ce bloc doit rester court : trois priorités maximum à exécuter.
                </p>
              </div>
              <Badge variant="outline">{displayLongDate(data.periods.todayStart)}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-5 pt-4">
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Priorités</h2>
                <span className="text-xs text-muted-foreground">{todayTasks.length} élément(s)</span>
              </div>
              {todayTasks.length === 0 ? (
                <EmptyLine text="Aucune priorité ouverte. Crée une tâche ou choisis une tâche sans date." />
              ) : (
                <div className="space-y-2">
                  {todayTasks.slice(0, 3).map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      compact
                      pendingKey={pendingKey}
                      onStatus={(status) => runAction(`task-${task.id}-${status}`, () => updateOrganisationTaskStatus(task.id, status), "Statut mis à jour.")}
                      onTime={() => runAction(`task-time-${task.id}`, () => createTimeEntryFromOrganisationTask(task.id, task.estimateMin ?? 60), "Temps imputé et tâche terminée.")}
                      onDelete={() => handleDeleteTask(task.id)}
                    />
                  ))}
                </div>
              )}
            </section>

            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Objectifs du jour</h2>
                <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => setGoalDialogOpen(true)}>Ajouter</Button>
              </div>
              {dayGoals.length === 0 ? (
                <EmptyLine text="Aucun objectif du jour. Garde-les rares et actionnables." />
              ) : (
                <div className="space-y-2">
                  {dayGoals.map((goal) => (
                    <GoalRow
                      key={goal.id}
                      goal={goal}
                      pendingKey={pendingKey}
                      onStatus={(status) => runAction(`goal-${goal.id}-${status}`, () => updateOrganisationGoalStatus(goal.id, status), "Objectif mis à jour.")}
                      onDelete={() => handleDeleteGoal(goal.id)}
                    />
                  ))}
                </div>
              )}
            </section>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardHeader className="border-b pb-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-primary" />
                  Semaine de travail
                </CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  Charge prévue, tâches planifiées et temps réellement imputé.
                </p>
              </div>
              <Badge variant="outline">{displayDate(data.periods.weekStart)} - {displayDate(data.periods.weekEnd)}</Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="grid gap-3 md:grid-cols-7">
              {weekDays.map((day) => {
                const key = dateKey(day)
                const dayTasks = openTasks.filter((task) => dateKey(task.scheduledDate ?? task.dueDate) === key)
                const daySeconds = data.weekTimeEntries
                  .filter((entry) => dateKey(entry.date) === key)
                  .reduce((sum, entry) => sum + entry.durationSec, 0)
                const isToday = key === todayKey

                return (
                  <div
                    key={key}
                    className={cn(
                      "min-h-40 rounded-lg border bg-background/60 p-3",
                      isToday && "border-primary/70 bg-primary/5 ring-1 ring-primary/20"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          {day.toLocaleDateString("fr-FR", { weekday: "short" })}
                        </p>
                        <p className="text-xl font-black leading-none">{day.getDate()}</p>
                      </div>
                      <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-mono text-muted-foreground">
                        {formatDuration(daySeconds)}
                      </span>
                    </div>
                    <div className="mt-3 space-y-1.5">
                      {dayTasks.length === 0 ? (
                        <p className="text-xs text-muted-foreground/70">Libre</p>
                      ) : (
                        dayTasks.slice(0, 3).map((task) => (
                          <div key={task.id} className="rounded-md border border-border/80 bg-card/70 px-2 py-1.5">
                            <p className="line-clamp-2 text-xs font-medium leading-snug">{task.title}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {formatMinutes(task.estimateMin)}
                            </p>
                          </div>
                        ))
                      )}
                      {dayTasks.length > 3 && (
                        <p className="text-xs text-primary">+{dayTasks.length - 3} autre(s)</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader className="border-b pb-4">
            <CardTitle className="flex items-center gap-2">
              <Goal className="h-4 w-4 text-primary" />
              Objectifs
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 pt-4 lg:grid-cols-2">
            <GoalBucket title="Semaine" goals={weekGoals} pendingKey={pendingKey} onStatus={(goal, status) => runAction(`goal-${goal.id}-${status}`, () => updateOrganisationGoalStatus(goal.id, status), "Objectif mis à jour.")} onDelete={(goal) => handleDeleteGoal(goal.id)} />
            <GoalBucket title="Mois" goals={monthGoals} pendingKey={pendingKey} onStatus={(goal, status) => runAction(`goal-${goal.id}-${status}`, () => updateOrganisationGoalStatus(goal.id, status), "Objectif mis à jour.")} onDelete={(goal) => handleDeleteGoal(goal.id)} />
            <GoalBucket title="Année" goals={yearGoals} pendingKey={pendingKey} onStatus={(goal, status) => runAction(`goal-${goal.id}-${status}`, () => updateOrganisationGoalStatus(goal.id, status), "Objectif mis à jour.")} onDelete={(goal) => handleDeleteGoal(goal.id)} />
            <div className="rounded-lg border border-dashed bg-background/50 p-4">
              <p className="text-sm font-semibold">Règle de santé</p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                Un objectif utile doit créer une action facturable, réduire un risque client, ou améliorer ton système de vente/livraison.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b pb-4">
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Vigilance business
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5 pt-4">
            <WatchSection
              icon={Receipt}
              title="Factures à suivre"
              empty="Aucune facture urgente."
              items={data.watchlist.invoices.slice(0, 5).map((invoice) => ({
                id: invoice.id,
                href: `/dashboard/factures/${invoice.id}`,
                title: `${invoice.number} - ${invoice.client.name}`,
                detail: `${displayLongDate(invoice.dueDate)} · ${formatCentsToEuro(invoice.totalTtcCents - invoice.paidAmountCents)}`,
                danger: invoice.status === "OVERDUE" || dateKey(invoice.dueDate) < todayKey,
              }))}
            />
            <WatchSection
              icon={Kanban}
              title="Devis ouverts"
              empty="Aucun devis à relancer."
              items={data.watchlist.quotes.slice(0, 4).map((quote) => ({
                id: quote.id,
                href: `/dashboard/devis/${quote.id}`,
                title: `${quote.number} - ${quote.client.name}`,
                detail: `${quote.validUntil ? displayLongDate(quote.validUntil) : "Sans expiration"} · ${formatCentsToEuro(quote.totalTtcCents)}`,
              }))}
            />
            <WatchSection
              icon={Flag}
              title="Jalons projet"
              empty="Aucun jalon proche."
              items={data.watchlist.milestones.slice(0, 4).map((milestone) => ({
                id: milestone.id,
                href: `/dashboard/projets/${milestone.project.id}`,
                title: milestone.title,
                detail: `${milestone.project.name} · ${displayLongDate(milestone.dueDate)}`,
              }))}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="border-b pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Toutes les tâches ouvertes</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">Triées par priorité puis échéance.</p>
            </div>
            <Button variant="outline" size="sm" className="gap-2" onClick={() => setTaskDialogOpen(true)}>
              <Plus className="h-4 w-4" />
              Ajouter une tâche
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          {openTasks.length === 0 ? (
            <EmptyLine text="Aucune tâche ouverte. Le système est clair." />
          ) : (
            <div className="grid gap-2 lg:grid-cols-2">
              {openTasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  pendingKey={pendingKey}
                  onStatus={(status) => runAction(`task-${task.id}-${status}`, () => updateOrganisationTaskStatus(task.id, status), "Statut mis à jour.")}
                  onTime={() => runAction(`task-time-${task.id}`, () => createTimeEntryFromOrganisationTask(task.id, task.estimateMin ?? 60), "Temps imputé et tâche terminée.")}
                  onDelete={() => handleDeleteTask(task.id)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <TaskDialog
        open={taskDialogOpen}
        onOpenChange={setTaskDialogOpen}
        projects={data.projects}
        clients={data.clients}
        goals={activeGoals}
        defaultDate={inputDate(data.periods.todayStart)}
        onCreate={async (payload) => {
          await runAction("create-task", () => createOrganisationTask(payload), "Tâche créée.")
          setTaskDialogOpen(false)
        }}
        pending={pendingKey === "create-task"}
      />
      <GoalDialog
        open={goalDialogOpen}
        onOpenChange={setGoalDialogOpen}
        defaultDate={inputDate(data.periods.todayStart)}
        onCreate={async (payload) => {
          await runAction("create-goal", () => createOrganisationGoal(payload), "Objectif créé.")
          setGoalDialogOpen(false)
        }}
        pending={pendingKey === "create-goal"}
      />
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
  tone: "primary" | "success" | "danger" | "neutral"
}) {
  const toneClass = {
    primary: "bg-primary/10 text-primary",
    success: "bg-success/10 text-success",
    danger: "bg-danger/10 text-danger",
    neutral: "bg-muted text-muted-foreground",
  }[tone]

  return (
    <Card size="sm" className="bg-card">
      <CardContent className="flex items-start gap-3">
        <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", toneClass)}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="mt-1 text-xl font-black tabular-nums tracking-tight">{value}</p>
          <p className="mt-1 truncate text-xs text-muted-foreground">{detail}</p>
        </div>
      </CardContent>
    </Card>
  )
}

function EmptyLine({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed bg-background/50 px-3 py-4 text-center text-sm text-muted-foreground">
      {text}
    </div>
  )
}

function TaskRow({
  task,
  compact = false,
  pendingKey,
  onStatus,
  onTime,
  onDelete,
}: {
  task: OrganisationData["tasks"][number]
  compact?: boolean
  pendingKey: string | null
  onStatus: (status: TaskStatus) => void
  onTime: () => void
  onDelete: () => void
}) {
  const status = getStatus(task.status)
  const category = getCategory(task.category)
  const pending = pendingKey?.includes(task.id)
  const linkedLabel = task.project?.name ?? task.client?.name ?? "Sans rattachement"

  return (
    <div className="rounded-lg border bg-background/70 p-3 transition-colors hover:bg-muted/30">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => onStatus(status === "DONE" ? "TODO" : "DONE")}
          disabled={pending}
          className="mt-0.5 text-muted-foreground transition-colors hover:text-success disabled:opacity-50"
          aria-label={status === "DONE" ? "Réouvrir la tâche" : "Terminer la tâche"}
        >
          {status === "DONE" ? <CheckCircle2 className="h-4 w-4 text-success" /> : <Circle className="h-4 w-4" />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="line-clamp-2 text-sm font-semibold leading-snug">{task.title}</p>
            <Badge variant={status === "BLOCKED" ? "destructive" : "outline"} className="h-4 px-1.5 text-xs">
              {statusLabels[status]}
            </Badge>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>{categoryLabels[category]}</span>
            <span>{priorityLabels[task.priority] ?? "Normale"}</span>
            <span>{formatMinutes(task.estimateMin)}</span>
            <span>{displayLongDate(task.scheduledDate ?? task.dueDate)}</span>
          </div>
          {!compact && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              {task.project ? (
                <Link href={`/dashboard/projets/${task.project.id}`} className="inline-flex items-center gap-1 text-primary hover:underline">
                  <Link2 className="h-3 w-3" />
                  {linkedLabel}
                </Link>
              ) : (
                <span className="text-muted-foreground">{linkedLabel}</span>
              )}
              {task.goal && <span className="text-muted-foreground">Objectif : {task.goal.title}</span>}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {status !== "IN_PROGRESS" && status !== "DONE" && (
            <Button variant="ghost" size="icon-xs" disabled={pending} onClick={() => onStatus("IN_PROGRESS")} title="Passer en cours">
              <Clock3 className="h-3 w-3" />
            </Button>
          )}
          {task.project && (
            <Button variant="ghost" size="icon-xs" disabled={pending} onClick={onTime} title="Imputer en temps passé">
              <Timer className="h-3 w-3" />
            </Button>
          )}
          <Button variant="ghost" size="icon-xs" disabled={pending} onClick={onDelete} title="Supprimer">
            <Trash2 className="h-3 w-3 text-danger" />
          </Button>
        </div>
      </div>
    </div>
  )
}

function GoalRow({
  goal,
  pendingKey,
  onStatus,
  onDelete,
}: {
  goal: OrganisationData["goals"][number]
  pendingKey: string | null
  onStatus: (status: TaskStatus) => void
  onDelete: () => void
}) {
  const status = getStatus(goal.status)
  const progress = goal.taskCount === 0 ? 0 : Math.round((goal.doneTaskCount / goal.taskCount) * 100)
  const pending = pendingKey?.includes(goal.id)

  return (
    <div className="rounded-lg border bg-background/70 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="line-clamp-2 text-sm font-semibold leading-snug">{goal.title}</p>
            <Badge variant="outline" className="h-4 px-1.5 text-xs">
              {scopeLabels[getScope(goal.scope)]}
            </Badge>
          </div>
          {goal.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{goal.description}</p>}
          <div className="mt-3 flex items-center gap-2">
            <Progress value={progress} className="h-1.5 flex-1" />
            <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">{progress}%</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {status !== "DONE" && (
            <Button variant="ghost" size="icon-xs" disabled={pending} onClick={() => onStatus("DONE")} title="Terminer">
              <CheckCircle2 className="h-3 w-3" />
            </Button>
          )}
          <Button variant="ghost" size="icon-xs" disabled={pending} onClick={onDelete} title="Supprimer">
            <Trash2 className="h-3 w-3 text-danger" />
          </Button>
        </div>
      </div>
    </div>
  )
}

function GoalBucket({
  title,
  goals,
  pendingKey,
  onStatus,
  onDelete,
}: {
  title: string
  goals: OrganisationData["goals"]
  pendingKey: string | null
  onStatus: (goal: OrganisationData["goals"][number], status: TaskStatus) => void
  onDelete: (goal: OrganisationData["goals"][number]) => void
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
        <span className="text-xs text-muted-foreground">{goals.length}</span>
      </div>
      {goals.length === 0 ? (
        <EmptyLine text="Vide" />
      ) : (
        goals.map((goal) => (
          <GoalRow
            key={goal.id}
            goal={goal}
            pendingKey={pendingKey}
            onStatus={(status) => onStatus(goal, status)}
            onDelete={() => onDelete(goal)}
          />
        ))
      )}
    </section>
  )
}

function WatchSection({
  icon: Icon,
  title,
  empty,
  items,
}: {
  icon: React.ElementType
  title: string
  empty: string
  items: Array<{ id: string; href: string; title: string; detail: string; danger?: boolean }>
}) {
  return (
    <section className="space-y-2">
      <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {title}
      </h2>
      {items.length === 0 ? (
        <EmptyLine text={empty} />
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className={cn(
                "block rounded-lg border bg-background/70 p-3 transition-colors hover:bg-muted/40",
                item.danger && "border-danger/30 bg-danger/5"
              )}
            >
              <p className="text-sm font-semibold">{item.title}</p>
              <p className={cn("mt-1 text-xs text-muted-foreground", item.danger && "text-danger")}>{item.detail}</p>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}

function TaskDialog({
  open,
  onOpenChange,
  projects,
  clients,
  goals,
  defaultDate,
  onCreate,
  pending,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  projects: OrganisationData["projects"]
  clients: OrganisationData["clients"]
  goals: OrganisationData["goals"]
  defaultDate: string
  onCreate: (payload: Parameters<typeof createOrganisationTask>[0]) => Promise<void>
  pending: boolean
}) {
  const [title, setTitle] = React.useState("")
  const [projectId, setProjectId] = React.useState("")
  const [clientId, setClientId] = React.useState("")
  const [goalId, setGoalId] = React.useState("")
  const [category, setCategory] = React.useState<TaskCategory>("DEV")
  const [priority, setPriority] = React.useState("2")
  const [scheduledDate, setScheduledDate] = React.useState(defaultDate)
  const [dueDate, setDueDate] = React.useState("")
  const [estimateMin, setEstimateMin] = React.useState("60")
  const [notes, setNotes] = React.useState("")
  const [isBillable, setIsBillable] = React.useState(true)
  const [recurrence, setRecurrence] = React.useState("")
  const [recurrenceInterval, setRecurrenceInterval] = React.useState("1")
  const [recurrenceEnd, setRecurrenceEnd] = React.useState("")

  React.useEffect(() => {
    if (open) setScheduledDate(defaultDate)
  }, [defaultDate, open])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    await onCreate({
      title,
      notes: notes || null,
      projectId: projectId || null,
      clientId: clientId || null,
      goalId: goalId || null,
      category,
      priority: Number(priority),
      scheduledDate: scheduledDate || null,
      dueDate: dueDate || null,
      estimateMin: estimateMin ? Number(estimateMin) : null,
      isBillable,
      status: "TODO",
      recurrence: (recurrence || null) as "DAILY" | "WEEKLY" | "MONTHLY" | null,
      recurrenceInterval: Number(recurrenceInterval),
      recurrenceEnd: recurrenceEnd || null,
    })
    setTitle("")
    setProjectId("")
    setClientId("")
    setGoalId("")
    setCategory("DEV")
    setPriority("2")
    setDueDate("")
    setEstimateMin("60")
    setNotes("")
    setIsBillable(true)
    setRecurrence("")
    setRecurrenceInterval("1")
    setRecurrenceEnd("")
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nouvelle tâche</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="task-title">Titre *</Label>
            <Input id="task-title" value={title} onChange={(event) => setTitle(event.target.value)} required />
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <FieldSelect label="Récurrence" value={recurrence} onChange={setRecurrence}>
              <option value="">Aucune</option>
              <option value="DAILY">Quotidienne</option>
              <option value="WEEKLY">Hebdomadaire</option>
              <option value="MONTHLY">Mensuelle</option>
            </FieldSelect>
            <div className="space-y-1.5">
              <Label htmlFor="task-recurrence-interval">Tous les</Label>
              <Input id="task-recurrence-interval" type="number" min="1" max="52" value={recurrenceInterval} onChange={(event) => setRecurrenceInterval(event.target.value)} disabled={!recurrence} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-recurrence-end">Fin de récurrence</Label>
              <Input id="task-recurrence-end" type="date" value={recurrenceEnd} onChange={(event) => setRecurrenceEnd(event.target.value)} disabled={!recurrence} />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <FieldSelect label="Projet" value={projectId} onChange={setProjectId}>
              <option value="">Sans projet</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name} - {project.client.name}
                </option>
              ))}
            </FieldSelect>
            <FieldSelect label="Client" value={clientId} onChange={setClientId}>
              <option value="">Auto / aucun</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>{client.name}</option>
              ))}
            </FieldSelect>
            <FieldSelect label="Objectif lié" value={goalId} onChange={setGoalId}>
              <option value="">Aucun</option>
              {goals.map((goal) => (
                <option key={goal.id} value={goal.id}>{goal.title}</option>
              ))}
            </FieldSelect>
            <FieldSelect label="Type" value={category} onChange={(value) => setCategory(value as TaskCategory)}>
              {TASK_CATEGORIES.map((item) => (
                <option key={item} value={item}>{categoryLabels[item]}</option>
              ))}
            </FieldSelect>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="task-priority">Priorité</Label>
              <select id="task-priority" value={priority} onChange={(event) => setPriority(event.target.value)} className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm outline-none focus:border-primary">
                <option value="1">Haute</option>
                <option value="2">Normale</option>
                <option value="3">Basse</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-scheduled">Planifiée</Label>
              <Input id="task-scheduled" type="date" value={scheduledDate} onChange={(event) => setScheduledDate(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-due">Échéance</Label>
              <Input id="task-due" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-estimate">Est. min</Label>
              <Input id="task-estimate" type="number" min="0" max="1440" value={estimateMin} onChange={(event) => setEstimateMin(event.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="task-notes">Notes</Label>
            <textarea
              id="task-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={isBillable} onChange={(event) => setIsBillable(event.target.checked)} />
            Temps facturable si la tâche est imputée
          </label>

          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Annuler</DialogClose>
            <Button type="submit" disabled={pending}>{pending ? "Création…" : "Créer"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function GoalDialog({
  open,
  onOpenChange,
  defaultDate,
  onCreate,
  pending,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultDate: string
  onCreate: (payload: Parameters<typeof createOrganisationGoal>[0]) => Promise<void>
  pending: boolean
}) {
  const [title, setTitle] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [scope, setScope] = React.useState<GoalScope>("WEEK")
  const [priority, setPriority] = React.useState("2")
  const [periodStart, setPeriodStart] = React.useState(defaultDate)
  const [periodEnd, setPeriodEnd] = React.useState("")

  React.useEffect(() => {
    if (open) setPeriodStart(defaultDate)
  }, [defaultDate, open])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    await onCreate({
      title,
      description: description || null,
      scope,
      priority: Number(priority),
      periodStart: periodStart || null,
      periodEnd: periodEnd || null,
      status: "TODO",
    })
    setTitle("")
    setDescription("")
    setScope("WEEK")
    setPriority("2")
    setPeriodEnd("")
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nouvel objectif</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="goal-title">Titre *</Label>
            <Input id="goal-title" value={title} onChange={(event) => setTitle(event.target.value)} required />
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <FieldSelect label="Période" value={scope} onChange={(value) => setScope(value as GoalScope)}>
              {GOAL_SCOPES.map((item) => (
                <option key={item} value={item}>{scopeLabels[item]}</option>
              ))}
            </FieldSelect>
            <div className="space-y-1.5">
              <Label htmlFor="goal-priority">Priorité</Label>
              <select id="goal-priority" value={priority} onChange={(event) => setPriority(event.target.value)} className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm outline-none focus:border-primary">
                <option value="1">Haute</option>
                <option value="2">Normale</option>
                <option value="3">Basse</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="goal-start">Début</Label>
              <Input id="goal-start" type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="goal-end">Fin optionnelle</Label>
            <Input id="goal-end" type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="goal-description">Description</Label>
            <textarea
              id="goal-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Annuler</DialogClose>
            <Button type="submit" disabled={pending}>{pending ? "Création…" : "Créer"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function FieldSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  children: React.ReactNode
}) {
  const id = React.useId()
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm outline-none focus:border-primary"
      >
        {children}
      </select>
    </div>
  )
}
