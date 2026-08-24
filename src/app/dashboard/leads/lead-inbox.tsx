"use client"

import { useMemo, useState, useTransition } from "react"
import { ArrowUpRight, CheckCircle2, Clock3, Copy, Mail, MapPin, Phone, ShieldCheck, UserRoundSearch } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { createLeadMarketingWithdrawalLink, updateLeadStatus, withdrawLeadMarketingConsent } from "@/actions/leads"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

type LeadData = Awaited<ReturnType<typeof import("@/actions/leads").getLeadDashboard>>

const STATUS_LABELS: Record<string, string> = {
  NEW: "Nouveau",
  CONTACTED: "Contacté",
  QUALIFIED: "Qualifié",
  ARCHIVED: "Archivé",
  SPAM: "Spam",
}

const statusOptions = Object.entries(STATUS_LABELS)

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
}

export function LeadInbox({ initialData }: { initialData: LeadData }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [filter, setFilter] = useState("ACTIVE")
  const visibleLeads = useMemo(() => initialData.leads.filter((lead) => {
    if (filter === "ALL") return true
    if (filter === "ACTIVE") return !["ARCHIVED", "SPAM"].includes(lead.status)
    return lead.status === filter
  }), [filter, initialData.leads])

  function execute(operation: () => Promise<unknown>, success: string) {
    startTransition(async () => {
      try {
        await operation()
        toast.success(success)
        router.refresh()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Action impossible")
      }
    })
  }

  function copyWithdrawalLink(leadId: string) {
    startTransition(async () => {
      try {
        const result = await createLeadMarketingWithdrawalLink(leadId)
        await navigator.clipboard.writeText(`${window.location.origin}${result.withdrawalPath}`)
        toast.success("Lien de désinscription copié.")
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Création du lien impossible")
      }
    })
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">À traiter</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold tabular-nums">{initialData.counts.NEW}</p><p className="mt-1 text-xs text-muted-foreground">Rappel attendu sous 48 h</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Contactés</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold tabular-nums">{initialData.counts.CONTACTED}</p><p className="mt-1 text-xs text-muted-foreground">Premier échange effectué</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Qualifiés</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold tabular-nums">{initialData.counts.QUALIFIED}</p><p className="mt-1 text-xs text-muted-foreground">Besoin confirmé</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Consentements</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold tabular-nums">{initialData.leads.filter((lead) => lead.marketingOptIn).length}</p><p className="mt-1 text-xs text-muted-foreground">Opt-in marketing actif</p></CardContent></Card>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3"><UserRoundSearch className="size-5 text-primary" /><div><p className="text-sm font-semibold">File commerciale</p><p className="text-xs text-muted-foreground">{visibleLeads.length} demande{visibleLeads.length > 1 ? "s" : ""} affichée{visibleLeads.length > 1 ? "s" : ""}</p></div></div>
        <Select value={filter} onValueChange={(value) => { if (value) setFilter(value) }}><SelectTrigger className="w-full sm:w-48"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ACTIVE">À suivre</SelectItem><SelectItem value="ALL">Tous les statuts</SelectItem>{statusOptions.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
      </div>

      {visibleLeads.length ? <div className="grid gap-4 xl:grid-cols-2">{visibleLeads.map((lead) => (
        <article key={lead.id} className="rounded-xl border bg-card p-5 shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><h2 className="text-base font-semibold">{lead.firstName} {lead.lastName}</h2><Badge variant={lead.status === "NEW" ? "default" : lead.status === "SPAM" ? "destructive" : "secondary"}>{STATUS_LABELS[lead.status] ?? lead.status}</Badge></div>
              <p className="mt-1 text-sm text-muted-foreground">{lead.projectType || "Projet à qualifier"}</p>
            </div>
            <Select value={lead.status} disabled={isPending} onValueChange={(value) => { if (value) execute(() => updateLeadStatus(lead.id, value), "Statut du prospect actualisé.") }}><SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger><SelectContent>{statusOptions.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
          </div>

          <div className="mt-4 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
            {lead.email ? <a className="flex min-h-10 items-center gap-2 rounded-lg px-2 hover:bg-muted hover:text-foreground" href={`mailto:${lead.email}`}><Mail className="size-4" />{lead.email}</a> : null}
            {lead.phone ? <a className="flex min-h-10 items-center gap-2 rounded-lg px-2 hover:bg-muted hover:text-foreground" href={`tel:${lead.phone}`}><Phone className="size-4" />{lead.phone}</a> : null}
            {lead.postalCode || lead.city ? <p className="flex min-h-10 items-center gap-2 px-2"><MapPin className="size-4" />{[lead.postalCode, lead.city].filter(Boolean).join(" ")}</p> : null}
            <p className="flex min-h-10 items-center gap-2 px-2"><Clock3 className="size-4" />{formatDate(lead.createdAt)}</p>
          </div>

          {lead.message ? <p className="mt-4 rounded-lg bg-muted/50 p-3 text-sm leading-6 text-foreground">{lead.message}</p> : null}

          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline">{lead.source}</Badge>
            {lead.utmSource ? <span>Source UTM : {lead.utmSource}</span> : null}
            {lead.utmCampaign ? <span>Campagne : {lead.utmCampaign}</span> : null}
            <span className="inline-flex items-center gap-1"><ShieldCheck className="size-3.5" />{lead.marketingOptIn ? "Marketing accepté" : "Service uniquement"}</span>
          </div>

          <div className="mt-5 flex flex-wrap gap-2 border-t pt-4">
            {lead.client ? <Link className={buttonVariants({ variant: "outline", size: "sm" })} href={`/dashboard/clients/${lead.client.id}`}><ArrowUpRight />Dossier client</Link> : null}
            {lead.status === "NEW" ? <Button size="sm" disabled={isPending} onClick={() => execute(() => updateLeadStatus(lead.id, "CONTACTED"), "Prospect marqué comme contacté.")}><CheckCircle2 />Marquer contacté</Button> : null}
            {lead.marketingOptIn ? <Button variant="outline" size="sm" disabled={isPending} onClick={() => copyWithdrawalLink(lead.id)}><Copy />Copier le lien de désinscription</Button> : null}
            {lead.marketingOptIn ? <Button variant="ghost" size="sm" disabled={isPending} onClick={() => execute(() => withdrawLeadMarketingConsent(lead.id), "Opposition marketing enregistrée avec preuve.")}>Retirer en interne</Button> : null}
          </div>
        </article>
      ))}</div> : <div className="rounded-xl border border-dashed bg-card px-6 py-16 text-center"><UserRoundSearch className="mx-auto size-7 text-muted-foreground" /><p className="mt-3 text-sm font-medium">Aucun prospect dans cette vue</p><p className="mt-1 text-xs text-muted-foreground">Les demandes du site public apparaîtront ici automatiquement.</p></div>}
    </div>
  )
}
