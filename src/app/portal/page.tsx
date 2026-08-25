import type { CSSProperties } from "react"
import type { Metadata } from "next"
import Link from "next/link"
import Image from "next/image"
import { CalendarDays, CheckCircle2, Clock3, Download, FileText, FolderKanban, LogOut, MapPin, MessageSquare, ReceiptText, ShieldCheck } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { getCurrentPortalAccess } from "@/lib/portal/session"
import prisma from "@/lib/prisma"
import { PortalWorkspace } from "./portal-workspace"

export const metadata: Metadata = {
  title: "Espace client sécurisé",
  robots: { index: false, follow: false, nocache: true },
}

export const dynamic = "force-dynamic"

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(value)
}

function formatEuro(cents: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100)
}

const projectLabels: Record<string, string> = { ACTIVE: "En cours", COMPLETED: "Terminé", ARCHIVED: "Archivé", PLANNED: "Planifié" }

function EmptyPortal({ invalid }: { invalid: boolean }) {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f7f9fc] px-5">
      <section className="w-full max-w-lg rounded-2xl border bg-white p-8 text-center shadow-sm">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary"><ShieldCheck className="size-6" /></span>
        <h1 className="mt-5 text-xl font-semibold">Espace client sécurisé</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {invalid ? "Ce lien a expiré, a été révoqué ou n’est plus valide." : "Utilisez le lien personnel transmis par l’entreprise pour ouvrir votre dossier."}
        </p>
        <p className="mt-5 rounded-xl bg-muted/50 p-3 text-xs leading-5 text-muted-foreground">Pour protéger vos informations, aucun dossier n’est accessible sans lien actif.</p>
      </section>
    </main>
  )
}

export default async function PortalPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [access, query] = await Promise.all([getCurrentPortalAccess(), searchParams])
  if (!access) return <EmptyPortal invalid={query.error === "invalid"} />

  const now = new Date()
  const [company, projects, quotes, invoices, contracts, files, interventions, messages, appointments] = await Promise.all([
    prisma.company.findUniqueOrThrow({
      where: { id: access.companyId },
      select: { name: true, logo: true, brandColor: true, email: true, phone: true, address: true },
    }),
    prisma.project.findMany({
      where: { companyId: access.companyId, clientId: access.clientId, status: { not: "ARCHIVED" } },
      include: { milestones: { orderBy: { order: "asc" }, select: { id: true, title: true, status: true, dueDate: true } } },
      orderBy: { updatedAt: "desc" },
      take: 12,
    }),
    prisma.quote.findMany({
      where: { companyId: access.companyId, clientId: access.clientId, status: { not: "DRAFT" } },
      include: { versions: { orderBy: { version: "desc" }, take: 1, select: { totalTtcCents: true } } },
      orderBy: { date: "desc" },
      take: 20,
    }),
    prisma.invoice.findMany({
      where: { companyId: access.companyId, clientId: access.clientId, status: { notIn: ["DRAFT", "CANCELLED"] } },
      orderBy: { date: "desc" },
      take: 30,
    }),
    prisma.contract.findMany({
      where: { companyId: access.companyId, clientId: access.clientId, status: { not: "DRAFT" } },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.clientFile.findMany({ where: { clientId: access.clientId }, orderBy: { createdAt: "desc" }, take: 30 }),
    prisma.fieldIntervention.findMany({
      where: { companyId: access.companyId, site: { clientId: access.clientId }, scheduledStart: { gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1_000) } },
      include: { site: { select: { label: true, city: true } } },
      orderBy: { scheduledStart: "asc" },
      take: 20,
    }),
    prisma.clientPortalMessage.findMany({ where: { companyId: access.companyId, clientId: access.clientId }, orderBy: { createdAt: "asc" }, take: 100 }),
    prisma.clientPortalAppointmentRequest.findMany({ where: { companyId: access.companyId, clientId: access.clientId }, orderBy: { createdAt: "desc" }, take: 20 }),
  ])

  const upcoming = interventions.filter((item) => item.scheduledStart >= now && !["CANCELLED", "COMPLETED"].includes(item.status))
  const outstandingCents = invoices.filter((invoice) => ["SENT", "OVERDUE"].includes(invoice.status)).reduce((sum, invoice) => sum + Math.max(0, invoice.totalTtcCents - invoice.paidAmountCents), 0)
  const activeProjects = projects.filter((project) => project.status !== "COMPLETED")
  const contactName = access.contact ? `${access.contact.firstName} ${access.contact.lastName}`.trim() : access.client.name
  const style = { "--primary": company.brandColor || "#1768ff" } as CSSProperties

  return (
    <main style={style} className="min-h-screen bg-[#f7f9fc] text-foreground">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            {company.logo ? <Image src={company.logo} alt="" width={40} height={40} unoptimized className="size-10 rounded-xl border object-contain" /> : <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-sm font-bold text-primary-foreground">{company.name.slice(0, 2).toUpperCase()}</span>}
            <div className="min-w-0"><p className="truncate font-semibold">{company.name}</p><p className="text-xs text-muted-foreground">Espace client sécurisé</p></div>
          </div>
          <form action="/api/portal/logout" method="post"><Button variant="ghost" type="submit"><LogOut />Quitter</Button></form>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-7 px-4 py-7 sm:px-6 lg:px-8 lg:py-10">
        <section className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div><p className="text-sm font-medium text-primary">Bonjour {contactName}</p><h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">Votre dossier en un coup d’œil</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">Suivez l’avancement, consultez vos documents et échangez avec l’équipe depuis un espace unique.</p></div>
          <div className="flex flex-wrap gap-2"><a href="#documents"><Button variant="outline"><FileText />Documents</Button></a><a href="#messages"><Button><MessageSquare />Écrire à l’équipe</Button></a></div>
        </section>

        <section className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Dossiers actifs</span><FolderKanban className="size-4 text-primary" /></div><p className="mt-4 text-3xl font-semibold tabular-nums">{activeProjects.length}</p><p className="mt-1 text-xs text-muted-foreground">projet{activeProjects.length === 1 ? "" : "s"} en cours</p></div>
          <div className="rounded-2xl border bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Prochaine visite</span><CalendarDays className="size-4 text-primary" /></div><p className="mt-4 text-lg font-semibold">{upcoming[0] ? formatDate(upcoming[0].scheduledStart) : "Aucune planifiée"}</p><p className="mt-1 text-xs text-muted-foreground">{upcoming[0]?.title ?? "Vous pouvez proposer un rendez-vous"}</p></div>
          <div className="rounded-2xl border bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Reste à régler</span><ReceiptText className="size-4 text-primary" /></div><p className="mt-4 text-3xl font-semibold tabular-nums">{formatEuro(outstandingCents)}</p><p className="mt-1 text-xs text-muted-foreground">selon les factures émises</p></div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-2xl border bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><FolderKanban className="size-5" /></span><div><h2 className="font-semibold">Avancement des dossiers</h2><p className="text-sm text-muted-foreground">Étapes terminées et prochaines échéances.</p></div></div>
            <div className="mt-5 space-y-4">
              {projects.length === 0 ? <p className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">Aucun dossier actif.</p> : projects.map((project) => {
                const completed = project.milestones.filter((milestone) => milestone.status === "COMPLETED").length
                const progress = project.milestones.length ? Math.round(completed / project.milestones.length * 100) : project.status === "COMPLETED" ? 100 : 0
                const next = project.milestones.find((milestone) => milestone.status !== "COMPLETED")
                return <article key={project.id} className="rounded-xl border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">{project.name}</h3>{project.description && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{project.description}</p>}</div><Badge variant="secondary">{projectLabels[project.status] ?? project.status}</Badge></div>
                  <div className="mt-4 flex items-center gap-3"><div className="h-2 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} /></div><span className="text-xs font-semibold tabular-nums">{progress}%</span></div>
                  {next && <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground"><Clock3 className="size-3.5" />Prochaine étape : <span className="font-medium text-foreground">{next.title}</span>{next.dueDate ? ` · ${formatDate(next.dueDate)}` : ""}</p>}
                </article>
              })}
            </div>
          </div>

          <div className="rounded-2xl border bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><CalendarDays className="size-5" /></span><div><h2 className="font-semibold">Visites et interventions</h2><p className="text-sm text-muted-foreground">Planning communiqué par l’équipe.</p></div></div>
            <div className="mt-5 space-y-3">
              {interventions.length === 0 ? <p className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">Aucune intervention récente ou planifiée.</p> : interventions.map((item) => <article key={item.id} className="rounded-xl border p-3.5"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold">{item.title}</p><p className="mt-1 text-xs text-muted-foreground">{formatDate(item.scheduledStart)}</p><p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="size-3" />{item.site.label}{item.site.city ? ` · ${item.site.city}` : ""}</p></div>{item.status === "COMPLETED" ? <CheckCircle2 className="size-5 text-emerald-600" /> : <Badge variant="outline">{item.status}</Badge>}</div></article>)}
            </div>
          </div>
        </section>

        <section id="documents" className="rounded-2xl border bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><FileText className="size-5" /></span><div><h2 className="font-semibold">Documents</h2><p className="text-sm text-muted-foreground">Les documents publiés par l’entreprise restent disponibles ici.</p></div></div>
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {quotes.map((quote) => <Link key={quote.id} href={`/api/portal/documents/quote/${quote.id}`} target="_blank" className="group flex items-center gap-3 rounded-xl border p-4 transition hover:border-primary/40 hover:bg-primary/[0.025]"><span className="grid size-10 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-700"><FileText className="size-4" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{quote.number} · {quote.object}</span><span className="mt-1 block text-xs text-muted-foreground">Devis · {formatEuro(quote.versions[0]?.totalTtcCents ?? 0)}</span></span><Download className="size-4 text-muted-foreground group-hover:text-primary" /></Link>)}
            {invoices.map((invoice) => <Link key={invoice.id} href={`/api/portal/documents/invoice/${invoice.id}`} target="_blank" className="group flex items-center gap-3 rounded-xl border p-4 transition hover:border-primary/40 hover:bg-primary/[0.025]"><span className="grid size-10 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-700"><ReceiptText className="size-4" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{invoice.number} · {invoice.object}</span><span className="mt-1 block text-xs text-muted-foreground">Facture · {formatEuro(invoice.totalTtcCents)}</span></span><Download className="size-4 text-muted-foreground group-hover:text-primary" /></Link>)}
            {files.map((file) => <Link key={file.id} href={`/api/portal/files/${file.id}`} target="_blank" className="group flex items-center gap-3 rounded-xl border p-4 transition hover:border-primary/40 hover:bg-primary/[0.025]"><span className="grid size-10 shrink-0 place-items-center rounded-lg bg-violet-50 text-violet-700"><FileText className="size-4" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{file.name}</span><span className="mt-1 block text-xs text-muted-foreground">Fichier · {Math.max(1, Math.round(file.size / 1024))} Ko</span></span><Download className="size-4 text-muted-foreground group-hover:text-primary" /></Link>)}
            {contracts.map((contract) => <div key={contract.id} className="flex items-center gap-3 rounded-xl border p-4"><span className="grid size-10 shrink-0 place-items-center rounded-lg bg-amber-50 text-amber-700"><ShieldCheck className="size-4" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{contract.number} · {contract.title}</span><span className="mt-1 block text-xs text-muted-foreground">Contrat · {contract.status}</span></span></div>)}
            {quotes.length + invoices.length + files.length + contracts.length === 0 && <p className="col-span-full rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">Aucun document publié.</p>}
          </div>
        </section>

        <PortalWorkspace
          messages={messages.map((message) => ({ ...message, createdAt: message.createdAt.toISOString() }))}
          appointments={appointments.map((appointment) => ({ ...appointment, preferredStart: appointment.preferredStart.toISOString(), alternativeStart: appointment.alternativeStart?.toISOString() ?? null }))}
        />
      </div>

      <footer className="border-t bg-white"><div className="mx-auto flex max-w-7xl flex-col justify-between gap-2 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:px-6 lg:px-8"><span>Accès personnel et confidentiel · Ne transférez pas ce lien.</span><span>{[company.email, company.phone].filter(Boolean).join(" · ")}</span></div></footer>
    </main>
  )
}
