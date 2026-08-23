"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Plus, MoreHorizontal, Briefcase } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { ProjectFormDialog } from "./project-form-dialog"
import { archiveProject, deleteProject } from "@/actions/projets"
import { useConfirm } from "@/components/shared/confirm-provider"
import { EmptyState } from "@/components/shared/empty-state"

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
  client: { id: string; name: string }
}

function formatEuro(cents: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100)
}

const statusConfig: Record<string, { label: string; class: string }> = {
  ACTIVE: { label: "En cours", class: "bg-success/10 text-success border-success/20" },
  COMPLETED: { label: "Terminé", class: "bg-primary/10 text-primary border-primary/20" },
  ARCHIVED: { label: "Archivé", class: "bg-muted text-muted-foreground border-transparent" },
}

export function ProjetsGrid({
  projects,
  clients,
}: {
  projects: Project[]
  clients: Array<{ id: string; name: string }>
}) {
  const router = useRouter()
  const confirmDialog = useConfirm()
  const [filter, setFilter] = React.useState<string>("ALL")
  const [createOpen, setCreateOpen] = React.useState(false)
  const [editTarget, setEditTarget] = React.useState<Project | null>(null)

  const filtered = filter === "ALL" ? projects : projects.filter((p) => p.status === filter)

  async function handleArchive(id: string) {
    try {
      await archiveProject(id)
      toast.success("Projet archivé.")
      router.refresh()
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur.")
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!(await confirmDialog({
      title: `Supprimer "${name}" ?`,
      description: "Cette action est irréversible.",
      confirmLabel: "Supprimer",
      destructive: true,
    }))) return
    try {
      await deleteProject(id)
      toast.success("Projet supprimé.")
      router.refresh()
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur.")
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex max-w-full gap-2 overflow-x-auto pb-1 sm:pb-0">
          {["ALL", "ACTIVE", "COMPLETED", "ARCHIVED"].map((s) => (
            <Button
              key={s}
              variant={filter === s ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(s)}
            >
              {s === "ALL" ? "Tous" : statusConfig[s]?.label ?? s}
            </Button>
          ))}
        </div>
        <Button className="w-full gap-2 sm:ml-auto sm:w-auto" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          Nouveau Projet
        </Button>
      </div>

      <ProjectFormDialog open={createOpen} onOpenChange={setCreateOpen} clients={clients} />
      {editTarget && (
        <ProjectFormDialog
          open={!!editTarget}
          onOpenChange={(o) => !o && setEditTarget(null)}
          clients={clients}
          project={editTarget}
        />
      )}

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-card">
          <EmptyState
            icon={Briefcase}
            title={projects.length === 0 ? "Aucune mission active" : "Aucun projet dans cette vue"}
            description={projects.length === 0 ? "Créez une première mission pour relier un client, un budget, du temps et vos prochains documents." : "Changez de filtre ou ajoutez un nouveau projet dans cette catégorie."}
            action={<Button onClick={() => setCreateOpen(true)}><Plus />Créer une mission</Button>}
          />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((project) => {
            const status = statusConfig[project.status] ?? statusConfig.ACTIVE
            const progress = project.budgetCents > 0
              ? Math.min(100, Math.round((project.consumedCents / project.budgetCents) * 100))
              : 0

            return (
              <Card key={project.id} className="transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-[0_12px_30px_rgba(16,24,40,0.08)]">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/dashboard/projets/${project.id}`} className="space-y-1 flex-1 min-w-0 hover:opacity-80">
                      <CardTitle className="text-base font-bold truncate">{project.name}</CardTitle>
                      <p className="text-sm text-muted-foreground truncate">{project.client.name}</p>
                    </Link>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge className={cn("text-xs uppercase font-bold border px-2 py-0.5", status.class)}>
                        {status.label}
                      </Badge>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Ouvrir les actions du projet">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => router.push(`/dashboard/projets/${project.id}`)}>
                            Voir le projet
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setEditTarget(project)}>Éditer</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => router.push(`/dashboard/temps?project=${project.id}`)}>
                            Ajouter du temps
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {project.status !== "ARCHIVED" && (
                            <DropdownMenuItem onClick={() => handleArchive(project.id)}>
                              Archiver
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            className="text-danger"
                            onClick={() => handleDelete(project.id, project.name)}
                          >
                            Supprimer
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Budget consommé</span>
                      <span className={cn("font-bold", progress > 90 ? "text-danger" : "text-foreground")}>
                        {progress}%
                      </span>
                    </div>
                    <Progress
                      value={progress}
                      className={cn("h-1.5", progress > 90 ? "[&>div]:bg-danger" : "")}
                    />
                  </div>
                  <div className="flex justify-between text-xs">
                    <div>
                      <p className="text-muted-foreground uppercase font-bold tracking-wider text-xs">Consommé</p>
                      <p className="font-bold">{formatEuro(project.consumedCents)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-muted-foreground uppercase font-bold tracking-wider text-xs">Budget</p>
                      <p className="font-bold">{formatEuro(project.budgetCents)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
