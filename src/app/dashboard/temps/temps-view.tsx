"use client"

import * as React from "react"
import { 
  Play, 
  Pause, 
  Clock, 
  MoreHorizontal, 
  Download, 
  ChevronLeft as ChevronLeftIcon, 
  ChevronRight as ChevronRightIcon, 
  Plus, 
  Trash, 
  Edit3 
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { createTimeEntry, deleteTimeEntry, updateTimeEntry } from "@/actions/temps"
import { toast } from "sonner"
import { useConfirm } from "@/components/shared/confirm-provider"
import { useRouter } from "next/navigation"
import {
  Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useTimerStore } from "@/store/timer-store"
import { cn } from "@/lib/utils"
import { PageHeader, PageHeaderStat } from "@/components/shared/page-header"

type TimeEntry = {
  id: string
  durationSec: number
  description?: string | null
  date: Date | string
  isBillable: boolean
  project: { id: string; name: string; client: { id: string; name: string } }
}

type Project = {
  id: string
  name: string
  client: { id: string; name: string }
}

function formatDuration(sec: number) {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  return `${h}h ${m.toString().padStart(2, "0")}m`
}

function formatTimer(sec: number) {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
}

function formatDate(d: Date | string) {
  return new Date(d).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })
}

function escapeCsvCell(value: string | number | boolean | null | undefined) {
  const text = String(value ?? "")
  return `"${text.replace(/"/g, '""')}"`
}

function getErrorMessage(error: unknown, fallback = "Erreur.") {
  return error instanceof Error ? error.message : fallback
}

export function TempsView({ timeEntries, projects }: { timeEntries: TimeEntry[]; projects: Project[] }) {
  const router = useRouter()
  const confirmDialog = useConfirm()
  const [saving, setSaving] = React.useState(false)
  const [editTarget, setEditTarget] = React.useState<TimeEntry | null>(null)
  
  // Weekly grid navigation state
  const [currentWeekOffset, setCurrentWeekOffset] = React.useState(0)
  
  // Create manual entry dialog state
  const [manualEntryDay, setManualEntryDay] = React.useState<Date | null>(null)
  const [manualProjId, setManualProjId] = React.useState("")
  const [manualHours, setManualHours] = React.useState("1")
  const [manualMinutes, setManualMinutes] = React.useState("0")
  const [manualDesc, setManualDesc] = React.useState("")
  const [manualBillable, setManualBillable] = React.useState(true)

  // Zustand persistent store
  const {
    isRunning,
    elapsed,
    projectId,
    startTimer,
    stopTimer,
    resetTimer,
    tick,
    setProject
  } = useTimerStore()

  // Real-time synchronization interval
  React.useEffect(() => {
    if (!isRunning) return
    const interval = setInterval(() => {
      tick()
    }, 1000)
    return () => clearInterval(interval)
  }, [isRunning, tick])

  // Today stats
  const totalToday = timeEntries
    .filter((e) => new Date(e.date).toDateString() === new Date().toDateString())
    .reduce((sum, e) => sum + e.durationSec, 0)

  // Week stats (current relative week)
  const totalWeek = timeEntries
    .filter((e) => {
      const d = new Date(e.date)
      const now = new Date()
      // Adjust by offset weeks
      const targetDate = new Date(now.setDate(now.getDate() + (currentWeekOffset * 7)))
      const day = targetDate.getDay()
      // French Monday standard
      const diff = targetDate.getDate() - day + (day === 0 ? -6 : 1)
      const weekStart = new Date(targetDate.setDate(diff))
      weekStart.setHours(0, 0, 0, 0)
      
      const weekEnd = new Date(weekStart)
      weekEnd.setDate(weekEnd.getDate() + 7)
      
      return d >= weekStart && d < weekEnd
    })
    .reduce((sum, e) => sum + e.durationSec, 0)

  async function handleDelete(id: string) {
    if (!(await confirmDialog({
      title: "Supprimer cette entrée ?",
      confirmLabel: "Supprimer",
      destructive: true,
    }))) return
    try {
      await deleteTimeEntry(id)
      toast.success("Entrée supprimée.")
      router.refresh()
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  async function handleSaveTimer() {
    if (elapsed < 60) {
      toast.error("Veuillez enregistrer au moins 1 minute de temps.")
      return
    }
    if (!projectId) {
      toast.error("Veuillez sélectionner un projet.")
      return
    }
    setSaving(true)
    try {
      await createTimeEntry({ 
        projectId, 
        durationSec: elapsed,
        description: "Enregistrement Chronomètre global"
      })
      toast.success("Temps enregistré !")
      resetTimer()
      router.refresh()
    } catch {
      toast.error("Erreur lors de l'enregistrement.")
    } finally {
      setSaving(false)
    }
  }

  function handleExportEntries() {
    if (timeEntries.length === 0) {
      toast.info("Aucune entrée de temps à exporter.")
      return
    }

    const header = [
      "Date",
      "Client",
      "Projet",
      "Description",
      "Durée",
      "Durée (secondes)",
      "Facturable",
    ]
    const rows = timeEntries.map((entry) => [
      new Date(entry.date).toISOString().slice(0, 10),
      entry.project.client.name,
      entry.project.name,
      entry.description ?? "",
      formatDuration(entry.durationSec),
      entry.durationSec,
      entry.isBillable ? "Oui" : "Non",
    ])
    const csv = [header, ...rows]
      .map((row) => row.map(escapeCsvCell).join(";"))
      .join("\r\n")
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `freelio-temps-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    toast.success("Export des temps téléchargé.")
  }

  async function handleCreateManual(e: React.FormEvent) {
    e.preventDefault()
    if (!manualProjId) {
      toast.error("Veuillez sélectionner un projet.")
      return
    }
    const secs = (Number(manualHours) || 0) * 3600 + (Number(manualMinutes) || 0) * 60
    if (secs <= 0) {
      toast.error("Veuillez entrer une durée valide.")
      return
    }
    setSaving(true)
    try {
      await createTimeEntry({
        projectId: manualProjId,
        durationSec: secs,
        description: manualDesc,
        date: manualEntryDay || new Date(),
        isBillable: manualBillable
      })
      toast.success("Entrée de temps ajoutée !")
      setManualEntryDay(null)
      setManualHours("1")
      setManualMinutes("0")
      setManualDesc("")
      router.refresh()
    } catch {
      toast.error("Erreur lors de la création de l'entrée.")
    } finally {
      setSaving(false)
    }
  }

  // Get start of the targeted week
  const getWeekDates = () => {
    const dates = []
    const now = new Date()
    const targetDate = new Date(now.setDate(now.getDate() + (currentWeekOffset * 7)))
    const day = targetDate.getDay()
    const diff = targetDate.getDate() - day + (day === 0 ? -6 : 1) // Monday starting standard
    const startOfWeek = new Date(targetDate.setDate(diff))
    
    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek)
      d.setDate(startOfWeek.getDate() + i)
      dates.push(d)
    }
    return dates
  }

  const weekDates = getWeekDates()

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Production"
        title="Suivi des temps"
        description="Imputez les heures par mission, contrôlez la charge et identifiez le temps prêt à facturer."
        actions={<><PageHeaderStat label="Aujourd’hui" value={formatDuration(totalToday)} /><PageHeaderStat label="Cette semaine" value={formatDuration(totalWeek)} /></>}
      />

      <Card className="border-primary/20 bg-card">
        <CardContent className="pt-6 pb-6 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-accent text-primary">
                <Clock className="size-5" />
              </div>
              <div>
                <h3 className="font-semibold text-sm">Chronomètre Global</h3>
                <p className="text-xs text-muted-foreground">Le temps s&apos;enregistre en temps réel et persiste sur tout le site.</p>
              </div>
            </div>

            <div className="flex items-center gap-4 self-center md:self-auto">
              <div className="text-right">
                <p className="text-3xl font-black tabular-nums tracking-tight font-mono">{formatTimer(elapsed)}</p>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <Select value={projectId} onValueChange={(v) => setProject(v ?? "")}>
              <SelectTrigger className="flex-1 bg-background border-border">
                <SelectValue placeholder="Affecter à un projet…" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} — <span className="text-xs text-muted-foreground">{p.client.name}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex items-center gap-2">
              <Button
                variant={isRunning ? "destructive" : "default"}
                onClick={() => {
                  if (isRunning) {
                    stopTimer()
                  } else {
                    if (!projectId) {
                      toast.error("Veuillez sélectionner un projet d'abord.")
                      return
                    }
                    startTimer(projectId)
                  }
                }}
                className="flex-1 sm:flex-initial"
              >
                {isRunning ? (
                  <>
                    <Pause className="h-4 w-4 mr-2" />
                    Pause
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    Démarrer
                  </>
                )}
              </Button>

              {elapsed > 0 && (
                <>
                  <Button variant="outline" size="icon" onClick={resetTimer} title="Réinitialiser">
                    <Trash className="h-4 w-4 text-muted-foreground" />
                  </Button>
                  <Button onClick={handleSaveTimer} disabled={saving} className="bg-success hover:bg-success/90">
                    Enregistrer
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Weekly interactive calendar view (7-day grid grid-cols-7) */}
      <Card className="bg-card">
        <CardHeader className="flex flex-col items-start justify-between gap-4 space-y-0 pb-4 sm:flex-row sm:items-center">
          <div>
            <CardTitle className="text-sm font-semibold">Calendrier hebdomadaire</CardTitle>
            <p className="text-xs text-muted-foreground">Cliquez sur un jour de la semaine pour y imputer directement des heures.</p>
          </div>

          <div className="flex w-full items-center gap-1.5 rounded-lg border border-border p-0.5 sm:w-auto">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              aria-label="Semaine précédente"
              onClick={() => setCurrentWeekOffset((o) => o - 1)}
            >
              <ChevronLeftIcon className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-9 flex-1 px-2.5 text-xs font-medium sm:flex-none"
              onClick={() => setCurrentWeekOffset(0)}
            >
              Aujourd&apos;hui
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              aria-label="Semaine suivante"
              onClick={() => setCurrentWeekOffset((o) => o + 1)}
            >
              <ChevronRightIcon className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3">
            {weekDates.map((date) => {
              const isToday = date.toDateString() === new Date().toDateString()
              
              // Filter entries for this specific day
              const dayEntries = timeEntries.filter(
                (e) => new Date(e.date).toDateString() === date.toDateString()
              )
              const totalSec = dayEntries.reduce((sum, e) => sum + e.durationSec, 0)
              const hours = totalSec / 3600
              
              // Calculate percent of a standard 8-hour day
              const percent = Math.min((hours / 8) * 100, 100)

              return (
                <button
                  key={date.toISOString()}
                  onClick={() => {
                    setManualEntryDay(date)
                    if (projects.length > 0) setManualProjId(projects[0].id)
                  }}
                  className={cn(
                    "flex flex-col items-stretch p-3 rounded-lg border text-left transition-colors duration-200 group relative overflow-hidden bg-background hover:bg-accent/40",
                    isToday ? "border-primary ring-1 ring-primary" : "border-border"
                  )}
                >
                  <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                    {date.toLocaleDateString("fr-FR", { weekday: "short" })}
                  </span>
                  <span className="text-lg font-black tracking-tight text-foreground my-0.5">
                    {date.getDate()}
                  </span>
                  <span className="text-xs font-mono font-semibold text-primary mt-1">
                    {hours > 0 ? `${hours.toFixed(1)}h` : "0.0h"}
                  </span>

                  {/* Progressive visual bar indicating time logging ratio */}
                  <div className="w-full h-1 bg-muted rounded-full mt-3 overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-colors",
                        hours >= 8 ? "bg-success" : hours > 0 ? "bg-primary" : "bg-transparent"
                      )}
                      style={{ width: `${percent}%` }}
                    />
                  </div>

                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-accent p-0.5 rounded">
                    <Plus className="h-3 w-3 text-muted-foreground" />
                  </div>
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Detailed Entries List */}
      <div className="border rounded-lg bg-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
          <h2 className="font-semibold text-sm flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Historique des entrées
          </h2>
          <Button variant="outline" size="sm" className="gap-2" onClick={handleExportEntries}>
            <Download className="h-4 w-4" />
            Exporter
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Projet / Client</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Durée</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {timeEntries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-12 text-center text-sm text-muted-foreground">
                  Aucune entrée enregistrée. Lancez le chronomètre ou cliquez sur un jour ci-dessus !
                </TableCell>
              </TableRow>
            ) : (
              timeEntries.map((entry) => (
                <TableRow key={entry.id} className="hover:bg-muted/30 transition-colors">
                  <TableCell className="text-sm text-muted-foreground capitalize">
                    {formatDate(entry.date)}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium text-sm text-foreground">{entry.project.name}</span>
                      <span className="text-xs text-muted-foreground uppercase tracking-wide">
                        {entry.project.client.name}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                    {entry.description ?? <span className="italic text-xs text-muted-foreground/60">Sans description</span>}
                  </TableCell>
                  <TableCell className="font-mono font-bold text-sm">
                    {formatDuration(entry.durationSec)}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-muted" aria-label="Ouvrir les actions de la saisie de temps">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-popover text-popover-foreground border">
                        <DropdownMenuItem onClick={() => setEditTarget(entry)} className="gap-2">
                          <Edit3 className="h-3.5 w-3.5" />
                          Éditer
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-danger hover:text-danger focus:text-danger gap-2"
                          onClick={() => handleDelete(entry.id)}
                        >
                          <Trash className="h-3.5 w-3.5" />
                          Supprimer
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Manual log entry Dialog */}
      {manualEntryDay && (
        <Dialog open onOpenChange={(o) => !o && setManualEntryDay(null)}>
          <DialogContent className="bg-popover border text-popover-foreground">
            <DialogHeader>
              <DialogTitle className="text-base font-bold">
                Imputer du temps le {manualEntryDay.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateManual} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="manualProj" className="text-xs font-semibold">Projet</Label>
                <select
                  id="manualProj"
                  value={manualProjId}
                  onChange={(e) => setManualProjId(e.target.value)}
                  className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-primary focus:border-primary outline-none"
                  required
                >
                  <option value="">Sélectionner un projet…</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.client.name})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="manualHours" className="text-xs font-semibold">Heures</Label>
                  <Input 
                    id="manualHours" 
                    type="number" 
                    min="0" 
                    value={manualHours} 
                    onChange={(e) => setManualHours(e.target.value)} 
                    className="bg-background border-border"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="manualMinutes" className="text-xs font-semibold">Minutes</Label>
                  <Input 
                    id="manualMinutes" 
                    type="number" 
                    min="0" 
                    max="59" 
                    value={manualMinutes} 
                    onChange={(e) => setManualMinutes(e.target.value)} 
                    className="bg-background border-border"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="manualDesc" className="text-xs font-semibold">Description</Label>
                <Input 
                  id="manualDesc" 
                  value={manualDesc} 
                  onChange={(e) => setManualDesc(e.target.value)} 
                  placeholder="Qu'avez-vous fait ?"
                  className="bg-background border-border"
                />
              </div>

              <div className="flex items-center space-x-2 pt-1">
                <input
                  type="checkbox"
                  id="manualBillable"
                  checked={manualBillable}
                  onChange={(e) => setManualBillable(e.target.checked)}
                  className="rounded border-input text-primary focus:ring-primary h-4 w-4 bg-background"
                />
                <Label htmlFor="manualBillable" className="text-xs select-none">Cette entrée est facturable au client</Label>
              </div>

              <DialogFooter>
                <DialogClose render={<Button type="button" variant="outline" />}>Annuler</DialogClose>
                <Button type="submit" disabled={saving}>{saving ? "…" : "Enregistrer"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* Edit Entry Dialog */}
      {editTarget && (
        <EditTimeEntryDialog
          entry={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            setEditTarget(null)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}

function EditTimeEntryDialog({
  entry,
  onClose,
  onSaved,
}: {
  entry: TimeEntry
  onClose: () => void
  onSaved: () => void
}) {
  const [pending, setPending] = React.useState(false)
  const initialH = Math.floor(entry.durationSec / 3600)
  const initialM = Math.floor((entry.durationSec % 3600) / 60)
  const [hours, setHours] = React.useState(initialH.toString())
  const [minutes, setMinutes] = React.useState(initialM.toString())
  const [description, setDescription] = React.useState(entry.description ?? "")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    try {
      const durationSec = (Number(hours) || 0) * 3600 + (Number(minutes) || 0) * 60
      if (durationSec <= 0) {
        toast.error("Durée invalide.")
        return
      }
      await updateTimeEntry(entry.id, { durationSec, description })
      toast.success("Entrée mise à jour.")
      onSaved()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-popover border text-popover-foreground">
        <DialogHeader>
          <DialogTitle>Éditer l&apos;entrée de temps</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="hours">Heures</Label>
              <Input id="hours" type="number" min="0" value={hours} onChange={(e) => setHours(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="minutes">Minutes</Label>
              <Input id="minutes" type="number" min="0" max="59" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="desc">Description</Label>
            <Input id="desc" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Annuler</DialogClose>
            <Button type="submit" disabled={pending}>{pending ? "…" : "Enregistrer"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
