"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { CheckCircle2, FileCheck2, LoaderCircle, ScrollText, Send, Trash2, XCircle } from "lucide-react"

import { createContractFromQuote, deleteQuote, updateQuoteStatus } from "@/actions/devis"
import { convertQuoteToCustomerOrder } from "@/actions/operations"
import { useConfirm } from "@/components/shared/confirm-provider"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { QuoteStatus } from "@/lib/quotes/workflow"

type QuoteStatusActionsProps = {
  quoteId: string
  status: string
  hasOrder?: boolean
  hasContract?: boolean
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "L’action n’a pas pu être terminée."
}

export function QuoteStatusActions({ quoteId, status, hasOrder = false, hasContract = false }: QuoteStatusActionsProps) {
  const router = useRouter()
  const confirmDialog = useConfirm()
  const [pending, setPending] = React.useState(false)
  const [launchOpen, setLaunchOpen] = React.useState(false)
  const [includeContract, setIncludeContract] = React.useState(!hasContract)

  async function changeStatus(next: QuoteStatus) {
    if (next === "ACCEPTED") {
      const confirmed = await confirmDialog({
        title: "Enregistrer l’accord du client ?",
        description: "Cette étape fige l’acceptation du devis. La commande, le chantier et la facturation pourront ensuite être préparés sans ressaisie.",
        confirmLabel: "Confirmer l’accord",
      })
      if (!confirmed) return
    }

    setPending(true)
    try {
      await updateQuoteStatus(quoteId, next)
      toast.success(next === "ACCEPTED" ? "Accord client enregistré." : "Statut mis à jour.")
      router.refresh()
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setPending(false)
    }
  }

  async function launchFolder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const depositRate = Number(form.get("depositRate") || 0)
    const expectedInstallationAt = String(form.get("expectedInstallationAt") || "")

    setPending(true)
    try {
      const order = await convertQuoteToCustomerOrder({ quoteId, depositRate, expectedInstallationAt })
      if (includeContract) await createContractFromQuote(quoteId)
      toast.success(order.existing ? `Le dossier ${order.number} était déjà préparé.` : `Commande ${order.number} et chantier préparés.`)
      setLaunchOpen(false)
      router.refresh()
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setPending(false)
    }
  }

  async function createContract() {
    setPending(true)
    try {
      const contract = await createContractFromQuote(quoteId)
      toast.success(hasContract ? "Contrat déjà préparé." : "Contrat métier préparé.")
      router.push(`/dashboard/contrats/${contract.id}`)
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setPending(false)
    }
  }

  async function handleDelete() {
    const confirmed = await confirmDialog({
      title: "Supprimer ce devis ?",
      description: "Seul ce brouillon sera supprimé. Cette action est définitive.",
      confirmLabel: "Supprimer",
      destructive: true,
    })
    if (!confirmed) return

    setPending(true)
    try {
      await deleteQuote(quoteId)
      toast.success("Devis supprimé.")
      router.push("/dashboard/devis")
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {status === "DRAFT" ? (
          <Button disabled={pending} onClick={() => changeStatus("SENT")}>
            {pending ? <LoaderCircle className="animate-spin" /> : <Send />}
            Marquer envoyé
          </Button>
        ) : null}
        {status === "SENT" ? (
          <Button disabled={pending} onClick={() => changeStatus("ACCEPTED")}>
            {pending ? <LoaderCircle className="animate-spin" /> : <CheckCircle2 />}
            Enregistrer l’accord
          </Button>
        ) : null}
        {status === "ACCEPTED" && !hasOrder ? (
          <Button disabled={pending} onClick={() => setLaunchOpen(true)}>
            <FileCheck2 />
            Lancer le dossier
          </Button>
        ) : null}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" disabled={pending}>Plus d’actions</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {status === "SENT" ? (
              <>
                <DropdownMenuItem onClick={() => changeStatus("REJECTED")} className="gap-2 text-danger">
                  <XCircle /> Marquer comme refusé
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => changeStatus("EXPIRED")} className="gap-2">Marquer comme expiré</DropdownMenuItem>
              </>
            ) : null}
            {status === "ACCEPTED" ? (
              <DropdownMenuItem onClick={createContract} className="gap-2">
                <ScrollText /> {hasContract ? "Ouvrir le contrat" : "Préparer le contrat"}
              </DropdownMenuItem>
            ) : null}
            {status === "DRAFT" ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleDelete} className="gap-2 text-danger">
                  <Trash2 /> Supprimer le brouillon
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Dialog open={launchOpen} onOpenChange={setLaunchOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Lancer le dossier accepté</DialogTitle>
            <DialogDescription>
              La commande reprend toutes les lignes du devis et crée le chantier associé. Les achats, l’acompte et le planning restent contrôlés dans le centre d’opérations.
            </DialogDescription>
          </DialogHeader>

          <form id="launch-quote-folder" onSubmit={launchFolder} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="depositRate">Acompte prévu</Label>
                <div className="relative">
                  <Input id="depositRate" name="depositRate" type="number" min="0" max="100" step="0.5" defaultValue="30" className="pr-9" />
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">%</span>
                </div>
                <p className="text-xs leading-5 text-muted-foreground">Prépare la facture d’acompte sans l’émettre automatiquement.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="expectedInstallationAt">Pose souhaitée</Label>
                <Input id="expectedInstallationAt" name="expectedInstallationAt" type="date" />
                <p className="text-xs leading-5 text-muted-foreground">Indicative : à confirmer avec l’équipe et le fabricant.</p>
              </div>
            </div>

            <label className="flex cursor-pointer items-start gap-3 rounded-xl border bg-muted/35 p-4">
              <Checkbox aria-label="Préparer aussi le contrat de fourniture et pose" checked={includeContract} onCheckedChange={(checked) => setIncludeContract(checked === true)} />
              <span className="min-w-0">
                <span className="block text-sm font-semibold">Préparer aussi le contrat de fourniture et pose</span>
                <span className="mt-1 block text-xs leading-5 text-muted-foreground">Le modèle métier reprend le devis, le relevé technique, la réception, les garanties et les règles de sécurité.</span>
              </span>
            </label>
          </form>

          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={() => setLaunchOpen(false)}>Annuler</Button>
            <Button type="submit" form="launch-quote-folder" disabled={pending}>
              {pending ? <LoaderCircle className="animate-spin" /> : <FileCheck2 />}
              Préparer le dossier
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
