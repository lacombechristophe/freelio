"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Briefcase, CalendarDays, MoreHorizontal, Plus, Search, Workflow } from "lucide-react"
import { toast } from "sonner"

import { archiveProject, deleteProject } from "@/actions/projets"
import { EmptyState } from "@/components/shared/empty-state"
import { useConfirm } from "@/components/shared/confirm-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { ProjectFormDialog } from "./project-form-dialog"
import { ProjectTemplateDialog, type ProjectTemplateOption } from "./project-template-dialog"

type Project = {
  id: string
  name: string
  description?: string | null
  status: string
  budgetCents: number
  consumedCents: number
  startDate?: Date | string | null
  endDate?: Date | string | null
  clientId: string
  agencyId?: string | null
  agency?: { id: string; name: string; code: string } | null
  projectTemplateId?: string | null
  worksiteType?: string | null
  client: { id: string; name: string }
}

const filters = ["ALL", "ACTIVE", "COMPLETED", "ARCHIVED"] as const

const statusConfig: Record<string, { label: string; className: string }> = {
  ACTIVE: { label: "En cours", className: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300" },
  COMPLETED: { label: "Terminé", className: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300" },
  ARCHIVED: { label: "Archivé", className: "border-border bg-muted text-muted-foreground" },
}

function formatEuro(cents: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100)
}

function formatDate(value?: Date | string | null) {
  if (!value) return null
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value))
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Action impossible."
}

export function ProjetsGrid({
  projects,
  clients,
  templates,
  agencies,
}: {
  projects: Project[]
  clients: Array<{ id: string; name: string }>
  templates: ProjectTemplateOption[]
  agencies: Array<{ id: string; name: string; code: string; isDefault: boolean }>
}) {
  const router = useRouter()
  const confirmDialog = useConfirm()
  const [filter, setFilter] = React.useState<(typeof filters)[number]>("ALL")
  const [query, setQuery] = React.useState("")
  const [createOpen, setCreateOpen] = React.useState(false)
  const [templatesOpen, setTemplatesOpen] = React.useState(false)
  const [editTarget, setEditTarget] = React.useState<Project | null>(null)

  const filtered = React.useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("fr")
    return projects.filter((project) => {
      const matchesStatus = filter === "ALL" || project.status === filter
      const searchable = [project.name, project.client.name, project.agency?.name, project.worksiteType]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("fr")
      return matchesStatus && (!normalizedQuery || searchable.includes(normalizedQuery))
    })
  }, [filter, projects, query])

  async function handleArchive(id: string) {
    try {
      await archiveProject(id)
      toast.success("Projet archivé.")
      router.refresh()
    } catch (error: unknown) {
      toast.error(errorMessage(error))
    }
  }

  async function handleDelete(id: string, name: string) {
    const confirmed = await confirmDialog({
      title: `Supprimer « ${name} » ?`,
      description: "Cette action est irréversible.",
      confirmLabel: "Supprimer",
      destructive: true,
    })
    if (!confirmed) return

    try {
      await deleteProject(id)
      toast.success("Projet supprimé.")
      router.refresh()
    } catch (error: unknown) {
      toast.error(errorMessage(error))
    }
  }

  function projectActions(project: Project) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Actions pour ${project.name}`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => router.push(`/dashboard/projets/${project.id}`)}>Ouvrir le chantier</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setEditTarget(project)}>Modifier</DropdownMenuItem>
          <DropdownMenuItem onClick={() => router.push(`/dashboard/temps?project=${project.id}`)}>Ajouter du temps</DropdownMenuItem>
          <DropdownMenuSeparator />
          {project.status !== "ARCHIVED" && <DropdownMenuItem onClick={() => handleArchive(project.id)}>Archiver</DropdownMenuItem>}
          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => handleDelete(project.id, project.name)}>Supprimer</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  return (
    <div className="space-y-4">
      <div className="workspace-panel flex flex-col gap-3 p-3 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1 lg:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Rechercher un chantier, un client, une agence…"
            aria-label="Rechercher un chantier"
            className="pl-9"
          />
        </div>
        <div className="flex max-w-full gap-1 overflow-x-auto rounded-lg border bg-muted/25 p-1" aria-label="Filtrer les chantiers">
          {filters.map((status) => (
            <Button
              key={status}
              variant={filter === status ? "secondary" : "ghost"}
              size="sm"
              aria-pressed={filter === status}
              onClick={() => setFilter(status)}
            >
              {status === "ALL" ? "Tous" : statusConfig[status]?.label ?? status}
            </Button>
          ))}
        </div>
        <span className="hidden text-xs text-muted-foreground xl:inline" aria-live="polite">{filtered.length} résultat{filtered.length > 1 ? "s" : ""}</span>
        <Button variant="outline" onClick={() => setTemplatesOpen(true)}><Workflow />Modèles</Button>
        <Button onClick={() => setCreateOpen(true)}><Plus />Nouveau chantier</Button>
      </div>

      <ProjectTemplateDialog open={templatesOpen} onOpenChange={setTemplatesOpen} templates={templates} />
      <ProjectFormDialog open={createOpen} onOpenChange={setCreateOpen} clients={clients} templates={templates} agencies={agencies} />
      {editTarget && (
        <ProjectFormDialog
          open={Boolean(editTarget)}
          onOpenChange={(open) => !open && setEditTarget(null)}
          clients={clients}
          templates={templates}
          agencies={agencies}
          project={editTarget}
        />
      )}

      {filtered.length === 0 ? (
        <div className="workspace-panel">
          <EmptyState
            icon={Briefcase}
            title={projects.length === 0 ? "Aucun chantier actif" : "Aucun chantier dans cette vue"}
            description={projects.length === 0 ? "Créez un premier chantier pour relier un client, un site, un budget et les documents opérationnels." : "Modifiez la recherche ou le filtre pour retrouver un chantier."}
            action={<Button onClick={() => setCreateOpen(true)}><Plus />Créer un chantier</Button>}
          />
        </div>
      ) : (
        <>
          <div className="workspace-panel hidden overflow-hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Chantier et client</TableHead>
                  <TableHead>Agence</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Budget consommé</TableHead>
                  <TableHead>Période</TableHead>
                  <TableHead className="w-12"><span className="sr-only">Actions</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((project) => {
                  const status = statusConfig[project.status] ?? statusConfig.ACTIVE
                  const usagePercent = project.budgetCents > 0 ? Math.round(project.consumedCents / project.budgetCents * 100) : 0
                  const startsAt = formatDate(project.startDate)
                  const endsAt = formatDate(project.endDate)
                  return (
                    <TableRow key={project.id}>
                      <TableCell className="min-w-64">
                        <Link href={`/dashboard/projets/${project.id}`} className="group block w-fit max-w-full rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                          <span className="block truncate font-semibold group-hover:text-primary">{project.name}</span>
                          <span className="mt-0.5 block truncate text-xs text-muted-foreground">{project.client.name}{project.worksiteType ? ` · ${project.worksiteType}` : ""}</span>
                        </Link>
                      </TableCell>
                      <TableCell>{project.agency ? <><span className="font-medium">{project.agency.name}</span><span className="ml-2 text-xs text-muted-foreground">{project.agency.code}</span></> : <span className="text-muted-foreground">Non affectée</span>}</TableCell>
                      <TableCell><Badge variant="outline" className={cn("font-medium", status.className)}>{status.label}</Badge></TableCell>
                      <TableCell className="min-w-52">
                        <div className="flex items-baseline justify-between gap-3 text-xs">
                          <span className="font-semibold tabular-nums">{formatEuro(project.consumedCents)}</span>
                          <span className={cn("tabular-nums text-muted-foreground", usagePercent > 90 && "text-destructive")}>{usagePercent} % sur {formatEuro(project.budgetCents)}</span>
                        </div>
                        <Progress value={Math.min(100, usagePercent)} className={cn("mt-2 h-1.5", usagePercent > 90 && "[&>div]:bg-destructive")} />
                      </TableCell>
                      <TableCell>
                        <span className="flex items-center gap-2 text-xs"><CalendarDays className="size-3.5 text-muted-foreground" />{startsAt || endsAt ? `${startsAt || "À planifier"} — ${endsAt || "En cours"}` : "À planifier"}</span>
                      </TableCell>
                      <TableCell>{projectActions(project)}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          <div className="space-y-3 md:hidden">
            {filtered.map((project) => {
              const status = statusConfig[project.status] ?? statusConfig.ACTIVE
              const usagePercent = project.budgetCents > 0 ? Math.round(project.consumedCents / project.budgetCents * 100) : 0
              return (
                <Card key={project.id} className="overflow-hidden shadow-none">
                  <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 pb-3">
                    <Link href={`/dashboard/projets/${project.id}`} className="min-w-0 flex-1 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <span className="block truncate font-semibold">{project.name}</span>
                      <span className="mt-1 block truncate text-xs text-muted-foreground">{project.client.name}{project.agency ? ` · ${project.agency.name}` : ""}</span>
                    </Link>
                    {projectActions(project)}
                  </CardHeader>
                  <CardContent className="space-y-3 border-t pt-4">
                    <div className="flex items-center justify-between gap-3"><Badge variant="outline" className={cn("font-medium", status.className)}>{status.label}</Badge><span className={cn("text-xs tabular-nums text-muted-foreground", usagePercent > 90 && "text-destructive")}>{usagePercent} % consommé</span></div>
                    <Progress value={Math.min(100, usagePercent)} className={cn("h-1.5", usagePercent > 90 && "[&>div]:bg-destructive")} />
                    <div className="flex justify-between text-sm"><span><span className="block text-xs text-muted-foreground">Consommé</span><span className="font-semibold tabular-nums">{formatEuro(project.consumedCents)}</span></span><span className="text-right"><span className="block text-xs text-muted-foreground">Budget</span><span className="font-semibold tabular-nums">{formatEuro(project.budgetCents)}</span></span></div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
