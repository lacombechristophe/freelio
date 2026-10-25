"use client"

import * as React from "react"
import { getBankingTargets } from "@/actions/bank"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

type TargetPage = Awaited<ReturnType<typeof getBankingTargets>>
export function BankTargetPicker({ transactionId, positive, value, onChange }: { transactionId: string; positive: boolean; value: string; onChange: (value: string) => void }) {
  const [search, setSearch] = React.useState("")
  const [page, setPage] = React.useState(1)
  const [active, setActive] = React.useState(false)
  const [result, setResult] = React.useState<TargetPage | null>(null)
  const [error, setError] = React.useState("")
  const [loading, setLoading] = React.useState(false)
  const [loadedKey, setLoadedKey] = React.useState("")
  const queryKey = `${transactionId}:${search}:${page}:${value}`
  React.useEffect(() => {
    if (!active && !value) return
    let cancelled = false
    const timer = setTimeout(() => React.startTransition(async () => {
      setLoading(true)
      setError("")
      try {
        const next = await getBankingTargets({ transactionId, search, page, ...(value ? { selectedId: value } : {}) })
        if (!cancelled) { setResult(next); setLoadedKey(queryKey) }
      } catch (error) {
        if (!cancelled) { setResult(null); setError(error instanceof Error ? error.message : "Correspondances indisponibles.") }
      } finally { if (!cancelled) setLoading(false) }
    }), 250)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [transactionId, search, page, value, active, queryKey])
  const current = loadedKey === queryKey ? result : null
  const selected = result?.selected?.id === value ? result.selected : result?.rows.find(row => row.id === value)
  const options = [...(current?.rows ?? []), ...(selected && !current?.rows.some(row => row.id === selected.id) ? [selected] : [])]
  const busy = loading || loadedKey !== queryKey
  return <div className="min-w-0 flex-1 space-y-2">
    <Input aria-label="Rechercher une correspondance" placeholder={positive ? "Rechercher une facture" : "Rechercher une dépense"} value={search} onFocus={() => setActive(true)} onChange={event => { setActive(true); setSearch(event.target.value); setPage(1) }} />
    <Select value={value} onOpenChange={open => { if (open) setActive(true) }} onValueChange={next => onChange(next ?? "")}>
      <SelectTrigger className="w-full" aria-label="Correspondance bancaire"><SelectValue placeholder={positive ? "Facture" : "Dépense de même montant"} /></SelectTrigger>
      <SelectContent>{options.map(option => <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>)}</SelectContent>
    </Select>
    {active && <div className="flex flex-wrap items-center gap-2 text-xs">
      <span aria-live="polite">{error || (busy ? "Chargement…" : current ? `${current.total} correspondance(s) · Page ${current.page} / ${current.pageCount}` : "")}</span>
      <Button variant="outline" size="sm" disabled={busy || !current || current.page <= 1} onClick={() => setPage((current?.page ?? 1) - 1)}>Page précédente</Button>
      <Button variant="outline" size="sm" disabled={busy || !current || current.page >= current.pageCount} onClick={() => setPage((current?.page ?? 1) + 1)}>Page suivante</Button>
    </div>}
    {error && active && <p role="alert" className="text-xs text-muted-foreground">{error}</p>}
  </div>
}
