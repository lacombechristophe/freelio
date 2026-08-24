"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  AlertTriangle,
  ArrowLeft,
  Braces,
  Check,
  CheckCircle2,
  ClipboardList,
  Copy,
  FileText,
  Plus,
  Save,
  Scale,
  Search,
  Shield,
  Sparkles,
} from "lucide-react"
import { toast } from "sonner"
import { createContract, updateContract } from "@/actions/contrats"
import { TiptapEditor } from "@/components/contracts/tiptap-editor"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  CONTRACT_CLAUSE_LIBRARY,
  CONTRACT_TEMPLATE_CATEGORY_LABELS,
  CONTRACT_TEMPLATE_PRESETS,
  type ContractTemplateCategory,
  type ContractTemplatePreset,
} from "@/lib/contracts/templates"
import { cn } from "@/lib/utils"

type Contract = {
  id: string
  clientId: string
  title: string
  content: string
  validFrom?: Date | string | null
  validUntil?: Date | string | null
}

type TemplateCategoryFilter = "all" | ContractTemplateCategory

const VARIABLES = [
  { label: "Nom du client", value: "{{client.name}}", desc: "Raison sociale du client" },
  { label: "Email du client", value: "{{client.email}}", desc: "Email du contact principal" },
  { label: "SIRET de l’entreprise", value: "{{entreprise.siret}}", desc: "SIRET configuré" },
  { label: "Raison sociale", value: "{{entreprise.name}}", desc: "Nom légal de votre structure" },
  { label: "Titre du contrat", value: "{{contract.title}}", desc: "Titre saisi dans l'en-tête" },
  { label: "Date d'effet", value: "{{contract.validFrom}}", desc: "Début du contrat" },
  { label: "Date d'échéance", value: "{{contract.validUntil}}", desc: "Fin prévue du contrat" },
]

const CLAUSE_ICONS = [FileText, Shield, Scale, ClipboardList] as const

const TEMPLATE_CATEGORY_OPTIONS: Array<{ value: TemplateCategoryFilter; label: string }> = [
  { value: "all", label: "Tous" },
  ...Object.entries(CONTRACT_TEMPLATE_CATEGORY_LABELS).map(([value, label]) => ({
    value: value as ContractTemplateCategory,
    label,
  })),
]

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Erreur."
}

function normalizeSearch(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
}

function isMeaningfulContent(value: string) {
  const trimmed = value.trim()
  return trimmed.length > 0 && trimmed !== "<p></p>"
}

export function ContractForm({
  contract,
  clients,
}: {
  contract?: Contract
  clients: Array<{ id: string; name: string }>
}) {
  const router = useRouter()
  const [pending, setPending] = React.useState(false)
  const [clientId, setClientId] = React.useState(contract?.clientId ?? "")
  const [title, setTitle] = React.useState(contract?.title ?? "")
  const [content, setContent] = React.useState(contract?.content ?? "")
  const [validFrom, setValidFrom] = React.useState(
    contract?.validFrom ? new Date(contract.validFrom).toISOString().slice(0, 10) : ""
  )
  const [validUntil, setValidUntil] = React.useState(
    contract?.validUntil ? new Date(contract.validUntil).toISOString().slice(0, 10) : ""
  )

  const [activeTab, setActiveTab] = React.useState<"variables" | "clauses">("variables")
  const [copiedValue, setCopiedValue] = React.useState<string | null>(null)
  const [templateCategory, setTemplateCategory] = React.useState<TemplateCategoryFilter>("all")
  const [templateSearch, setTemplateSearch] = React.useState("")
  const [selectedTemplateId, setSelectedTemplateId] = React.useState<string | null>(null)

  const filteredTemplates = React.useMemo(() => {
    const query = normalizeSearch(templateSearch)
    return CONTRACT_TEMPLATE_PRESETS.filter((template) => {
      const matchesCategory = templateCategory === "all" || template.category === templateCategory
      if (!matchesCategory) return false
      if (!query) return true

      const haystack = normalizeSearch(
        [
          template.name,
          template.title,
          template.description,
          template.bestFor,
          CONTRACT_TEMPLATE_CATEGORY_LABELS[template.category],
        ].join(" ")
      )
      return haystack.includes(query)
    })
  }, [templateCategory, templateSearch])

  async function handleCopy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedValue(text)
      toast.success("Copié dans le presse-papier.")
      setTimeout(() => setCopiedValue(null), 2000)
    } catch {
      toast.error("Copie indisponible dans ce navigateur.")
    }
  }

  function applyTemplate(template: ContractTemplatePreset) {
    if (
      isMeaningfulContent(content) &&
      selectedTemplateId !== template.id &&
      !window.confirm("Ce modèle remplacera le titre et le contenu actuels du contrat. Continuer ?")
    ) {
      return
    }

    setTitle(template.title)
    setContent(template.content)
    setSelectedTemplateId(template.id)
    toast.success(`Modèle "${template.name}" appliqué.`)
  }

  function appendClause(title: string, clause: string) {
    const prefix = isMeaningfulContent(content) ? content : ""
    setContent(`${prefix}<h2>${title}</h2><p>${clause}</p>`)
    setActiveTab("clauses")
    toast.success("Clause ajoutée au contrat.")
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!clientId) return toast.error("Sélectionnez un client.")
    if (!isMeaningfulContent(content)) return toast.error("Le contenu du contrat ne peut pas être vide.")
    setPending(true)
    try {
      const payload = {
        clientId,
        title,
        content,
        validFrom: validFrom || undefined,
        validUntil: validUntil || undefined,
      }
      if (contract) {
        await updateContract(contract.id, payload)
        toast.success("Contrat mis à jour.")
        router.push(`/dashboard/contrats/${contract.id}`)
      } else {
        const created = await createContract(payload)
        toast.success("Contrat créé.")
        router.push(`/dashboard/contrats/${created.id}`)
      }
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/dashboard/contrats">
          <Button type="button" variant="ghost" size="icon" aria-label="Retour aux contrats">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="ml-auto">
          <Button type="submit" disabled={pending} className="gap-2">
            <Save className="h-4 w-4" />
            {pending ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </div>
      </div>

      <Card className="bg-card">
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <CardTitle className="text-sm font-semibold">Modèles professionnels</CardTitle>
                <Badge variant="secondary">{CONTRACT_TEMPLATE_PRESETS.length} modèles</Badge>
              </div>
              <CardDescription className="max-w-3xl text-xs">
                Bases de rédaction structurées pour contrats, avenants, confidentialité, maintenance, conseil et missions opérationnelles.
              </CardDescription>
            </div>
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-950 dark:text-amber-200 md:max-w-sm">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>Ces modèles restent des bases de travail à adapter et à faire relire selon l&apos;enjeu juridique.</span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            <div className="relative xl:w-80">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="Rechercher un modèle de contrat"
                value={templateSearch}
                onChange={(e) => setTemplateSearch(e.target.value)}
                placeholder="Rechercher un modèle…"
                className="bg-background pl-8"
              />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {TEMPLATE_CATEGORY_OPTIONS.map((category) => (
                <button
                  key={category.value}
                  type="button"
                  aria-pressed={templateCategory === category.value}
                  onClick={() => setTemplateCategory(category.value)}
                  className={cn(
                    "h-8 shrink-0 rounded-lg border px-3 text-xs font-medium transition-colors",
                    templateCategory === category.value
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-muted-foreground hover:text-foreground"
                  )}
                >
                  {category.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid max-h-[520px] gap-3 overflow-y-auto pr-1 md:grid-cols-2 xl:grid-cols-3">
            {filteredTemplates.map((template) => {
              const selected = selectedTemplateId === template.id
              return (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => applyTemplate(template)}
                  className={cn(
                    "flex min-h-[190px] flex-col rounded-lg border bg-background p-4 text-left transition-colors hover:border-primary/60 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    selected && "border-primary bg-primary/5"
                  )}
                >
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <Badge variant="outline">{CONTRACT_TEMPLATE_CATEGORY_LABELS[template.category]}</Badge>
                    <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                      {template.sections} sections
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold leading-snug text-foreground">{template.name}</h3>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{template.description}</p>
                  <div className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                    <ClipboardList className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                    <span>{template.bestFor}</span>
                  </div>
                  <div className="mt-auto flex items-center justify-between pt-4 text-xs font-medium">
                    <span className="text-primary">Appliquer</span>
                    {selected ? (
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                    ) : (
                      <Plus className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                </button>
              )
            })}
            {filteredTemplates.length === 0 && (
              <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground md:col-span-2 xl:col-span-3">
                Aucun modèle ne correspond à cette recherche.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <Card className="bg-card">
            <CardHeader>
              <CardTitle className="text-sm font-semibold">En-tête du document</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Client destinataire *</Label>
                  <Select value={clientId} onValueChange={(v) => setClientId(v ?? "")}>
                    <SelectTrigger className="bg-background" aria-label="Client destinataire du contrat">
                      <SelectValue placeholder="Sélectionner un client…" />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {clients.length === 0 && (
                    <p className="text-xs text-muted-foreground">Aucun client disponible pour l&apos;instant.</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="title">Titre juridique du contrat *</Label>
                  <Input
                    id="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Ex : Contrat de fourniture et pose"
                    required
                    className="bg-background"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="validFrom">Date d&apos;effet du contrat</Label>
                  <Input
                    id="validFrom"
                    type="date"
                    value={validFrom}
                    onChange={(e) => setValidFrom(e.target.value)}
                    className="bg-background"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="validUntil">Date d&apos;échéance programmée</Label>
                  <Input
                    id="validUntil"
                    type="date"
                    value={validUntil}
                    onChange={(e) => setValidUntil(e.target.value)}
                    className="bg-background"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Rédaction des clauses</CardTitle>
              <CardDescription className="text-xs">
                Contenu final du contrat avec variables de fusion, clauses et adaptations métier.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TiptapEditor
                value={content}
                onChange={(html) => setContent(html)}
                placeholder="Rédigez votre contrat ici…"
              />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="flex h-full flex-col bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Bibliothèque juridique</CardTitle>
              <CardDescription className="text-xs">Variables de fusion et clauses réutilisables.</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 space-y-4">
              <div className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-muted/40 p-1">
                <button
                  type="button"
                  onClick={() => setActiveTab("variables")}
                  className={cn(
                    "min-h-9 flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-colors",
                    activeTab === "variables"
                      ? "bg-background font-bold text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Braces className="h-3.5 w-3.5" />
                  Variables
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("clauses")}
                  className={cn(
                    "min-h-9 flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-colors",
                    activeTab === "clauses"
                      ? "bg-background font-bold text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Scale className="h-3.5 w-3.5" />
                  Clauses
                </button>
              </div>

              {activeTab === "variables" ? (
                <div className="space-y-2">
                  {VARIABLES.map((v) => (
                    <button
                      key={v.value}
                      type="button"
                      onClick={() => handleCopy(v.value)}
                      className="group flex w-full items-center justify-between rounded-lg border border-border bg-background p-2.5 text-left transition-colors hover:bg-accent/40"
                    >
                      <div className="min-w-0 space-y-0.5">
                        <span className="font-mono text-xs font-bold text-primary">{v.value}</span>
                        <p className="text-xs leading-relaxed text-muted-foreground">
                          {v.label} - {v.desc}
                        </p>
                      </div>
                      <div className="shrink-0 text-muted-foreground group-hover:text-foreground">
                        {copiedValue === v.value ? (
                          <Check className="h-3.5 w-3.5 text-success" />
                        ) : (
                          <Copy className="h-3.5 w-3.5 opacity-50 transition-opacity group-hover:opacity-100" />
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {CONTRACT_CLAUSE_LIBRARY.map((clause, index) => {
                    const Icon = CLAUSE_ICONS[index % CLAUSE_ICONS.length]
                    return (
                      <div
                        key={clause.id}
                        className="rounded-lg border border-border bg-background/50 p-3 transition-colors hover:bg-background"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                            <Icon className="h-3.5 w-3.5 text-primary" />
                            {clause.title}
                          </span>
                          <div className="flex shrink-0 items-center gap-1">
                            <button
                              type="button"
                              onClick={() => appendClause(clause.title, clause.content)}
                              className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                              title="Ajouter la clause"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleCopy(clause.content)}
                              className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                              title="Copier la clause"
                            >
                              {copiedValue === clause.content ? (
                                <Check className="h-3.5 w-3.5 text-success" />
                              ) : (
                                <Copy className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </div>
                        </div>
                        <p className="mt-1.5 text-xs leading-normal text-muted-foreground">{clause.description}</p>
                        <div className="mt-2 max-h-[100px] overflow-y-auto rounded border border-border/50 bg-muted/40 p-2.5 font-sans text-xs leading-relaxed text-muted-foreground">
                          {clause.content}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </form>
  )
}
