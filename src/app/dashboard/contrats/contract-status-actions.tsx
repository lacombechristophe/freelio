"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Clipboard, ExternalLink, Link2, Send, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { updateContractStatus, deleteContract } from "@/actions/contrats"
import { useConfirm } from "@/components/shared/confirm-provider"

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Erreur."
}

export function ContractStatusActions({ contractId, status }: { contractId: string; status: string }) {
  const router = useRouter()
  const confirmDialog = useConfirm()
  const [pending, setPending] = React.useState(false)
  const [signingUrl, setSigningUrl] = React.useState("")

  async function changeStatus(next: "SENT" | "EXPIRED") {
    setPending(true)
    try {
      const result = await updateContractStatus(contractId, next)
      if (result?.signingPath) {
        const url = `${window.location.origin}${result.signingPath}`
        setSigningUrl(url)
        await navigator.clipboard.writeText(url).catch(() => undefined)
        toast.success("Lien de signature sécurisé prêt à partager.")
      } else {
        toast.success("Statut mis à jour.")
      }
      router.refresh()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setPending(false)
    }
  }

  async function handleDelete() {
    if (
      !(await confirmDialog({
        title: "Supprimer ce contrat ?",
        confirmLabel: "Supprimer",
        destructive: true,
      }))
    )
      return
    setPending(true)
    try {
      await deleteContract(contractId)
      toast.success("Contrat supprimé.")
      router.push("/dashboard/contrats")
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setPending(false)
    }
  }

  async function copySigningUrl() {
    try {
      await navigator.clipboard.writeText(signingUrl)
      toast.success("Lien copié.")
    } catch {
      toast.error("Copie automatique indisponible. Sélectionnez le lien ci-dessous.")
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button disabled={pending}>Actions</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {(status === "DRAFT" || status === "SENT") && (
            <DropdownMenuItem onClick={() => changeStatus("SENT")} className="gap-2">
              <Send className="h-4 w-4" /> {status === "SENT" ? "Régénérer le lien" : "Envoyer pour signature"}
            </DropdownMenuItem>
          )}
          {status !== "SIGNED" && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleDelete} className="gap-2 text-danger">
                <Trash2 className="h-4 w-4" /> Supprimer
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={Boolean(signingUrl)} onOpenChange={(open) => { if (!open) setSigningUrl("") }}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <div className="mb-1 grid size-10 place-items-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
              <Link2 className="size-4" />
            </div>
            <DialogTitle>Invitation de signature prête</DialogTitle>
            <DialogDescription>
              Transmettez ce lien au signataire. Il est aléatoire, révocable par régénération et ne contient aucun identifiant métier.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-xl border border-border bg-muted/30 p-3">
            <label htmlFor="contract-signing-url" className="mb-2 block text-xs font-semibold text-muted-foreground">
              Lien de signature à partager
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input id="contract-signing-url" value={signingUrl} readOnly className="font-mono text-xs" onFocus={(event) => event.currentTarget.select()} />
              <Button type="button" variant="outline" onClick={copySigningUrl}>
                <Clipboard className="size-4" />
                Copier
              </Button>
            </div>
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            Conseil : utilisez l’e-mail du CRM pour conserver la preuve d’envoi dans l’historique client.
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setSigningUrl("")}>Fermer</Button>
            <Button type="button" onClick={() => window.open(signingUrl, "_blank", "noopener,noreferrer")}>
              <ExternalLink className="size-4" />
              Ouvrir le parcours
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
