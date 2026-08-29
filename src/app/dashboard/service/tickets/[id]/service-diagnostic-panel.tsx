"use client"

import { useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { CheckCircle2, ClipboardCheck, Loader2, ShieldAlert, Sparkles } from "lucide-react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { completeServiceTicketDiagnostic } from "@/actions/service-diagnostics"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { HelpTip } from "@/components/ui/help-tip"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

type Ticket = NonNullable<Awaited<ReturnType<typeof import("@/actions/operations").getServiceTicketDetail>>>

const controlClass = "h-10 w-full rounded-[10px] border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/20"
const warrantyLabels: Record<string, string> = {
  COVERED: "Sous garantie",
  EXPIRED: "Garantie expirée",
  UNKNOWN: "Garantie à confirmer",
  NOT_APPLICABLE: "Garantie non applicable",
}

function date(value: Date | string) {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
}

export function ServiceDiagnosticPanel({ ticket, readOnly }: { ticket: Ticket; readOnly: boolean }) {
  const router = useRouter()
  const suggestedGuide = ticket.diagnosticGuides.find((guide) => guide.suggested)
  const [guideId, setGuideId] = useState(suggestedGuide?.id || ticket.diagnosticGuides[0]?.id || "")
  const [warrantyStatus, setWarrantyStatus] = useState(ticket.warrantyStatus)
  const [pending, startTransition] = useTransition()
  const guide = useMemo(() => ticket.diagnosticGuides.find((item) => item.id === guideId), [guideId, ticket.diagnosticGuides])

  function submit(form: HTMLFormElement) {
    if (!guide) return
    const data = new FormData(form)
    startTransition(() => void completeServiceTicketDiagnostic({
      ticketId: ticket.id,
      guideId: guide.id,
      symptom: data.get("symptom"),
      completedStepIds: data.getAll("completedStepIds"),
      warrantyStatus: data.get("warrantyStatus"),
      outcome: data.get("outcome"),
      recommendedAction: data.get("recommendedAction"),
    }).then(() => {
      toast.success("Diagnostic consigné dans l’historique.")
      form.reset()
      router.refresh()
    }).catch((error) => toast.error(error instanceof Error ? error.message : "Diagnostic impossible.")))
  }

  const warrantyInstruction = warrantyStatus === "COVERED" ? guide?.warrantyInstructions : guide?.outOfWarrantyInstructions

  return <Card>
    <CardHeader>
      <div className="flex items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base"><ClipboardCheck className="size-4 text-primary" />Diagnostic guidé</CardTitle>
          <CardDescription className="mt-1">Contrôles reproductibles, contexte de garantie et conclusion horodatée.</CardDescription>
        </div>
        <HelpTip label="Aide, pas décision">Le score propose un guide selon le matériel et les mots du ticket. Le technicien choisit, vérifie et signe la conclusion.</HelpTip>
      </div>
    </CardHeader>
    <CardContent className="space-y-5">
      {!readOnly && ticket.diagnosticGuides.length > 0 && <form className="space-y-4 rounded-xl border p-4" onSubmit={(event) => { event.preventDefault(); submit(event.currentTarget) }}>
        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor={`diagnostic-guide-${ticket.id}`}>Guide</Label>
              <Link href="/dashboard/service/diagnostics" className="text-xs font-medium text-primary hover:underline">Gérer la bibliothèque</Link>
            </div>
            <select id={`diagnostic-guide-${ticket.id}`} value={guideId} onChange={(event) => setGuideId(event.target.value)} className={`${controlClass} mt-1.5`}>
              {ticket.diagnosticGuides.map((item) => <option key={item.id} value={item.id}>{item.suggested ? "★ " : ""}{item.name}</option>)}
            </select>
          </div>
          <div>
            <Label htmlFor={`diagnostic-warranty-${ticket.id}`}>Garantie</Label>
            <select id={`diagnostic-warranty-${ticket.id}`} name="warrantyStatus" value={warrantyStatus} onChange={(event) => setWarrantyStatus(event.target.value as Ticket["warrantyStatus"])} className={`${controlClass} mt-1.5`}>
              {Object.entries(warrantyLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
        </div>

        {guide?.suggested && <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs">
          <Sparkles className="size-3.5 text-primary" />
          <span className="font-semibold">Suggestion {guide.score}%</span>
          <span className="text-muted-foreground">{guide.reasons.join(" · ")}</span>
        </div>}

        {guide && <>
          <div>
            <p className="text-sm font-semibold">{guide.symptom}</p>
            <p className="mt-1 text-xs text-muted-foreground">{[guide.productCategory, guide.manufacturer, guide.modelPattern].filter(Boolean).join(" · ") || "Tous équipements"}</p>
          </div>
          {warrantyInstruction && <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-xs leading-5 text-amber-950 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-100"><span className="font-semibold">Consigne {warrantyLabels[warrantyStatus].toLocaleLowerCase("fr-FR")} :</span> {warrantyInstruction}</div>}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Points de contrôle</p>
            {guide.steps.map((step) => <label key={step.id} className="flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-sm hover:bg-muted/20">
              <input type="checkbox" name="completedStepIds" value={step.id} required={step.required} className="mt-0.5 size-4 accent-primary" />
              <span className="min-w-0 flex-1">{step.label}</span>
              <Badge variant="outline">{step.required ? "Obligatoire" : "Optionnel"}</Badge>
            </label>)}
          </div>
          <div>
            <Label htmlFor={`diagnostic-symptom-${ticket.id}`}>Symptôme constaté</Label>
            <Textarea id={`diagnostic-symptom-${ticket.id}`} name="symptom" required minLength={2} maxLength={500} rows={2} defaultValue={ticket.title} className="mt-1.5" />
          </div>
          {guide.resolutionHints.length > 0 && <div className="rounded-lg border bg-muted/15 p-3">
            <p className="text-xs font-semibold">Issues possibles à confirmer</p>
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">{guide.resolutionHints.map((hint) => <li key={hint}>• {hint}</li>)}</ul>
          </div>}
          <div>
            <Label htmlFor={`diagnostic-outcome-${ticket.id}`}>Conclusion factuelle</Label>
            <Textarea id={`diagnostic-outcome-${ticket.id}`} name="outcome" required minLength={3} maxLength={5_000} rows={4} placeholder="Mesures, code défaut, cause retenue ou contrôles restant à effectuer…" className="mt-1.5" />
          </div>
          <div>
            <Label htmlFor={`diagnostic-action-${ticket.id}`}>Action recommandée</Label>
            <Textarea id={`diagnostic-action-${ticket.id}`} name="recommendedAction" maxLength={2_000} rows={2} placeholder="Réglage sur site, devis pièce, retour fabricant, surveillance…" className="mt-1.5" />
          </div>
          <Button type="submit" disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}Consigner le diagnostic</Button>
        </>}
      </form>}

      {!readOnly && ticket.diagnosticGuides.length === 0 && <div className="rounded-xl border border-dashed p-5 text-center">
        <ShieldAlert className="mx-auto size-5 text-muted-foreground" />
        <p className="mt-2 text-sm font-medium">Aucun guide actif</p>
        <p className="mt-1 text-xs text-muted-foreground">Créez un premier playbook à partir des pannes les plus fréquentes.</p>
        <Link href="/dashboard/service/diagnostics" className={buttonVariants({ size: "sm", variant: "outline", className: "mt-3" })}>Créer un guide</Link>
      </div>}

      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold">Historique des diagnostics</h3>
          <p className="mt-1 text-xs text-muted-foreground">Chaque saisie conserve le guide et le matériel tels qu’ils étaient au moment du contrôle.</p>
        </div>
        {ticket.diagnostics.length > 0 ? ticket.diagnostics.map((diagnostic, index) => <details key={diagnostic.id} open={index === 0} className="rounded-lg border">
          <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 px-3 py-3">
            <CheckCircle2 className="size-4 text-success" />
            <span className="text-sm font-semibold">{diagnostic.guideName}</span>
            <Badge variant="outline">{warrantyLabels[diagnostic.warrantyStatus] || diagnostic.warrantyStatus}</Badge>
            {diagnostic.mergedFrom && <Link href={`/dashboard/service/tickets/${diagnostic.mergedFrom.id}`} className="text-[11px] font-medium text-primary underline">via {diagnostic.mergedFrom.number}</Link>}
            <span className="ml-auto text-[11px] text-muted-foreground">{date(diagnostic.completedAt)} · {diagnostic.performedBy}</span>
          </summary>
          <div className="space-y-3 border-t bg-muted/10 px-4 py-3 text-sm">
            <div><p className="text-xs font-semibold text-muted-foreground">Symptôme</p><p className="mt-1">{diagnostic.symptom}</p></div>
            <div><p className="text-xs font-semibold text-muted-foreground">Contrôles validés</p><ul className="mt-1 space-y-1">{diagnostic.steps.filter((step) => diagnostic.completedStepIds.includes(step.id)).map((step) => <li key={step.id}>✓ {step.label}</li>)}</ul></div>
            <div><p className="text-xs font-semibold text-muted-foreground">Conclusion</p><p className="mt-1 whitespace-pre-wrap">{diagnostic.outcome}</p></div>
            {diagnostic.recommendedAction && <div><p className="text-xs font-semibold text-muted-foreground">Action recommandée</p><p className="mt-1 whitespace-pre-wrap">{diagnostic.recommendedAction}</p></div>}
          </div>
        </details>) : <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Aucun diagnostic structuré consigné sur ce dossier.</p>}
      </section>
    </CardContent>
  </Card>
}
