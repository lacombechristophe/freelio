"use client"

import * as React from "react"
import Link from "next/link"
import { Braces, History, Pencil, Settings2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { updateRecordCrmProperties } from "@/actions/crm-properties"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { CrmObjectType } from "@/lib/crm-properties"

type PropertyOption = { value: string; label: string }
type PropertyDefinition = {
  id: string
  key: string
  label: string
  type: string
  groupName: string
  description: string | null
  options: unknown
  required: boolean
  value: unknown
}
type HistoryEntry = {
  id: string
  propertyLabel: string
  previousValue: string | null
  nextValue: string | null
  changedBy: string
  createdAt: string
}

export type RecordCrmPropertiesData = {
  definitions: PropertyDefinition[]
  history: HistoryEntry[]
}

function optionsOf(definition: PropertyDefinition): PropertyOption[] {
  return Array.isArray(definition.options)
    ? definition.options.flatMap((option) => option && typeof option === "object" && "value" in option && "label" in option
      ? [{ value: String(option.value), label: String(option.label) }]
      : [])
    : []
}

function optionLabel(definition: PropertyDefinition, value: string) {
  return optionsOf(definition).find((option) => option.value === value)?.label || value
}

function valueLabel(definition: PropertyDefinition, value: unknown) {
  if (value == null || value === "" || (Array.isArray(value) && !value.length)) return "Non renseigné"
  if (definition.type === "BOOLEAN") return value === true ? "Oui" : "Non"
  if (definition.type === "CURRENCY" && typeof value === "number") return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(value)
  if (definition.type === "NUMBER" && typeof value === "number") return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 4 }).format(value)
  if (definition.type === "DATE" && typeof value === "string") return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${value}T12:00:00.000Z`))
  if (definition.type === "SELECT" && typeof value === "string") return optionLabel(definition, value)
  if (definition.type === "MULTI_SELECT" && Array.isArray(value)) return value.map((item) => optionLabel(definition, String(item))).join(", ")
  return String(value)
}

function historyValue(value: string | null) {
  if (value == null) return "Non renseigné"
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.join(", ") : typeof parsed === "boolean" ? (parsed ? "Oui" : "Non") : String(parsed)
  } catch {
    return value
  }
}

export function RecordPropertiesPanel({
  objectType,
  recordId,
  data,
}: {
  objectType: CrmObjectType
  recordId: string
  data: RecordCrmPropertiesData
}) {
  const router = useRouter()
  const [editOpen, setEditOpen] = React.useState(false)
  const [historyOpen, setHistoryOpen] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const [values, setValues] = React.useState<Record<string, unknown>>(() => Object.fromEntries(data.definitions.map((definition) => [definition.id, definition.value])))

  React.useEffect(() => {
    setValues(Object.fromEntries(data.definitions.map((definition) => [definition.id, definition.value])))
  }, [data.definitions])

  const groups = React.useMemo(() => {
    const grouped = new Map<string, PropertyDefinition[]>()
    for (const definition of data.definitions) grouped.set(definition.groupName, [...(grouped.get(definition.groupName) ?? []), definition])
    return [...grouped.entries()]
  }, [data.definitions])

  async function save() {
    setPending(true)
    try {
      const result = await updateRecordCrmProperties({ objectType, recordId, values })
      toast.success(result.updated ? `${result.updated} propriété(s) mise(s) à jour.` : "Aucune modification à enregistrer.")
      setEditOpen(false)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible d’enregistrer les propriétés.")
    } finally {
      setPending(false)
    }
  }

  if (!data.definitions.length && !data.history.length) {
    return <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
      <span className="flex items-center gap-2"><Braces className="size-4" />Champs personnalisés non configurés</span>
      <Button nativeButton={false} variant="ghost" size="sm" render={<Link href="/dashboard/settings/properties" />}><Settings2 />Configurer</Button>
    </div>
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div><CardTitle className="flex items-center gap-2 text-sm"><Braces className="size-4 text-primary" />Propriétés métier</CardTitle><p className="mt-1 text-xs leading-5 text-muted-foreground">Données structurées propres à votre organisation, avec historique des changements.</p></div>
        <div className="flex shrink-0 gap-2">
          {data.history.length ? <Button type="button" variant="ghost" size="sm" onClick={() => setHistoryOpen(true)}><History />Historique</Button> : null}
          {data.definitions.length ? <Button type="button" variant="outline" size="sm" onClick={() => setEditOpen(true)}><Pencil />Modifier</Button> : null}
        </div>
      </CardHeader>
      <CardContent>
        {groups.length ? (
          <div className="space-y-5">
            {groups.map(([group, definitions]) => (
              <section key={group}>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{group}</h3>
                <dl className="grid overflow-hidden rounded-xl border sm:grid-cols-2 xl:grid-cols-3">
                  {definitions.map((definition) => {
                    const empty = definition.value == null || definition.value === "" || (Array.isArray(definition.value) && !definition.value.length)
                    return <div key={definition.id} className="min-w-0 border-b p-3 last:border-b-0 sm:border-r sm:[&:nth-last-child(-n+2)]:border-b-0 xl:[&:nth-last-child(-n+3)]:border-b-0"><dt className="text-xs text-muted-foreground">{definition.label}</dt><dd className={`mt-1 break-words text-sm font-medium ${empty ? "text-muted-foreground" : ""}`}>{valueLabel(definition, definition.value)}</dd></div>
                  })}
                </dl>
              </section>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-start gap-3 py-2 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-medium">Aucune propriété personnalisée</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Un administrateur peut installer les champs métier utiles à cette fiche.</p></div><Button nativeButton={false} variant="outline" size="sm" render={<Link href="/dashboard/settings/properties" />}><Settings2 />Configurer</Button></div>
        )}
      </CardContent>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>Modifier les propriétés métier</DialogTitle><DialogDescription>Les formats et options sont contrôlés avant enregistrement. Chaque différence alimente l’historique de la fiche.</DialogDescription></DialogHeader>
          <div className="space-y-6">
            {groups.map(([group, definitions]) => <section key={group} className="space-y-3"><h3 className="border-b pb-2 text-sm font-semibold">{group}</h3><div className="grid gap-4 sm:grid-cols-2">{definitions.map((definition) => <PropertyField key={definition.id} definition={definition} value={values[definition.id]} onChange={(value) => setValues((current) => ({ ...current, [definition.id]: value }))} />)}</div></section>)}
          </div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setEditOpen(false)} disabled={pending}>Annuler</Button><Button type="button" onClick={save} disabled={pending}>{pending ? "Enregistrement…" : "Enregistrer"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader><DialogTitle>Historique des propriétés</DialogTitle><DialogDescription>Les 50 dernières modifications, classées de la plus récente à la plus ancienne.</DialogDescription></DialogHeader>
          <div className="divide-y overflow-hidden rounded-xl border">
            {data.history.map((entry) => <div key={entry.id} className="p-3.5"><div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm">{entry.propertyLabel}</strong><time className="text-xs text-muted-foreground">{new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(entry.createdAt))}</time></div><p className="mt-1.5 text-xs text-muted-foreground"><span className="line-through">{historyValue(entry.previousValue)}</span><span className="mx-2">→</span><span className="font-medium text-foreground">{historyValue(entry.nextValue)}</span></p><p className="mt-1 text-[11px] text-muted-foreground">Par {entry.changedBy}</p></div>)}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

function PropertyField({ definition, value, onChange }: { definition: PropertyDefinition; value: unknown; onChange: (value: unknown) => void }) {
  const inputId = `crm-property-${definition.id}`
  const options = optionsOf(definition)
  const label = <Label htmlFor={inputId}>{definition.label}{definition.required ? " *" : ""}</Label>
  const help = definition.description ? <p className="text-xs leading-5 text-muted-foreground">{definition.description}</p> : null

  if (definition.type === "BOOLEAN") return <div className="space-y-1.5">{label}<Select value={value == null ? "unset" : String(value)} onValueChange={(next) => onChange(next === "unset" ? null : next === "true")}><SelectTrigger id={inputId}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unset">Non renseigné</SelectItem><SelectItem value="true">Oui</SelectItem><SelectItem value="false">Non</SelectItem></SelectContent></Select>{help}</div>
  if (definition.type === "SELECT") return <div className="space-y-1.5">{label}<Select value={typeof value === "string" ? value : "unset"} onValueChange={(next) => onChange(next === "unset" ? null : next)}><SelectTrigger id={inputId}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unset">Non renseigné</SelectItem>{options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select>{help}</div>
  if (definition.type === "MULTI_SELECT") {
    const selected = Array.isArray(value) ? value.map(String) : []
    return <fieldset className="space-y-2 sm:col-span-2"><legend className="text-sm font-medium">{definition.label}{definition.required ? " *" : ""}</legend><div className="flex flex-wrap gap-2">{options.map((option) => <label key={option.value} className="flex min-h-10 items-center gap-2 rounded-lg border px-3 text-sm"><Checkbox checked={selected.includes(option.value)} onCheckedChange={(checked) => onChange(checked === true ? [...new Set([...selected, option.value])] : selected.filter((item) => item !== option.value))} />{option.label}</label>)}</div>{help}</fieldset>
  }
  if (definition.type === "TEXT" && (definition.description?.length ?? 0) > 80) return <div className="space-y-1.5 sm:col-span-2">{label}<Textarea id={inputId} value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value)} required={definition.required} />{help}</div>
  return <div className="space-y-1.5">{label}<Input id={inputId} type={definition.type === "DATE" ? "date" : definition.type === "NUMBER" || definition.type === "CURRENCY" ? "number" : "text"} step={definition.type === "NUMBER" || definition.type === "CURRENCY" ? "0.01" : undefined} value={typeof value === "string" || typeof value === "number" ? value : ""} onChange={(event) => onChange(event.target.value)} required={definition.required} />{help}</div>
}
