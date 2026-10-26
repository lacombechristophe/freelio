"use client"

import * as React from "react"
import Link from "next/link"
import { CalendarSync } from "lucide-react"
import { createOrganisationGoal, createOrganisationTask } from "@/actions/organisation"
import { Button } from "@/components/ui/button"
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
import type { GoalScope, TaskCategory, OrganisationData } from "./organisation-types"
import {
  scopeLabels,
  categoryLabels,
  GOAL_SCOPES,
  TASK_CATEGORIES,
} from "./organisation-format"

export function TaskDialog({
  open,
  onOpenChange,
  projects,
  clients,
  goals,
  calendarChannels,
  defaultDate,
  onCreate,
  pending,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  projects: OrganisationData["projects"]
  clients: OrganisationData["clients"]
  goals: OrganisationData["goals"]
  calendarChannels: OrganisationData["calendarChannels"]
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
  const [scheduledTime, setScheduledTime] = React.useState("09:00")
  const [dueDate, setDueDate] = React.useState("")
  const [estimateMin, setEstimateMin] = React.useState("60")
  const [notes, setNotes] = React.useState("")
  const [isBillable, setIsBillable] = React.useState(true)
  const [recurrence, setRecurrence] = React.useState("")
  const [recurrenceInterval, setRecurrenceInterval] = React.useState("1")
  const [recurrenceEnd, setRecurrenceEnd] = React.useState("")
  const [calendarChannelId, setCalendarChannelId] = React.useState("")

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
      scheduledDate: scheduledDate ? `${scheduledDate}T${scheduledTime || "09:00"}` : null,
      dueDate: dueDate || null,
      estimateMin: estimateMin ? Number(estimateMin) : null,
      isBillable,
      status: "TODO",
      recurrence: (recurrence || null) as "DAILY" | "WEEKLY" | "MONTHLY" | null,
      recurrenceInterval: Number(recurrenceInterval),
      recurrenceEnd: recurrenceEnd || null,
      calendarChannelId: calendarChannelId || null,
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
    setCalendarChannelId("")
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

          <div className="grid gap-3 md:grid-cols-5">
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
              <Label htmlFor="task-scheduled-time">Heure</Label>
              <Input id="task-scheduled-time" type="time" value={scheduledTime} onChange={(event) => setScheduledTime(event.target.value)} disabled={!scheduledDate} />
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

          <div className="rounded-lg border bg-muted/20 p-3">
            <div className="flex items-start gap-3">
              <CalendarSync className="mt-0.5 size-4 shrink-0 text-primary" />
              <div className="min-w-0 flex-1 space-y-2">
                <div><p className="text-sm font-medium">Calendrier externe</p><p className="text-xs leading-5 text-muted-foreground">Crée le rendez-vous dans Google ou Microsoft et conserve les modifications reçues lors des synchronisations.</p></div>
                {calendarChannels.length ? <select aria-label="Calendrier externe" value={calendarChannelId} onChange={(event) => setCalendarChannelId(event.target.value)} disabled={!scheduledDate} className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-primary"><option value="">Ne pas synchroniser</option>{calendarChannels.map((channel) => <option key={channel.id} value={channel.id}>{channel.provider === "GOOGLE" ? "Google" : "Microsoft"} · {channel.displayName || channel.emailAddress}</option>)}</select> : <Link href="/dashboard/communications?tab=integrations" className="inline-flex text-xs font-medium text-primary hover:underline">Connecter Google Workspace ou Microsoft 365</Link>}
              </div>
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

export function GoalDialog({
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
