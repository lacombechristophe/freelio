"use client"

import { useMemo, useState } from "react"
import { Archive, CheckCircle2, FileText, Mail, Monitor, Plus, Search, Smartphone, Sparkles, TriangleAlert } from "lucide-react"

import { archiveEmailTemplate, createEmailTemplate, updateEmailTemplate } from "@/actions/automations"
import type { AutomationData, AutomationRunner, AutomationTemplate } from "@/app/dashboard/automatisations/automation-model"
import { controlClass, plainTextFromHtml, safeEmailPreviewDocument, textAreaClass } from "@/app/dashboard/automatisations/automation-model"
import { EmptyState } from "@/components/shared/empty-state"
import { useConfirm } from "@/components/shared/confirm-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { HelpTip } from "@/components/ui/help-tip"
import { Input } from "@/components/ui/input"

const variables = ["{{contact.firstName}}", "{{contact.lastName}}", "{{contact.email}}", "{{lead.projectType}}", "{{lead.city}}", "{{company.name}}"]
const categoryLabels: Record<string, string> = { NURTURE: "Suivi commercial", QUOTE: "Devis", SERVICE: "Service", EVENT: "Actualité" }

export function TemplateStudio({ data, pending, run }: { data: AutomationData; pending: boolean; run: AutomationRunner }) {
  const confirm = useConfirm()
  const [selectedId, setSelectedId] = useState(data.templates[0]?.id ?? "")
  const [creating, setCreating] = useState(data.templates.length === 0)
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState("ALL")
  const filtered = useMemo(() => data.templates.filter((template) => {
    const text = `${template.name} ${template.subject}`.toLocaleLowerCase("fr")
    return text.includes(query.trim().toLocaleLowerCase("fr")) && (category === "ALL" || template.category === category)
  }), [category, data.templates, query])
  const selected = data.templates.find((template) => template.id === selectedId) ?? filtered[0] ?? data.templates[0]

  async function archive(template: AutomationTemplate) {
    const accepted = await confirm({ title: "Archiver ce modèle ?", description: "Les étapes existantes conservent leur copie du contenu. Le modèle ne sera plus proposé pour de nouvelles étapes.", confirmLabel: "Archiver", destructive: true })
    if (accepted) run(() => archiveEmailTemplate(template.id), "Modèle archivé.", { after: () => { setCreating(false); setSelectedId("") } })
  }

  return <div className="grid min-h-[720px] overflow-hidden rounded-xl border bg-card xl:grid-cols-[320px_minmax(0,1fr)]">
    <aside className="border-b xl:border-b-0 xl:border-r">
      <div className="space-y-3 border-b p-3"><Button className="w-full" onClick={() => { setCreating(true); setSelectedId("") }}><Plus />Nouveau modèle</Button><div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" placeholder="Rechercher…" aria-label="Rechercher un modèle" /></div><select value={category} onChange={(event) => setCategory(event.target.value)} className={controlClass} aria-label="Filtrer les modèles"><option value="ALL">Toutes les catégories</option>{Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      <div className="max-h-[600px] overflow-y-auto p-2">{filtered.length ? filtered.map((template) => <button type="button" key={template.id} onClick={() => { setCreating(false); setSelectedId(template.id) }} className={`mb-1 w-full rounded-lg px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${!creating && selected?.id === template.id ? "bg-primary/[0.07]" : "hover:bg-muted/60"}`}><span className="flex items-center justify-between gap-2"><span className="truncate text-sm font-medium">{template.name}</span><Badge variant="outline">{categoryLabels[template.category] ?? template.category}</Badge></span><span className="mt-1.5 block truncate text-xs text-muted-foreground">{template.subject}</span></button>) : <p className="px-4 py-10 text-center text-sm text-muted-foreground">Aucun modèle ne correspond aux filtres.</p>}</div>
    </aside>
    {creating || selected ? <TemplateEditor key={creating ? "new" : selected!.id} template={creating ? undefined : selected} pending={pending} run={run} onArchive={selected && !creating ? () => archive(selected) : undefined} onDone={() => setCreating(false)} /> : <EmptyState icon={FileText} title="Aucun modèle" description="Créez un contenu réutilisable et contrôlez son rendu avant l’envoi." action={<Button onClick={() => setCreating(true)}><Plus />Créer un modèle</Button>} />}
  </div>
}

function TemplateEditor({ template, pending, run, onArchive, onDone }: { template?: AutomationTemplate; pending: boolean; run: AutomationRunner; onArchive?: () => void; onDone: () => void }) {
  const [name, setName] = useState(template?.name ?? "")
  const [category, setCategory] = useState(template?.category ?? "NURTURE")
  const [subject, setSubject] = useState(template?.subject ?? "")
  const [bodyHtml, setBodyHtml] = useState(template?.bodyHtml ?? "<p>Bonjour {{contact.firstName}},</p><p>Nous revenons vers vous au sujet de votre projet.</p><p>Bien cordialement,</p>")
  const [viewport, setViewport] = useState<"desktop" | "mobile">("desktop")
  const previewText = plainTextFromHtml(bodyHtml)
  const usedVariables = variables.filter((variable) => subject.includes(variable) || bodyHtml.includes(variable))
  const checks = [
    { label: "Objet renseigné", valid: subject.trim().length >= 2, detail: `${subject.length}/180 caractères` },
    { label: "Objet lisible sur mobile", valid: subject.trim().length <= 60, detail: subject.length <= 60 ? "Longueur recommandée" : "Visez 60 caractères ou moins" },
    { label: "Contenu suffisant", valid: previewText.length >= 40, detail: `${previewText.length} caractères de texte` },
    { label: "Personnalisation", valid: usedVariables.length > 0, detail: usedVariables.length ? `${usedVariables.length} variable(s) utilisée(s)` : "Ajoutez au moins une variable utile" },
  ]

  function insertVariable(variable: string) {
    setBodyHtml((current) => `${current}${current.endsWith(" ") ? "" : " "}${variable}`)
  }

  return <section className="min-w-0">
    <header className="flex flex-col gap-3 border-b px-4 py-4 sm:px-5 lg:flex-row lg:items-start lg:justify-between"><div><div className="flex items-center gap-2"><h2 className="text-lg font-semibold">{template ? "Modifier le modèle" : "Nouveau modèle"}</h2>{template && <Badge variant="outline">Actif</Badge>}</div><p className="mt-1 text-sm text-muted-foreground">Éditez, contrôlez la personnalisation et vérifiez le rendu sur deux largeurs.</p></div>{onArchive && <Button variant="ghost" size="sm" onClick={onArchive} disabled={pending}><Archive />Archiver</Button>}</header>
    <div className="grid xl:grid-cols-[minmax(360px,0.85fr)_minmax(420px,1.15fr)]">
      <div className="space-y-5 border-b p-4 sm:p-5 xl:border-b-0 xl:border-r">
        <form id="template-editor-form" className="space-y-4" onSubmit={(event) => { event.preventDefault(); run(() => template ? updateEmailTemplate({ id: template.id, name, category, subject, bodyHtml }) : createEmailTemplate({ name, category, subject, bodyHtml }), template ? "Modèle mis à jour." : "Modèle créé.", { after: onDone }) }}>
          <div className="grid gap-4 sm:grid-cols-2"><Field label="Nom interne"><Input value={name} onChange={(event) => setName(event.target.value)} required minLength={2} maxLength={120} placeholder="Relance devis à J+3" /></Field><Field label="Catégorie"><select value={category} onChange={(event) => setCategory(event.target.value)} className={controlClass}>{Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field></div>
          <Field label="Objet"><Input value={subject} onChange={(event) => setSubject(event.target.value)} required minLength={2} maxLength={180} placeholder="Votre projet {{lead.projectType}}" /></Field>
          <div><div className="mb-1.5 flex items-center gap-2"><span className="text-xs font-semibold">Contenu HTML</span><HelpTip label="HTML autorisé">Le contenu est nettoyé côté serveur avant l’envoi. Utilisez des balises simples : paragraphes, titres, listes, emphase et liens HTTPS.</HelpTip></div><textarea aria-label="Contenu HTML" value={bodyHtml} onChange={(event) => setBodyHtml(event.target.value)} required minLength={10} maxLength={50000} className={`${textAreaClass} min-h-72 font-mono text-xs leading-5`} /></div>
          <div><p className="mb-2 text-xs font-semibold">Variables disponibles</p><div className="flex flex-wrap gap-1.5">{variables.map((variable) => <button type="button" key={variable} onClick={() => insertVariable(variable)} className="rounded-md border bg-background px-2 py-1 font-mono text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{variable}</button>)}</div></div>
          <div className="flex flex-wrap justify-end gap-2 border-t pt-4"><Button type="submit" disabled={pending || name.trim().length < 2 || subject.trim().length < 2 || bodyHtml.trim().length < 10}>{template ? "Enregistrer les modifications" : "Créer le modèle"}</Button></div>
        </form>
      </div>

      <div className="min-w-0 space-y-5 bg-muted/20 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-sm font-semibold">Aperçu sécurisé</h3><p className="mt-0.5 text-xs text-muted-foreground">Scripts, formulaires et ressources distantes bloqués.</p></div><div className="flex rounded-lg border bg-card p-1"><Button type="button" size="sm" variant={viewport === "desktop" ? "secondary" : "ghost"} onClick={() => setViewport("desktop")} aria-pressed={viewport === "desktop"}><Monitor />Bureau</Button><Button type="button" size="sm" variant={viewport === "mobile" ? "secondary" : "ghost"} onClick={() => setViewport("mobile")} aria-pressed={viewport === "mobile"}><Smartphone />Mobile</Button></div></div>
        <div className={`mx-auto overflow-hidden rounded-xl bg-white ring-1 ring-border transition-[max-width] duration-200 ${viewport === "mobile" ? "max-w-[390px]" : "max-w-full"}`}><div className="border-b px-4 py-3 text-[#182230]"><p className="text-[11px] text-[#667085]">Objet</p><p className="mt-1 truncate text-sm font-semibold">{subject || "Sans objet"}</p></div><iframe title="Aperçu HTML du modèle" sandbox="" srcDoc={safeEmailPreviewDocument(bodyHtml)} className="h-[430px] w-full bg-white" /></div>
        <Card><CardHeader className="pb-2"><div className="flex items-center gap-2"><Sparkles className="size-4 text-primary" /><CardTitle className="text-sm">Contrôle avant envoi</CardTitle></div><CardDescription>Conseils de qualité, sans bloquer les choix éditoriaux.</CardDescription></CardHeader><CardContent className="space-y-2">{checks.map((check) => <div key={check.label} className="flex items-start gap-2 rounded-lg bg-muted/35 px-3 py-2"><span className={`mt-0.5 ${check.valid ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300"}`}>{check.valid ? <CheckCircle2 className="size-4" /> : <TriangleAlert className="size-4" />}</span><span><span className="block text-xs font-medium">{check.label}</span><span className="block text-[11px] text-muted-foreground">{check.detail}</span></span></div>)}</CardContent></Card>
        <div className="flex items-start gap-2 rounded-lg border bg-card p-3 text-xs leading-5 text-muted-foreground"><Mail className="mt-0.5 size-4 shrink-0 text-primary" /><span>Le lien de désinscription réglementaire est ajouté automatiquement lors de l’envoi de la séquence.</span></div>
      </div>
    </div>
  </section>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-1.5"><span className="block text-xs font-semibold">{label}</span>{children}</label>
}
