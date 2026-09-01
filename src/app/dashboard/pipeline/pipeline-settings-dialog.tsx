"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { ArrowDown, ArrowUp, Check, GitBranch, Plus, Settings2, Star, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { createPipeline, deletePipeline, setDefaultPipeline, updatePipeline } from "@/actions/pipeline"
import { useConfirm } from "@/components/shared/confirm-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type Stage = { id: string; title: string }
type PipelineSummary = {
  id: string
  name: string
  isDefault: boolean
  opportunityCount: number
}

function newStageId() {
  return `CUSTOM_${crypto.randomUUID().replaceAll("-", "").slice(0, 16).toUpperCase()}`
}

export function PipelineSettingsDialog({
  open,
  onOpenChange,
  pipeline,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  pipeline: {
    id: string
    name: string
    isDefault: boolean
    stages: Stage[]
    pipelines: PipelineSummary[]
  }
}) {
  const router = useRouter()
  const confirm = useConfirm()
  const [mode, setMode] = React.useState<"edit" | "create">("edit")
  const [name, setName] = React.useState(pipeline.name)
  const [stages, setStages] = React.useState<Stage[]>(pipeline.stages)
  const [pending, setPending] = React.useState(false)
  const currentSummary = pipeline.pipelines.find((item) => item.id === pipeline.id)

  const reset = React.useCallback(() => {
    setMode("edit")
    setName(pipeline.name)
    setStages(pipeline.stages)
  }, [pipeline.name, pipeline.stages])

  React.useEffect(() => {
    if (open) reset()
  }, [open, reset])

  function startCreation() {
    setMode("create")
    setName("")
    setStages(pipeline.stages.map((stage) => ({ ...stage })))
  }

  function moveStage(index: number, offset: -1 | 1) {
    const destination = index + offset
    if (destination < 0 || destination >= stages.length) return
    setStages((current) => {
      const next = [...current]
      const [stage] = next.splice(index, 1)
      next.splice(destination, 0, stage)
      return next
    })
  }

  function removeStage(stageId: string) {
    setStages((current) => current.filter((stage) => stage.id !== stageId))
  }

  async function saveConfiguration() {
    setPending(true)
    try {
      if (mode === "create") {
        const created = await createPipeline({ name, stages })
        toast.success("Pipeline créé.")
        onOpenChange(false)
        router.replace(`/dashboard/pipeline?pipeline=${encodeURIComponent(created.id)}`)
      } else {
        await updatePipeline(pipeline.id, { name, stages })
        toast.success("Pipeline mis à jour.")
        onOpenChange(false)
        router.refresh()
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible d’enregistrer le pipeline.")
    } finally {
      setPending(false)
    }
  }

  async function makeDefault() {
    setPending(true)
    try {
      await setDefaultPipeline(pipeline.id)
      toast.success("Pipeline défini par défaut.")
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible de modifier le pipeline par défaut.")
    } finally {
      setPending(false)
    }
  }

  async function removePipeline() {
    const accepted = await confirm({
      title: "Supprimer ce pipeline ?",
      description: currentSummary?.opportunityCount
        ? "Ce pipeline contient des opportunités et ne peut pas être supprimé."
        : "Cette action supprime la configuration du pipeline. Les autres pipelines restent intacts.",
      confirmLabel: "Supprimer",
      destructive: true,
    })
    if (!accepted) return
    setPending(true)
    try {
      const result = await deletePipeline(pipeline.id)
      toast.success("Pipeline supprimé.")
      onOpenChange(false)
      router.replace(`/dashboard/pipeline?pipeline=${encodeURIComponent(result.fallbackId)}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible de supprimer le pipeline.")
    } finally {
      setPending(false)
    }
  }

  const isCreation = mode === "create"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <div className="mb-1 flex size-10 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
            <Settings2 className="size-4" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle>{isCreation ? "Créer un pipeline" : "Configurer le pipeline"}</DialogTitle>
            {!isCreation && pipeline.isDefault ? <Badge variant="secondary"><Star className="size-3 fill-current" />Par défaut</Badge> : null}
          </div>
          <DialogDescription>
            Personnalisez le cycle de vente sans casser l’historique. Les étapes contenant des opportunités sont protégées contre la suppression.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="pipeline-name">Nom du pipeline</Label>
              <Input
                id="pipeline-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Ex. Vente piscines neuves"
                maxLength={100}
                autoFocus={isCreation}
              />
            </div>
            {!isCreation ? (
              <div className="flex flex-wrap gap-2">
                {!pipeline.isDefault ? (
                  <Button type="button" variant="outline" onClick={makeDefault} disabled={pending}>
                    <Star className="size-4" />Définir par défaut
                  </Button>
                ) : null}
                <Button type="button" variant="outline" onClick={startCreation} disabled={pending}>
                  <Plus className="size-4" />Nouveau
                </Button>
              </div>
            ) : null}
          </div>

          <div className="overflow-hidden rounded-xl border">
            <div className="flex items-center justify-between border-b bg-muted/45 px-4 py-3">
              <div>
                <p className="font-semibold">Étapes commerciales</p>
                <p className="text-xs text-muted-foreground">L’ordre défini ici devient celui du tableau.</p>
              </div>
              <Badge variant="outline" className="font-mono tabular-nums">{stages.length}/15</Badge>
            </div>
            <div className="divide-y">
              {stages.map((stage, index) => {
                const protectedStage = stage.id === "WON"
                return (
                  <div key={stage.id} className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5 sm:px-4">
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
                    <div className="space-y-1">
                      <Label htmlFor={`stage-${stage.id}`} className="sr-only">Nom de l’étape {index + 1}</Label>
                      <Input
                        id={`stage-${stage.id}`}
                        value={stage.title}
                        onChange={(event) => setStages((current) => current.map((item) => item.id === stage.id ? { ...item, title: event.target.value } : item))}
                        maxLength={120}
                      />
                      {protectedStage ? <p className="flex items-center gap-1 text-[11px] text-muted-foreground"><Check className="size-3 text-success" />Issue gagnée conservée pour les statistiques</p> : null}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button type="button" variant="ghost" size="icon" onClick={() => moveStage(index, -1)} disabled={pending || index === 0} aria-label={`Monter l’étape ${stage.title}`} title="Monter">
                        <ArrowUp className="size-4" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" onClick={() => moveStage(index, 1)} disabled={pending || index === stages.length - 1} aria-label={`Descendre l’étape ${stage.title}`} title="Descendre">
                        <ArrowDown className="size-4" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeStage(stage.id)} disabled={pending || protectedStage || stages.length <= 2} aria-label={`Supprimer l’étape ${stage.title}`} title={protectedStage ? "Étape système protégée" : "Supprimer"} className="text-muted-foreground hover:text-danger">
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="border-t bg-muted/25 p-3 sm:px-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setStages((current) => [...current, { id: newStageId(), title: "Nouvelle étape" }])}
                disabled={pending || stages.length >= 15}
              >
                <Plus className="size-4" />Ajouter une étape
              </Button>
            </div>
          </div>

          {!isCreation ? (
            <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <GitBranch className="size-4" />
                <span><strong className="font-semibold text-foreground">{currentSummary?.opportunityCount ?? 0}</strong> opportunité(s) dans ce pipeline</span>
              </div>
              <Button
                type="button"
                variant="ghost"
                onClick={removePipeline}
                disabled={pending || pipeline.pipelines.length <= 1 || Boolean(currentSummary?.opportunityCount)}
                title={currentSummary?.opportunityCount ? "Déplacez ou supprimez d’abord les opportunités" : undefined}
                className="justify-start text-danger hover:bg-danger/10 hover:text-danger"
              >
                <Trash2 className="size-4" />Supprimer le pipeline
              </Button>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          {isCreation ? (
            <Button type="button" variant="outline" onClick={reset} disabled={pending}>Retour</Button>
          ) : (
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Annuler</Button>
          )}
          <Button type="button" onClick={saveConfiguration} disabled={pending || name.trim().length < 2 || stages.some((stage) => !stage.title.trim())}>
            {pending ? "Enregistrement…" : isCreation ? "Créer le pipeline" : "Enregistrer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
