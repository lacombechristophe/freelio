import { calendarDayKey } from "@/lib/calendar-days"
import type { TaskStatus, GoalScope, TaskCategory } from "./organisation-types"

export const statusLabels: Record<TaskStatus, string> = {
  TODO: "À faire",
  IN_PROGRESS: "En cours",
  DONE: "Terminé",
  BLOCKED: "Bloqué",
}

export const scopeLabels: Record<GoalScope, string> = {
  DAY: "Jour",
  WEEK: "Semaine",
  MONTH: "Mois",
  YEAR: "Année",
}

export const categoryLabels: Record<TaskCategory, string> = {
  DEV: "Dev",
  ADMIN: "Admin",
  SALES: "Vente",
  SUPPORT: "Support",
  LEARNING: "Veille",
  MEETING: "Rendez-vous",
}

export const priorityLabels: Record<number, string> = {
  1: "Haute",
  2: "Normale",
  3: "Basse",
}

export function dateKey(value: string | Date | null | undefined, timeZone = "UTC") {
  if (!value) return ""
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "" : calendarDayKey(date, timeZone)
}

export function displayDate(value: string | null | undefined, timeZone = "UTC", fallback = "Sans date") {
  if (!value) return fallback
  return new Date(value).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    timeZone,
  })
}

export function displayLongDate(value: string | null | undefined, timeZone = "UTC") {
  if (!value) return "Non planifié"
  const date = new Date(value)
  const label = date.toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    timeZone,
  })
  return `${label} · ${date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone })}`
}

export function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return `${h}h${m.toString().padStart(2, "0")}`
}

export function formatMinutes(minutes: number | null) {
  if (!minutes) return "Non estimé"
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h}h${m.toString().padStart(2, "0")}` : `${h}h`
}

export function getStatus(value: string): TaskStatus {
  return TASK_STATUSES.includes(value as TaskStatus) ? (value as TaskStatus) : "TODO"
}

export function getScope(value: string): GoalScope {
  return GOAL_SCOPES.includes(value as GoalScope) ? (value as GoalScope) : "WEEK"
}

export function getCategory(value: string): TaskCategory {
  return TASK_CATEGORIES.includes(value as TaskCategory) ? (value as TaskCategory) : "DEV"
}

export function isOpenStatus(status: string) {
  return status !== "DONE"
}

export function compareByPriority<T extends { priority: number; dueDate?: string | null; scheduledDate?: string | null }>(a: T, b: T) {
  if (a.priority !== b.priority) return a.priority - b.priority
  const aDate = a.scheduledDate ?? a.dueDate ?? "9999-12-31"
  const bDate = b.scheduledDate ?? b.dueDate ?? "9999-12-31"
  return aDate.localeCompare(bDate)
}

const TASK_STATUSES: TaskStatus[] = ["TODO", "IN_PROGRESS", "DONE", "BLOCKED"]

export const GOAL_SCOPES: GoalScope[] = ["DAY", "WEEK", "MONTH", "YEAR"]

export const TASK_CATEGORIES: TaskCategory[] = ["DEV", "ADMIN", "SALES", "SUPPORT", "LEARNING", "MEETING"]
