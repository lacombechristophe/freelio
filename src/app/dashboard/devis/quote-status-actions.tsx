"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Send, CheckCircle2, XCircle, FileText, Trash2, ScrollText, ShoppingCart } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { convertQuoteToInvoice, createContractFromQuote, deleteQuote, updateQuoteStatus } from "@/actions/devis"
import { convertQuoteToCustomerOrder } from "@/actions/operations"
import { useConfirm } from "@/components/shared/confirm-provider"

export function QuoteStatusActions({ quoteId, status }: { quoteId: string; status: string }) {
  const router = useRouter()
  const confirmDialog = useConfirm()
  const [pending, setPending] = React.useState(false)

  async function changeStatus(next: "DRAFT" | "SENT" | "ACCEPTED" | "REJECTED" | "EXPIRED") {
    setPending(true)
    try {
      await updateQuoteStatus(quoteId, next)
      toast.success("Statut mis à jour.")
      router.refresh()
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur.")
    } finally {
      setPending(false)
    }
  }

  async function convert() {
    setPending(true)
    try {
      const invoice = await convertQuoteToInvoice(quoteId)
      toast.success("Facture créée.")
      router.push(`/dashboard/factures/${invoice.id}`)
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur.")
    } finally {
      setPending(false)
    }
  }

  async function createOrder() {
    setPending(true)
    try {
      const order = await convertQuoteToCustomerOrder(quoteId)
      toast.success(order.existing ? `Commande ${order.number} déjà créée.` : `Commande ${order.number} créée avec son chantier.`)
      router.push("/dashboard/operations?tab=orders")
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erreur.")
    } finally {
      setPending(false)
    }
  }

  async function createContract() {
    setPending(true)
    try {
      const contract = await createContractFromQuote(quoteId)
      toast.success("Contrat cree.")
      router.push(`/dashboard/contrats/${contract.id}`)
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur.")
    } finally {
      setPending(false)
    }
  }

  async function handleDelete() {
    if (!(await confirmDialog({
      title: "Supprimer ce devis ?",
      confirmLabel: "Supprimer",
      destructive: true,
    }))) return
    setPending(true)
    try {
      await deleteQuote(quoteId)
      toast.success("Devis supprimé.")
      router.push("/dashboard/devis")
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur.")
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      {(status === "ACCEPTED" || status === "SENT") ? <Button variant="outline" disabled={pending} onClick={createOrder}><ShoppingCart />Créer la commande</Button> : null}
      <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button disabled={pending}>Actions</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {status === "DRAFT" && (
          <DropdownMenuItem onClick={() => changeStatus("SENT")} className="gap-2">
            <Send className="h-4 w-4" /> Marquer comme envoyé
          </DropdownMenuItem>
        )}
        {status === "SENT" && (
          <>
            <DropdownMenuItem onClick={() => changeStatus("ACCEPTED")} className="gap-2 text-success">
              <CheckCircle2 className="h-4 w-4" /> Marquer comme accepté
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => changeStatus("REJECTED")} className="gap-2 text-danger">
              <XCircle className="h-4 w-4" /> Marquer comme refusé
            </DropdownMenuItem>
          </>
        )}
        {(status === "ACCEPTED" || status === "SENT") && (
          <DropdownMenuItem onClick={createOrder} className="gap-2">
            <ShoppingCart className="h-4 w-4" /> Créer la commande client
          </DropdownMenuItem>
        )}
        {(status === "ACCEPTED" || status === "SENT") && (
          <DropdownMenuItem onClick={convert} className="gap-2">
            <FileText className="h-4 w-4" /> Convertir en facture
          </DropdownMenuItem>
        )}
        {(status === "ACCEPTED" || status === "SENT") && (
          <DropdownMenuItem onClick={createContract} className="gap-2">
            <ScrollText className="h-4 w-4" /> Creer un contrat
          </DropdownMenuItem>
        )}
        {status === "DRAFT" && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleDelete} className="gap-2 text-danger">
              <Trash2 className="h-4 w-4" /> Supprimer
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
