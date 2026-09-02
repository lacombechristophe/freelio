"use client"

import { useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowUpRight, CheckCircle2, Clock3, Copy, Mail, MapPin, MoreHorizontal, Phone, Search, ShieldCheck, UserRoundSearch } from "lucide-react"
import { toast } from "sonner"

import { createLeadMarketingWithdrawalLink, updateLeadStatus, withdrawLeadMarketingConsent } from "@/actions/leads"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

type LeadData = Awaited<ReturnType<typeof import("@/actions/leads").getLeadDashboard>>
type Lead = LeadData["leads"][number]

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
  const [query, setQuery] = useState("")
  const visibleLeads = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("fr")
    return initialData.leads.filter((lead) => {
      const matchesStatus = filter === "ALL" || filter === "ACTIVE" && !["ARCHIVED", "SPAM"].includes(lead.status) || lead.status === filter
      const searchable = [lead.firstName, lead.lastName, lead.email, lead.phone, lead.city, lead.postalCode, lead.projectType, lead.source].filter(Boolean).join(" ").toLocaleLowerCase("fr")
      return matchesStatus && (!normalizedQuery || searchable.includes(normalizedQuery))
    })
  }, [filter, initialData.leads, query])

  function execute(operation: () => Promise<unknown>, success: string) {
    startTransition(async () => {
      try {
        await operation()
        toast.success(success)
        router.refresh()
      } catch (error: unknown) {
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
      } catch (error: unknown) {
        toast.error(error instanceof Error ? error.message : "Création du lien impossible")
      }
    })
  }

  function leadActions(lead: Lead) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Actions pour ${lead.firstName} ${lead.lastName}`}><MoreHorizontal /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {lead.client ? <DropdownMenuItem onClick={() => router.push(`/dashboard/clients/${lead.client?.id}`)}><ArrowUpRight />Ouvrir le dossier client</DropdownMenuItem> : null}
          {lead.status === "NEW" ? <DropdownMenuItem disabled={isPending} onClick={() => execute(() => updateLeadStatus(lead.id, "CONTACTED"), "Prospect marqué comme contacté.")}><CheckCircle2 />Marquer contacté</DropdownMenuItem> : null}
          {lead.marketingOptIn ? <><DropdownMenuSeparator /><DropdownMenuItem disabled={isPending} onClick={() => copyWithdrawalLink(lead.id)}><Copy />Copier le lien de désinscription</DropdownMenuItem><DropdownMenuItem disabled={isPending} onClick={() => execute(() => withdrawLeadMarketingConsent(lead.id), "Opposition marketing enregistrée avec preuve.")}>Retirer le consentement</DropdownMenuItem></> : null}
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  return (
    <div className="space-y-5">
      <section aria-label="Indicateurs des prospects" className="workspace-metrics overflow-hidden rounded-xl border bg-card">
        <div className="grid sm:grid-cols-2 xl:grid-cols-4">
          <LeadMetric icon={Clock3} label="À traiter" value={initialData.counts.NEW} detail="Rappel attendu sous 48 h" />
          <LeadMetric icon={Phone} label="Contactés" value={initialData.counts.CONTACTED} detail="Premier échange effectué" />
          <LeadMetric icon={CheckCircle2} label="Qualifiés" value={initialData.counts.QUALIFIED} detail="Besoin confirmé" />
          <LeadMetric icon={ShieldCheck} label="Consentements" value={initialData.leads.filter((lead) => lead.marketingOptIn).length} detail="Opt-in marketing actif" />
        </div>
      </section>

      <div className="workspace-panel flex flex-col gap-3 p-3 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1 lg:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher un prospect, une ville, un projet…" aria-label="Rechercher un prospect" className="pl-9" />
        </div>
        <div className="flex items-center gap-3 lg:ml-auto">
          <span className="text-xs text-muted-foreground" aria-live="polite">{visibleLeads.length} demande{visibleLeads.length > 1 ? "s" : ""}</span>
          <Select value={filter} onValueChange={(value) => value && setFilter(value)}><SelectTrigger aria-label="Filtrer les prospects" className="w-48"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ACTIVE">À suivre</SelectItem><SelectItem value="ALL">Tous les statuts</SelectItem>{statusOptions.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
        </div>
      </div>

      {visibleLeads.length ? <>
        <div className="workspace-panel hidden overflow-x-auto md:block">
          <Table className="min-w-[1080px]">
            <TableHeader><TableRow><TableHead>Prospect et besoin</TableHead><TableHead>Coordonnées</TableHead><TableHead>Priorité</TableHead><TableHead>Consentement</TableHead><TableHead>Reçu</TableHead><TableHead>Statut</TableHead><TableHead className="w-12"><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
            <TableBody>{visibleLeads.map((lead) => <TableRow key={lead.id}>
              <TableCell className="min-w-64"><div className="flex items-center gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{lead.firstName.slice(0, 1)}{lead.lastName.slice(0, 1)}</span><div className="min-w-0"><p className="truncate font-semibold">{lead.firstName} {lead.lastName}</p><p className="mt-0.5 max-w-64 truncate text-xs text-muted-foreground" title={lead.message || undefined}>{lead.projectType || lead.message || "Projet à qualifier"}</p></div></div></TableCell>
              <TableCell className="min-w-56"><div className="space-y-1 text-xs">{lead.email ? <a href={`mailto:${lead.email}`} className="flex items-center gap-2 hover:text-primary"><Mail className="size-3.5 text-muted-foreground" />{lead.email}</a> : null}{lead.phone ? <a href={`tel:${lead.phone}`} className="flex items-center gap-2 hover:text-primary"><Phone className="size-3.5 text-muted-foreground" />{lead.phone}</a> : null}{lead.postalCode || lead.city ? <span className="flex items-center gap-2 text-muted-foreground"><MapPin className="size-3.5" />{[lead.postalCode, lead.city].filter(Boolean).join(" ")}</span> : null}</div></TableCell>
              <TableCell><div className="flex items-center gap-2"><Badge variant={lead.score >= 60 ? "default" : "outline"}>{lead.score} pts</Badge><span className="text-xs text-muted-foreground">{lead.source}</span></div></TableCell>
              <TableCell><span className="inline-flex items-center gap-1.5 text-xs"><ShieldCheck className="size-3.5 text-muted-foreground" />{lead.marketingOptIn ? "Marketing accepté" : "Service uniquement"}</span></TableCell>
              <TableCell className="text-xs text-muted-foreground">{formatDate(lead.createdAt)}</TableCell>
              <TableCell><Select value={lead.status} disabled={isPending} onValueChange={(value) => value && execute(() => updateLeadStatus(lead.id, value), "Statut du prospect actualisé.")}><SelectTrigger aria-label={`Statut de ${lead.firstName} ${lead.lastName}`} className="w-36"><SelectValue /></SelectTrigger><SelectContent>{statusOptions.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></TableCell>
              <TableCell>{leadActions(lead)}</TableCell>
            </TableRow>)}</TableBody>
          </Table>
        </div>

        <div className="space-y-3 md:hidden">{visibleLeads.map((lead) => <article key={lead.id} className="workspace-panel p-4">
          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">{lead.firstName} {lead.lastName}</h2><Badge variant={lead.status === "NEW" ? "default" : lead.status === "SPAM" ? "destructive" : "secondary"}>{STATUS_LABELS[lead.status] ?? lead.status}</Badge></div><p className="mt-1 truncate text-sm text-muted-foreground">{lead.projectType || "Projet à qualifier"}</p></div>{leadActions(lead)}</div>
          <div className="mt-4 space-y-2 text-sm text-muted-foreground">{lead.email ? <a className="flex min-h-9 items-center gap-2" href={`mailto:${lead.email}`}><Mail className="size-4" />{lead.email}</a> : null}{lead.phone ? <a className="flex min-h-9 items-center gap-2" href={`tel:${lead.phone}`}><Phone className="size-4" />{lead.phone}</a> : null}{lead.postalCode || lead.city ? <p className="flex min-h-9 items-center gap-2"><MapPin className="size-4" />{[lead.postalCode, lead.city].filter(Boolean).join(" ")}</p> : null}</div>
          {lead.message ? <p className="mt-3 line-clamp-3 rounded-lg bg-muted/50 p-3 text-sm leading-6">{lead.message}</p> : null}
          <div className="mt-4 flex items-center justify-between gap-3 border-t pt-4"><Badge variant={lead.score >= 60 ? "default" : "outline"}>{lead.score} points</Badge><Select value={lead.status} disabled={isPending} onValueChange={(value) => value && execute(() => updateLeadStatus(lead.id, value), "Statut du prospect actualisé.")}><SelectTrigger aria-label={`Statut de ${lead.firstName} ${lead.lastName}`} className="w-36"><SelectValue /></SelectTrigger><SelectContent>{statusOptions.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
          {lead.client ? <Link className={buttonVariants({ variant: "outline", size: "sm", className: "mt-3 w-full" })} href={`/dashboard/clients/${lead.client.id}`}><ArrowUpRight />Dossier client</Link> : null}
        </article>)}</div>
      </> : <div className="workspace-panel border-dashed px-6 py-16 text-center"><UserRoundSearch className="mx-auto size-7 text-muted-foreground" /><p className="mt-3 text-sm font-medium">Aucun prospect dans cette vue</p><p className="mt-1 text-xs text-muted-foreground">Modifiez la recherche ou attendez une nouvelle demande du site.</p></div>}
    </div>
  )
}

function LeadMetric({ icon: Icon, label, value, detail }: { icon: typeof Clock3; label: string; value: number; detail: string }) {
  return <div className="workspace-metric flex min-w-0 items-center gap-3 border-b p-4 last:border-b-0 sm:[&:nth-child(odd)]:border-r sm:[&:nth-child(3)]:border-b-0 sm:[&:nth-child(4)]:border-b-0 xl:border-b-0 xl:border-r xl:last:border-r-0"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Icon className="size-4" /></span><div className="min-w-0"><p className="text-[25px] font-semibold leading-none tabular-nums tracking-tight">{value}</p><p className="mt-1 truncate text-[13px] font-medium">{label}</p><p className="mt-0.5 truncate text-xs text-muted-foreground">{detail}</p></div></div>
}
