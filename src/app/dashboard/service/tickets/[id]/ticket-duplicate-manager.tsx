"use client"

import { useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { GitMerge, Loader2, RotateCcw, ShieldCheck } from "lucide-react"
import { toast } from "sonner"

import { mergeServiceTickets, unmergeServiceTicket } from "@/actions/operations"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { HelpTip } from "@/components/ui/help-tip"

type TicketDetail = NonNullable<Awaited<ReturnType<typeof import("@/actions/operations").getServiceTicketDetail>>>

function date(value: Date | string | null) {
  if (!value) return "Date inconnue"
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
}

export function TicketDuplicateManager({
  ticketId,
  ticketNumber,
  duplicateCandidates,
  mergedTickets,
  mergedInto,
}: {
  ticketId: string
  ticketNumber: string
  duplicateCandidates: TicketDetail["duplicateCandidates"]
  mergedTickets: TicketDetail["mergedTickets"]
  mergedInto: TicketDetail["mergedInto"]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function merge(sourceId: string, targetId: string, navigateToTarget: boolean) {
    startTransition(() => void mergeServiceTickets({ sourceId, targetId }).then((result) => {
      toast.success(`Tickets regroupés dans ${result.targetNumber}.`)
      if (navigateToTarget) router.push(`/dashboard/service/tickets/${result.targetId}`)
      else router.refresh()
    }).catch((error) => toast.error(error instanceof Error ? error.message : "Fusion impossible.")))
  }

  function restore(sourceId: string) {
    startTransition(() => void unmergeServiceTicket(sourceId).then(() => {
      toast.success("Ticket restauré comme dossier séparé.")
      router.refresh()
    }).catch((error) => toast.error(error instanceof Error ? error.message : "Restauration impossible.")))
  }

  if (mergedInto) return <Card className="border-primary/25 bg-primary/5">
    <CardHeader>
      <CardTitle className="flex items-center gap-2 text-base"><GitMerge className="size-4 text-primary" />Ticket regroupé</CardTitle>
      <CardDescription>Ce dossier est conservé en lecture seule dans <Link href={`/dashboard/service/tickets/${mergedInto.id}`} className="font-semibold text-primary hover:underline">{mergedInto.number} · {mergedInto.title}</Link>.</CardDescription>
    </CardHeader>
    <CardContent className="flex flex-wrap items-center justify-between gap-3">
      <p className="max-w-xl text-xs leading-5 text-muted-foreground">La restauration rend ce ticket autonome avec son ancien statut, ses conversations, ses notes et ses interventions.</p>
      <Button type="button" variant="outline" disabled={pending} onClick={() => restore(ticketId)}>{pending ? <Loader2 className="animate-spin" /> : <RotateCcw />}Restaurer ce ticket</Button>
    </CardContent>
  </Card>

  return <Card>
    <CardHeader>
      <div className="flex items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base"><GitMerge className="size-4 text-primary" />Doublons et regroupements</CardTitle>
          <CardDescription className="mt-1">Les rapprochements restent explicites, auditables et réversibles.</CardDescription>
        </div>
        <HelpTip label="Fusion sans perte">Le ticket écarté passe en lecture seule. Ses e-mails, notes et interventions restent visibles dans le dossier conservé et peuvent être restaurés.</HelpTip>
      </div>
    </CardHeader>
    <CardContent className="space-y-5">
      {mergedTickets.length > 0 && <section className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="size-4 text-success" />Tickets déjà regroupés ici</div>
        {mergedTickets.map((ticket) => <div key={ticket.id} className="rounded-lg border bg-muted/15 p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <Link href={`/dashboard/service/tickets/${ticket.id}`} className="text-sm font-semibold hover:text-primary hover:underline">{ticket.number} · {ticket.title}</Link>
              <p className="mt-1 text-xs text-muted-foreground">Fusionné le {date(ticket.mergedAt)} · {ticket.conversationCount} conversation(s) · {ticket.noteCount} note(s) · {ticket.interventionCount} intervention(s)</p>
            </div>
            <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => restore(ticket.id)}>{pending ? <Loader2 className="animate-spin" /> : <RotateCcw />}Restaurer</Button>
          </div>
        </div>)}
      </section>}

      <section className="space-y-3">
        <div>
          <p className="text-sm font-semibold">Doublons probables</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">Le score sert uniquement d’aide. Rien n’est fusionné automatiquement.</p>
        </div>
        {duplicateCandidates.length > 0 ? duplicateCandidates.map((candidate) => <article key={candidate.id} className="rounded-lg border p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/dashboard/service/tickets/${candidate.id}`} className="text-sm font-semibold hover:text-primary hover:underline">{candidate.number} · {candidate.title}</Link>
                <Badge variant={candidate.score >= 75 ? "default" : "outline"}>{candidate.score}% · {candidate.confidence.replace("_", " ").toLocaleLowerCase("fr-FR")}</Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{candidate.status} · reçu le {date(candidate.requestedAt)}</p>
              <p className="mt-2 text-xs leading-5">Indices : {candidate.reasons.join(" · ")}.</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 border-t pt-3">
            <Button type="button" size="sm" disabled={pending} onClick={() => merge(candidate.id, ticketId, false)}>{pending ? <Loader2 className="animate-spin" /> : <GitMerge />}Conserver {ticketNumber}</Button>
            <Button type="button" size="sm" variant="outline" disabled={pending || mergedTickets.length > 0} title={mergedTickets.length > 0 ? "Restaurez d’abord les tickets déjà regroupés ici" : `Conserver ${candidate.number}`} onClick={() => merge(ticketId, candidate.id, true)}>Conserver {candidate.number}</Button>
          </div>
        </article>) : <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Aucun doublon probable détecté pour ce client dans les 90 jours autour de cette demande.</div>}
      </section>
    </CardContent>
  </Card>
}
