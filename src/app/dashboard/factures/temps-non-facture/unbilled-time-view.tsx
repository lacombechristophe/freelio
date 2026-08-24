"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  Filter,
  Receipt,
  Timer,
} from "lucide-react"

import { createInvoiceFromTimeEntries } from "@/actions/factures"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { formatCentsToEuro } from "@/lib/billing"
import { cn } from "@/lib/utils"

type UnbilledTimeData = {
  defaultHourlyRateCents: number
  totalDurationSec: number
  estimatedTotalCents: number
  entries: Array<{
    id: string
    date: string
    durationSec: number
    description: string | null
    project: {
      id: string
      name: string
      clientId: string
      client: { id: string; name: string }
    }
  }>
}

function inputDate(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-")
}

function addDays(date: Date, days: number) {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

function formatDuration(seconds: number) {
  const totalMinutes = Math.round(seconds / 60)
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return `${h}h${m.toString().padStart(2, "0")}`
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

function computeAmount(durationSec: number, hourlyRateCents: number) {
  return Math.round((durationSec / 3600) * hourlyRateCents)
}

function euroToCents(value: string) {
  const normalized = value.replace(/\s/g, "").replace(",", ".")
  const number = Number(normalized)
  return Number.isFinite(number) ? Math.round(number * 100) : 0
}

function centsToEuroInput(cents: number) {
  return (cents / 100).toFixed(2)
}

export function UnbilledTimeView({ data }: { data: UnbilledTimeData }) {
  const router = useRouter()
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(() => new Set())
  const [clientFilter, setClientFilter] = React.useState("ALL")
  const [projectFilter, setProjectFilter] = React.useState("ALL")
  const [hourlyRate, setHourlyRate] = React.useState(centsToEuroInput(data.defaultHourlyRateCents))
  const [dueDate, setDueDate] = React.useState(inputDate(addDays(new Date(), 30)))
  const [object, setObject] = React.useState("")
  const [lineMode, setLineMode] = React.useState<"GROUP_BY_PROJECT" | "DETAIL">("GROUP_BY_PROJECT")
  const [pending, setPending] = React.useState(false)

  const hourlyRateCents = euroToCents(hourlyRate)
  const clients = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const entry of data.entries) {
      map.set(entry.project.client.id, entry.project.client.name)
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [data.entries])

  const projects = React.useMemo(() => {
    const map = new Map<string, { id: string; name: string; clientId: string; clientName: string }>()
    for (const entry of data.entries) {
      if (clientFilter !== "ALL" && entry.project.client.id !== clientFilter) continue
      map.set(entry.project.id, {
        id: entry.project.id,
        name: entry.project.name,
        clientId: entry.project.client.id,
        clientName: entry.project.client.name,
      })
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [clientFilter, data.entries])

  const visibleEntries = React.useMemo(() => {
    return data.entries.filter((entry) => {
      if (clientFilter !== "ALL" && entry.project.client.id !== clientFilter) return false
      if (projectFilter !== "ALL" && entry.project.id !== projectFilter) return false
      return true
    })
  }, [clientFilter, data.entries, projectFilter])

  const selectedEntries = React.useMemo(
    () => data.entries.filter((entry) => selectedIds.has(entry.id)),
    [data.entries, selectedIds]
  )

  const selectedDurationSec = selectedEntries.reduce((sum, entry) => sum + entry.durationSec, 0)
  const selectedAmountCents = computeAmount(selectedDurationSec, hourlyRateCents)
  const selectedClientIds = new Set(selectedEntries.map((entry) => entry.project.client.id))
  const selectedProjectIds = new Set(selectedEntries.map((entry) => entry.project.id))
  const hasMultipleClients = selectedClientIds.size > 1
  const canGenerate = selectedEntries.length > 0 && !hasMultipleClients && hourlyRateCents > 0 && !!dueDate && !pending

  function toggleEntry(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  function selectVisible() {
    setSelectedIds((current) => {
      const next = new Set(current)
      for (const entry of visibleEntries) next.add(entry.id)
      return next
    })
  }

  async function handleCreateInvoice() {
    if (!canGenerate) return
    setPending(true)
    try {
      const invoice = await createInvoiceFromTimeEntries({
        timeEntryIds: Array.from(selectedIds),
        hourlyRateCents,
        dueDate,
        object: object.trim() || undefined,
        lineMode,
      })
      toast.success("Facture brouillon créée depuis les temps.")
      router.push(`/dashboard/factures/${invoice.id}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erreur lors de la création de la facture.")
    } finally {
      setPending(false)
    }
  }

  if (data.entries.length === 0) {
    return (
      <Card>
        <CardContent className="flex min-h-[320px] flex-col items-center justify-center gap-4 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-success/10 text-success">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Aucun temps facturable en attente</h2>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              Les entrées facturables non rattachées à une facture apparaîtront ici.
            </p>
          </div>
          <Link href="/dashboard/temps">
            <Button variant="outline" className="gap-2">
              <Timer className="h-4 w-4" />
              Aller au suivi des temps
            </Button>
          </Link>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <MetricCard
            label="Temps en attente"
            value={formatDuration(data.totalDurationSec)}
            detail={`${data.entries.length} entrée(s) facturables`}
            icon={Clock}
          />
          <MetricCard
            label="Potentiel HT"
            value={formatCentsToEuro(data.estimatedTotalCents)}
            detail={`au taux ${formatCentsToEuro(data.defaultHourlyRateCents)}/h`}
            icon={Receipt}
          />
          <MetricCard
            label="Sélection"
            value={formatCentsToEuro(selectedAmountCents)}
            detail={`${selectedEntries.length} entrée(s), ${formatDuration(selectedDurationSec)}`}
            icon={FileText}
          />
        </div>

        <Card>
          <CardHeader className="border-b pb-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-primary" />
                  Entrées facturables
                </CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  Sélectionnez des temps d’un seul client pour créer une facture brouillon.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={selectVisible}>
                  Sélectionner visible
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
                  Vider
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            <div className="grid gap-3 md:grid-cols-2">
              <FieldSelect
                label="Client"
                value={clientFilter}
                onChange={(value) => {
                  setClientFilter(value)
                  setProjectFilter("ALL")
                }}
              >
                <option value="ALL">Tous les clients</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>{client.name}</option>
                ))}
              </FieldSelect>
              <FieldSelect label="Projet" value={projectFilter} onChange={setProjectFilter}>
                <option value="ALL">Tous les projets</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name} - {project.clientName}
                  </option>
                ))}
              </FieldSelect>
            </div>

            {visibleEntries.length === 0 ? (
              <div className="rounded-lg border border-dashed bg-background/50 px-4 py-10 text-center text-sm text-muted-foreground">
                Aucun temps ne correspond à ces filtres.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <div className="min-w-[720px]">
                  <div className="grid grid-cols-[42px_minmax(0,1fr)_120px_130px] border-b bg-muted/40 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <span />
                    <span>Travail</span>
                    <span>Durée</span>
                    <span className="text-right">Montant HT</span>
                  </div>
                  <div className="divide-y">
                    {visibleEntries.map((entry) => {
                      const checked = selectedIds.has(entry.id)
                      return (
                        <label
                          key={entry.id}
                          className={cn(
                            "grid cursor-pointer grid-cols-[42px_minmax(0,1fr)_120px_130px] items-center px-3 py-3 transition-colors hover:bg-muted/30",
                            checked && "bg-primary/5"
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleEntry(entry.id)}
                            className="h-4 w-4"
                          />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold">
                              {entry.description || "Temps de développement"}
                            </span>
                            <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                              <span>{formatDate(entry.date)}</span>
                              <span>{entry.project.name}</span>
                              <Badge variant="outline" className="h-4 px-1.5 text-xs">
                                {entry.project.client.name}
                              </Badge>
                            </span>
                          </span>
                          <span className="text-sm font-mono">{formatDuration(entry.durationSec)}</span>
                          <span className="text-right text-sm font-bold tabular-nums">
                            {formatCentsToEuro(computeAmount(entry.durationSec, hourlyRateCents))}
                          </span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
        <Card>
          <CardHeader className="border-b pb-4">
            <CardTitle>Créer la facture</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border bg-background/60 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Durée</p>
                <p className="mt-1 text-xl font-black">{formatDuration(selectedDurationSec)}</p>
              </div>
              <div className="rounded-lg border bg-background/60 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total HT</p>
                <p className="mt-1 text-xl font-black">{formatCentsToEuro(selectedAmountCents)}</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="hourly-rate">Taux horaire HT (€)</Label>
              <Input
                id="hourly-rate"
                inputMode="decimal"
                value={hourlyRate}
                onChange={(event) => setHourlyRate(event.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="due-date">Échéance</Label>
              <Input
                id="due-date"
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="line-mode">Lignes de facture</Label>
              <select
                id="line-mode"
                value={lineMode}
                onChange={(event) => setLineMode(event.target.value as "GROUP_BY_PROJECT" | "DETAIL")}
                className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm outline-none focus:border-primary"
              >
                <option value="GROUP_BY_PROJECT">Regrouper par projet</option>
                <option value="DETAIL">Une ligne par entrée</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="invoice-object">Objet optionnel</Label>
              <Input
                id="invoice-object"
                value={object}
                onChange={(event) => setObject(event.target.value)}
                placeholder="Ex : Pose, réglages et contrôle de fin de chantier"
              />
            </div>

            <div className="space-y-2 rounded-lg border bg-background/60 p-3 text-xs text-muted-foreground">
              <p>{selectedEntries.length} entrée(s) sélectionnée(s)</p>
              <p>{selectedClientIds.size} client(s), {selectedProjectIds.size} projet(s)</p>
              {hasMultipleClients && (
                <p className="flex items-start gap-2 text-danger">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Sélectionnez un seul client pour générer une facture.
                </p>
              )}
              {hourlyRateCents <= 0 && (
                <p className="text-danger">Le taux horaire doit être supérieur à 0.</p>
              )}
            </div>

            <Button className="w-full gap-2" disabled={!canGenerate} onClick={handleCreateInvoice}>
              <Receipt className="h-4 w-4" />
              {pending ? "Création…" : "Créer la facture brouillon"}
            </Button>
          </CardContent>
        </Card>
      </aside>
    </div>
  )
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string
  value: string
  detail: string
  icon: React.ElementType
}) {
  return (
    <Card size="sm">
      <CardContent className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="mt-1 text-xl font-black tabular-nums">{value}</p>
          <p className="mt-1 truncate text-xs text-muted-foreground">{detail}</p>
        </div>
      </CardContent>
    </Card>
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
