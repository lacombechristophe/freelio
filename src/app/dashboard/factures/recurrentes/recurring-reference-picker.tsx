"use client"

import { useEffect, useState, useTransition } from "react"
import { getRecurringInvoiceChoices } from "@/actions/factures"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DirectoryPagination } from "@/components/shared/directory-pagination"

type Choices = Awaited<ReturnType<typeof getRecurringInvoiceChoices>>

export function RecurringReferencePicker({ kind, clientId, value, onChange, required = false }: {
  kind: "CLIENT" | "PROJECT"; clientId?: string; value: string; onChange: (value: string) => void; required?: boolean
}) {
  const label = kind === "CLIENT" ? "Client" : "Chantier"
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [retry, setRetry] = useState(0)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState(false)
  const [result, setResult] = useState<{ key: string; data: Choices } | null>(null)
  const key = JSON.stringify([kind, clientId, value, search, page, retry])
  useEffect(() => {
    let current = true
    const timer = setTimeout(() => startTransition(async () => {
      try {
        const data = await getRecurringInvoiceChoices({ kind, clientId, selectedId: value || undefined, search, page })
        if (current) { setResult({ key, data }); setError(false) }
      } catch { if (current) setError(true) }
    }), 200)
    return () => { current = false; clearTimeout(timer) }
  }, [kind, clientId, value, search, page, key])
  const fresh = result?.key === key
  const data = result?.data
  const selected = data?.selected?.id === value ? data.selected : data?.items.find(item => item.id === value)
  const options = fresh ? data?.items ?? [] : []
  const rows = selected && !options.some(item => item.id === selected.id) ? [selected, ...options] : options
  const busy = pending || (!fresh && !error)
  return <div role="group" aria-label={`Choix ${label.toLowerCase()}`} className="space-y-2">
    <Select value={value || (required ? null : "none")} onValueChange={id => onChange(id === "none" ? "" : id ?? "")}>
      <SelectTrigger className="w-full" aria-label={label} disabled={busy || (kind === "PROJECT" && !clientId)}><SelectValue placeholder="Sélectionner" /></SelectTrigger>
      <SelectContent>{!required && <SelectItem value="none">Non renseigné</SelectItem>}{rows.map(item => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent>
    </Select>
    <Input aria-label={`Rechercher un ${label.toLowerCase()}`} placeholder={`Rechercher un ${label.toLowerCase()}`} maxLength={200} value={search} onChange={event => { setSearch(event.target.value); setPage(1); setError(false) }} />
    <DirectoryPagination total={data?.total ?? 0} page={fresh ? data!.page : page} pending={busy} error={error} onPage={next => { setPage(next); setError(false) }} onRetry={() => { setError(false); setRetry(value => value + 1) }} />
  </div>
}
