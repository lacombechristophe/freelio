"use client"

import * as React from "react"
import {
  ChevronDown,
  Download,
  ExternalLink,
  FileCheck2,
  LayoutTemplate,
} from "lucide-react"

import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { DocumentChecks } from "@/components/shared/document-checks"
import { assessBillingDocumentQuality } from "@/lib/document-quality"
import {
  normalizePdfTemplate,
  renderDocumentHtml,
  type PdfDensity,
  type PdfDocument,
  type PdfTemplate,
} from "@/lib/pdf/render"
import { cn } from "@/lib/utils"

type DocumentStudioProps = {
  kind: "devis" | "facture"
  documentId: string
  documentNumber: string
  defaultTemplate?: string | null
  document: PdfDocument
}

type LayoutId = "ESSENTIAL" | "STANDARD" | "COMPACT"

type LayoutPreset = {
  id: LayoutId
  label: string
  description: string
  template: PdfTemplate
  density: PdfDensity
  recommended?: boolean
}

const DOCUMENT_INK = "#202630"
// A4 at 96 dpi, plus the screen renderer's gutters and scrollbar space.
const PREVIEW_WIDTH = 854

const LAYOUTS: LayoutPreset[] = [
  {
    id: "STANDARD",
    label: "Standard",
    description: "Grille classique, lecture rapide et récapitulatif net.",
    template: "PROFESSIONAL",
    density: "BALANCED",
    recommended: true,
  },
  {
    id: "ESSENTIAL",
    label: "Essentiel",
    description: "Présentation plus aérée pour les devis courts.",
    template: "MINIMAL",
    density: "BALANCED",
  },
  {
    id: "COMPACT",
    label: "Compact",
    description: "Même rigueur, avec davantage de lignes par page.",
    template: "PROFESSIONAL",
    density: "COMPACT",
  },
]

function initialLayout(template: string | null | undefined): LayoutId {
  return normalizePdfTemplate(template) === "MINIMAL" ? "ESSENTIAL" : "STANDARD"
}

function PaperThumbnail({ compact = false, essential = false }: { compact?: boolean; essential?: boolean }) {
  return (
    <div aria-hidden="true" className="h-16 w-24 shrink-0 overflow-hidden rounded border border-zinc-300 bg-white p-2 shadow-sm">
      <div className="flex items-start justify-between border-b border-zinc-300 pb-1.5">
        <div className="space-y-1"><div className="h-1.5 w-8 bg-zinc-800" /><div className="h-1 w-11 bg-zinc-300" /></div>
        <div className="h-2 w-6 bg-zinc-700" />
      </div>
      {essential ? (
        <><div className="mt-2 h-2 w-3/4 bg-zinc-800" /><div className="mt-2 h-px bg-zinc-300" /><div className="mt-1.5 h-1 w-full bg-zinc-200" /></>
      ) : (
        <><div className="mt-1.5 grid grid-cols-[20px_1fr] border border-zinc-300"><div className="bg-zinc-100" /><div className="h-4 border-l border-zinc-300" /></div><div className={cn("mt-1 space-y-1", compact && "space-y-0.5")}>{[0, 1, 2].slice(0, compact ? 3 : 2).map((row) => <div key={row} className="h-1 bg-zinc-200" />)}</div></>
      )}
    </div>
  )
}

export function DocumentStudio({
  kind,
  documentId,
  documentNumber,
  defaultTemplate,
  document,
}: DocumentStudioProps) {
  const [layoutId, setLayoutId] = React.useState<LayoutId>(() => initialLayout(defaultTemplate))
  const [showPayment, setShowPayment] = React.useState(true)
  const [showReference, setShowReference] = React.useState(true)
  const previewRef = React.useRef<HTMLDivElement>(null)
  const [previewSize, setPreviewSize] = React.useState({ width: PREVIEW_WIDTH, height: 620 })

  React.useEffect(() => {
    const element = previewRef.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
        setPreviewSize({ width: entry.contentRect.width, height: entry.contentRect.height })
      }
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const previewScale = Math.min(1, previewSize.width / PREVIEW_WIDTH)

  const layout = LAYOUTS.find((option) => option.id === layoutId) ?? LAYOUTS[0]
  const quality = React.useMemo(() => assessBillingDocumentQuality(document), [document])

  const queryString = React.useMemo(() => {
    const params = new URLSearchParams({
      template: layout.template,
      density: layout.density,
      payment: showPayment ? "1" : "0",
      reference: showReference ? "1" : "0",
    })
    return params.toString()
  }, [layout.density, layout.template, showPayment, showReference])

  const previewHtml = React.useMemo(
    () => renderDocumentHtml(document, {
      template: layout.template,
      accentColor: DOCUMENT_INK,
      density: layout.density,
      showPayment,
      showReference,
      previewFit: false,
    }),
    [document, layout.density, layout.template, showPayment, showReference]
  )

  const apiPath = `/api/pdf/${kind}/${documentId}`
  const downloadUrl = `${apiPath}?${queryString}`
  const screenUrl = `${downloadUrl}&screen=1`

  return (
    <Card id="document-studio" className="overflow-hidden border-border bg-card">
      <CardHeader className="border-b border-border">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base"><FileCheck2 className="size-5 text-primary" />Document prêt à contrôler</CardTitle>
            <CardDescription>Un rendu A4 sobre, conçu pour l’impression, la signature et l’archivage.</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={screenUrl} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline", size: "sm" })}><ExternalLink className="size-4" />Plein écran</a>
            <a href={downloadUrl} target="_blank" rel="noopener noreferrer" className={buttonVariants({ size: "sm" })}><Download className="size-4" />Télécharger {documentNumber}</a>
          </div>
        </div>
      </CardHeader>

      <CardContent className="grid p-0 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-5 border-b border-border p-4 lg:border-r lg:border-b-0">
          <DocumentChecks report={quality} />

          <details className="group rounded-lg border bg-card">
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg p-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden"><LayoutTemplate aria-hidden="true" className="size-4 text-muted-foreground" /><span className="flex-1">Mise en page · {layout.label}</span><ChevronDown aria-hidden="true" className="size-4 text-muted-foreground transition-transform group-open:rotate-180" /></summary>
            <div className="space-y-3 border-t p-3">
              <div className="space-y-2">{LAYOUTS.map((option) => {
                const active = option.id === layoutId
                return <button key={option.id} type="button" aria-pressed={active} onClick={() => setLayoutId(option.id)} className={cn("flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-[border-color,background-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", active ? "border-foreground/35 bg-muted/45 shadow-sm" : "border-border bg-background hover:bg-muted/30")}>
                  <PaperThumbnail compact={option.id === "COMPACT"} essential={option.id === "ESSENTIAL"} />
                  <span className="min-w-0"><span className="flex items-center gap-2 text-sm font-semibold">{option.label}{option.recommended ? <span className="rounded border bg-background px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">Recommandé</span> : null}</span><span className="mt-1 block text-[11px] leading-5 text-muted-foreground">{option.description}</span></span>
                </button>
              })}</div>
              <p className="text-[11px] leading-5 text-muted-foreground">Les documents restent volontairement neutres. Le logo identifie l’entreprise sans transformer le devis en support marketing.</p>
              <section className="space-y-3 border-t border-border pt-4">
              <div className="flex items-center justify-between gap-3"><div><Label className="text-xs font-semibold">Référence répétée</Label><p className="mt-1 text-[11px] leading-4 text-muted-foreground">Numéro visible dans le pied de page.</p></div><Switch aria-label="Afficher la référence répétée" checked={showReference} onCheckedChange={setShowReference} /></div>
              {kind === "facture" ? <div className="flex items-center justify-between gap-3"><div><Label className="text-xs font-semibold">Instructions de règlement</Label><p className="mt-1 text-[11px] leading-4 text-muted-foreground">IBAN, référence et mentions de paiement.</p></div><Switch aria-label="Afficher le bloc de règlement" checked={showPayment} onCheckedChange={setShowPayment} /></div> : null}
              </section>
            </div>
          </details>
        </aside>

        <section className="bg-muted/35 p-4">
          <div className="mb-3 flex items-center justify-between gap-3"><div><p className="text-sm font-semibold">Aperçu du document</p><p className="text-xs text-muted-foreground">Vérifiez aussi les sauts de page dans le PDF téléchargé.</p></div><span className="rounded-md border bg-background px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">A4</span></div>
          <div className="h-[min(620px,75dvh)] min-h-80 overflow-hidden rounded-lg border border-border bg-zinc-200 p-2 sm:p-3">
            <div ref={previewRef} className="relative h-full w-full overflow-hidden">
              <iframe key={queryString} title={`Aperçu ${documentNumber}`} srcDoc={previewHtml} className="absolute top-0 left-0 origin-top-left rounded border-0 bg-white" style={{ width: PREVIEW_WIDTH, height: previewSize.height / previewScale, transform: `scale(${previewScale})` }} />
            </div>
          </div>
        </section>
      </CardContent>
    </Card>
  )
}
