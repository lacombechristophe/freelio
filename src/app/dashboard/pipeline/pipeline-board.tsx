"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ChevronLeft, ChevronRight, Plus, MoreHorizontal, Euro, Target } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { OpportunityFormDialog } from "./opportunity-form-dialog"
import { deleteOpportunity, updateOpportunity } from "@/actions/pipeline"
import { useConfirm } from "@/components/shared/confirm-provider"
import styles from "./pipeline-board.module.css"

type Opportunity = {
  id: string
  title: string
  status: string
  valueCents: number
  probability: number
  clientId: string
  client: { id: string; name: string }
  createdAt: Date | string
}

type Pipeline = {
  id: string
  stages: unknown
  opportunities: Opportunity[]
} | null

function formatEuro(cents: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(cents / 100)
}

const DEFAULT_STAGES = [
  { id: "PROSPECT", title: "Prospect" },
  { id: "CONTACTED", title: "Contact pris" },
  { id: "QUALIFIED", title: "Besoin qualifié" },
  { id: "SENT", title: "Devis envoyé" },
  { id: "WON", title: "Gagné" },
]

const SCROLL_EDGE_TOLERANCE = 2

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function usePipelineScroll() {
  const viewportRef = React.useRef<HTMLDivElement>(null)
  const frameRef = React.useRef<number | null>(null)
  const targetRef = React.useRef(0)
  const reducedMotionRef = React.useRef(false)
  const [scrollState, setScrollState] = React.useState({
    hasOverflow: false,
    canScrollLeft: false,
    canScrollRight: false,
  })

  const updateScrollState = React.useCallback(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    const maxScroll = Math.max(0, viewport.scrollWidth - viewport.clientWidth)
    const nextState = {
      hasOverflow: maxScroll > SCROLL_EDGE_TOLERANCE,
      canScrollLeft: viewport.scrollLeft > SCROLL_EDGE_TOLERANCE,
      canScrollRight: viewport.scrollLeft < maxScroll - SCROLL_EDGE_TOLERANCE,
    }

    setScrollState((current) => (
      current.hasOverflow === nextState.hasOverflow
      && current.canScrollLeft === nextState.canScrollLeft
      && current.canScrollRight === nextState.canScrollRight
        ? current
        : nextState
    ))
  }, [])

  const scrollTo = React.useCallback((left: number) => {
    const viewport = viewportRef.current
    if (!viewport) return

    const maxScroll = Math.max(0, viewport.scrollWidth - viewport.clientWidth)
    targetRef.current = clamp(left, 0, maxScroll)

    if (reducedMotionRef.current) {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
      frameRef.current = null
      viewport.scrollLeft = targetRef.current
      updateScrollState()
      return
    }

    if (frameRef.current !== null) return

    const animate = () => {
      const activeViewport = viewportRef.current
      if (!activeViewport) {
        frameRef.current = null
        return
      }

      const distance = targetRef.current - activeViewport.scrollLeft
      if (Math.abs(distance) < 0.5) {
        activeViewport.scrollLeft = targetRef.current
        frameRef.current = null
        updateScrollState()
        return
      }

      activeViewport.scrollLeft += distance * 0.22
      frameRef.current = requestAnimationFrame(animate)
    }

    frameRef.current = requestAnimationFrame(animate)
  }, [updateScrollState])

  const scrollByViewport = React.useCallback((direction: -1 | 1) => {
    const viewport = viewportRef.current
    if (!viewport) return

    const distance = Math.max(280, viewport.clientWidth * 0.72)
    const start = frameRef.current === null ? viewport.scrollLeft : targetRef.current
    scrollTo(start + direction * distance)
  }, [scrollTo])

  React.useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)")
    const syncMotionPreference = () => {
      reducedMotionRef.current = motionQuery.matches
    }
    const handleScroll = () => {
      if (frameRef.current === null) targetRef.current = viewport.scrollLeft
      updateScrollState()
    }
    const handleWheel = (event: WheelEvent) => {
      if (event.ctrlKey || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return

      const unit = event.deltaMode === 1
        ? 20
        : event.deltaMode === 2
          ? viewport.clientWidth
          : 1
      const delta = event.deltaY * unit
      const maxScroll = Math.max(0, viewport.scrollWidth - viewport.clientWidth)
      const start = frameRef.current === null ? viewport.scrollLeft : targetRef.current
      const next = clamp(start + delta, 0, maxScroll)
      const isStillMoving = delta > 0
        ? viewport.scrollLeft < maxScroll - SCROLL_EDGE_TOLERANCE
        : viewport.scrollLeft > SCROLL_EDGE_TOLERANCE

      if (next === start && !isStillMoving) return

      event.preventDefault()
      scrollTo(next)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (document.activeElement !== viewport) return

      if (event.key === "ArrowLeft" || event.key === "PageUp") {
        event.preventDefault()
        scrollByViewport(-1)
      }
      if (event.key === "ArrowRight" || event.key === "PageDown") {
        event.preventDefault()
        scrollByViewport(1)
      }
      if (event.key === "Home") {
        event.preventDefault()
        scrollTo(0)
      }
      if (event.key === "End") {
        event.preventDefault()
        scrollTo(viewport.scrollWidth)
      }
    }

    syncMotionPreference()
    targetRef.current = viewport.scrollLeft
    updateScrollState()

    const resizeObserver = new ResizeObserver(() => {
      targetRef.current = clamp(
        viewport.scrollLeft,
        0,
        Math.max(0, viewport.scrollWidth - viewport.clientWidth),
      )
      updateScrollState()
    })

    resizeObserver.observe(viewport)
    viewport.addEventListener("wheel", handleWheel, { passive: false })
    viewport.addEventListener("scroll", handleScroll, { passive: true })
    viewport.addEventListener("keydown", handleKeyDown)
    motionQuery.addEventListener("change", syncMotionPreference)

    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
      resizeObserver.disconnect()
      viewport.removeEventListener("wheel", handleWheel)
      viewport.removeEventListener("scroll", handleScroll)
      viewport.removeEventListener("keydown", handleKeyDown)
      motionQuery.removeEventListener("change", syncMotionPreference)
    }
  }, [scrollByViewport, scrollTo, updateScrollState])

  return { viewportRef, scrollByViewport, ...scrollState }
}

export function PipelineBoard({
  pipeline,
  clients,
}: {
  pipeline: Pipeline
  clients: Array<{ id: string; name: string }>
}) {
  const router = useRouter()
  const confirmDialog = useConfirm()
  const stages = Array.isArray(pipeline?.stages)
    ? (pipeline.stages as Array<{ id: string; title: string }>)
    : DEFAULT_STAGES
  const opportunities = pipeline?.opportunities ?? []

  const [createOpen, setCreateOpen] = React.useState(false)
  const [editTarget, setEditTarget] = React.useState<Opportunity | null>(null)
  const {
    viewportRef,
    scrollByViewport,
    hasOverflow,
    canScrollLeft,
    canScrollRight,
  } = usePipelineScroll()

  const totalValue = opportunities
    .filter((o) => o.status !== "LOST")
    .reduce((sum, o) => sum + o.valueCents, 0)

  const weightedValue = opportunities
    .filter((o) => o.status !== "LOST")
    .reduce((sum, o) => sum + (o.valueCents * o.probability) / 100, 0)

  async function moveToStage(id: string, status: string) {
    try {
      await updateOpportunity(id, { status })
      toast.success("Étape mise à jour.")
      router.refresh()
    } catch (err: any) { toast.error(err?.message ?? "Erreur.") }
  }

  async function handleDelete(id: string) {
    if (!(await confirmDialog({
      title: "Supprimer cette opportunité ?",
      confirmLabel: "Supprimer",
      destructive: true,
    }))) return
    try {
      await deleteOpportunity(id)
      toast.success("Opportunité supprimée.")
      router.refresh()
    } catch (err: any) { toast.error(err?.message ?? "Erreur.") }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col space-y-4">
      <div className="flex shrink-0 flex-col gap-3 rounded-xl border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-2 text-sm">
          <div><span className="text-muted-foreground">Pipeline total</span><span className="ml-2 font-mono font-semibold tabular-nums">{formatEuro(totalValue)}</span></div>
          <div><span className="text-muted-foreground">Valeur pondérée</span><span className="ml-2 font-mono font-semibold tabular-nums text-success">{formatEuro(weightedValue)}</span></div>
        </div>
        <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto sm:flex-nowrap">
          <div
            className={`flex shrink-0 items-center gap-1 transition-opacity duration-150 ${hasOverflow ? "opacity-100" : "pointer-events-none opacity-0"}`}
            aria-hidden={!hasOverflow}
          >
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => scrollByViewport(-1)}
              disabled={!canScrollLeft}
              aria-label="Afficher les étapes précédentes"
              className="rounded-full"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => scrollByViewport(1)}
              disabled={!canScrollRight}
              aria-label="Afficher les étapes suivantes"
              className="rounded-full"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
          <Button className="min-w-[190px] flex-1 gap-2 sm:flex-none" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> Nouvelle Opportunité
          </Button>
        </div>
      </div>

      <OpportunityFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        stages={stages}
        clients={clients}
      />
      {editTarget && (
        <OpportunityFormDialog
          open={!!editTarget}
          onOpenChange={(o) => !o && setEditTarget(null)}
          stages={stages}
          clients={clients}
          opportunity={editTarget}
        />
      )}

      <div className="min-h-0 flex-1">
        <div
          ref={viewportRef}
          className={`${styles.viewport} flex h-full min-h-0 gap-3 overflow-x-auto focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/25`}
          data-pipeline-scroll-viewport
          role="region"
          aria-label="Étapes du pipeline"
          tabIndex={0}
        >
          {stages.map((stage) => {
            const deals = opportunities.filter((o) => o.status === stage.id)
            const stageValue = deals.reduce((sum, o) => sum + o.valueCents, 0)

            return (
              <section key={stage.id} className="flex w-[300px] flex-shrink-0 flex-col gap-3 rounded-xl border border-border bg-muted/45 p-3">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">{stage.title}</span>
                  <Badge variant="secondary" className="text-xs font-bold">{deals.length}</Badge>
                </div>
                <span className="text-xs text-muted-foreground font-medium">{formatEuro(stageValue)}</span>
              </div>

              <div className="flex flex-1 flex-col gap-2">
                {deals.length === 0 ? (
                  <button type="button" onClick={() => setCreateOpen(true)} className="flex min-h-28 flex-col items-center justify-center rounded-[10px] border border-dashed border-border bg-card/55 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/35 hover:bg-card hover:text-primary">
                    <Plus className="mb-2 size-4" />Ajouter une opportunité
                  </button>
                ) : (
                  deals.map((deal) => (
                    <Card key={deal.id} className="py-0 transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-[0_8px_20px_rgba(16,24,40,0.07)]">
                      <CardContent className="p-3 space-y-2">
                        <div className="flex items-start justify-between gap-1">
                          <p className="font-semibold text-sm leading-tight cursor-pointer" onClick={() => setEditTarget(deal)}>
                            {deal.title}
                          </p>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="-mr-1 -mt-0.5 h-8 w-8 shrink-0" aria-label="Ouvrir les actions de l’opportunité">
                                <MoreHorizontal className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setEditTarget(deal)}>Éditer</DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {stages.map((s) => s.id !== deal.status && (
                                <DropdownMenuItem key={s.id} onClick={() => moveToStage(deal.id, s.id)}>
                                  Déplacer → {s.title}
                                </DropdownMenuItem>
                              ))}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-danger" onClick={() => moveToStage(deal.id, "LOST")}>
                                Marquer perdu
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-danger" onClick={() => handleDelete(deal.id)}>
                                Supprimer
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                        <p className="text-xs text-muted-foreground">{deal.client.name}</p>
                        <div className="flex items-center justify-between pt-1 border-t">
                          <div className="flex items-center gap-1 text-xs font-bold">
                            <Euro className="h-3 w-3 text-muted-foreground" />
                            {formatEuro(deal.valueCents)}
                          </div>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Target className="h-3 w-3" />
                            {deal.probability}%
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
              </section>
            )
          })}
        </div>

      </div>
    </div>
  )
}
