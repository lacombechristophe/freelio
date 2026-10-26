"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Flag,
  Goal,
  Kanban,
  Plus,
  Receipt,
  Rocket,
  Target,
  Timer,
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
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useConfirm } from "@/components/shared/confirm-provider"
import { formatCentsToEuro } from "@/lib/billing"
import { cn } from "@/lib/utils"
import { PageHeader } from "@/components/shared/page-header"
import { PortalBookingCalendar } from "./portal-booking-calendar"
import type { OrganisationData } from "./organisation-types"
import {
  dateKey,
  displayDate,
  displayLongDate,
  formatDuration,
  formatMinutes,
  getScope,
  isOpenStatus,
  compareByPriority,
} from "./organisation-format"
import {
  MetricCard,
  EmptyLine,
  TaskRow,
  GoalRow,
  GoalBucket,
  WatchSection,
} from "./organisation-cards"
import { TaskDialog, GoalDialog } from "./organisation-dialogs"

export function OrganisationView({ data }: { data: OrganisationData }) {
  const router = useRouter()
  const confirm = useConfirm()
  const [taskDialogOpen, setTaskDialogOpen] = React.useState(false)
  const [goalDialogOpen, setGoalDialogOpen] = React.useState(false)
  const [pendingKey, setPendingKey] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (window.location.hash === "#objectifs") {
      document.getElementById("objectifs")?.scrollIntoView({ block: "start", behavior: "instant" })
    }
  }, [])

  const todayKey = dateKey(data.periods.todayStart, data.timeZone)
  const weekStart = React.useMemo(() => new Date(`${dateKey(data.periods.weekStart, data.timeZone)}T00:00:00.000Z`), [data.periods.weekStart, data.timeZone])
  const weekDays = React.useMemo(() => {
    return Array.from({ length: 7 }, (_, index) => {
      const day = new Date(weekStart)
      day.setUTCDate(weekStart.getUTCDate() + index)
      return day
    })
  }, [weekStart])

  const openTasks = data.tasks
    .filter((task) => isOpenStatus(task.status))
    .sort(compareByPriority)

  const todayTasks = openTasks.filter((task) => {
    const scheduled = dateKey(task.scheduledDate, data.timeZone)
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

  async function runAction<T>(key: string, action: () => Promise<T>, success: string): Promise<T | undefined> {
    setPendingKey(key)
    try {
      const result = await action()
      toast.success(success)
      router.refresh()
      return result
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erreur.")
    } finally {
      setPendingKey(null)
    }
  }

  async function imputeTaskTime(id: string, minutes: number) {
    const result = await createTimeEntryFromOrganisationTask(id, minutes)
    if (!result.ok) throw new Error(result.error)
    return result
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
          <a download href="/api/organisation/calendar.ics">
            <Button variant="outline" className="gap-2"><Download className="h-4 w-4" /> Calendrier ICS</Button>
          </a>
          <Button variant="outline" className="gap-2" onClick={() => setGoalDialogOpen(true)}>
            <Target className="h-4 w-4" />
            Nouvel objectif
          </Button>
          <Button demoMutation className="gap-2" onClick={() => setTaskDialogOpen(true)}>
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
          detail={data.canReadFinance ? `${overdueInvoices.length} facture(s) en retard` : "Accès Finance requis"}
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
              <Badge variant="outline">{displayLongDate(data.periods.todayStart, data.timeZone)}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-5 pt-4">
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold tracking-normal text-muted-foreground">Priorités</h2>
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
                      timeZone={data.timeZone}
                      compact
                      pendingKey={pendingKey}
                      onStatus={(status) => runAction(`task-${task.id}-${status}`, () => updateOrganisationTaskStatus(task.id, status), "Statut mis à jour.")}
                      onTime={() => runAction(`task-time-${task.id}`, () => imputeTaskTime(task.id, task.estimateMin ?? 60), "Temps imputé et tâche terminée.")}
                      onDelete={() => handleDeleteTask(task.id)}
                    />
                  ))}
                </div>
              )}
            </section>

            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold tracking-normal text-muted-foreground">Objectifs du jour</h2>
                <Button demoMutation variant="ghost" size="sm" className="h-8 px-2" onClick={() => setGoalDialogOpen(true)}>Ajouter</Button>
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
              <Badge variant="outline">{displayDate(data.periods.weekStart, data.timeZone)} - {displayDate(data.periods.weekEnd, data.timeZone)}</Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="grid gap-3 md:grid-cols-7">
              {weekDays.map((day) => {
                const key = dateKey(day)
                const dayTasks = openTasks.filter((task) => (task.scheduledDate ? dateKey(task.scheduledDate, data.timeZone) : dateKey(task.dueDate)) === key)
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
                        <p className="text-xs font-semibold tracking-normal text-muted-foreground">
                          {day.toLocaleDateString("fr-FR", { weekday: "short", timeZone: "UTC" })}
                        </p>
                        <p className="text-xl font-black leading-none">{day.getUTCDate()}</p>
                      </div>
                      <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-mono text-muted-foreground">
                        {formatDuration(daySeconds)}
                      </span>
                    </div>
                    <div className="mt-3 space-y-1.5">
                      {dayTasks.length === 0 ? (
                        <p className="text-xs text-muted-foreground">Aucune tâche</p>
                      ) : (
                        dayTasks.slice(0, 3).map((task) => (
                          <div key={task.id} className="rounded-md border border-border/80 bg-card/70 px-2 py-1.5">
                            <p className="line-clamp-2 text-xs font-medium leading-snug">{task.title}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {task.scheduledDate ? new Date(task.scheduledDate).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: data.timeZone }) : "Échéance"} · {formatMinutes(task.estimateMin)}
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
            <PortalBookingCalendar initialDay={dateKey(data.periods.weekStart, data.timeZone)} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card id="objectifs" tabIndex={-1} className="scroll-mt-4 target:ring-2 target:ring-ring focus-visible:outline-2 focus-visible:outline-ring">
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
              empty={data.canReadFinance ? "Aucune facture urgente." : "Accès Finance requis"}
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
              empty={data.canReadSales ? "Aucun devis à relancer." : "Accès commercial requis"}
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
            <Button demoMutation variant="outline" size="sm" className="gap-2" onClick={() => setTaskDialogOpen(true)}>
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
                  timeZone={data.timeZone}
                  pendingKey={pendingKey}
                  onStatus={(status) => runAction(`task-${task.id}-${status}`, () => updateOrganisationTaskStatus(task.id, status), "Statut mis à jour.")}
                  onTime={() => runAction(`task-time-${task.id}`, () => imputeTaskTime(task.id, task.estimateMin ?? 60), "Temps imputé et tâche terminée.")}
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
        calendarChannels={data.calendarChannels}
        defaultDate={dateKey(data.periods.todayStart, data.timeZone)}
        onCreate={async (payload) => {
          const result = await runAction("create-task", () => createOrganisationTask(payload), "Tâche créée.")
          if (!result) return
          if (result.calendarWarning) toast.warning(`Tâche conservée, calendrier à corriger : ${result.calendarWarning}`)
          setTaskDialogOpen(false)
        }}
        pending={pendingKey === "create-task"}
      />
      <GoalDialog
        open={goalDialogOpen}
        onOpenChange={setGoalDialogOpen}
        defaultDate={dateKey(data.periods.todayStart, data.timeZone)}
        onCreate={async (payload) => {
          const result = await runAction("create-goal", () => createOrganisationGoal(payload), "Objectif créé.")
          if (result) setGoalDialogOpen(false)
        }}
        pending={pendingKey === "create-goal"}
      />
    </div>
  )
}
