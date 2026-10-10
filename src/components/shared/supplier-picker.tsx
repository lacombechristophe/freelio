"use client"

import { useEffect, useState, useTransition } from "react"
import { getSupplierChoices } from "@/actions/suppliers"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DirectoryPagination } from "@/components/shared/directory-pagination"

type Choices = Awaited<ReturnType<typeof getSupplierChoices>>

export function SupplierPicker({ value, onChange, name, label = "Fournisseur", productId, required = false, variant = "native" }: {
  value?: string; onChange?: (value: string) => void; name?: string; label?: string;
  productId?: string; required?: boolean; variant?: "native" | "select"
}) {
  const [internalValue, setInternalValue] = useState("")
  const selectedId = value ?? internalValue
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [retry, setRetry] = useState(0)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState(false)
  const [result, setResult] = useState<{ key: string; data: Choices } | null>(null)
  const key = JSON.stringify([search, page, selectedId, productId, retry])
  useEffect(() => {
    let current = true
    const timer = setTimeout(() => startTransition(async () => {
      try {
        const data = await getSupplierChoices({ search, page, selectedId: selectedId || undefined, productId })
        if (current) { setResult({ key, data }); setError(false) }
      } catch { if (current) setError(true) }
    }), 200)
    return () => { current = false; clearTimeout(timer) }
  }, [search, page, selectedId, productId, key])
  const fresh = result?.key === key
  const data = result?.data
  const selected = data?.selected?.id === selectedId ? data.selected : data?.items.find(item => item.id === selectedId)
  const options = fresh ? data?.items ?? [] : []
  const rows = selected && !options.some(item => item.id === selected.id) ? [selected, ...options] : options
  const busy = pending || (!fresh && !error)
  function choose(id: string) { setInternalValue(id); onChange?.(id) }
  return <div className="space-y-2">
    {variant === "select" ? <Select value={selectedId || "none"} onValueChange={id => choose(id === "none" ? "" : id ?? "")}>
      <SelectTrigger aria-label={label} disabled={busy}><SelectValue /></SelectTrigger>
      <SelectContent><SelectItem value="none">Non renseigné</SelectItem>{rows.map(item => <SelectItem key={item.id} value={item.id}>{item.name}{item.active ? "" : " · Inactif"}</SelectItem>)}</SelectContent>
    </Select> : <select id={name} name={name} aria-label={label} value={selectedId} onChange={event => choose(event.target.value)} required={required} disabled={busy}
      className="h-10 w-full rounded-[10px] border border-input bg-background px-3 text-sm outline-none focus:border-primary focus:ring-3 focus:ring-ring/20">
      <option value="">Sélectionner…</option>{rows.map(item => <option key={item.id} value={item.id}>{item.name}{item.active ? "" : " · Inactif"}</option>)}
    </select>}
    {variant === "native" && busy && name ? <input type="hidden" name={name} value={selectedId} /> : null}
    <Input aria-label="Rechercher un fournisseur" placeholder="Rechercher un fournisseur" maxLength={200} value={search} onChange={event => { setSearch(event.target.value); setPage(1); setError(false) }} />
    <DirectoryPagination total={data?.total ?? 0} page={fresh ? data!.page : page} pending={busy} error={error} onPage={next => { setPage(next); setError(false) }} onRetry={() => { setError(false); setRetry(value => value + 1) }} />
  </div>
}
