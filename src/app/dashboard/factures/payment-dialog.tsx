"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { recordPayment } from "@/actions/factures"

type PaymentMethod = "TRANSFER" | "STRIPE" | "CASH" | "CHECK" | "OTHER"

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Erreur."
}

export function PaymentDialog({
  invoiceId,
  defaultAmountCents,
  open,
  onOpenChange,
}: {
  invoiceId: string
  defaultAmountCents: number
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const router = useRouter()
  const [pending, setPending] = React.useState(false)
  const [amount, setAmount] = React.useState((defaultAmountCents / 100).toString())
  const [method, setMethod] = React.useState<PaymentMethod>("TRANSFER")
  const [reference, setReference] = React.useState("")

  React.useEffect(() => {
    if (open) {
      setAmount((defaultAmountCents / 100).toString())
      setMethod("TRANSFER")
      setReference("")
    }
  }, [open, defaultAmountCents])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    try {
      await recordPayment({
        invoiceId,
        amountCents: Math.round(Number(amount || 0) * 100),
        method,
        reference,
      })
      toast.success("Paiement enregistré.")
      onOpenChange(false)
      router.refresh()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Enregistrer un paiement</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="amount">Montant (€) *</Label>
            <Input id="amount" type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label>Méthode</Label>
            <Select value={method} onValueChange={(v) => setMethod((v || "TRANSFER") as PaymentMethod)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="TRANSFER">Virement</SelectItem>
                <SelectItem value="STRIPE">Stripe</SelectItem>
                <SelectItem value="CASH">Espèces</SelectItem>
                <SelectItem value="CHECK">Chèque</SelectItem>
                <SelectItem value="OTHER">Autre</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ref">Référence</Label>
            <Input id="ref" value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Annuler</DialogClose>
            <Button type="submit" disabled={pending}>{pending ? "…" : "Enregistrer"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
