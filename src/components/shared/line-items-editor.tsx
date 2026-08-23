"use client"

import * as React from "react"
import { ClipboardList, Plus, Sparkles, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { BILLING_LINE_PRESETS } from "@/lib/document-presets"
import { cn } from "@/lib/utils"

export type Line = {
  label: string
  description?: string
  quantity: number
  unitPriceCents: number
  tvaRate: number
}

function formatEuro(cents: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100)
}

export function computeLineTotals(lines: Line[]) {
  let totalHtCents = 0
  let totalTvaCents = 0
  for (const line of lines) {
    const lineHt = Math.round(line.quantity * line.unitPriceCents)
    const lineTva = Math.round((lineHt * line.tvaRate) / 100)
    totalHtCents += lineHt
    totalTvaCents += lineTva
  }
  return { totalHtCents, totalTvaCents, totalTtcCents: totalHtCents + totalTvaCents }
}

export function LineItemsEditor({
  lines,
  onChange,
  showPresets = true,
  isTvaApplicable = true,
}: {
  lines: Line[]
  onChange: (lines: Line[]) => void
  showPresets?: boolean
  isTvaApplicable?: boolean
}) {
  function normalizeLine(line: Line): Line {
    return isTvaApplicable ? line : { ...line, tvaRate: 0 }
  }

  function update(index: number, patch: Partial<Line>) {
    onChange(lines.map((line, i) => normalizeLine(i === index ? { ...line, ...patch } : line)))
  }

  function remove(index: number) {
    onChange(lines.filter((_, i) => i !== index))
  }

  function add() {
    onChange([...lines, { label: "", quantity: 1, unitPriceCents: 0, tvaRate: isTvaApplicable ? 20 : 0 }])
  }

  function applyPreset(presetLines: Line[]) {
    const normalizedPresetLines = presetLines.map(normalizeLine)
    const hasOnlyBlankLine =
      lines.length === 1 &&
      !lines[0].label.trim() &&
      !lines[0].description?.trim() &&
      lines[0].unitPriceCents === 0

    onChange(hasOnlyBlankLine ? normalizedPresetLines : [...lines.map(normalizeLine), ...normalizedPresetLines])
  }

  const effectiveLines = lines.map(normalizeLine)
  const totals = computeLineTotals(effectiveLines)

  return (
    <div className="space-y-3">
      {showPresets && (
        <div className="rounded-lg border border-border bg-background p-3">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Sparkles className="h-4 w-4 text-primary" />
                Bases de prestations
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Ajoutez une structure de prestation adaptée à un devis ou une facture.
              </p>
            </div>
            <ClipboardList className="h-4 w-4 shrink-0 text-muted-foreground" />
              </div>
              {!isTvaApplicable && (
                <p className="mb-2 rounded-md border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                  Franchise TVA active : les lignes restent à 0 %.
                </p>
              )}
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                {BILLING_LINE_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset.lines)}
                className={cn(
                  "rounded-md border border-border bg-muted/20 p-3 text-left transition-colors",
                  "hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                )}
              >
                <span className="text-sm font-semibold text-foreground">{preset.label}</span>
                <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                  {preset.description}
                </span>
                <span className="mt-2 block text-[11px] leading-relaxed text-muted-foreground">
                  {preset.bestFor}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        {effectiveLines.map((line, index) => {
          const lineHt = Math.round(line.quantity * line.unitPriceCents)

          return (
            <div
              key={index}
              className="grid grid-cols-12 items-end gap-2 rounded-lg border bg-muted/20 p-3"
            >
              <div className="col-span-12 space-y-1 md:col-span-5">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Libellé
                </Label>
                <Input
                  aria-label={`Libellé de la ligne ${index + 1}`}
                  value={line.label}
                  onChange={(event) => update(index, { label: event.target.value })}
                  placeholder="Prestation..."
                  required
                />
              </div>
              <div className="col-span-4 space-y-1 sm:col-span-2 md:col-span-1">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Qté
                </Label>
                <Input
                  aria-label={`Quantité de la ligne ${index + 1}`}
                  type="number"
                  min="0"
                  step="0.01"
                  value={line.quantity}
                  onChange={(event) => update(index, { quantity: Number(event.target.value) || 0 })}
                />
              </div>
              <div className="col-span-4 space-y-1 sm:col-span-3 md:col-span-2">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  PU HT (EUR)
                </Label>
                <Input
                  aria-label={`Prix unitaire hors taxes de la ligne ${index + 1}`}
                  type="number"
                  min="0"
                  step="0.01"
                  value={(line.unitPriceCents / 100).toString()}
                  onChange={(event) =>
                    update(index, { unitPriceCents: Math.round(Number(event.target.value || 0) * 100) })
                  }
                />
              </div>
              <div className="col-span-4 space-y-1 sm:col-span-2 md:col-span-1">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  TVA %
                </Label>
                <Input
                  aria-label={`Taux de TVA de la ligne ${index + 1}`}
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={line.tvaRate}
                  disabled={!isTvaApplicable}
                  onChange={(event) => update(index, { tvaRate: Number(event.target.value) || 0 })}
                />
              </div>
              <div className="col-span-10 text-right sm:col-span-4 md:col-span-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total HT</p>
                <p className="font-bold tabular-nums">{formatEuro(lineHt)}</p>
              </div>
              <div className="col-span-2 flex justify-end md:col-span-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => remove(index)}
                  disabled={lines.length <= 1}
                  aria-label="Supprimer la ligne"
                >
                  <Trash2 className="h-4 w-4 text-danger" />
                </Button>
              </div>
              <div className="col-span-12 space-y-1">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Détail / livrable
                </Label>
                <Input
                  aria-label={`Détail de la ligne ${index + 1}`}
                  value={line.description ?? ""}
                  onChange={(event) => update(index, { description: event.target.value })}
                  placeholder="Précisions visibles sur le PDF..."
                />
              </div>
            </div>
          )
        })}
      </div>

      <Button type="button" variant="outline" size="sm" onClick={add} className="gap-2">
        <Plus className="h-4 w-4" />
        Ajouter une ligne
      </Button>

      <div className="flex justify-end">
        <div className="min-w-[260px] space-y-1 rounded-lg border bg-muted/30 p-4">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Total HT</span>
            <span className="font-medium tabular-nums">{formatEuro(totals.totalHtCents)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">TVA</span>
            <span className="font-medium tabular-nums">{formatEuro(totals.totalTvaCents)}</span>
          </div>
          <div className="flex justify-between border-t pt-1 text-base">
            <span className="font-bold">Total TTC</span>
            <span className="font-bold tabular-nums">{formatEuro(totals.totalTtcCents)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
