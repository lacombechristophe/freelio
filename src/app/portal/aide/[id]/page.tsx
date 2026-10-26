import type { CSSProperties } from "react"
import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, BookOpen, ShieldCheck } from "lucide-react"
import { notFound } from "next/navigation"

import { sanitizeSequenceEmailHtml } from "@/lib/automations/email"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CompanyIdentity } from "@/components/shared/company-identity"
import { getCurrentPortalAccess } from "@/lib/portal/session"
import prisma from "@/lib/prisma"

export const metadata: Metadata = { title: "Aide", robots: { index: false, follow: false, nocache: true } }
export const dynamic = "force-dynamic"

export default async function PortalArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const access = await getCurrentPortalAccess()
  if (!access) notFound()
  const article = await prisma.knowledgeArticle.findFirst({ where: { id: (await params).id, companyId: access.companyId, status: "PUBLISHED", visibility: "PORTAL" }, include: { company: { select: { name: true, logo: true, brandColor: true, serviceTimezone: true } } } })
  if (!article) notFound()
  const style = { "--portal-brand": article.company.brandColor || "#1768ff" } as CSSProperties
  return (
    <main style={style} className="min-h-screen bg-background text-foreground [--primary:var(--portal-brand)] dark:[--primary:var(--portal-theme-primary)]">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <CompanyIdentity company={article.company} caption="Centre d’aide" />
          <Button nativeButton={false} render={<Link href="/portal" />} variant="outline" className="h-auto min-h-9 max-w-full whitespace-normal py-2"><ArrowLeft />Retour au dossier</Button>
        </div>
      </header>
      <article className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <div className="min-w-0 rounded-2xl border bg-card p-6 shadow-sm sm:p-10">
          <div className="flex flex-wrap items-center gap-2">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><BookOpen className="size-5" /></span>
            {article.category && <Badge variant="outline" className="h-auto min-h-5 max-w-full whitespace-normal [overflow-wrap:anywhere]">{article.category}</Badge>}
          </div>
          <h1 className="mt-6 text-3xl font-semibold tracking-tight [overflow-wrap:anywhere] sm:text-4xl">{article.title}</h1>
          {article.summary && <p className="mt-4 text-base leading-7 text-muted-foreground [overflow-wrap:anywhere]">{article.summary}</p>}
          <div className="prose prose-sm mt-8 max-w-none border-t pt-8 [overflow-wrap:anywhere] dark:prose-invert [&_img]:h-auto [&_img]:max-w-full [&_pre]:overflow-x-auto [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto" dangerouslySetInnerHTML={{ __html: sanitizeSequenceEmailHtml(article.bodyHtml) }} />
          <footer className="mt-10 flex items-start gap-2 border-t pt-5 text-xs text-muted-foreground">
            <ShieldCheck className="size-4 shrink-0 text-primary" />
            <span>Contenu validé et publié par l’équipe · mis à jour le {new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: article.company.serviceTimezone }).format(article.updatedAt)}</span>
          </footer>
        </div>
      </article>
    </main>
  )
}
