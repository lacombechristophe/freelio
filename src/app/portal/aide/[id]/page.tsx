import type { CSSProperties } from "react"
import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { ArrowLeft, BookOpen, ShieldCheck } from "lucide-react"
import { notFound } from "next/navigation"

import { sanitizeSequenceEmailHtml } from "@/lib/automations/email"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { getCurrentPortalAccess } from "@/lib/portal/session"
import prisma from "@/lib/prisma"

export const metadata: Metadata = { title: "Aide", robots: { index: false, follow: false, nocache: true } }
export const dynamic = "force-dynamic"

export default async function PortalArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const access = await getCurrentPortalAccess()
  if (!access) notFound()
  const article = await prisma.knowledgeArticle.findFirst({ where: { id: (await params).id, companyId: access.companyId, status: "PUBLISHED", visibility: "PORTAL" }, include: { company: { select: { name: true, logo: true, brandColor: true } } } })
  if (!article) notFound()
  const style = { "--primary": article.company.brandColor || "#1768ff" } as CSSProperties
  return <main style={style} className="min-h-screen bg-[#f7f9fc] text-foreground"><header className="border-b bg-white"><div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-4 sm:px-6"> <div className="flex items-center gap-3">{article.company.logo ? <Image src={article.company.logo} alt="" width={40} height={40} unoptimized className="size-10 rounded-xl border object-contain" /> : <span className="grid size-10 place-items-center rounded-xl bg-primary text-sm font-bold text-primary-foreground">{article.company.name.slice(0, 2).toUpperCase()}</span>}<div><p className="font-semibold">{article.company.name}</p><p className="text-xs text-muted-foreground">Centre d’aide</p></div></div><Button nativeButton={false} render={<Link href="/portal" />} variant="outline"><ArrowLeft />Retour au dossier</Button></div></header><article className="mx-auto max-w-4xl px-4 py-10 sm:px-6"><div className="rounded-2xl border bg-white p-6 shadow-sm sm:p-10"><div className="flex flex-wrap items-center gap-2"><span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><BookOpen className="size-5" /></span>{article.category && <Badge variant="outline">{article.category}</Badge>}</div><h1 className="mt-6 text-3xl font-semibold tracking-tight sm:text-4xl">{article.title}</h1>{article.summary && <p className="mt-4 text-base leading-7 text-muted-foreground">{article.summary}</p>}<div className="prose prose-sm mt-8 max-w-none border-t pt-8" dangerouslySetInnerHTML={{ __html: sanitizeSequenceEmailHtml(article.bodyHtml) }} /><footer className="mt-10 flex items-center gap-2 border-t pt-5 text-xs text-muted-foreground"><ShieldCheck className="size-4 text-primary" />Contenu validé et publié par l’équipe · mis à jour le {new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(article.updatedAt)}</footer></div></article></main>
}

