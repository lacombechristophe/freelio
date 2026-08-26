"use client"

import * as React from "react"
import Link from "next/link"
import { Building2, Mail, Phone, Search, ShieldCheck, UserRound } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

type ContactRow = NonNullable<Awaited<ReturnType<typeof import("@/actions/contacts").getContactsDirectory>>>[number]

export function ContactsDirectory({ contacts }: { contacts: ContactRow[] }) {
  const [search, setSearch] = React.useState("")
  const [marketing, setMarketing] = React.useState("ALL")
  const normalized = search.trim().toLowerCase()
  const visible = contacts.filter((contact) => {
    if (marketing === "OPTED_IN" && contact.marketingStatus !== "OPTED_IN") return false
    if (marketing === "OPTED_OUT" && contact.marketingStatus !== "OPTED_OUT") return false
    if (!normalized) return true
    return [contact.firstName, contact.lastName, contact.email, contact.phone, contact.role, contact.client.name].some((value) => value?.toLowerCase().includes(normalized))
  })

  return <div className="space-y-4">
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 lg:flex-row lg:items-center">
      <div className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Rechercher un contact" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nom, entreprise, e-mail, téléphone…" className="pl-9" /></div>
      <Select value={marketing} onValueChange={(value) => setMarketing(value ?? "ALL")}><SelectTrigger aria-label="Filtrer par consentement" className="w-full lg:w-52"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">Tous les consentements</SelectItem><SelectItem value="OPTED_IN">Marketing accepté</SelectItem><SelectItem value="OPTED_OUT">Marketing refusé</SelectItem></SelectContent></Select>
      <p className="shrink-0 text-xs text-muted-foreground">{visible.length} sur {contacts.length}</p>
    </div>

    {visible.length ? <div className="overflow-hidden rounded-xl border bg-card">
      <div className="hidden grid-cols-[minmax(220px,1fr)_minmax(180px,0.9fr)_minmax(220px,1fr)_140px] gap-4 border-b bg-muted/35 px-5 py-3 text-xs font-semibold text-muted-foreground md:grid"><span>Contact</span><span>Client</span><span>Coordonnées</span><span>Engagement</span></div>
      <div className="divide-y">{visible.map((contact) => <article key={contact.id} className="grid gap-4 px-5 py-4 transition-colors hover:bg-muted/20 md:grid-cols-[minmax(220px,1fr)_minmax(180px,0.9fr)_minmax(220px,1fr)_140px] md:items-center">
        <div className="flex min-w-0 items-center gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"><UserRound className="size-4" /></span><div className="min-w-0"><Link href={`/dashboard/contacts/${contact.id}`} className="block truncate text-sm font-semibold hover:text-primary hover:underline">{contact.firstName} {contact.lastName}</Link><p className="mt-0.5 truncate text-xs text-muted-foreground">{contact.role || "Fonction non renseignée"}</p><div className="mt-1 flex gap-1">{contact.isPrimary && <Badge variant="secondary">Principal</Badge>}{contact.lifecycleStage && <Badge variant="outline">{contact.lifecycleStage}</Badge>}</div></div></div>
        <Link href={`/dashboard/clients/${contact.client.id}`} className="flex min-w-0 items-center gap-2 text-sm font-medium hover:text-primary"><Building2 className="size-4 shrink-0 text-muted-foreground" /><span className="truncate">{contact.client.name}</span></Link>
        <div className="flex min-w-0 flex-col gap-1">{contact.email ? <a href={`mailto:${contact.email}`} className="flex items-center gap-2 truncate text-sm hover:text-primary"><Mail className="size-3.5 shrink-0 text-muted-foreground" />{contact.email}</a> : <span className="text-xs text-muted-foreground">E-mail non renseigné</span>}{contact.phone ? <a href={`tel:${contact.phone}`} className="flex items-center gap-2 text-sm hover:text-primary"><Phone className="size-3.5 shrink-0 text-muted-foreground" />{contact.phone}</a> : null}</div>
        <div><Badge variant={contact.marketingStatus === "OPTED_OUT" ? "destructive" : contact.marketingStatus === "OPTED_IN" ? "secondary" : "outline"}><ShieldCheck />{contact.marketingStatus === "OPTED_OUT" ? "Refusé" : contact.marketingStatus === "OPTED_IN" ? "Accepté" : "Non défini"}</Badge><p className="mt-2 text-[11px] text-muted-foreground">{contact._count.emailDeliveries} e-mail(s) · {contact._count.sequenceEnrollments} séquence(s)</p></div>
      </article>)}</div>
    </div> : <div className="rounded-xl border border-dashed bg-card py-16 text-center"><UserRound className="mx-auto size-8 text-muted-foreground/50" /><p className="mt-3 text-sm font-semibold">Aucun contact dans cette vue</p><p className="mt-1 text-xs text-muted-foreground">Modifiez les filtres ou ajoutez un contact depuis une fiche client.</p><Button nativeButton={false} className="mt-4" variant="outline" render={<Link href="/dashboard/clients" />}>Ouvrir les clients</Button></div>}
  </div>
}
