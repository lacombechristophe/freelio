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

type Project = {
  id: string
  name: string
  description?: string | null
  status: string
  budgetCents: number
  clientId: string
}

type ClientOption = { id: string; name: string }

export function ProjectFormDialog({
  project,
  clients,
  open,
  onOpenChange,
}: {
  project?: Project
  clients: ClientOption[]
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const router = useRouter()
  const [pending, setPending] = React.useState(false)
  const [form, setForm] = React.useState({
    clientId: project?.clientId ?? "",
    name: project?.name ?? "",
    description: project?.description ?? "",
    budget: project ? (project.budgetCents / 100).toString() : "",
    status: project?.status ?? "ACTIVE",
  })

  React.useEffect(() => {
    if (open && project) {
      setForm({
        clientId: project.clientId,
        name: project.name,
        description: project.description ?? "",
        budget: (project.budgetCents / 100).toString(),
        status: project.status,
      })
    }
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
        name: form.name,
        description: form.description,
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
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner un client…" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
