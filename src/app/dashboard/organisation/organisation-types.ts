
export type TaskStatus = "TODO" | "IN_PROGRESS" | "DONE" | "BLOCKED"

export type GoalScope = "DAY" | "WEEK" | "MONTH" | "YEAR"

export type TaskCategory = "DEV" | "ADMIN" | "SALES" | "SUPPORT" | "LEARNING" | "MEETING"

export type OrganisationData = {
  generatedAt: string
  timeZone: string
  canReadFinance: boolean
  canReadSales: boolean
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
    calendarChannelId: string | null
    calendarProvider: string | null
    calendarExternalId: string | null
    calendarSyncStatus: string | null
    calendarLastError: string | null
    calendarLastSyncedAt: string | null
  }>
  calendarChannels: Array<{
    id: string
    provider: string
    emailAddress: string
    displayName: string | null
    lastSyncAt: string | null
    lastError: string | null
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
