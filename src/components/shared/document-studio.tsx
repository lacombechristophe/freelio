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
  Palette,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { assessBillingDocumentQuality } from "@/lib/document-quality"
import { cn } from "@/lib/utils"
import {
  PDF_ACCENT_OPTIONS,
  PDF_DENSITIES,
  PDF_TEMPLATES,
  normalizePdfDensity,
  normalizePdfTemplate,
  renderDocumentHtml,
  type PdfDensity,
  type PdfDocument,
  type PdfTemplate,
} from "@/lib/pdf/render"

type DocumentStudioProps = {
  kind: "devis" | "facture"
  documentId: string
  documentNumber: string
  defaultTemplate?: string | null
  document: PdfDocument
}

const templateCopy: Record<PdfTemplate, { label: string; description: string }> = {
  MINIMAL: {
    label: "Éditorial",
    description: "Serif expressive, grands blancs et hiérarchie sobre pour les missions premium.",
  },
  PROFESSIONAL: {
    label: "Registre",
    description: "Grille rigoureuse et synthèse dense pour les échanges B2B exigeants.",
  },
  MODERN: {
    label: "Signature",
    description: "Composition contemporaine et montant prioritaire pour une lecture immédiate.",
  },
}

const densityCopy: Record<PdfDensity, string> = {
  COMPACT: "Compact",
  BALANCED: "Équilibré",
  SPACIOUS: "Aéré",
}

const issueIcon = {
  error: AlertTriangle,
  warning: AlertTriangle,
  info: Info,
} as const

function TemplateThumbnail({ template, accentColor }: { template: PdfTemplate; accentColor: string }) {
  if (template === "MINIMAL") {
    return (
      <div className="h-16 overflow-hidden rounded border border-border bg-white p-2">
        <div className="h-0.5 w-full" style={{ backgroundColor: accentColor }} />
        <div className="mt-1.5 flex items-start justify-between gap-3 border-b border-zinc-200 pb-1.5">
          <div className="space-y-1">
            <div className="h-1.5 w-11 rounded-sm bg-zinc-800" />
            <div className="h-1 w-14 rounded-sm bg-zinc-300" />
          </div>
          <div className="text-right"><span className="block text-[5px] font-semibold" style={{ color: accentColor }}>PROPOSITION</span><span className="block text-[6px] font-semibold text-zinc-700">DEVIS 026</span></div>
        </div>
        <div className="mt-1.5 grid grid-cols-[1fr_30px] items-end gap-2">
          <div className="space-y-1"><div className="h-2 w-4/5 rounded-sm bg-zinc-800" /><div className="h-1 w-3/5 rounded-sm bg-zinc-200" /></div>
          <div className="border-t border-zinc-400 pt-1"><div className="h-1.5 rounded-sm" style={{ backgroundColor: accentColor }} /></div>
        </div>
      </div>
    )
  }

  if (template === "PROFESSIONAL") {
    return (
      <div className="h-16 overflow-hidden rounded border border-border bg-white p-2">
        <div className="h-0.5 w-6" style={{ backgroundColor: accentColor }} />
        <div className="mt-1 flex items-center justify-between border-b border-zinc-300 pb-1">
          <div className="h-1.5 w-12 rounded-sm bg-zinc-800" />
          <div className="h-2 w-8 rounded-sm bg-zinc-800" />
        </div>
        <div className="mt-1 grid grid-cols-[24px_1fr] border border-zinc-200" style={{ borderTopColor: accentColor }}>
          <div className="h-5 bg-zinc-100 p-1"><div className="h-1 w-3/4 rounded-sm bg-zinc-500" /></div>
          <div className="grid h-5 grid-cols-3 gap-px bg-zinc-200">
            <div className="bg-white p-1"><div className="h-1 rounded-sm bg-zinc-300" /></div>
            <div className="bg-white p-1"><div className="h-1 rounded-sm bg-zinc-300" /></div>
            <div className="bg-white p-1"><div className="h-1 rounded-sm" style={{ backgroundColor: accentColor }} /></div>
          </div>
        </div>
        <div className="mt-1 h-1.5 bg-zinc-800" />
      </div>
    )
  }

  return (
    <div className="h-16 overflow-hidden rounded border border-border bg-white">
      <div className="h-1" style={{ backgroundColor: accentColor }} />
      <div className="grid h-10 grid-cols-[1fr_34px] gap-2 bg-zinc-100 p-2">
        <div className="space-y-1">
          <div className="flex items-center justify-between"><div className="h-1 w-8 rounded-sm bg-zinc-400" /><div className="h-1 w-6 rounded-sm" style={{ backgroundColor: accentColor }} /></div>
          <div className="h-2 w-14 rounded-sm bg-zinc-800" />
          <div className="h-1 w-10 rounded-sm bg-zinc-300" />
        </div>
        <div className="border-t-2 p-1" style={{ backgroundColor: "#202630", borderTopColor: accentColor }}><div className="h-1 w-full rounded-sm bg-white/60" /><div className="mt-1 h-1.5 w-full rounded-sm bg-white" /></div>
      </div>
      <div className="mx-2 mt-1.5 grid grid-cols-4 gap-px"><div className="h-1.5 bg-zinc-800" /><div className="h-1.5 bg-zinc-800" /><div className="h-1.5 bg-zinc-800" /><div className="h-1.5 bg-zinc-800" /></div>
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
  const [template, setTemplate] = React.useState<PdfTemplate>(() => normalizePdfTemplate(defaultTemplate))
  const [accentColor, setAccentColor] = React.useState<string>(PDF_ACCENT_OPTIONS[0].value)
  const [density, setDensity] = React.useState<PdfDensity>("BALANCED")
  const [showPayment, setShowPayment] = React.useState(true)
  const [showReference, setShowReference] = React.useState(true)

  const quality = React.useMemo(() => assessBillingDocumentQuality(document), [document])
  const visibleIssues = quality.issues.slice(0, 5)

  const queryString = React.useMemo(() => {
    const params = new URLSearchParams({
      template,
      accent: accentColor,
      density,
      payment: showPayment ? "1" : "0",
      reference: showReference ? "1" : "0",
    })

    return params.toString()
  }, [accentColor, density, showPayment, showReference, template])

  const previewHtml = React.useMemo(
    () =>
      renderDocumentHtml(document, {
        template,
        accentColor,
        density,
        showPayment,
        showReference,
        previewFit: true,
      }),
    [accentColor, density, document, showPayment, showReference, template]
  )

  const apiPath = `/api/pdf/${kind}/${documentId}`
  const downloadUrl = `${apiPath}?${queryString}`
  const screenUrl = `${apiPath}?${queryString}&screen=1`

  return (
    <Card id="document-studio" className="overflow-hidden border-border bg-card">
      <CardHeader className="border-b border-border">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileCheck2 className="h-5 w-5 text-primary" />
              Studio documentaire
            </CardTitle>
            <CardDescription>
              Ajustez le rendu, contrôlez la qualité et exportez {kind === "facture" ? "la facture" : "le devis"}.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a href={screenUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" className="gap-2">
                <ExternalLink className="h-4 w-4" />
                Plein écran
              </Button>
            </a>
            <a href={downloadUrl} target="_blank" rel="noopener noreferrer">
              <Button size="sm" className="gap-2">
                <Download className="h-4 w-4" />
                Télécharger {documentNumber}
              </Button>
            </a>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-0 p-0 lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="space-y-6 border-b border-border p-4 lg:border-b-0 lg:border-r">
          <section className="rounded-lg border border-border bg-background p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  <ShieldCheck className="h-4 w-4" />
                  Qualité
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-3xl font-bold tabular-nums">{quality.score}</span>
                  <span className="text-xs font-semibold text-muted-foreground">/100</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{quality.summary}</p>
              </div>
              <span
                className={cn(
                  "rounded-full border px-2 py-1 text-[11px] font-semibold",
                  quality.status === "READY" && "border-success/30 bg-success/10 text-success",
                  quality.status === "TO_REVIEW" && "border-warning/30 bg-warning/10 text-warning",
                  quality.status === "BLOCKED" && "border-danger/30 bg-danger/10 text-danger"
                )}
              >
                {quality.label}
              </span>
            </div>
            {visibleIssues.length > 0 ? (
              <div className="mt-3 space-y-2">
                {visibleIssues.map((issue) => {
                  const Icon = issueIcon[issue.severity]
                  return (
                    <div key={issue.id} className="flex gap-2 rounded-md border border-border/70 bg-muted/20 p-2">
                      <Icon
                        className={cn(
                          "mt-0.5 h-3.5 w-3.5 shrink-0",
                          issue.severity === "error" && "text-danger",
                          issue.severity === "warning" && "text-warning",
                          issue.severity === "info" && "text-muted-foreground"
                        )}
                      />
                      <div>
                        <p className="text-xs font-semibold">{issue.title}</p>
                        <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{issue.detail}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="mt-3 flex items-center gap-2 rounded-md border border-success/20 bg-success/10 p-2 text-xs text-success">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Aucun point bloquant détecté.
              </div>
            )}
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
              <LayoutTemplate className="h-4 w-4" />
                  Modèle
            </div>
            <div className="grid gap-2">
              {PDF_TEMPLATES.map((option) => {
                const active = template === option
                const copy = templateCopy[option]

                return (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setTemplate(option)}
                    className={cn(
                      "rounded-md border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      active ? "border-primary bg-primary/10" : "border-border bg-background hover:bg-muted/60"
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold">{copy.label}</span>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        {option}
                      </span>
                    </div>
                    <div className="mt-3">
                      <TemplateThumbnail template={option} accentColor={accentColor} />
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{copy.description}</p>
                  </button>
                )
              })}
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
              <Palette className="h-4 w-4" />
              Couleur
            </div>
            <div className="grid grid-cols-5 gap-2">
              {PDF_ACCENT_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-label={option.label}
                  aria-pressed={accentColor === option.value}
                  onClick={() => setAccentColor(option.value)}
                  className={cn(
                    "h-9 rounded-md border transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    accentColor === option.value ? "border-foreground ring-2 ring-primary/30" : "border-border"
                  )}
                  style={{ backgroundColor: option.value }}
                  title={option.label}
                />
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
              <SlidersHorizontal className="h-4 w-4" />
              Densité
            </div>
            <div className="grid grid-cols-3 rounded-md border border-border bg-background p-1">
              {PDF_DENSITIES.map((option) => {
                const value = normalizePdfDensity(option)

                return (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={density === value}
                    onClick={() => setDensity(value)}
                    className={cn(
                      "min-h-9 rounded px-2 py-1.5 text-xs font-semibold transition-colors",
                      density === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {densityCopy[value]}
                  </button>
                )
              })}
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Référence visible</Label>
                <p className="text-[11px] leading-snug text-muted-foreground">Affiche un rappel du numéro.</p>
              </div>
              <Switch aria-label="Afficher la référence du document" checked={showReference} onCheckedChange={setShowReference} />
            </div>
            {kind === "facture" && (
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Bloc règlement</Label>
                  <p className="text-[11px] leading-snug text-muted-foreground">Coordonnées de paiement et référence.</p>
                </div>
                <Switch aria-label="Afficher le bloc de règlement" checked={showPayment} onCheckedChange={setShowPayment} />
              </div>
            )}
          </section>
        </aside>

        <section className="bg-muted/40 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Aperçu écran</p>
              <p className="text-xs text-muted-foreground">Le PDF final conserve cette direction visuelle.</p>
            </div>
            <span className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
              A4
            </span>
          </div>
          <div className="h-[620px] overflow-hidden rounded-lg border border-border bg-zinc-200 p-3 shadow-inner">
            <iframe
              key={queryString}
              title={`Aperçu ${documentNumber}`}
              srcDoc={previewHtml}
              className="h-full w-full rounded-md border-0 bg-white"
            />
          </div>
        </section>
      </CardContent>
    </Card>
  )
}
