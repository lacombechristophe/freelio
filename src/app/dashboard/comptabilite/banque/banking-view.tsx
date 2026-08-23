"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import Papa from "papaparse"
import { ArrowLeft, Check, FileUp, Link2, Plus } from "lucide-react"
import { toast } from "sonner"
import {
  createExpenseFromTransaction,
  importBankTransactions,
  matchTransactionToExpense,
  matchTransactionToInvoice,
} from "@/actions/bank"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PageHeader } from "@/components/shared/page-header"

type DashboardData = Awaited<ReturnType<typeof import("@/actions/bank").getBankingDashboard>>
type RawRow = Record<string, string>

function formatEuro(cents: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100)
}

function parseDate(value: string) {
  const trimmed = value.trim()
  const french = trimmed.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/)
  if (french) return `${french[3]}-${french[2].padStart(2, "0")}-${french[1].padStart(2, "0")}`
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : ""
}

function parseAmount(value: string) {
  let normalized = value.replace(/[^0-9,.-]/g, "")
  if (normalized.includes(",") && normalized.includes(".")) {
    normalized = normalized.lastIndexOf(",") > normalized.lastIndexOf(".")
      ? normalized.replace(/\./g, "").replace(",", ".")
      : normalized.replace(/,/g, "")
  } else {
    normalized = normalized.replace(",", ".")
  }
  const amount = Number(normalized)
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0
}

function guess(headers: string[], terms: string[]) {
  return headers.find((header) => terms.some((term) => header.toLowerCase().includes(term))) ?? ""
}

export function BankingView({ data }: { data: NonNullable<DashboardData> }) {
  const router = useRouter()
  const [rawRows, setRawRows] = React.useState<RawRow[]>([])
  const [headers, setHeaders] = React.useState<string[]>([])
  const [mapping, setMapping] = React.useState({ date: "", label: "", amount: "", reference: "" })
  const [targets, setTargets] = React.useState<Record<string, string>>({})
  const [pending, setPending] = React.useState(false)

  const normalizedRows = React.useMemo(() => rawRows.map((row) => ({
    date: parseDate(row[mapping.date] ?? ""),
    label: (row[mapping.label] ?? "").trim(),
    amountCents: parseAmount(row[mapping.amount] ?? ""),
    reference: (row[mapping.reference] ?? "").trim(),
  })).filter((row) => row.date && row.label && row.amountCents !== 0), [rawRows, mapping])

  function readCsv(file: File | undefined) {
    if (!file) return
    Papa.parse<RawRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const nextHeaders = result.meta.fields ?? []
        setHeaders(nextHeaders)
        setRawRows(result.data)
        setMapping({
          date: guess(nextHeaders, ["date", "opération", "operation"]),
          label: guess(nextHeaders, ["libellé", "libelle", "label", "description"]),
          amount: guess(nextHeaders, ["montant", "amount", "valeur"]),
          reference: guess(nextHeaders, ["référence", "reference", "ref"]),
        })
      },
      error: (error) => toast.error(error.message),
    })
  }

  async function importRows() {
    if (!normalizedRows.length) return toast.error("Aucune ligne exploitable.")
    setPending(true)
    try {
      const result = await importBankTransactions({ rows: normalizedRows })
      toast.success(`${result.imported} transaction(s) importée(s), ${result.ignored} doublon(s) ignoré(s).`)
      setRawRows([])
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import impossible.")
    } finally {
      setPending(false)
    }
  }

  async function reconcile(transactionId: string, amountCents: number) {
    const target = targets[transactionId]
    if (!target) return toast.error("Sélectionnez une correspondance.")
    setPending(true)
    try {
      if (amountCents > 0) await matchTransactionToInvoice(transactionId, target)
      else await matchTransactionToExpense(transactionId, target)
      toast.success("Transaction rapprochée.")
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Rapprochement impossible.")
    } finally {
      setPending(false)
    }
  }

  async function createExpense(transactionId: string) {
    setPending(true)
    try {
      await createExpenseFromTransaction(transactionId)
      toast.success("Dépense créée et rapprochée.")
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Création impossible.")
    } finally {
      setPending(false)
    }
  }

  const unmatched = data.transactions.filter((transaction) => !transaction.matchedPaymentId && !transaction.matchedExpenseId)
  const inflow = data.transactions.reduce((sum, transaction) => sum + Math.max(0, transaction.amountCents), 0)
  const outflow = data.transactions.reduce((sum, transaction) => sum + Math.min(0, transaction.amountCents), 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/comptabilite"><Button variant="ghost" size="icon" title="Retour"><ArrowLeft /></Button></Link>
        <PageHeader className="flex-1" eyebrow="Comptabilité" title="Rapprochement bancaire" description="Importez un relevé CSV, dédoublonnez les lignes et associez chaque mouvement explicitement." />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardHeader><CardTitle className="text-xs uppercase text-muted-foreground">Entrées importées</CardTitle></CardHeader><CardContent className="text-2xl font-bold text-success">{formatEuro(inflow)}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-xs uppercase text-muted-foreground">Sorties importées</CardTitle></CardHeader><CardContent className="text-2xl font-bold text-danger">{formatEuro(outflow)}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-xs uppercase text-muted-foreground">À rapprocher</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{unmatched.length}</CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><FileUp /> Importer un relevé CSV</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Input aria-label="Sélectionner un relevé bancaire CSV" type="file" accept=".csv,text/csv" onChange={(event) => readCsv(event.target.files?.[0])} />
          {headers.length > 0 && <>
            <div className="grid gap-3 sm:grid-cols-4">
              {(["date", "label", "amount", "reference"] as const).map((field) => (
                <div key={field} className="space-y-1.5"><Label>{({ date: "Date", label: "Libellé", amount: "Montant", reference: "Référence" })[field]}</Label>
                  <Select value={mapping[field]} onValueChange={(value) => setMapping((current) => ({ ...current, [field]: value ?? "" }))}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Colonne" /></SelectTrigger>
                    <SelectContent>{headers.map((header) => <SelectItem key={header} value={header}>{header}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between rounded-lg border bg-muted/20 px-3 py-2 text-sm"><span>{normalizedRows.length} ligne(s) valide(s) sur {rawRows.length}</span><Button onClick={importRows} disabled={pending || normalizedRows.length === 0}>Importer</Button></div>
          </>}
        </CardContent>
      </Card>

      <div className="overflow-hidden rounded-lg border bg-card">
        <Table>
          <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Libellé</TableHead><TableHead>Montant</TableHead><TableHead>État</TableHead><TableHead>Rapprochement</TableHead></TableRow></TableHeader>
          <TableBody>
            {data.transactions.length === 0 ? <TableRow><TableCell colSpan={5} className="py-14 text-center text-muted-foreground">Aucune transaction importée.</TableCell></TableRow> : data.transactions.map((transaction) => {
              const matched = transaction.matchedPayment?.invoice.number ?? transaction.matchedExpense?.label
              const options = transaction.amountCents > 0
                ? data.invoices.map((invoice) => ({ id: invoice.id, label: `${invoice.number} · ${invoice.client.name} · ${formatEuro(invoice.totalTtcCents - invoice.paidAmountCents)}` }))
                : data.expenses.filter((expense) => expense.amountCents === Math.abs(transaction.amountCents)).map((expense) => ({ id: expense.id, label: `${expense.label} · ${formatEuro(expense.amountCents)}` }))
              return <TableRow key={transaction.id}>
                <TableCell className="text-xs">{new Date(transaction.date).toLocaleDateString("fr-FR")}</TableCell>
                <TableCell><div className="max-w-sm truncate font-medium">{transaction.label}</div><div className="text-xs text-muted-foreground">{transaction.reference}</div></TableCell>
                <TableCell className={transaction.amountCents > 0 ? "font-bold text-success" : "font-bold text-danger"}>{formatEuro(transaction.amountCents)}</TableCell>
                <TableCell>{matched ? <Badge className="gap-1"><Check /> {matched}</Badge> : <Badge variant="outline">À rapprocher</Badge>}</TableCell>
                <TableCell>
                  {!matched && <div className="flex min-w-[320px] items-center gap-2">
                    <Select value={targets[transaction.id] ?? ""} onValueChange={(value) => setTargets((current) => ({ ...current, [transaction.id]: value ?? "" }))}>
                      <SelectTrigger className="flex-1"><SelectValue placeholder={transaction.amountCents > 0 ? "Facture" : "Dépense de même montant"} /></SelectTrigger>
                      <SelectContent>{options.map((option) => <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>)}</SelectContent>
                    </Select>
                    <Button size="icon" variant="outline" title="Rapprocher" disabled={pending || !targets[transaction.id]} onClick={() => reconcile(transaction.id, transaction.amountCents)}><Link2 /></Button>
                    {transaction.amountCents < 0 && <Button size="icon" variant="outline" title="Créer une dépense" disabled={pending} onClick={() => createExpense(transaction.id)}><Plus /></Button>}
                  </div>}
                </TableCell>
              </TableRow>
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
