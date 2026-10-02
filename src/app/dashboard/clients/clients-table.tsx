"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { ArrowDownAZ, ArrowUpAZ, Building2, Columns3, Download, Mail, MoreHorizontal, Plus, Search, SlidersHorizontal, User, X } from "lucide-react"

import { deleteClient } from "@/actions/clients"
import { useConfirm } from "@/components/shared/confirm-provider"
import { EmptyState } from "@/components/shared/empty-state"
import { ListToolbar } from "@/components/shared/list-toolbar"
import { getClientDirectory } from "@/actions/directories"
import { useDirectory } from "@/hooks/use-directory"
import { type DirectoryQuery } from "@/lib/directory-query"
import { DirectoryPagination } from "@/components/shared/directory-pagination"
import { PageHeader } from "@/components/shared/page-header"
import { SavedViewBar } from "@/components/shared/saved-view-bar"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { ClientFormDialog } from "./client-form-dialog"

type Client = {
  id: string
  name: string
  type: string
  siret?: string | null
  tvaNumber?: string | null
  address?: string | null
  totalRevenueCents: number
  totalUnpaidCents: number
  relationScore: number
  contacts: Array<{ firstName: string; lastName: string; email?: string | null }>
  propertyValues: Record<string, unknown>
}

type PropertyDefinition = {
  id: string
  key: string
  label: string
  type: string
  groupName: string
  options: unknown
}

type SavedView = Awaited<ReturnType<typeof import("@/actions/views").getSavedViews>>[number]
type ListFilter = DirectoryQuery["filters"][number]
type SortConfig = { field: string; direction: "asc" | "desc" }

const BUILTIN_COLUMNS = [
  { id: "type", label: "Type", type: "SELECT" },
  { id: "revenue", label: "CA total", type: "CURRENCY" },
  { id: "unpaid", label: "Impayé", type: "CURRENCY" },
  { id: "relation", label: "Score relation", type: "NUMBER" },
] as const

const OPERATOR_LABELS: Record<string, string> = {
  contains: "contient",
  equals: "est égal à",
  not_equals: "est différent de",
  greater_than: "est supérieur à",
  less_than: "est inférieur à",
  is_empty: "n’est pas renseigné",
  is_not_empty: "est renseigné",
}

function formatEuro(cents: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100)
}

function propertyOptions(definition: PropertyDefinition) {
  return Array.isArray(definition.options)
    ? definition.options.flatMap((option) => option && typeof option === "object" && "value" in option && "label" in option ? [{ value: String(option.value), label: String(option.label) }] : [])
    : []
}

function propertyValueLabel(definition: PropertyDefinition, value: unknown) {
  if (value == null || value === "" || (Array.isArray(value) && !value.length)) return "—"
  const options = propertyOptions(definition)
  const option = (item: unknown) => options.find((candidate) => candidate.value === String(item))?.label || String(item)
  if (definition.type === "BOOLEAN") return value === true ? "Oui" : "Non"
  if (definition.type === "CURRENCY" && typeof value === "number") return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(value)
  if (definition.type === "NUMBER" && typeof value === "number") return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 4 }).format(value)
  if (definition.type === "DATE" && typeof value === "string") return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${value}T12:00:00.000Z`))
  if (Array.isArray(value)) return value.map(option).join(", ")
  if (definition.type === "SELECT") return option(value)
  return String(value)
}

function clientFieldValue(client: Client, field: string) {
  if (field === "type") return client.type
  if (field === "revenue") return client.totalRevenueCents / 100
  if (field === "unpaid") return client.totalUnpaidCents / 100
  if (field === "relation") return client.relationScore
  return client.propertyValues[field] ?? null
}

function operatorsFor(type: string): ListFilter["operator"][] {
  if (["NUMBER", "CURRENCY", "DATE"].includes(type)) return ["equals", "greater_than", "less_than", "is_empty", "is_not_empty"]
  if (["BOOLEAN", "SELECT"].includes(type)) return ["equals", "not_equals", "is_empty", "is_not_empty"]
  return ["contains", "equals", "not_equals", "is_empty", "is_not_empty"]
}

function parseSavedFilters(value: unknown): ListFilter[] {
  if (typeof value !== "string") return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.flatMap((item) => item && typeof item === "object" && typeof item.id === "string" && typeof item.field === "string" && typeof item.operator === "string" && typeof item.value === "string" ? [item as ListFilter] : []) : []
  } catch {
    return []
  }
}

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`
}

export function ClientsTable({
  clients,
  propertyDefinitions,
  savedViews,
  initial,
}: {
  clients: Client[]
  propertyDefinitions: PropertyDefinition[]
  savedViews: SavedView[]
  initial: { data: Awaited<ReturnType<typeof getClientDirectory>>; query: import("@/lib/directory-query").DirectoryQuery }
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const confirmDialog = useConfirm()
  const directory = useDirectory("clients", getClientDirectory, initial)
  const { search, filters, sort } = directory.state
  const setSearch = (search: string) => { setSelected(new Set()); directory.update({ search }) }
  const setFilters = (next: ListFilter[] | ((current: ListFilter[]) => ListFilter[])) => { setSelected(new Set()); directory.update({ filters: typeof next === "function" ? next(filters) : next }) }
  const setSort = (next: SortConfig | ((current: SortConfig) => SortConfig)) => { setSelected(new Set()); directory.update({ sort: typeof next === "function" ? next(sort) : next }) }
  const visibleColumns = directory.state.columns
  const setVisibleColumns = (next: string[] | ((current: string[]) => string[])) => directory.update({ columns: typeof next === "function" ? next(visibleColumns) : next, page: directory.state.page })
  const [exporting, setExporting] = React.useState(false)
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [createOpen, setCreateOpen] = React.useState(() => searchParams.get("create") === "1")
  const [editTarget, setEditTarget] = React.useState<Client | null>(null)

  const fields = React.useMemo(() => [
    { id: "name", label: "Nom du client", type: "TEXT", options: [] as Array<{ value: string; label: string }> },
    ...BUILTIN_COLUMNS.map((column) => ({ ...column, options: column.id === "type" ? [{ value: "ENTERPRISE", label: "Entreprise" }, { value: "INDIVIDUAL", label: "Particulier" }] : [] })),
    ...propertyDefinitions.map((definition) => ({ id: definition.id, label: definition.label, type: definition.type, options: propertyOptions(definition) })),
  ], [propertyDefinitions])

  const columnDefinitions = React.useMemo(() => new Map(propertyDefinitions.map((definition) => [definition.id, definition])), [propertyDefinitions])
  const filtered = directory.data?.rows ?? clients
  const total = directory.data?.total ?? clients.length

  const selectedVisible = filtered.length > 0 && filtered.every((client) => selected.has(client.id))

  async function handleDelete(id: string, name: string) {
    if (!await confirmDialog({ title: `Supprimer « ${name} » ?`, description: "Cette action est irréversible.", confirmLabel: "Supprimer", destructive: true })) return
    try {
      await deleteClient(id)
      toast.success("Client supprimé.")
      router.refresh()
      void directory.refetch()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erreur lors de la suppression.")
    }
  }

  function addFilter() {
    setFilters((current) => [...current, { id: crypto.randomUUID(), field: "name", operator: "contains", value: "" }])
  }

  function applySavedView(config: SavedView["config"]) {
    const savedFilters = config.filters as Record<string, unknown> | undefined
    const savedSort = config.sort as { field?: unknown; direction?: unknown } | undefined
    directory.update({
      search: typeof config.search === "string" ? config.search : "",
      filters: parseSavedFilters(savedFilters?.custom),
      ...(savedSort && typeof savedSort.field === "string" && ["asc", "desc"].includes(String(savedSort.direction)) ? { sort: { field: savedSort.field, direction: savedSort.direction as "asc" | "desc" } } : {}),
      ...(Array.isArray(config.columns) ? { columns: config.columns.filter((column): column is string => typeof column === "string") } : {}),
      page: 1,
    })
    setSelected(new Set())
  }

  async function exportCsv() {
    const rows: Client[] = []
    try {
      if (selected.size) rows.push(...filtered.filter((client) => selected.has(client.id)))
      else {
        let page = 1
        do {
          const result = await getClientDirectory({ ...directory.state, page })
          if (!result) throw new Error("Accès à la liste indisponible.")
          rows.push(...result.rows)
          if (rows.length >= result.total || result.rows.length === 0) break
          page++
        } while (true)
      }
    } catch { toast.error("Impossible d’exporter les clients. Réessayez."); return }
    if (!rows.length) return toast.error("Aucun client à exporter.")
    const columns = visibleColumns.map((columnId) => BUILTIN_COLUMNS.find((column) => column.id === columnId) || columnDefinitions.get(columnId)).filter(Boolean) as Array<{ id: string; label: string }>
    const lines = [
      ["Client", "Contact principal", ...columns.map((column) => column.label)].map(csvCell).join(";"),
      ...rows.map((client) => {
        const primary = client.contacts[0]
        return [
          client.name,
          primary ? `${primary.firstName} ${primary.lastName}` : "",
          ...columns.map((column) => {
            const value = clientFieldValue(client, column.id)
            if (column.id === "revenue" || column.id === "unpaid") return String(value ?? "")
            const definition = columnDefinitions.get(column.id)
            return definition ? propertyValueLabel(definition, value) : String(value ?? "")
          }),
        ].map(csvCell).join(";")
      }),
    ]
    const blob = new Blob([`\uFEFF${lines.join("\n")}`], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `clients-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
    toast.success(`${rows.length} client(s) exporté(s).`)
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Clients" description="Vos relations clients, leurs coordonnées et leur activité." actions={<Button demoMutation onClick={() => setCreateOpen(true)}><Plus />Ajouter un client</Button>} />
      <SavedViewBar resource="CLIENTS" views={savedViews} config={{ search, filters: { custom: JSON.stringify(filters) }, sort, columns: visibleColumns }} onApply={applySavedView} />

      <ListToolbar>
        <div className="relative min-w-52 flex-1 sm:max-w-sm"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Rechercher dans les clients" placeholder="Nom, contact, e-mail, SIRET…" className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
        <div className="flex max-w-full shrink-0 flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={addFilter}><SlidersHorizontal />Ajouter un filtre{filters.length ? <Badge variant="secondary" className="ml-1">{filters.length}</Badge> : null}</Button>
          <Select value={sort.field} onValueChange={(field) => field && setSort((current) => ({ ...current, field }))}><SelectTrigger aria-label="Trier les clients" className="w-[190px]"><SelectValue /></SelectTrigger><SelectContent>{fields.map((field) => <SelectItem key={field.id} value={field.id}>{field.label}</SelectItem>)}</SelectContent></Select>
          <Button type="button" variant="outline" size="icon" onClick={() => setSort((current) => ({ ...current, direction: current.direction === "asc" ? "desc" : "asc" }))} aria-label={sort.direction === "asc" ? "Tri croissant" : "Tri décroissant"} title={sort.direction === "asc" ? "Tri croissant" : "Tri décroissant"}>{sort.direction === "asc" ? <ArrowDownAZ /> : <ArrowUpAZ />}</Button>
          <DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="outline"><Columns3 />Colonnes</Button></DropdownMenuTrigger><DropdownMenuContent align="start" className="w-64"><DropdownMenuLabel>Colonnes affichées</DropdownMenuLabel>{[...BUILTIN_COLUMNS, ...propertyDefinitions].map((column) => <DropdownMenuCheckboxItem key={column.id} checked={visibleColumns.includes(column.id)} onCheckedChange={(checked) => setVisibleColumns((current) => checked ? [...new Set([...current, column.id])] : current.filter((id) => id !== column.id))}>{column.label}</DropdownMenuCheckboxItem>)}</DropdownMenuContent></DropdownMenu>
          <Button type="button" variant="outline" disabled={exporting || directory.isFetching} onClick={async () => { setExporting(true); try { await exportCsv() } finally { setExporting(false) } }}><Download />{exporting ? "Export en cours…" : selected.size ? `Exporter (${selected.size})` : "Exporter"}</Button>
        </div>
        </ListToolbar>

      {filters.length ? <div className="workspace-panel space-y-2 bg-muted/25 p-3">{filters.map((filter) => {
        const field = fields.find((candidate) => candidate.id === filter.field) || fields[0]
        const operators = operatorsFor(field.type)
        const needsValue = !["is_empty", "is_not_empty"].includes(filter.operator)
        return <div key={filter.id} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_180px_minmax(0,1fr)_40px]">
          <Select value={filter.field} onValueChange={(nextField) => { if (!nextField) return; const nextType = fields.find((candidate) => candidate.id === nextField)?.type || "TEXT"; setFilters((current) => current.map((item) => item.id === filter.id ? { ...item, field: nextField, operator: operatorsFor(nextType)[0], value: "" } : item)) }}><SelectTrigger aria-label="Propriété à filtrer"><SelectValue /></SelectTrigger><SelectContent>{fields.map((candidate) => <SelectItem key={candidate.id} value={candidate.id}>{candidate.label}</SelectItem>)}</SelectContent></Select>
          <Select value={filter.operator} onValueChange={(operator) => operator && setFilters((current) => current.map((item) => item.id === filter.id ? { ...item, operator: operator as ListFilter["operator"] } : item))}><SelectTrigger aria-label="Opérateur du filtre"><SelectValue /></SelectTrigger><SelectContent>{operators.map((operator) => <SelectItem key={operator} value={operator}>{OPERATOR_LABELS[operator]}</SelectItem>)}</SelectContent></Select>
          {needsValue ? <FilterValueControl field={field} value={filter.value} onChange={(value) => setFilters((current) => current.map((item) => item.id === filter.id ? { ...item, value } : item))} /> : <div />}
          <Button type="button" variant="ghost" size="icon" onClick={() => setFilters((current) => current.filter((item) => item.id !== filter.id))} aria-label="Supprimer le filtre"><X /></Button>
        </div>
      })}</div> : null}

      {selected.size ? <div className="flex items-center justify-between rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm"><span><strong>{selected.size}</strong> client(s) sélectionné(s)</span><Button type="button" variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Effacer la sélection</Button></div> : null}

      <ClientFormDialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) void directory.refetch() }} />
      {editTarget ? <ClientFormDialog client={editTarget} open={Boolean(editTarget)} onOpenChange={(open) => { if (!open) { setEditTarget(null); void directory.refetch() } }} /> : null}

      <div className="workspace-panel overflow-hidden">
        <Table className="clients-table">
          <TableHeader><TableRow><TableHead className="w-12"><Checkbox aria-label="Sélectionner tous les clients visibles" aria-checked={!selectedVisible && selected.size > 0 && filtered.some((client) => selected.has(client.id)) ? "mixed" : selectedVisible} checked={selectedVisible} onCheckedChange={(checked) => setSelected((current) => { const next = new Set(current); for (const client of filtered) { if (checked === true) next.add(client.id); else next.delete(client.id) } return next })} /></TableHead><TableHead className="min-w-[240px]">Nom / Contact</TableHead>{visibleColumns.map((columnId) => <TableHead key={columnId} data-column={columnId} className={["revenue", "unpaid"].includes(columnId) ? "text-right" : undefined}>{BUILTIN_COLUMNS.find((column) => column.id === columnId)?.label || columnDefinitions.get(columnId)?.label || columnId}</TableHead>)}<TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
          <TableBody>
            {!filtered.length ? <TableRow><TableCell colSpan={visibleColumns.length + 3} className="p-0 whitespace-normal"><EmptyState compact icon={User} title={!clients.length ? "Aucun client enregistré" : "Aucun client dans cette vue"} description={!clients.length ? "Ajoutez votre premier client pour relier contacts, chantiers et documents." : "Modifiez les filtres ou la recherche pour élargir la vue."} action={!clients.length ? <Button demoMutation size="sm" onClick={() => setCreateOpen(true)}><Plus />Ajouter un client</Button> : <Button size="sm" variant="outline" onClick={() => { setSearch(""); setFilters([]) }}>Réinitialiser</Button>} /></TableCell></TableRow> : filtered.map((client) => {
              const primary = client.contacts[0]
              return <TableRow key={client.id} data-state={selected.has(client.id) ? "selected" : undefined}>
                <TableCell><Checkbox aria-label={`Sélectionner ${client.name}`} checked={selected.has(client.id)} onCheckedChange={(checked) => setSelected((current) => { const next = new Set(current); if (checked === true) next.add(client.id); else next.delete(client.id); return next })} /></TableCell>
                <TableCell><Link href={`/dashboard/clients/${client.id}`} className="flex items-center gap-3"><Avatar className="size-9 border"><AvatarFallback className="bg-primary/5 text-xs text-primary">{client.name.slice(0, 2).toUpperCase()}</AvatarFallback></Avatar><span className="min-w-0"><span className="block whitespace-normal font-medium hover:underline">{client.name}</span>{primary ? <span className="block truncate text-xs text-muted-foreground">{primary.firstName} {primary.lastName}{primary.email ? ` · ${primary.email}` : ""}</span> : null}<span className="mt-1 block text-xs text-muted-foreground sm:hidden">{client.type === "INDIVIDUAL" ? "Particulier" : "Entreprise"}{client.totalUnpaidCents > 0 ? ` · À encaisser : ${formatEuro(client.totalUnpaidCents)}` : ""}</span></span></Link></TableCell>
                {visibleColumns.map((columnId) => <ClientColumn key={columnId} columnId={columnId} client={client} definition={columnDefinitions.get(columnId)} />)}
                <TableCell className="text-right"><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Ouvrir les actions du client"><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuLabel>Actions</DropdownMenuLabel>{primary?.email ? <DropdownMenuItem demoMutation onClick={() => window.open(`mailto:${primary.email}`)}><Mail />Envoyer un e-mail</DropdownMenuItem> : null}<DropdownMenuItem onClick={() => router.push(`/dashboard/clients/${client.id}`)}>Ouvrir la fiche</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem demoMutation onClick={() => setEditTarget(client)}>Modifier</DropdownMenuItem><DropdownMenuItem demoMutation variant="destructive" onClick={() => handleDelete(client.id, client.name)}>Supprimer</DropdownMenuItem></DropdownMenuContent></DropdownMenu></TableCell>
              </TableRow>
            })}
          </TableBody>
        </Table>
      </div>
      <DirectoryPagination total={total} page={directory.data?.page ?? directory.state.page} pending={directory.isFetching} error={directory.isError} onPage={(page) => { setSelected(new Set()); directory.update({ page }) }} onRetry={() => { void directory.refetch() }} />
    </div>
  )
}

function FilterValueControl({ field, value, onChange }: { field: { type: string; options: Array<{ value: string; label: string }> }; value: string; onChange: (value: string) => void }) {
  if (field.options.length) return <Select value={value || "unset"} onValueChange={(next) => onChange(next === "unset" ? "" : next || "")}><SelectTrigger aria-label="Valeur du filtre"><SelectValue placeholder="Choisir…" /></SelectTrigger><SelectContent><SelectItem value="unset">Choisir…</SelectItem>{field.options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select>
  if (field.type === "BOOLEAN") return <Select value={value || "unset"} onValueChange={(next) => onChange(next === "unset" ? "" : next || "")}><SelectTrigger aria-label="Valeur du filtre"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unset">Choisir…</SelectItem><SelectItem value="true">Oui</SelectItem><SelectItem value="false">Non</SelectItem></SelectContent></Select>
  return <Input aria-label="Valeur du filtre" type={["NUMBER", "CURRENCY"].includes(field.type) ? "number" : field.type === "DATE" ? "date" : "text"} value={value} onChange={(event) => onChange(event.target.value)} placeholder="Valeur…" />
}

function ClientColumn({ columnId, client, definition }: { columnId: string; client: Client; definition?: PropertyDefinition }) {
  if (columnId === "type") return <TableCell data-column={columnId}><Badge variant="secondary" className="font-normal"><Building2 />{client.type === "INDIVIDUAL" ? "Particulier" : "Entreprise"}</Badge></TableCell>
  if (columnId === "revenue") return <TableCell data-column={columnId} className="text-right font-medium tabular-nums">{formatEuro(client.totalRevenueCents)}</TableCell>
  if (columnId === "unpaid") return <TableCell data-column={columnId} className={cn("text-right font-medium tabular-nums", client.totalUnpaidCents > 0 ? "text-danger" : "text-muted-foreground")}>{formatEuro(client.totalUnpaidCents)}</TableCell>
  if (columnId === "relation") return <TableCell data-column={columnId}><div className="flex items-center gap-2"><div className="h-1.5 w-14 overflow-hidden rounded-full bg-muted"><div className={cn("h-full", client.relationScore > 80 ? "bg-success" : client.relationScore > 60 ? "bg-warning" : "bg-danger")} style={{ width: `${client.relationScore}%` }} /></div><span className="text-xs font-medium">{client.relationScore}%</span></div></TableCell>
  const label = definition ? propertyValueLabel(definition, client.propertyValues[columnId]) : "—"
  return <TableCell data-column={columnId} className="max-w-[240px] truncate" title={label}>{label}</TableCell>
}
