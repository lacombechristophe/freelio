"use client"

import * as React from "react"
import { Archive, Braces, Check, ListFilter, Plus, RotateCcw, Sparkles } from "lucide-react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import {
  createCrmPropertyDefinition,
  installCrmPropertyPreset,
  setCrmPropertyArchived,
  updateCrmPropertyDefinition,
} from "@/actions/crm-properties"
import { useConfirm } from "@/components/shared/confirm-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  CRM_OBJECT_TYPES,
  CRM_PROPERTY_TYPES,
  crmPropertyKeyFromLabel,
  type CrmObjectType,
  type CrmPropertyType,
} from "@/lib/crm-properties"

type Definition = {
  id: string
  objectType: string
  key: string
  label: string
  type: string
  groupName: string
  description: string | null
  options: unknown
  required: boolean
  archivedAt: string | null
  _count: { values: number }
}

const OBJECT_LABELS: Record<CrmObjectType, string> = {
  CLIENT: "Clients",
  CONTACT: "Contacts",
  OPPORTUNITY: "Opportunités",
  PROJECT: "Chantiers",
  TICKET: "Tickets SAV",
  EQUIPMENT: "Équipements",
}

const TYPE_LABELS: Record<CrmPropertyType, string> = {
  TEXT: "Texte",
  NUMBER: "Nombre",
  CURRENCY: "Montant",
  DATE: "Date",
  BOOLEAN: "Oui / Non",
  SELECT: "Liste unique",
  MULTI_SELECT: "Liste multiple",
}

type FormState = {
  label: string
  key: string
  type: CrmPropertyType
  groupName: string
  description: string
  optionsText: string
  required: boolean
}

const EMPTY_FORM: FormState = {
  label: "",
  key: "",
  type: "TEXT",
  groupName: "Informations complémentaires",
  description: "",
  optionsText: "",
  required: false,
}

function optionsFromDefinition(value: unknown) {
  if (!Array.isArray(value)) return ""
  return value.flatMap((option) => option && typeof option === "object" && "value" in option && "label" in option
    ? [`${String(option.value)}=${String(option.label)}`]
    : []).join("\n")
}

function parseOptions(value: string) {
  return value.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
    const separator = line.indexOf("=")
    const rawValue = separator >= 0 ? line.slice(0, separator) : line
    const label = separator >= 0 ? line.slice(separator + 1).trim() : line
    return { value: crmPropertyKeyFromLabel(rawValue), label }
  })
}

export function PropertyDefinitionsManager({ initialDefinitions }: { initialDefinitions: Definition[] }) {
  const router = useRouter()
  const confirm = useConfirm()
  const [definitions, setDefinitions] = React.useState(initialDefinitions)
  const [objectType, setObjectType] = React.useState<CrmObjectType>("CLIENT")
  const [showArchived, setShowArchived] = React.useState(false)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<Definition | null>(null)
  const [form, setForm] = React.useState<FormState>(EMPTY_FORM)
  const [pending, setPending] = React.useState(false)

  React.useEffect(() => setDefinitions(initialDefinitions), [initialDefinitions])

  const visibleDefinitions = definitions.filter((definition) => (
    definition.objectType === objectType && (showArchived || !definition.archivedAt)
  ))
  const activeCount = definitions.filter((definition) => definition.objectType === objectType && !definition.archivedAt).length
  const valueCount = visibleDefinitions.reduce((total, definition) => total + definition._count.values, 0)

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setDialogOpen(true)
  }

  function openEdit(definition: Definition) {
    setEditing(definition)
    setForm({
      label: definition.label,
      key: definition.key,
      type: definition.type as CrmPropertyType,
      groupName: definition.groupName,
      description: definition.description || "",
      optionsText: optionsFromDefinition(definition.options),
      required: definition.required,
    })
    setDialogOpen(true)
  }

  function updateLabel(label: string) {
    setForm((current) => ({
      ...current,
      label,
      key: editing || (current.key && current.key !== crmPropertyKeyFromLabel(current.label))
        ? current.key
        : crmPropertyKeyFromLabel(label),
    }))
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    try {
      const payload = {
        objectType,
        key: form.key,
        label: form.label,
        type: form.type,
        groupName: form.groupName,
        description: form.description || null,
        options: ["SELECT", "MULTI_SELECT"].includes(form.type) ? parseOptions(form.optionsText) : [],
        required: form.required,
      }
      if (editing) {
        await updateCrmPropertyDefinition(editing.id, payload)
        toast.success("Propriété mise à jour.")
      } else {
        await createCrmPropertyDefinition(payload)
        toast.success("Propriété créée.")
      }
      setDialogOpen(false)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible d’enregistrer la propriété.")
    } finally {
      setPending(false)
    }
  }

  async function toggleArchived(definition: Definition) {
    const archive = !definition.archivedAt
    if (archive && !await confirm({
      title: "Archiver cette propriété ?",
      description: "Elle disparaîtra des fiches, mais ses valeurs et son historique seront conservés.",
      confirmLabel: "Archiver",
    })) return
    setPending(true)
    try {
      await setCrmPropertyArchived(definition.id, archive)
      toast.success(archive ? "Propriété archivée." : "Propriété restaurée.")
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action impossible.")
    } finally {
      setPending(false)
    }
  }

  async function installPreset() {
    setPending(true)
    try {
      const result = await installCrmPropertyPreset(objectType)
      toast.success(result.installed ? `${result.installed} propriété(s) recommandée(s) ajoutée(s).` : "Le preset est déjà installé.")
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Preset impossible à installer.")
    } finally {
      setPending(false)
    }
  }

  const selectable = ["SELECT", "MULTI_SELECT"].includes(form.type)

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 rounded-xl border bg-card p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-wrap gap-2">
          {CRM_OBJECT_TYPES.map((type) => (
            <Button key={type} type="button" variant={objectType === type ? "default" : "ghost"} size="sm" onClick={() => setObjectType(type)}>
              {OBJECT_LABELS[type]}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={installPreset} disabled={pending}>
            <Sparkles />Installer le preset pisciniste
          </Button>
          <Button type="button" onClick={openCreate}><Plus />Nouvelle propriété</Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="flex items-center gap-3 p-4"><span className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary"><Braces className="size-4" /></span><div><p className="font-mono text-xl font-semibold tabular-nums">{activeCount}</p><p className="text-xs text-muted-foreground">propriétés actives</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4"><span className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary"><ListFilter className="size-4" /></span><div><p className="font-mono text-xl font-semibold tabular-nums">{new Set(visibleDefinitions.map((definition) => definition.groupName)).size}</p><p className="text-xs text-muted-foreground">groupes d’affichage</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4"><span className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary"><Check className="size-4" /></span><div><p className="font-mono text-xl font-semibold tabular-nums">{valueCount}</p><p className="text-xs text-muted-foreground">valeurs renseignées</p></div></CardContent></Card>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="flex items-center justify-between gap-4 border-b bg-muted/30 px-4 py-3">
          <div><h2 className="font-semibold">{OBJECT_LABELS[objectType]}</h2><p className="mt-0.5 text-xs text-muted-foreground">La clé technique reste stable pour préserver imports, filtres et historique.</p></div>
          <label className="flex items-center gap-2 text-sm text-muted-foreground"><Switch checked={showArchived} onCheckedChange={setShowArchived} />Afficher les archives</label>
        </div>
        {visibleDefinitions.length ? (
          <div className="divide-y">
            {visibleDefinitions.map((definition) => (
              <div key={definition.id} className="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_160px_100px_auto] sm:items-center">
                <button type="button" onClick={() => openEdit(definition)} className="min-w-0 text-left focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/25">
                  <span className="flex flex-wrap items-center gap-2"><strong className="text-sm">{definition.label}</strong>{definition.required ? <Badge variant="secondary">Obligatoire</Badge> : null}{definition.archivedAt ? <Badge variant="outline">Archivée</Badge> : null}</span>
                  <span className="mt-1 block truncate font-mono text-xs text-muted-foreground">{definition.key} · {definition.groupName}</span>
                </button>
                <Badge variant="outline" className="w-fit">{TYPE_LABELS[definition.type as CrmPropertyType] ?? definition.type}</Badge>
                <span className="font-mono text-xs tabular-nums text-muted-foreground">{definition._count.values} valeur(s)</span>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={() => openEdit(definition)}>Modifier</Button>
                  <Button type="button" variant="ghost" size="icon" onClick={() => toggleArchived(definition)} disabled={pending} aria-label={definition.archivedAt ? `Restaurer ${definition.label}` : `Archiver ${definition.label}`} title={definition.archivedAt ? "Restaurer" : "Archiver"}>
                    {definition.archivedAt ? <RotateCcw className="size-4" /> : <Archive className="size-4" />}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-6 py-14 text-center"><Braces className="mx-auto size-6 text-muted-foreground" /><p className="mt-3 font-semibold">Aucune propriété pour {OBJECT_LABELS[objectType].toLowerCase()}</p><p className="mx-auto mt-1 max-w-md text-sm leading-6 text-muted-foreground">Installez le preset métier ou créez seulement les champs réellement utiles à l’équipe.</p></div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-xl">
          <form onSubmit={submit} className="space-y-5">
            <DialogHeader>
              <DialogTitle>{editing ? "Modifier la propriété" : "Nouvelle propriété"}</DialogTitle>
              <DialogDescription>Les types et clés techniques sont figés après création afin de protéger les valeurs existantes.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5"><Label htmlFor="property-label">Libellé</Label><Input id="property-label" value={form.label} onChange={(event) => updateLabel(event.target.value)} required maxLength={120} /></div>
              <div className="space-y-1.5"><Label htmlFor="property-key">Clé technique</Label><Input id="property-key" value={form.key} onChange={(event) => setForm({ ...form, key: event.target.value })} required disabled={Boolean(editing)} className="font-mono" /></div>
              <div className="space-y-1.5"><Label>Type</Label><Select value={form.type} onValueChange={(value) => setForm({ ...form, type: (value || "TEXT") as CrmPropertyType })} disabled={Boolean(editing)}><SelectTrigger aria-label="Type de propriété"><SelectValue /></SelectTrigger><SelectContent>{CRM_PROPERTY_TYPES.map((type) => <SelectItem key={type} value={type}>{TYPE_LABELS[type]}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1.5"><Label htmlFor="property-group">Groupe</Label><Input id="property-group" value={form.groupName} onChange={(event) => setForm({ ...form, groupName: event.target.value })} required /></div>
            </div>
            <div className="space-y-1.5"><Label htmlFor="property-description">Aide à la saisie</Label><Textarea id="property-description" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Expliquez quand et comment renseigner cette donnée." className="min-h-20" /></div>
            {selectable ? <div className="space-y-1.5"><Label htmlFor="property-options">Options</Label><Textarea id="property-options" value={form.optionsText} onChange={(event) => setForm({ ...form, optionsText: event.target.value })} placeholder={"construction=Construction\nrenovation=Rénovation"} /><p className="text-xs text-muted-foreground">Une option par ligne, au format valeur=Libellé. Les valeurs restent stables dans les imports.</p></div> : null}
            <label className="flex min-h-11 items-center gap-3 rounded-lg border px-3 text-sm"><Checkbox checked={form.required} onCheckedChange={(checked) => setForm({ ...form, required: checked === true })} /><span><strong className="block font-medium">Valeur obligatoire</strong><span className="text-xs text-muted-foreground">Empêche d’effacer ce champ une fois affiché dans une fiche.</span></span></label>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={pending}>Annuler</Button><Button type="submit" disabled={pending || !form.label.trim() || !form.key.trim()}>{pending ? "Enregistrement…" : "Enregistrer"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
