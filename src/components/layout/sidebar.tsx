"use client"

import * as React from "react"
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Pause,
  Play,
  RotateCcw,
  Save,
} from "lucide-react"
import { toast } from "sonner"

import { createTimeEntry } from "@/actions/temps"
import { getProjects } from "@/actions/projets"
import { AppBrand, type WorkspaceBrand } from "@/components/shared/app-brand"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useTimerStore } from "@/store/timer-store"
import { DashboardNavigationMenu } from "./dashboard-navigation-menu"

function formatTimer(seconds: number) {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainingSeconds = seconds % 60
  return [hours, minutes, remainingSeconds]
    .map((value) => value.toString().padStart(2, "0"))
    .join(":")
}

export function Sidebar({ brand }: { brand: WorkspaceBrand }) {
  const [isCollapsed, setIsCollapsed] = React.useState(false)
  const [projectsList, setProjectsList] = React.useState<Array<{ id: string; name: string }>>([])
  const [saving, setSaving] = React.useState(false)
  const {
    isRunning,
    elapsed,
    projectId,
    tick,
    startTimer,
    stopTimer,
    resetTimer,
    setProject,
  } = useTimerStore()

  React.useEffect(() => {
    if (!isRunning) return
    const interval = window.setInterval(tick, 1000)
    return () => window.clearInterval(interval)
  }, [isRunning, tick])

  React.useEffect(() => {
    getProjects(undefined, 100)
      .then((projects) => setProjectsList((projects ?? []).map(({ id, name }) => ({ id, name }))))
      .catch(() => {})
  }, [])

  async function handleSave() {
    if (elapsed < 60) {
      toast.error("Veuillez enregistrer au moins 1 minute.")
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
        description: "Enregistrement Chronomètre global",
      })
      toast.success("Temps enregistré avec succès.")
      resetTimer()
      window.location.reload()
    } catch {
      toast.error("Erreur lors de l'enregistrement du temps.")
    } finally {
      setSaving(false)
    }
  }

  function toggleTimer() {
    if (isRunning) {
      stopTimer()
      return
    }
    if (!projectId) {
      toast.error("Sélectionnez un projet avant de lancer le chronomètre.")
      return
    }
    startTimer(projectId)
  }

  return (
    <div
      className={cn(
        "relative flex h-full flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200 ease-out",
        isCollapsed ? "w-[76px]" : "w-[264px]"
      )}
    >
      <div className={cn("flex h-16 shrink-0 items-center border-b border-sidebar-border", isCollapsed ? "justify-center px-2" : "px-5")}>
        <AppBrand brand={brand} compact={isCollapsed} />
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4"><DashboardNavigationMenu collapsed={isCollapsed} /></div>

      <div className="border-t border-sidebar-border p-3">
        {isCollapsed ? (
          <div className="flex items-center justify-center pb-2">
            <button
              type="button"
              onClick={() => {
                if (isRunning) stopTimer()
                else if (projectId) startTimer(projectId)
                else if (projectsList[0]) startTimer(projectsList[0].id)
                else toast.error("Aucun projet disponible pour le chronomètre.")
              }}
              className={cn(
                "flex size-10 items-center justify-center rounded-[10px] border border-border bg-card text-muted-foreground transition-colors hover:bg-accent hover:text-primary",
                isRunning && "border-primary/30 bg-accent text-primary"
              )}
              title={isRunning ? `Suspendre le chronomètre (${formatTimer(elapsed)})` : "Démarrer le chronomètre"}
              aria-label={isRunning ? `Suspendre le chronomètre à ${formatTimer(elapsed)}` : "Démarrer le chronomètre"}
            >
              <Clock className="size-[18px]" />
            </button>
          </div>
        ) : (
          <div className="mb-2 space-y-3 rounded-xl border border-border bg-card p-3 shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-xs font-semibold text-foreground">
                <span className={cn("size-2 rounded-full bg-[#98a2b3]", isRunning && "bg-success shadow-[0_0_0_4px_rgba(5,150,105,0.12)]")} />
                Chronomètre
              </span>
              <span className="text-[10px] text-muted-foreground">{isRunning ? "En cours" : "En pause"}</span>
            </div>

            <div className="font-mono text-[22px] font-semibold tabular-nums text-foreground">
              {formatTimer(elapsed)}
            </div>

            <select
              aria-label="Projet du chronomètre"
              value={projectId}
              onChange={(event) => setProject(event.target.value)}
              className="h-9 w-full rounded-[9px] border border-input bg-background px-2.5 text-xs text-foreground outline-none focus:border-primary focus:ring-3 focus:ring-ring/20"
              disabled={saving}
            >
              <option value="">Sélectionner un projet…</option>
              {projectsList.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>

            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant={isRunning ? "outline" : "default"}
                className="flex-1 text-xs"
                onClick={toggleTimer}
                disabled={saving}
              >
                {isRunning ? <><Pause className="size-3.5" />Pause</> : <><Play className="size-3.5" />Lancer</>}
              </Button>

              {elapsed > 0 && (
                <>
                  <Button size="icon" variant="ghost" className="size-9 shrink-0 text-muted-foreground" onClick={resetTimer} disabled={saving} title="Réinitialiser" aria-label="Réinitialiser le chronomètre">
                    <RotateCcw className="size-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="size-9 shrink-0 text-success hover:bg-success/10 hover:text-success" onClick={handleSave} disabled={saving || !projectId} title="Enregistrer le temps" aria-label="Enregistrer le temps">
                    <Save className="size-3.5" />
                  </Button>
                </>
              )}
            </div>
          </div>
        )}

        <Button
          variant="ghost"
          size="sm"
          className={cn("w-full text-muted-foreground", isCollapsed ? "justify-center px-0" : "justify-start")}
          onClick={() => setIsCollapsed((value) => !value)}
          title={isCollapsed ? "Agrandir la navigation" : "Réduire la navigation"}
          aria-label={isCollapsed ? "Agrandir la navigation" : "Réduire la navigation"}
        >
          {isCollapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
          {!isCollapsed && <span>Réduire</span>}
        </Button>
      </div>
    </div>
  )
}
