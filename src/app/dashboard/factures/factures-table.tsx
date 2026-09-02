"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  Plus, Search, MoreHorizontal, Zap, Clock, CheckCircle2, CalendarClock,
  AlertTriangle, Receipt, Trash2, Send, FileDown, Timer,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { deleteInvoice, updateInvoiceStatus } from "@/actions/factures"
import { PaymentDialog } from "./payment-dialog"
import { useConfirm } from "@/components/shared/confirm-provider"
import { EmptyState } from "@/components/shared/empty-state"

type Invoice = {
  id: string
  number: string
  status: string
  type: string
  totalTtcCents: number
  paidAmountCents: number
  dueDate: Date | string
  client: { id: string; name: string }
}

const statusConfig: Record<string, { label: string; class: string; icon: React.ElementType }> = {
  DRAFT: { label: "Brouillon", class: "bg-muted text-muted-foreground border-transparent", icon: Clock },
  SENT: { label: "Émise", class: "bg-primary/10 text-primary border-primary/20", icon: Zap },
  PAID: { label: "Payée", class: "bg-success/10 text-success border-success/20", icon: CheckCircle2 },
  OVERDUE: { label: "En retard", class: "bg-danger/10 text-danger border-danger/20", icon: AlertTriangle },
  CANCELLED: { label: "Annulée", class: "bg-muted text-muted-foreground border-transparent", icon: Clock },
}

function formatEuro(cents: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100)
}

function formatDate(d: Date | string) {
  return new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Erreur."
}

export function FacturesTable({ invoices }: { invoices: Invoice[] }) {
  const router = useRouter()
  const confirmDialog = useConfirm()
  const [search, setSearch] = React.useState("")
  const [payTarget, setPayTarget] = React.useState<{ id: string; unpaid: number } | null>(null)

  const filtered = invoices.filter(
    (i) =>
      i.number.toLowerCase().includes(search.toLowerCase()) ||
      i.client.name.toLowerCase().includes(search.toLowerCase())
  )

  async function handleStatus(id: string, next: "SENT" | "CANCELLED") {
    try {
      await updateInvoiceStatus(id, next)
      toast.success("Statut mis à jour.")
      router.refresh()
    } catch (err) { toast.error(getErrorMessage(err)) }
  }

  async function handleDelete(id: string, number: string) {
    if (!(await confirmDialog({
      title: `Supprimer ${number} ?`,
      description: "Brouillon uniquement. Action irréversible.",
      confirmLabel: "Supprimer",
      destructive: true,
    }))) return
    try {
      await deleteInvoice(id)
      toast.success("Facture supprimée.")
      router.refresh()
    } catch (err) { toast.error(getErrorMessage(err)) }
  }

  return (
    <div className="space-y-4">
      <div className="workspace-panel flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher une facture…"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-2">
        <Link href="/dashboard/factures/recurrentes">
          <Button variant="outline" className="gap-2">
            <CalendarClock className="h-4 w-4" /> Récurrences
          </Button>
        </Link>
        <Link href="/dashboard/factures/temps-non-facture">
          <Button variant="outline" className="gap-2">
            <Timer className="h-4 w-4" /> Temps non facturé
          </Button>
        </Link>
        <Link href="/dashboard/factures/new">
          <Button className="gap-2">
            <Plus className="h-4 w-4" /> Nouvelle Facture
          </Button>
        </Link>
        </div>
      </div>

      {payTarget && (
        <PaymentDialog
          invoiceId={payTarget.id}
          defaultAmountCents={payTarget.unpaid}
          open={!!payTarget}
          onOpenChange={(o) => !o && setPayTarget(null)}
        />
      )}

      <div className="workspace-panel overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead className="w-[150px]">Référence</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Montant TTC</TableHead>
              <TableHead>Reste à payer</TableHead>
              <TableHead>Échéance</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="p-0 whitespace-normal">
                  <EmptyState
                    compact
                    icon={Receipt}
                    title={invoices.length === 0 ? "Aucune facture émise" : "Aucune facture trouvée"}
                    description={invoices.length === 0 ? "Créez votre première facture ou transformez un devis accepté pour démarrer le suivi des encaissements." : "Modifiez votre recherche pour afficher d’autres factures."}
                    action={invoices.length === 0 ? <Button size="sm" onClick={() => router.push("/dashboard/factures/new")}><Plus />Créer une facture</Button> : <Button size="sm" variant="outline" onClick={() => setSearch("")}>Effacer la recherche</Button>}
                  />
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((invoice) => {
                const status = statusConfig[invoice.status] ?? statusConfig.DRAFT
                const unpaid = invoice.totalTtcCents - invoice.paidAmountCents
                return (
                  <TableRow key={invoice.id} className="hover:bg-muted/30 transition-colors">
                    <TableCell>
                      <Link href={`/dashboard/factures/${invoice.id}`} className="font-mono text-xs font-bold hover:underline">
                        {invoice.number}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link href={`/dashboard/clients/${invoice.client.id}`} className="text-sm hover:underline">
                        {invoice.client.name}
                      </Link>
                    </TableCell>
                    <TableCell className="font-bold">{formatEuro(invoice.totalTtcCents)}</TableCell>
                    <TableCell>
                      <span className={cn("text-sm font-medium", unpaid > 0 ? "text-danger" : "text-muted-foreground")}>
                        {formatEuro(unpaid)}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDate(invoice.dueDate)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium", status.class)}>
                        <status.icon className="h-3 w-3" />
                        {status.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Ouvrir les actions de la facture">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuItem className="gap-2" onClick={() => router.push(`/dashboard/factures/${invoice.id}`)}>
                            <Receipt className="h-4 w-4 text-muted-foreground" /> Voir la facture
                          </DropdownMenuItem>
                          <DropdownMenuItem className="gap-2" onClick={() => window.open(`/api/pdf/facture/${invoice.id}`, "_blank")}>
                            <FileDown className="h-4 w-4 text-muted-foreground" /> Télécharger PDF
                          </DropdownMenuItem>
                          {invoice.status === "DRAFT" && (
                            <>
                              <DropdownMenuItem onClick={() => router.push(`/dashboard/factures/${invoice.id}/edit`)}>Éditer</DropdownMenuItem>
                              <DropdownMenuItem className="gap-2" onClick={() => handleStatus(invoice.id, "SENT")}>
                                <Send className="h-4 w-4 text-muted-foreground" /> Émettre
                              </DropdownMenuItem>
                            </>
                          )}
                          {unpaid > 0 && invoice.status !== "CANCELLED" && (
                            <DropdownMenuItem className="gap-2 text-success" onClick={() => setPayTarget({ id: invoice.id, unpaid })}>
                              <CheckCircle2 className="h-4 w-4" /> Enregistrer paiement
                            </DropdownMenuItem>
                          )}
                          {invoice.status === "DRAFT" && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="gap-2 text-danger" onClick={() => handleDelete(invoice.id, invoice.number)}>
                                <Trash2 className="h-4 w-4" /> Supprimer
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
