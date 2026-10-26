"use client"

import { useId, useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { leadSourceLabels, leadStatusLabels, marketingValueLabel, scoringFieldLabels, scoringOperatorLabels } from "@/lib/marketing/labels"

const controlClass = "h-10 w-full rounded-[10px] border border-input bg-background px-3 text-base sm:text-sm"

export function ScoringRuleCriteria({ initial }: { initial?: { field: string; operator: string; value: string } | null }) {
  const id = useId()
  const [field, setField] = useState(initial?.field ?? "status")
  const [operator, setOperator] = useState(initial?.operator ?? "EQUALS")
  const [value, setValue] = useState(initial?.field === "source" ? marketingValueLabel("source", initial.value) : initial?.value ?? "")
  const categorical = operator !== "CONTAINS" && (field === "status" || field === "marketingOptIn")
  const choices = field === "status" ? leadStatusLabels : { true: "Accepté", false: "Refusé" }

  return <>
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-field`}>Champ</Label>
        <select id={`${id}-field`} name="field" className={controlClass} value={field} onChange={event => { setField(event.target.value); setValue("") }}>
          {Object.entries(scoringFieldLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-operator`}>Opérateur</Label>
        <select id={`${id}-operator`} name="operator" className={controlClass} value={operator} onChange={event => { setOperator(event.target.value); if (event.target.value === "EXISTS") setValue("") }}>
          {Object.entries(scoringOperatorLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
      </div>
    </div>
    <div className="space-y-1.5">
      {operator === "EXISTS" ? <>
        <input type="hidden" name="value" value="" />
        <p className="text-xs text-muted-foreground">Aucune valeur à préciser pour « est renseigné ».</p>
      </> : <>
        <Label htmlFor={`${id}-value`}>Valeur</Label>
        {categorical ? <select id={`${id}-value`} name="value" className={controlClass} value={value} onChange={event => setValue(event.target.value)} required>
          <option value="">Sélectionner une valeur…</option>
          {value && !Object.hasOwn(choices, value) ? <option value={value}>Valeur historique : {value}</option> : null}
          {Object.entries(choices).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select> : <Input id={`${id}-value`} name="value" maxLength={120} value={value} onChange={event => setValue(event.target.value)}
          list={field === "source" ? `${id}-sources` : undefined}
          placeholder={field === "source" ? "Site web ou nom de votre source" : field === "city" ? "Ex. Nantes" : field === "projectType" ? "Ex. rénovation" : "Valeur à comparer"} />}
        {field === "source" ? <datalist id={`${id}-sources`}>{Object.values(leadSourceLabels).map(label => <option key={label} value={label} />)}</datalist> : null}
        {field === "source" && initial?.field === "source" && value === initial.value ? <p className="text-xs text-muted-foreground">Source : {marketingValueLabel("source", value)}</p> : null}
      </>}
    </div>
  </>
}
