"use client"

import * as React from "react"
import Link from "next/link"
import {
  CalendarSync,
  CheckCircle2,
  Circle,
  Clock3,
  Link2,
  Timer,
  Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import type { TaskStatus, OrganisationData } from "./organisation-types"
import {
  statusLabels,
  scopeLabels,
  categoryLabels,
  priorityLabels,
  displayLongDate,
  formatMinutes,
  getStatus,
  getScope,
  getCategory,
} from "./organisation-format"

export function MetricCard({
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
          <p className="text-xs font-semibold tracking-normal text-muted-foreground">{label}</p>
          <p className="mt-1 text-xl font-black tabular-nums tracking-tight">{value}</p>
          <p className="mt-1 truncate text-xs text-muted-foreground">{detail}</p>
        </div>
      </CardContent>
    </Card>
  )
}

export function EmptyLine({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed bg-background/50 px-3 py-4 text-center text-sm text-muted-foreground">
      {text}
    </div>
  )
}

export function TaskRow({
  task,
  timeZone,
  compact = false,
  pendingKey,
  onStatus,
  onTime,
  onDelete,
}: {
  task: OrganisationData["tasks"][number]
  timeZone: string
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
          className="-m-1.5 grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-success disabled:opacity-50"
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
            {task.calendarProvider && <Badge variant={task.calendarSyncStatus === "ERROR" ? "destructive" : "secondary"} className="h-4 px-1.5 text-xs" title={task.calendarLastError || "Synchronisé avec le calendrier externe"}><CalendarSync className="size-3" />{task.calendarProvider === "GOOGLE" ? "Google" : "Microsoft"}</Badge>}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>{categoryLabels[category]}</span>
            <span>{priorityLabels[task.priority] ?? "Normale"}</span>
            <span>{formatMinutes(task.estimateMin)}</span>
            <span>{displayLongDate(task.scheduledDate ?? task.dueDate, task.scheduledDate ? timeZone : "UTC")}</span>
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

export function GoalRow({
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

export function GoalBucket({
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
        <h2 className="text-xs font-semibold tracking-normal text-muted-foreground">{title}</h2>
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

export function WatchSection({
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
      <h2 className="flex items-center gap-2 text-xs font-semibold tracking-normal text-muted-foreground">
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
