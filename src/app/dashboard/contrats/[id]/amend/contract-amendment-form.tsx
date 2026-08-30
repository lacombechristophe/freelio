"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, FileSignature, Loader2, Plus, Save, Scale, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { createContractAmendment } from "@/actions/contrats"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

type ChangeRow = {
  id: string
  category: "PÉRIMÈTRE" | "DÉLAI" | "PRIX" | "FACTURATION" | "GARANTIE" | "AUTRE"
  label: string
  previousValue: string
  nextValue: string
  financialImpact: string
}

const changeCategories: ChangeRow["category"][] = [
  "PÉRIMÈTRE",
  "DÉLAI",
  "PRIX",
  "FACTURATION",
  "GARANTIE",
  "AUTRE",
]

const controlClass =
  "h-10 w-full rounded-[10px] border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/20"

function emptyChange(id: string): ChangeRow {
  return {
    id,
    category: "PÉRIMÈTRE",
    label: "",
    previousValue: "",
    nextValue: "",
    financialImpact: "",
  }
}

export function ContractAmendmentForm({ baseContract }: { baseContract: { id: string; number: string; title: string; clientName: string } }) {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()
  const [title, setTitle] = React.useState(`Avenant · ${baseContract.title}`)
  const [reason, setReason] = React.useState("")
  const [effectiveAt, setEffectiveAt] = React.useState("")
  const [changes, setChanges] = React.useState<ChangeRow[]>([emptyChange("initial")])

  function updateChange(id: string, patch: Partial<ChangeRow>) {
    setChanges((current) =>
      current.map((change) => (change.id === id ? { ...change, ...patch } : change))
    )
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const normalized = changes.map((change) => {
      const amount = change.financialImpact.trim() === "" ? null : Number(change.financialImpact.replace(",", "."))
      return {
        category: change.category,
        label: change.label,
        previousValue: change.previousValue,
        nextValue: change.nextValue,
        financialImpactCents: amount == null ? null : Math.round(amount * 100),
      }
    })
    if (
      normalized.some(
        (change) =>
          change.financialImpactCents != null && !Number.isFinite(change.financialImpactCents)
      )
    ) {
      toast.error("Un impact financier est invalide.")
      return
    }

    startTransition(() => {
      void createContractAmendment({
        parentContractId: baseContract.id,
        title,
        reason,
        effectiveAt,
        changes: normalized,
      })
        .then((created) => {
          toast.success("Avenant créé en brouillon.")
          router.push(`/dashboard/contrats/${created.id}`)
        })
        .catch((error) =>
          toast.error(error instanceof Error ? error.message : "Création impossible.")
        )
    })
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href={`/dashboard/contrats/${baseContract.id}`}
            aria-label="Retour au contrat"
            className={buttonVariants({ variant: "ghost", size: "icon" })}
          >
            <ArrowLeft />
          </Link>
          <div>
            <p className="text-xs font-semibold text-primary">Avenant contractuel</p>
            <h1 className="text-2xl font-bold tracking-tight">Formaliser les modifications</h1>
          </div>
        </div>
        <Button type="submit" disabled={pending} className="sm:ml-auto">
          {pending ? <Loader2 className="animate-spin" /> : <Save />}
          Créer le brouillon
        </Button>
      </div>

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="flex items-start gap-3 p-4">
          <FileSignature className="mt-0.5 size-5 text-primary" />
          <div>
            <p className="font-semibold">
              {baseContract.number} · {baseContract.title}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Client : {baseContract.clientName}. Le contrat signé reste figé ; cet avenant aura
              son propre numéro, PDF, lien de signature et empreinte d’intégrité.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cadre de l’avenant</CardTitle>
          <CardDescription>
            Expliquez pourquoi le contrat change et quand les nouvelles conditions prennent effet.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="amendment-title">Titre</Label>
            <Input
              id="amendment-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              minLength={3}
              maxLength={200}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="effective-at">Date d’effet</Label>
            <Input
              id="effective-at"
              type="date"
              value={effectiveAt}
              onChange={(event) => setEffectiveAt(event.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="reason">Motif et contexte</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              minLength={5}
              maxLength={2000}
              rows={4}
              required
              placeholder="Demande du client, évolution du périmètre, nouvelle contrainte technique…"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Scale className="size-4 text-primary" />
                Modifications structurées
              </CardTitle>
              <CardDescription className="mt-1">
                Décrivez l’état avant/après. L’impact financier est optionnel et peut être négatif.
              </CardDescription>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                setChanges((current) => [...current, emptyChange(crypto.randomUUID())])
              }
            >
              <Plus />
              Ajouter
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {changes.map((change, index) => (
            <fieldset key={change.id} className="rounded-xl border p-4">
              <legend className="px-2 text-xs font-semibold text-muted-foreground">
                Modification {index + 1}
              </legend>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor={`category-${change.id}`}>Catégorie</Label>
                  <select
                    id={`category-${change.id}`}
                    value={change.category}
                    onChange={(event) =>
                      updateChange(change.id, {
                        category: event.target.value as ChangeRow["category"],
                      })
                    }
                    className={controlClass}
                  >
                    {changeCategories.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`label-${change.id}`}>Point modifié</Label>
                  <Input
                    id={`label-${change.id}`}
                    value={change.label}
                    onChange={(event) => updateChange(change.id, { label: event.target.value })}
                    minLength={2}
                    maxLength={150}
                    required
                    placeholder="Ex. Forfait annuel"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`previous-${change.id}`}>Avant</Label>
                  <Textarea
                    id={`previous-${change.id}`}
                    value={change.previousValue}
                    onChange={(event) =>
                      updateChange(change.id, { previousValue: event.target.value })
                    }
                    maxLength={1000}
                    rows={3}
                    placeholder="Condition du contrat source"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`next-${change.id}`}>Après</Label>
                  <Textarea
                    id={`next-${change.id}`}
                    value={change.nextValue}
                    onChange={(event) =>
                      updateChange(change.id, { nextValue: event.target.value })
                    }
                    maxLength={1000}
                    rows={3}
                    required
                    placeholder="Nouvelle condition convenue"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`impact-${change.id}`}>Impact financier TTC (€)</Label>
                  <Input
                    id={`impact-${change.id}`}
                    inputMode="decimal"
                    value={change.financialImpact}
                    onChange={(event) =>
                      updateChange(change.id, { financialImpact: event.target.value })
                    }
                    placeholder="Ex. 120 ou -50"
                  />
                </div>
                <div className="flex items-end justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-danger"
                    disabled={changes.length === 1}
                    onClick={() =>
                      setChanges((current) =>
                        current.filter((item) => item.id !== change.id)
                      )
                    }
                  >
                    <Trash2 />
                    Retirer
                  </Button>
                </div>
              </div>
            </fieldset>
          ))}
        </CardContent>
      </Card>
    </form>
  )
}
