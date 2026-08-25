"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { createProject, updateProject } from "@/actions/projets"
import type { ProjectTemplateOption } from "./project-template-dialog"

type Project = {
  id: string
  name: string
  description?: string | null
  status: string
  budgetCents: number
  clientId: string
  projectTemplateId?: string | null
  worksiteType?: string | null
  startDate?: Date | string | null
  endDate?: Date | string | null
}

type ClientOption = { id: string; name: string }

function emptyProjectForm() {
  return { clientId: "", projectTemplateId: "", name: "", description: "", worksiteType: "", startDate: "", endDate: "", budget: "", status: "ACTIVE" }
}

export function ProjectFormDialog({
  project,
  clients,
  templates,
  open,
  onOpenChange,
}: {
  project?: Project
  clients: ClientOption[]
  templates: ProjectTemplateOption[]
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const router = useRouter()
  const [pending, setPending] = React.useState(false)
  const [form, setForm] = React.useState({
    clientId: project?.clientId ?? "",
    projectTemplateId: project?.projectTemplateId ?? "",
    name: project?.name ?? "",
    description: project?.description ?? "",
    worksiteType: project?.worksiteType ?? "",
    startDate: project?.startDate ? new Date(project.startDate).toISOString().slice(0, 10) : "",
    endDate: project?.endDate ? new Date(project.endDate).toISOString().slice(0, 10) : "",
    budget: project ? (project.budgetCents / 100).toString() : "",
    status: project?.status ?? "ACTIVE",
  })

  React.useEffect(() => {
    if (open && project) {
      setForm({
        clientId: project.clientId,
        projectTemplateId: project.projectTemplateId ?? "",
        name: project.name,
        description: project.description ?? "",
        worksiteType: project.worksiteType ?? "",
        startDate: project.startDate ? new Date(project.startDate).toISOString().slice(0, 10) : "",
        endDate: project.endDate ? new Date(project.endDate).toISOString().slice(0, 10) : "",
        budget: (project.budgetCents / 100).toString(),
        status: project.status,
      })
    } else if (open && !project) setForm(emptyProjectForm())
  }, [open, project])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.clientId) {
      toast.error("Sélectionnez un client.")
      return
    }
    setPending(true)
    try {
      const payload = {
        clientId: form.clientId,
        projectTemplateId: form.projectTemplateId,
        name: form.name,
        description: form.description,
        worksiteType: form.worksiteType,
        startDate: form.startDate,
        endDate: form.endDate,
        budgetCents: Math.round(Number(form.budget || 0) * 100),
        status: form.status as "ACTIVE" | "COMPLETED" | "ARCHIVED",
      }
      if (project) {
        await updateProject(project.id, payload)
        toast.success("Projet mis à jour.")
      } else {
        await createProject(payload)
        toast.success("Projet créé.")
      }
      onOpenChange(false)
      router.refresh()
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de l'enregistrement.")
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{project ? "Éditer le projet" : "Nouveau projet"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Client *</Label>
            <Select value={form.clientId} onValueChange={(v) => setForm({ ...form, clientId: v ?? "" })}>
              <SelectTrigger aria-label="Client du projet">
                <SelectValue placeholder="Sélectionner un client…" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {!project && templates.some((template) => template.active) ? (
            <div className="space-y-1.5">
              <Label htmlFor="project-template">Modèle de chantier</Label>
              <select id="project-template" value={form.projectTemplateId} onChange={(event) => {
                const template = templates.find((item) => item.id === event.target.value)
                setForm({ ...form, projectTemplateId: event.target.value, worksiteType: template?.worksiteType || form.worksiteType, budget: template?.defaultBudgetCents ? (template.defaultBudgetCents / 100).toString() : form.budget })
              }} className="h-10 w-full rounded-[10px] border bg-background px-3 text-sm">
                <option value="">Projet libre</option>
                {templates.filter((template) => template.active).map((template) => <option key={template.id} value={template.id}>{template.name} · {template.steps.length} étapes</option>)}
              </select>
              <p className="text-xs text-muted-foreground">Les étapes, dates et dépendances sont instanciées à la création.</p>
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="name">Nom *</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="worksiteType">Type de chantier</Label>
            <Input id="worksiteType" value={form.worksiteType} onChange={(e) => setForm({ ...form, worksiteType: e.target.value })} placeholder="Installation, SAV, rénovation…" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label htmlFor="projectStartDate">Début prévu</Label><Input id="projectStartDate" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></div>
            <div className="space-y-1.5"><Label htmlFor="projectEndDate">Fin prévue</Label><Input id="projectEndDate" type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="budget">Budget (€)</Label>
            <Input
              id="budget"
              type="number"
              min="0"
              step="0.01"
              value={form.budget}
              onChange={(e) => setForm({ ...form, budget: e.target.value })}
            />
          </div>
          {project && (
            <div className="space-y-1.5">
              <Label>Statut</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v ?? "ACTIVE" })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">En cours</SelectItem>
                  <SelectItem value="COMPLETED">Terminé</SelectItem>
                  <SelectItem value="ARCHIVED">Archivé</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Annuler</DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "…" : project ? "Enregistrer" : "Créer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
