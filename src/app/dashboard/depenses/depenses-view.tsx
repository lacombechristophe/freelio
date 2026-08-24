"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  Plus,
  Search,
  MoreHorizontal,
  Camera,
  FileText,
  Tag,
  CheckCircle2,
  Clock,
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ExpenseFormDialog } from "./expense-form-dialog"
import { deleteExpense, markExpenseJustified } from "@/actions/depenses"
import { useConfirm } from "@/components/shared/confirm-provider"
import { EmptyState } from "@/components/shared/empty-state"
import { PageHeader } from "@/components/shared/page-header"

type Expense = {
  id: string
  label: string
  provider?: string | null
  amountCents: number
  tvaCents: number
  date: Date | string
  category: string
  status: string
  files: Array<{ id: string; url: string }>
  projectId?: string | null
  clientId?: string | null
  project?: { id: string; name: string } | null
}

function formatEuro(cents: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100)
}

function formatDate(d: Date | string) {
  return new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })
}

function getErrorMessage(error: unknown, fallback = "Erreur.") {
  return error instanceof Error ? error.message : fallback
}

export function DepensesView({ expenses, projects }: { expenses: Expense[]; projects: Array<{ id: string; name: string; clientId: string }> }) {
  const router = useRouter()
  const confirmDialog = useConfirm()
  const [search, setSearch] = React.useState("")
  const [createOpen, setCreateOpen] = React.useState(false)
  const [editTarget, setEditTarget] = React.useState<Expense | null>(null)

  const filtered = expenses.filter((e) =>
    e.label.toLowerCase().includes(search.toLowerCase()) ||
    (e.provider ?? "").toLowerCase().includes(search.toLowerCase())
  )

  const now = new Date()
  const thisMonthTotal = expenses
    .filter((e) => {
      const d = new Date(e.date)
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    })
    .reduce((sum, e) => sum + e.amountCents, 0)

  const toJustify = expenses.filter((e) => e.status === "TO_JUSTIFY").length

  async function handleDelete(id: string, label: string) {
    if (!(await confirmDialog({
      title: `Supprimer "${label}" ?`,
      confirmLabel: "Supprimer",
      destructive: true,
    }))) return
    try {
      await deleteExpense(id)
      toast.success("Dépense supprimée.")
      router.refresh()
    } catch (err) { toast.error(getErrorMessage(err)) }
  }

  async function handleJustify(id: string) {
    try {
      await markExpenseJustified(id)
      toast.success("Dépense marquée comme justifiée.")
      router.refresh()
    } catch (err) { toast.error(getErrorMessage(err)) }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Charges"
        title="Dépenses"
        description="Conservez les justificatifs, rattachez les achats aux chantiers et gardez une vue claire sur vos charges."
        actions={<>
          <Button variant="outline" className="gap-2" onClick={() => setCreateOpen(true)}>
            <Camera className="h-4 w-4" />
            Scanner un ticket (AI)
          </Button>
          <Button className="gap-2" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            Saisie manuelle
          </Button>
        </>}
      />

      <ExpenseFormDialog open={createOpen} onOpenChange={setCreateOpen} projects={projects} />
      {editTarget && (
        <ExpenseFormDialog
          expense={editTarget}
          open={!!editTarget}
          onOpenChange={(o) => !o && setEditTarget(null)}
          projects={projects}
        />
      )}

      <div className="grid max-w-2xl gap-3 sm:grid-cols-2">
        <Card className="bg-primary/5 border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium uppercase tracking-widest text-primary/70">Total Mois</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatEuro(thisMonthTotal)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium uppercase tracking-widest text-muted-foreground">À Justifier</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-danger">{toJustify}</div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher une dépense…"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Badge variant="outline" className="gap-2 px-3 py-1.5">
          <Tag className="h-4 w-4" />
          Catégories fixes
        </Badge>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Libellé / Fournisseur</TableHead>
              <TableHead>Catégorie</TableHead>
              <TableHead>Montant TTC</TableHead>
              <TableHead>Justificatif</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="p-0 whitespace-normal">
                  <EmptyState
                    compact
                    icon={Camera}
                    title={expenses.length === 0 ? "Aucune dépense enregistrée" : "Aucune dépense trouvée"}
                    description={expenses.length === 0 ? "Ajoutez une première dépense et son justificatif pour commencer votre suivi." : "Modifiez votre recherche pour afficher d’autres dépenses."}
                    action={expenses.length === 0 ? <Button size="sm" onClick={() => setCreateOpen(true)}><Plus />Ajouter une dépense</Button> : <Button size="sm" variant="outline" onClick={() => setSearch("")}>Effacer la recherche</Button>}
                  />
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((expense) => (
                <TableRow key={expense.id} className="group hover:bg-muted/30 transition-colors">
                  <TableCell className="text-xs text-muted-foreground font-medium uppercase">
                    {formatDate(expense.date)}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium text-sm">{expense.label}</span>
                      {expense.provider && (
                        <span className="text-xs text-muted-foreground font-semibold uppercase tracking-tighter">
                          {expense.provider}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs uppercase tracking-wider font-bold">
                      {expense.category}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-bold">{formatEuro(expense.amountCents)}</TableCell>
                  <TableCell>
                    {expense.status === "JUSTIFIED" ? (
                      <Badge className="bg-success/10 text-success border-success/20 gap-1 text-xs uppercase font-bold">
                        <CheckCircle2 className="h-3 w-3" /> Justifié
                      </Badge>
                    ) : (
                      <Badge className="bg-danger/10 text-danger border-danger/20 gap-1 text-xs uppercase font-bold">
                        <Clock className="h-3 w-3" /> Manquant
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Ouvrir les actions de la dépense">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        {expense.files[0] && (
                          <DropdownMenuItem
                            className="gap-2"
                            onClick={() => window.open(`/api/files/expense/${expense.files[0].id}`, "_blank")}
                          >
                            <FileText className="h-4 w-4 text-muted-foreground" /> Voir justificatif
                          </DropdownMenuItem>
                        )}
                        {expense.status === "TO_JUSTIFY" && (
                          <DropdownMenuItem className="gap-2" onClick={() => handleJustify(expense.id)}>
                            <CheckCircle2 className="h-4 w-4 text-success" /> Marquer comme justifiée
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => setEditTarget(expense)}>Éditer</DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-danger"
                          onClick={() => handleDelete(expense.id, expense.label)}
                        >
                          Supprimer
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
