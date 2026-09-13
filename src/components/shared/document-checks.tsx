import { AlertTriangle, CheckCircle2, ChevronDown, Info, ShieldCheck } from "lucide-react"
import type { DocumentQualityReport } from "@/lib/document-quality"
import { cn } from "@/lib/utils"

/** Indicative checks, not a legal approval or a document workflow status. */
export function DocumentChecks({ report }: { report: DocumentQualityReport }) {
  const errors = report.issues.filter((issue) => issue.severity === "error").length
  const warnings = report.issues.filter((issue) => issue.severity === "warning").length

  return (
    <details open={errors > 0} className="group rounded-lg border bg-card">
      <summary className="flex cursor-pointer list-none items-start gap-3 rounded-lg p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">Vérifications du document</span>
          <span className={cn("mt-1 block text-xs", errors ? "text-danger" : warnings ? "text-warning" : "text-muted-foreground")}>
            {report.issues.length === 0 ? "Aucune anomalie détectée" : `${errors} erreur(s) · ${warnings} point(s) de vigilance · ${report.issues.length - errors - warnings} conseil(s)`}
          </span>
          <span className="mt-1 block text-xs leading-5 text-muted-foreground">Contrôles indicatifs, sans validation juridique ni fiscale.</span>
        </span>
        <ChevronDown aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t px-4 pb-4">
        {report.issues.length ? <ul className="divide-y">{report.issues.map((issue) => {
          const Icon = issue.severity === "info" ? Info : AlertTriangle
          return <li key={issue.id} className="flex gap-2 py-3 last:pb-0">
            <Icon aria-hidden="true" className={cn("mt-0.5 size-4 shrink-0", issue.severity === "error" ? "text-danger" : issue.severity === "warning" ? "text-warning" : "text-muted-foreground")} />
            <div><p className="text-sm font-medium">{issue.title}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{issue.detail}</p></div>
          </li>
        })}</ul> : <p className="flex items-start gap-2 pt-3 text-xs leading-5 text-muted-foreground"><CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />Relisez les informations, conditions et montants avant tout envoi ou signature.</p>}
      </div>
    </details>
  )
}
