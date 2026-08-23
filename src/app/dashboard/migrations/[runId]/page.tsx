import { ArrowLeft, CircleAlert, Database, FileArchive, ShieldCheck } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"

import { getMigrationRunDetails } from "@/actions/migrations"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const TARGET_LABELS: Record<string, string> = {
  CLIENT: "Clients",
  CONTACT: "Contacts",
  SITE: "Sites",
  SUPPLIER: "Fournisseurs",
  PRODUCT: "Produits",
  WAREHOUSE: "Dépôts",
  OPPORTUNITY: "Affaires",
  PROJECT: "Chantiers",
  EQUIPMENT: "Équipements",
  TICKET: "SAV",
  INTERVENTION: "Interventions",
  MAINTENANCE_CONTRACT: "Contrats d’entretien",
  PURCHASE_ORDER: "Achats",
  CUSTOMER_ORDER: "Commandes client",
  DELIVERY_NOTE: "Bons de livraison",
  GOODS_RECEIPT: "Réceptions fournisseur",
  STOCK_RESERVATION: "Réservations de stock",
  STOCK_MOVEMENT: "Mouvements de stock",
  QUOTE: "Devis",
  INVOICE: "Factures",
  LINE_ITEM: "Lignes de documents",
  PAYMENT: "Règlements",
  ACTIVITY: "Activités",
  UNSUPPORTED: "À mapper",
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`
}

function payloadPreview(payload: unknown) {
  const text = JSON.stringify(payload)
  return text.length > 260 ? `${text.slice(0, 257)}…` : text
}

export default async function MigrationRunPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params
  const run = await getMigrationRunDetails(runId)
  if (!run) notFound()

  const errors = run.issues.filter((issue) => issue.status === "OPEN" && issue.severity === "ERROR").length
  const warnings = run.issues.filter((issue) => issue.status === "OPEN" && issue.severity === "WARNING").length
  const imported = run.metrics.reduce((sum, metric) => sum + metric.imported, 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link href="/dashboard/migrations" className={buttonVariants({ variant: "ghost", size: "sm", className: "-ml-3 mb-2" })}><ArrowLeft />Centre de migration</Link>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Contrôle du lot</h1>
            <Badge variant={errors ? "destructive" : "secondary"}>{run.status}</Badge>
          </div>
          <p className="mt-1 font-mono text-xs text-muted-foreground">{run.id}</p>
        </div>
        <a href={`/api/migrations/${run.id}/report`} className={buttonVariants({ variant: "outline" })}><ShieldCheck />Télécharger le rapport</a>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Source</CardTitle></CardHeader><CardContent><p className="text-xl font-semibold">{run.provider}</p><p className="text-xs text-muted-foreground">{run.kind}</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Lignes brutes</CardTitle></CardHeader><CardContent><p className="text-xl font-semibold tabular-nums">{run.recordCount.toLocaleString("fr-FR")}</p><p className="text-xs text-muted-foreground">{run.samples.length} type{run.samples.length > 1 ? "s" : ""}</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Importées</CardTitle></CardHeader><CardContent><p className="text-xl font-semibold tabular-nums">{imported.toLocaleString("fr-FR")}</p><p className="text-xs text-muted-foreground">Identifiants source conservés</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Anomalies ouvertes</CardTitle></CardHeader><CardContent><p className="text-xl font-semibold tabular-nums">{errors + warnings}</p><p className="text-xs text-muted-foreground">{errors} bloquante{errors > 1 ? "s" : ""} · {warnings} avertissement{warnings > 1 ? "s" : ""}</p></CardContent></Card>
      </div>

      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border px-5 py-4"><h2 className="text-sm font-semibold">Rapprochement par objet</h2><p className="mt-1 text-xs text-muted-foreground">Source = extrait + explicitement rejeté. Chaque écart doit rester visible.</p></div>
        {run.metrics.length ? <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted/40 text-left text-xs text-muted-foreground"><tr><th className="px-5 py-3 font-medium">Objet</th><th className="px-4 py-3 text-right font-medium">Source</th><th className="px-4 py-3 text-right font-medium">Extrait</th><th className="px-4 py-3 text-right font-medium">Importé</th><th className="px-5 py-3 text-right font-medium">Rejeté</th></tr></thead><tbody className="divide-y divide-border">{run.metrics.map((metric) => <tr key={metric.id}><td className="px-5 py-3 font-medium">{metric.objectType}</td><td className="px-4 py-3 text-right tabular-nums">{metric.sourceCount}</td><td className="px-4 py-3 text-right tabular-nums">{metric.extracted}</td><td className="px-4 py-3 text-right tabular-nums">{metric.imported}</td><td className="px-5 py-3 text-right tabular-nums">{metric.rejected}</td></tr>)}</tbody></table></div> : <p className="px-5 py-8 text-sm text-muted-foreground">Aucune métrique disponible.</p>}
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex items-center gap-3 border-b border-border px-5 py-4"><Database className="size-4 text-primary" /><div><h2 className="text-sm font-semibold">Aperçu des données</h2><p className="mt-1 text-xs text-muted-foreground">Trois exemples maximum par objet.</p></div></div>
          {run.samples.length ? <div className="divide-y divide-border">{run.samples.map((sample) => <details key={sample.objectType} className="group px-5 py-4"><summary className="flex cursor-pointer list-none items-center justify-between gap-3"><span className="text-sm font-medium">{sample.objectType}</span><span className="flex items-center gap-2"><Badge variant={sample.targetKind === "UNSUPPORTED" ? "outline" : "secondary"}>{TARGET_LABELS[sample.targetKind]}</Badge><span className="text-xs tabular-nums text-muted-foreground">{sample.count}</span></span></summary><div className="mt-3 space-y-2">{sample.records.map((record) => <div key={record.id} className="rounded-lg border bg-muted/20 p-3"><div className="mb-2 flex items-center justify-between gap-2"><code className="text-[11px]">{record.sourceId}</code>{record.targetModel ? <Badge variant="outline">{record.targetModel}</Badge> : null}</div><p className="break-all font-mono text-[11px] leading-5 text-muted-foreground">{payloadPreview(record.payload)}</p></div>)}</div></details>)}</div> : <p className="px-5 py-8 text-sm text-muted-foreground">Analyse des archives en attente.</p>}
        </section>

        <div className="space-y-6">
          <section className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex items-center gap-3 border-b border-border px-5 py-4"><CircleAlert className="size-4 text-primary" /><div><h2 className="text-sm font-semibold">Journal des anomalies</h2><p className="mt-1 text-xs text-muted-foreground">Aucune donnée problématique n'est supprimée silencieusement.</p></div></div>
            {run.issues.length ? <div className="max-h-[420px] divide-y divide-border overflow-y-auto">{run.issues.map((issue) => <div key={issue.id} className="px-5 py-4"><div className="flex items-start gap-2"><Badge variant={issue.severity === "ERROR" ? "destructive" : "outline"}>{issue.severity}</Badge><div className="min-w-0"><p className="text-sm font-medium">{issue.message}</p><p className="mt-1 font-mono text-[11px] text-muted-foreground">{issue.code}{issue.objectType ? ` · ${issue.objectType}` : ""}{issue.sourceId ? ` · ${issue.sourceId}` : ""}</p></div></div></div>)}</div> : <p className="px-5 py-8 text-sm text-muted-foreground">Aucune anomalie enregistrée.</p>}
          </section>

          <section className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex items-center gap-3 border-b border-border px-5 py-4"><FileArchive className="size-4 text-primary" /><div><h2 className="text-sm font-semibold">Manifeste documentaire</h2><p className="mt-1 text-xs text-muted-foreground">Empreintes calculées avant transformation.</p></div></div>
            {run.documents.length ? <div className="max-h-[360px] divide-y divide-border overflow-y-auto">{run.documents.map((document) => <div key={document.id} className="flex items-start justify-between gap-4 px-5 py-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{document.fileName}</p><p className="mt-1 truncate font-mono text-[10px] text-muted-foreground">SHA-256 {document.sha256}</p></div><span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatSize(document.size)}</span></div>)}</div> : <p className="px-5 py-8 text-sm text-muted-foreground">Aucun document.</p>}
          </section>
        </div>
      </div>
    </div>
  )
}
