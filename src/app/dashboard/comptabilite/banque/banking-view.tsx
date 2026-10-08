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
  getBankingDashboard,
} from "@/actions/bank"
import { BankTargetPicker } from "./bank-target-picker"
import { parseBankDate } from "@/lib/bank-date"
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
  const [search, setSearch] = React.useState("")
  const [status, setStatus] = React.useState("ALL")
  const [page, setPage] = React.useState(1)
  const [history, setHistory] = React.useState(data)
  const [loadedKey, setLoadedKey] = React.useState("ALL:1:")
  const [historyError, setHistoryError] = React.useState("")
  const queryKey = `${status}:${page}:${search}`
  const loading = loadedKey !== queryKey
  React.useEffect(() => {
    let cancelled = false
    const timer = setTimeout(() => React.startTransition(async () => {
      setHistoryError("")
      try {
        const next = await getBankingDashboard({ search, status, page })
        if (!cancelled) { setHistory(next); setLoadedKey(queryKey) }
      } catch (error) {
        if (!cancelled) setHistoryError(error instanceof Error ? error.message : "Historique indisponible.")
      }
    }), 250)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [search, status, page, queryKey, data])

  const normalizedRows = React.useMemo(() => rawRows.map((row) => ({
    date: parseDate(row[mapping.date] ?? ""),
    label: (row[mapping.label] ?? "").trim(),
    amountCents: parseAmount(row[mapping.amount] ?? ""),
    reference: (row[mapping.reference] ?? "").trim(),
  })).filter(row => row.label && row.amountCents !== 0), [rawRows, mapping])
  const validRowCount = normalizedRows.filter(row => { try { parseBankDate(row.date); return true } catch { return false } }).length

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
      for (const row of rawRows) {
        const value = row[mapping.date] ?? ""
        try { parseBankDate(parseDate(value)) } catch { throw new Error(`Date bancaire invalide : ${value}`) }
      }
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

  const { inflow, outflow, unmatched } = history.totals

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/comptabilite"><Button variant="ghost" size="icon" title="Retour"><ArrowLeft /></Button></Link>
        <PageHeader className="flex-1" eyebrow="Comptabilité" title="Rapprochement bancaire" description="Importez un relevé CSV, dédoublonnez les lignes et associez chaque mouvement explicitement." />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardHeader><CardTitle className="text-xs uppercase text-muted-foreground">Entrées importées</CardTitle></CardHeader><CardContent className="text-2xl font-bold text-success">{formatEuro(inflow)}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-xs uppercase text-muted-foreground">Sorties importées</CardTitle></CardHeader><CardContent className="text-2xl font-bold text-danger">{formatEuro(outflow)}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-xs uppercase text-muted-foreground">À rapprocher</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{unmatched}</CardContent></Card>
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
            <div className="flex items-center justify-between rounded-lg border bg-muted/20 px-3 py-2 text-sm"><span>{validRowCount} ligne(s) valide(s) sur {rawRows.length}</span><Button demoMutation onClick={importRows} disabled={pending || normalizedRows.length === 0}>Importer</Button></div>
          </>}
        </CardContent>
      </Card>

      <div className="space-y-3" aria-label="Historique bancaire">
        <div className="flex flex-wrap items-center gap-3">
          <Input className="sm:max-w-sm" aria-label="Rechercher une transaction" placeholder="Libellé ou référence" value={search} onChange={event => { setSearch(event.target.value); setPage(1); setHistoryError("") }} />
          <Select value={status} onValueChange={value => { setStatus(value ?? "ALL"); setPage(1); setHistoryError("") }}>
            <SelectTrigger aria-label="État du rapprochement"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="ALL">Toutes</SelectItem><SelectItem value="UNMATCHED">À rapprocher</SelectItem><SelectItem value="MATCHED">Rapprochées</SelectItem></SelectContent>
          </Select>
          <span aria-live="polite" className="text-sm text-muted-foreground">{historyError || (loading ? "Chargement…" : `${history.total} transaction(s) · Page ${history.page} / ${history.pageCount}`)}</span>
          <Button variant="outline" disabled={loading || history.page <= 1} onClick={() => setPage(history.page - 1)}>Page précédente</Button>
          <Button variant="outline" disabled={loading || history.page >= history.pageCount} onClick={() => setPage(history.page + 1)}>Page suivante</Button>
        </div>
        {historyError && <p role="alert" className="text-sm text-muted-foreground">{historyError}</p>}
      <div className="overflow-hidden rounded-lg border bg-card">
        <Table>
          <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Libellé</TableHead><TableHead>Montant</TableHead><TableHead>État</TableHead><TableHead>Rapprochement</TableHead></TableRow></TableHeader>
          <TableBody>
            {loading ? <TableRow><TableCell colSpan={5} className="py-14 text-center text-muted-foreground">{historyError || "Chargement…"}</TableCell></TableRow> : history.transactions.length === 0 ? <TableRow><TableCell colSpan={5} className="py-14 text-center text-muted-foreground">Aucune transaction importée.</TableCell></TableRow> : history.transactions.map((transaction) => {
              const matched = transaction.matchedPayment?.invoice.number ?? transaction.matchedExpense?.label ?? (transaction.matchedPaymentId || transaction.matchedExpenseId ? "Rapprochée" : null)
              return <TableRow key={transaction.id}>
                <TableCell className="text-xs">{new Date(transaction.date).toLocaleDateString("fr-FR")}</TableCell>
                <TableCell><div className="max-w-sm truncate font-medium">{transaction.label}</div><div className="text-xs text-muted-foreground">{transaction.reference}</div></TableCell>
                <TableCell className={transaction.amountCents > 0 ? "font-bold text-success" : "font-bold text-danger"}>{formatEuro(transaction.amountCents)}</TableCell>
                <TableCell>{matched ? <Badge className="gap-1"><Check /> {matched}</Badge> : <Badge variant="outline">À rapprocher</Badge>}</TableCell>
                <TableCell>
                  {!matched && <div className="flex min-w-[320px] items-center gap-2">
                    <BankTargetPicker transactionId={transaction.id} positive={transaction.amountCents > 0} value={targets[transaction.id] ?? ""} onChange={value => setTargets(current => ({ ...current, [transaction.id]: value }))} />
                    <Button demoMutation size="icon" variant="outline" title="Rapprocher" disabled={pending || !targets[transaction.id]} onClick={() => reconcile(transaction.id, transaction.amountCents)}><Link2 /></Button>
                    {transaction.amountCents < 0 && <Button demoMutation size="icon" variant="outline" title="Créer une dépense" disabled={pending} onClick={() => createExpense(transaction.id)}><Plus /></Button>}
                  </div>}
                </TableCell>
              </TableRow>
            })}
          </TableBody>
        </Table>
      </div>
      </div>
    </div>
  )
}
