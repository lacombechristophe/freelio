"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Plus, Trash2, Workflow } from "lucide-react"
import { toast } from "sonner"

import { createProjectTemplate, setProjectTemplateActive } from "@/actions/projets"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export type ProjectTemplateOption = {
  id: string
  name: string
  description?: string | null
  worksiteType?: string | null
  defaultBudgetCents: number
  defaultDurationDays: number
  active: boolean
  steps: Array<{ id: string; title: string; kind: string; offsetDays: number; durationDays: number; order: number; dependsOnStepId?: string | null; dependsOnStep?: { id: string; title: string } | null }>
  _count: { projects: number }
}

type DraftStep = { title: string; kind: "MILESTONE" | "TASK" | "CHECKPOINT"; offsetDays: string; durationDays: string; dependsOnIndex: string }

const emptyStep = (): DraftStep => ({ title: "", kind: "MILESTONE", offsetDays: "0", durationDays: "1", dependsOnIndex: "-1" })

export function ProjectTemplateDialog({ open, onOpenChange, templates }: { open: boolean; onOpenChange: (open: boolean) => void; templates: ProjectTemplateOption[] }) {
  const router = useRouter()
  const [pending, setPending] = React.useState(false)
  const [name, setName] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [worksiteType, setWorksiteType] = React.useState("INSTALLATION")
  const [budget, setBudget] = React.useState("")
  const [durationDays, setDurationDays] = React.useState("30")
  const [steps, setSteps] = React.useState<DraftStep[]>([emptyStep()])

  function updateStep(index: number, patch: Partial<DraftStep>) {
    setSteps((current) => current.map((step, stepIndex) => stepIndex === index ? { ...step, ...patch } : step))
  }

  function removeStep(index: number) {
    setSteps((current) => current
      .filter((_, stepIndex) => stepIndex !== index)
      .map((step) => {
        const dependency = Number(step.dependsOnIndex)
        if (dependency === index) return { ...step, dependsOnIndex: "-1" }
        if (dependency > index) return { ...step, dependsOnIndex: String(dependency - 1) }
        return step
      }))
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    try {
      await createProjectTemplate({
        name,
        description,
        worksiteType,
        defaultBudgetCents: Math.round(Number(budget || 0) * 100),
        defaultDurationDays: Number(durationDays || 0),
        steps: steps.map((step) => ({ ...step, offsetDays: Number(step.offsetDays), durationDays: Number(step.durationDays), dependsOnIndex: Number(step.dependsOnIndex) })),
      })
      toast.success("Modèle de chantier créé.")
      setName("")
      setDescription("")
      setBudget("")
      setSteps([emptyStep()])
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Création impossible.")
    } finally {
      setPending(false)
    }
  }

  async function toggle(template: ProjectTemplateOption) {
    setPending(true)
    try {
      await setProjectTemplateActive(template.id, !template.active)
      toast.success(template.active ? "Modèle désactivé." : "Modèle réactivé.")
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Mise à jour impossible.")
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Modèles de chantier</DialogTitle>
        </DialogHeader>

        {templates.length ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {templates.map((template) => (
              <div key={template.id} className="rounded-xl border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><p className="truncate text-sm font-semibold">{template.name}</p><p className="mt-1 text-xs text-muted-foreground">{template.steps.length} étape{template.steps.length > 1 ? "s" : ""} · {template.defaultDurationDays} j · {template._count.projects} chantier{template._count.projects > 1 ? "s" : ""}</p></div>
                  <Badge variant={template.active ? "secondary" : "outline"}>{template.active ? "Actif" : "Inactif"}</Badge>
                </div>
                <ol className="mt-3 space-y-1 text-xs text-muted-foreground">{template.steps.slice(0, 5).map((step) => <li key={step.id}>{step.order + 1}. {step.title}{step.dependsOnStep ? ` ← ${step.dependsOnStep.title}` : ""}</li>)}</ol>
                <Button type="button" size="sm" variant="ghost" className="mt-3" disabled={pending} onClick={() => toggle(template)}>{template.active ? "Désactiver" : "Réactiver"}</Button>
              </div>
            ))}
          </div>
        ) : null}

        <form onSubmit={submit} className="space-y-5 border-t pt-5">
          <div className="flex items-center gap-2"><Workflow className="size-4 text-primary" /><h3 className="text-sm font-semibold">Nouveau modèle</h3></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="template-name">Nom</Label><Input id="template-name" value={name} onChange={(event) => setName(event.target.value)} required /></div>
            <div className="space-y-1.5"><Label htmlFor="template-type">Type de chantier</Label><Input id="template-type" value={worksiteType} onChange={(event) => setWorksiteType(event.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="template-budget">Budget par défaut (€)</Label><Input id="template-budget" type="number" min="0" step="0.01" value={budget} onChange={(event) => setBudget(event.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="template-duration">Durée globale (jours)</Label><Input id="template-duration" type="number" min="0" max="730" value={durationDays} onChange={(event) => setDurationDays(event.target.value)} required /></div>
          </div>
          <div className="space-y-1.5"><Label htmlFor="template-description">Description</Label><Input id="template-description" value={description} onChange={(event) => setDescription(event.target.value)} /></div>

          <div className="overflow-hidden rounded-xl border">
            <div className="border-b bg-muted/45 px-4 py-3 text-xs font-semibold">Étapes et dépendances</div>
            <div className="divide-y">
              {steps.map((step, index) => (
                <div key={index} className="grid gap-3 p-4 lg:grid-cols-[minmax(180px,1fr)_140px_90px_90px_minmax(150px,0.8fr)_36px] lg:items-end">
                  <div className="space-y-1.5"><Label htmlFor={`template-step-${index}`}>Étape {index + 1}</Label><Input id={`template-step-${index}`} value={step.title} onChange={(event) => updateStep(index, { title: event.target.value })} required /></div>
                  <label className="space-y-1.5 text-sm font-medium">Type<select aria-label={`Type de l’étape ${index + 1}`} value={step.kind} onChange={(event) => updateStep(index, { kind: event.target.value as DraftStep["kind"] })} className="mt-1 h-10 w-full rounded-[10px] border bg-background px-3 text-sm"><option value="MILESTONE">Jalon</option><option value="TASK">Tâche</option><option value="CHECKPOINT">Contrôle</option></select></label>
                  <div className="space-y-1.5"><Label htmlFor={`template-offset-${index}`}>Début J+</Label><Input id={`template-offset-${index}`} type="number" min="0" value={step.offsetDays} onChange={(event) => updateStep(index, { offsetDays: event.target.value })} required /></div>
                  <div className="space-y-1.5"><Label htmlFor={`template-step-duration-${index}`}>Durée</Label><Input id={`template-step-duration-${index}`} type="number" min="0" value={step.durationDays} onChange={(event) => updateStep(index, { durationDays: event.target.value })} required /></div>
                  <label className="space-y-1.5 text-sm font-medium">Prérequis<select aria-label={`Prérequis de l’étape ${index + 1}`} value={step.dependsOnIndex} onChange={(event) => updateStep(index, { dependsOnIndex: event.target.value })} className="mt-1 h-10 w-full rounded-[10px] border bg-background px-3 text-sm"><option value="-1">Aucun</option>{steps.slice(0, index).map((candidate, candidateIndex) => <option key={candidateIndex} value={candidateIndex}>{candidate.title || `Étape ${candidateIndex + 1}`}</option>)}</select></label>
                  <Button type="button" size="icon-sm" variant="ghost" aria-label={`Supprimer l’étape ${index + 1}`} disabled={steps.length === 1} onClick={() => removeStep(index)}><Trash2 className="text-danger" /></Button>
                </div>
              ))}
            </div>
            <div className="border-t p-3"><Button type="button" size="sm" variant="outline" onClick={() => setSteps((current) => [...current, emptyStep()])}><Plus />Ajouter une étape</Button></div>
          </div>

          <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Fermer</Button><Button type="submit" disabled={pending}>{pending ? "Création…" : "Créer le modèle"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
