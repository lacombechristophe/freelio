"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Send, CheckCircle2, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { updateContractStatus, deleteContract } from "@/actions/contrats"
import { useConfirm } from "@/components/shared/confirm-provider"

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Erreur."
}

export function ContractStatusActions({ contractId, status }: { contractId: string; status: string }) {
  const router = useRouter()
  const confirmDialog = useConfirm()
  const [pending, setPending] = React.useState(false)

  async function changeStatus(next: "DRAFT" | "SENT" | "SIGNED" | "EXPIRED") {
    setPending(true)
    try {
      const result = await updateContractStatus(contractId, next)
      if (result?.signingPath) {
        await navigator.clipboard.writeText(`${window.location.origin}${result.signingPath}`)
        toast.success("Lien de signature sécurisé copié.")
      } else {
        toast.success("Statut mis à jour.")
      }
      router.refresh()
    } catch (err) { toast.error(getErrorMessage(err)) }
    finally { setPending(false) }
  }

  async function handleDelete() {
    if (!(await confirmDialog({
      title: "Supprimer ce contrat ?",
      confirmLabel: "Supprimer",
      destructive: true,
    }))) return
    setPending(true)
    try {
      await deleteContract(contractId)
      toast.success("Contrat supprimé.")
      router.push("/dashboard/contrats")
    } catch (err) { toast.error(getErrorMessage(err)) }
    finally { setPending(false) }
  }

  return (
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
          <DropdownMenuItem onClick={() => changeStatus("SIGNED")} className="gap-2 text-success">
            <CheckCircle2 className="h-4 w-4" /> Marquer comme signé
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
  )
}
