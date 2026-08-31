"use client"

import * as React from "react"
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  ExternalLink,
  FileCheck2,
  Info,
  LayoutTemplate,
  ShieldCheck,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
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

const issueIcon = {
  error: AlertTriangle,
  warning: AlertTriangle,
  info: Info,
} as const

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

  const layout = LAYOUTS.find((option) => option.id === layoutId) ?? LAYOUTS[0]
  const quality = React.useMemo(() => assessBillingDocumentQuality(document), [document])
  const visibleIssues = quality.issues.slice(0, 5)

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
      previewFit: true,
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
            <a href={screenUrl} target="_blank" rel="noopener noreferrer"><Button variant="outline" size="sm"><ExternalLink className="size-4" />Plein écran</Button></a>
            <a href={downloadUrl} target="_blank" rel="noopener noreferrer"><Button size="sm"><Download className="size-4" />Télécharger {documentNumber}</Button></a>
          </div>
        </div>
      </CardHeader>

      <CardContent className="grid p-0 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-5 border-b border-border p-4 lg:border-r lg:border-b-0">
          <section className="rounded-xl border border-border bg-background p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground"><ShieldCheck className="size-4" />Contrôle</div>
                <div className="mt-2 flex items-baseline gap-1.5"><span className="text-3xl font-semibold tabular-nums">{quality.score}</span><span className="text-xs text-muted-foreground">/100</span></div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{quality.summary}</p>
              </div>
              <span className={cn("rounded-full border px-2.5 py-1 text-[11px] font-semibold", quality.status === "READY" && "border-success/25 bg-success/10 text-success", quality.status === "TO_REVIEW" && "border-warning/25 bg-warning/10 text-warning", quality.status === "BLOCKED" && "border-danger/25 bg-danger/10 text-danger")}>{quality.label}</span>
            </div>
            {visibleIssues.length ? (
              <div className="mt-3 space-y-2">{visibleIssues.map((issue) => {
                const Icon = issueIcon[issue.severity]
                return <div key={issue.id} className="flex gap-2 border-t border-border pt-2.5"><Icon className={cn("mt-0.5 size-3.5 shrink-0", issue.severity === "error" && "text-danger", issue.severity === "warning" && "text-warning", issue.severity === "info" && "text-muted-foreground")} /><div><p className="text-xs font-semibold">{issue.title}</p><p className="mt-0.5 text-[11px] leading-5 text-muted-foreground">{issue.detail}</p></div></div>
              })}</div>
            ) : (
              <div className="mt-3 flex items-center gap-2 border-t border-border pt-3 text-xs text-success"><CheckCircle2 className="size-4" />Aucun point bloquant détecté.</div>
            )}
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground"><LayoutTemplate className="size-4" />Format</div>
            <div className="space-y-2">{LAYOUTS.map((option) => {
              const active = option.id === layoutId
              return <button key={option.id} type="button" aria-pressed={active} onClick={() => setLayoutId(option.id)} className={cn("flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-[border-color,background-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", active ? "border-foreground/35 bg-muted/45 shadow-sm" : "border-border bg-background hover:bg-muted/30")}>
                <PaperThumbnail compact={option.id === "COMPACT"} essential={option.id === "ESSENTIAL"} />
                <span className="min-w-0"><span className="flex items-center gap-2 text-sm font-semibold">{option.label}{option.recommended ? <span className="rounded border bg-background px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">Recommandé</span> : null}</span><span className="mt-1 block text-[11px] leading-5 text-muted-foreground">{option.description}</span></span>
              </button>
            })}</div>
            <p className="text-[11px] leading-5 text-muted-foreground">Les documents restent volontairement neutres. Le logo identifie l’entreprise sans transformer le devis en support marketing.</p>
          </section>

          <section className="space-y-3 border-t border-border pt-4">
            <div className="flex items-center justify-between gap-3"><div><Label className="text-xs font-semibold">Référence répétée</Label><p className="mt-1 text-[11px] leading-4 text-muted-foreground">Numéro visible dans le pied de page.</p></div><Switch aria-label="Afficher la référence répétée" checked={showReference} onCheckedChange={setShowReference} /></div>
            {kind === "facture" ? <div className="flex items-center justify-between gap-3"><div><Label className="text-xs font-semibold">Instructions de règlement</Label><p className="mt-1 text-[11px] leading-4 text-muted-foreground">IBAN, référence et mentions de paiement.</p></div><Switch aria-label="Afficher le bloc de règlement" checked={showPayment} onCheckedChange={setShowPayment} /></div> : null}
          </section>
        </aside>

        <section className="bg-muted/35 p-4">
          <div className="mb-3 flex items-center justify-between gap-3"><div><p className="text-sm font-semibold">Aperçu du document</p><p className="text-xs text-muted-foreground">Le téléchargement utilise exactement cette mise en page.</p></div><span className="rounded-md border bg-background px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">A4</span></div>
          <div className="h-[620px] overflow-hidden rounded-xl border border-border bg-zinc-200 p-3 shadow-inner"><iframe key={queryString} title={`Aperçu ${documentNumber}`} srcDoc={previewHtml} className="h-full w-full rounded-md border-0 bg-white" /></div>
        </section>
      </CardContent>
    </Card>
  )
}
