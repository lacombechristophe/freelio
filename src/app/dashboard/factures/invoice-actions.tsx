"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Send, CheckCircle2, Trash2, Receipt, RotateCcw, Mail } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import {
  createCreditNote,
  deleteInvoice,
  markInvoiceReminderSent,
  prepareInvoiceReminder,
  updateInvoiceStatus,
} from "@/actions/factures"
import { PaymentDialog } from "./payment-dialog"
import { useConfirm } from "@/components/shared/confirm-provider"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Erreur."
}

export function InvoiceActions({
  invoiceId,
  status,
  unpaidCents,
  invoiceNumber,
  type,
}: {
  invoiceId: string
  status: string
  unpaidCents: number
  invoiceNumber: string
  type: string
}) {
  const router = useRouter()
  const confirmDialog = useConfirm()
  const [pending, setPending] = React.useState(false)
  const [paymentOpen, setPaymentOpen] = React.useState(false)
  const [creditOpen, setCreditOpen] = React.useState(false)
  const [reminderOpen, setReminderOpen] = React.useState(false)
  const [creditAmount, setCreditAmount] = React.useState(Math.max(0, unpaidCents) / 100)
  const [creditReason, setCreditReason] = React.useState("")
  const [reminder, setReminder] = React.useState<{
    id: string; to: string; subject: string; message: string
  } | null>(null)

  async function changeStatus(next: "DRAFT" | "SENT" | "PAID" | "OVERDUE" | "CANCELLED") {
    setPending(true)
    try {
      await updateInvoiceStatus(invoiceId, next)
      toast.success("Statut mis à jour.")
      router.refresh()
    } catch (err) { toast.error(getErrorMessage(err)) }
    finally { setPending(false) }
  }

  async function handleDelete() {
    if (!(await confirmDialog({
      title: "Supprimer cette facture ?",
      confirmLabel: "Supprimer",
      destructive: true,
    }))) return
    setPending(true)
    try {
      await deleteInvoice(invoiceId)
      toast.success("Facture supprimée.")
      router.push("/dashboard/factures")
    } catch (err) { toast.error(getErrorMessage(err)) }
    finally { setPending(false) }
  }

  async function handleCredit() {
    setPending(true)
    try {
      const created = await createCreditNote({
        invoiceId,
        amountCents: Math.round(creditAmount * 100),
        reason: creditReason,
      })
      toast.success("Avoir créé et émis.")
      setCreditOpen(false)
      router.push(`/dashboard/factures/${created.id}`)
    } catch (err) { toast.error(getErrorMessage(err)) }
    finally { setPending(false) }
  }

  async function handlePrepareReminder() {
    setPending(true)
    try {
      const prepared = await prepareInvoiceReminder({ invoiceId })
      setReminder(prepared)
      setReminderOpen(true)
    } catch (err) { toast.error(getErrorMessage(err)) }
    finally { setPending(false) }
  }

  async function handleOpenEmail() {
    if (!reminder) return
    window.location.href = `mailto:${encodeURIComponent(reminder.to)}?subject=${encodeURIComponent(reminder.subject)}&body=${encodeURIComponent(reminder.message)}`
    await markInvoiceReminderSent(reminder.id)
    toast.success("Relance ouverte dans votre messagerie.")
    setReminderOpen(false)
    router.refresh()
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button disabled={pending}>Actions</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {status === "DRAFT" && (
            <DropdownMenuItem onClick={() => changeStatus("SENT")} className="gap-2">
              <Send className="h-4 w-4" /> Émettre (marquer envoyée)
            </DropdownMenuItem>
          )}
          {unpaidCents > 0 && status !== "CANCELLED" && (
            <DropdownMenuItem onClick={() => setPaymentOpen(true)} className="gap-2 text-success">
              <Receipt className="h-4 w-4" /> Enregistrer paiement
            </DropdownMenuItem>
          )}
          {unpaidCents > 0 && ["SENT", "OVERDUE"].includes(status) && (
            <DropdownMenuItem onClick={handlePrepareReminder} className="gap-2">
              <Mail className="h-4 w-4" /> Préparer une relance
            </DropdownMenuItem>
          )}
          {type !== "CREDIT_NOTE" && ["SENT", "OVERDUE", "PAID"].includes(status) && (
            <DropdownMenuItem onClick={() => setCreditOpen(true)} className="gap-2">
              <RotateCcw className="h-4 w-4" /> Créer un avoir
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
          {status === "SENT" && unpaidCents === 0 && (
            <DropdownMenuItem onClick={() => changeStatus("PAID")} className="gap-2 text-success">
              <CheckCircle2 className="h-4 w-4" /> Marquer comme payée
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <PaymentDialog
        invoiceId={invoiceId}
        defaultAmountCents={unpaidCents}
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
      />

      <Dialog open={creditOpen} onOpenChange={setCreditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Créer un avoir pour {invoiceNumber}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="creditAmount">Montant TTC (€)</Label>
              <Input id="creditAmount" type="number" min="0.01" step="0.01" value={creditAmount} onChange={(event) => setCreditAmount(Number(event.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="creditReason">Motif</Label>
              <textarea id="creditReason" value={creditReason} onChange={(event) => setCreditReason(event.target.value)} className="min-h-24 w-full rounded-lg border bg-background p-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50" />
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setCreditOpen(false)}>Annuler</Button><Button onClick={handleCredit} disabled={pending || creditAmount <= 0 || creditReason.trim().length < 3}>Créer et émettre</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reminderOpen} onOpenChange={setReminderOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>Relance {invoiceNumber}</DialogTitle></DialogHeader>
          {reminder && <div className="space-y-3 text-sm">
            <div><span className="text-muted-foreground">Destinataire : </span>{reminder.to || "Aucun email client"}</div>
            <div><span className="text-muted-foreground">Objet : </span>{reminder.subject}</div>
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border bg-muted/30 p-3 font-sans">{reminder.message}</pre>
          </div>}
          <DialogFooter><Button variant="outline" onClick={() => setReminderOpen(false)}>Fermer</Button><Button className="gap-2" onClick={handleOpenEmail} disabled={!reminder?.to}><Mail /> Ouvrir dans la messagerie</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
