"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { BookOpen, Eye, FilePenLine, Globe2, Plus, Search, ShieldCheck } from "lucide-react"
import { toast } from "sonner"

import { createKnowledgeArticle, updateKnowledgeArticle } from "@/actions/service-content"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { HelpTip } from "@/components/ui/help-tip"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

type ServiceContentData = NonNullable<Awaited<ReturnType<typeof import("@/actions/service-content").getServiceContentDashboard>>>
type Article = ServiceContentData["articles"][number]
const controlClass = "h-10 w-full rounded-[10px] border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/20"
const statusLabels: Record<string, string> = { DRAFT: "Brouillon", PUBLISHED: "Publié", ARCHIVED: "Archivé" }

export function KnowledgeCenter({ initialData }: { initialData: ServiceContentData }) {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()
  const [search, setSearch] = React.useState("")
  const filtered = initialData.articles.filter((item) => `${item.title} ${item.summary || ""} ${item.category || ""} ${item.tags.join(" ")}`.toLowerCase().includes(search.toLowerCase()))
  const published = initialData.articles.filter((item) => item.status === "PUBLISHED").length
  const portal = initialData.articles.filter((item) => item.status === "PUBLISHED" && item.visibility === "PORTAL").length

  function run(task: () => Promise<unknown>, success: string, form?: HTMLFormElement) {
    startTransition(() => void task().then(() => { form?.reset(); toast.success(success); router.refresh() }).catch((error) => toast.error(error instanceof Error ? error.message : "Action impossible.")))
  }

  return <div className="space-y-6">
    <section className="record-metrics grid grid-cols-2 overflow-hidden rounded-xl border bg-card sm:grid-cols-3"><Metric icon={BookOpen} label="Articles actifs" value={initialData.articles.length} detail="Hors archives" /><Metric icon={ShieldCheck} label="Validés" value={published} detail="Contenu publié" /><Metric icon={Globe2} label="Espace client" value={portal} detail="Visibles par les clients" /></section>
    <details className="group rounded-xl border bg-card"><summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-5 font-semibold"><span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary"><Plus className="size-4" /></span>Rédiger un article<span className="ml-auto text-xs font-normal text-muted-foreground group-open:hidden">Procédure, FAQ ou conseil client</span></summary><div className="border-t p-5"><ArticleForm pending={pending} onSubmit={(payload, form) => run(() => createKnowledgeArticle(payload), "Article créé.", form)} /></div></details>
    <div className="flex items-center gap-3 rounded-xl border bg-card p-3"><Search className="ml-1 size-4 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} className="border-0 shadow-none focus-visible:ring-0" placeholder="Rechercher par titre, catégorie ou mot-clé…" aria-label="Rechercher dans la base de connaissances" /></div>
    {filtered.length ? <div className="grid gap-5 xl:grid-cols-2">{filtered.map((article) => <ArticleCard key={article.id} article={article} pending={pending} onUpdate={(payload, form) => run(() => updateKnowledgeArticle(article.id, payload), "Article mis à jour.", form)} />)}</div> : <div className="rounded-xl border border-dashed bg-card py-16 text-center"><BookOpen className="mx-auto size-8 text-muted-foreground/50" /><p className="mt-3 text-sm font-semibold">Aucun article correspondant</p><p className="mt-1 text-xs text-muted-foreground">Créez une première réponse réutilisable ou modifiez la recherche.</p></div>}
  </div>
}

function ArticleCard({ article, pending, onUpdate }: { article: Article; pending: boolean; onUpdate: (payload: Record<string, unknown>, form: HTMLFormElement) => void }) {
  const [preview, setPreview] = React.useState(false)
  return <Card className="overflow-hidden"><CardHeader className="border-b bg-muted/20"><div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><CardTitle className="text-base">{article.title}</CardTitle><Badge variant={article.status === "PUBLISHED" ? "default" : "secondary"}>{statusLabels[article.status] || article.status}</Badge><Badge variant="outline">{article.visibility === "PORTAL" ? "Espace client" : "Interne"}</Badge></div><CardDescription className="mt-2">{article.summary || "Aucun résumé renseigné."}</CardDescription></div><Button variant="ghost" size="icon" onClick={() => setPreview((value) => !value)} aria-label={preview ? "Modifier l’article" : "Prévisualiser l’article"}>{preview ? <FilePenLine /> : <Eye />}</Button></div><p className="text-xs text-muted-foreground">{article.category || "Sans catégorie"} · mis à jour le {new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(article.updatedAt))}</p></CardHeader><CardContent className="pt-5">{preview ? <div><div className="prose prose-sm max-w-none rounded-xl border bg-background p-5" dangerouslySetInnerHTML={{ __html: article.bodyHtml }} /><p className="mt-3 text-xs text-muted-foreground">Aperçu sécurisé après nettoyage HTML. Les scripts, formulaires et contenus embarqués sont supprimés.</p></div> : <ArticleForm article={article} pending={pending} submitLabel="Enregistrer les modifications" onSubmit={onUpdate} />}</CardContent></Card>
}

function ArticleForm({ article, pending, submitLabel = "Créer l’article", onSubmit }: { article?: Article; pending: boolean; submitLabel?: string; onSubmit: (payload: Record<string, unknown>, form: HTMLFormElement) => void }) {
  return <form className="grid gap-4 lg:grid-cols-2" onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); onSubmit({ title: data.get("title"), slug: data.get("slug"), summary: data.get("summary"), bodyHtml: data.get("bodyHtml"), category: data.get("category"), status: data.get("status"), visibility: data.get("visibility"), tags: String(data.get("tags") || "").split(",").map((tag) => tag.trim()).filter(Boolean) }, form) }}>
    <Field label="Titre"><Input name="title" required minLength={3} defaultValue={article?.title} placeholder="Préparer une intervention SAV" /></Field><Field label="Catégorie"><Input name="category" defaultValue={article?.category || ""} placeholder="SAV, installation, entretien…" /></Field><Field label="Adresse courte"><Input name="slug" defaultValue={article?.slug || ""} placeholder="Générée automatiquement si vide" /></Field><Field label="Mots-clés"><Input name="tags" defaultValue={article?.tags.join(", ") || ""} placeholder="garantie, panne, entretien" /></Field><div className="lg:col-span-2"><Field label="Résumé"><Textarea name="summary" rows={2} defaultValue={article?.summary || ""} placeholder="La réponse courte affichée dans les listes et le portail." /></Field></div><div className="lg:col-span-2"><div className="flex items-center gap-2"><Label htmlFor={article ? `body-${article.id}` : "body-new"}>Contenu HTML</Label><HelpTip label="HTML autorisé">Titres, paragraphes, listes, liens, gras et citations sont conservés. Les scripts, styles, iframes et formulaires sont supprimés côté serveur.</HelpTip></div><Textarea id={article ? `body-${article.id}` : "body-new"} name="bodyHtml" required minLength={3} rows={10} className="mt-1.5 font-mono text-xs" defaultValue={article?.bodyHtml || "<h2>Objectif</h2><p>Décrivez la procédure à suivre.</p><h2>Étapes</h2><ol><li>Première étape</li></ol>"} /></div><Field label="État"><select name="status" defaultValue={article?.status || "DRAFT"} className={controlClass}><option value="DRAFT">Brouillon</option><option value="PUBLISHED">Publié</option><option value="ARCHIVED">Archivé</option></select></Field><Field label="Visibilité"><select name="visibility" defaultValue={article?.visibility || "INTERNAL"} className={controlClass}><option value="INTERNAL">Équipe uniquement</option><option value="PORTAL">Espace client</option></select></Field><div className="lg:col-span-2"><Button type="submit" disabled={pending}>{pending ? <FilePenLine className="animate-pulse" /> : <ShieldCheck />}{submitLabel}</Button></div>
  </form>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block space-y-1.5"><span className="block text-sm font-medium leading-none">{label}</span>{children}</label> }
function Metric({ icon: Icon, label, value, detail }: { icon: typeof BookOpen; label: string; value: number; detail: string }) { return <div className="border-t p-5 first:border-t-0 sm:border-l sm:border-t-0 sm:first:border-l-0"><div className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><Icon className="size-4 text-primary" />{label}</div><p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div> }
