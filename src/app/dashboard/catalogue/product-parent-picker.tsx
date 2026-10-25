"use client"

import { useEffect, useState, useTransition } from "react"
import { getProductParentChoices } from "@/actions/products"
import { DirectoryPagination } from "@/components/shared/directory-pagination"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

type Choices = Awaited<ReturnType<typeof getProductParentChoices>>

export function ProductParentPicker({ value, productId, onChange }: { value: string; productId?: string; onChange: (id: string) => void }) {
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [retry, setRetry] = useState(0)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState(false)
  const [result, setResult] = useState<{ key: string; data: Choices } | null>(null)
  const key = JSON.stringify([search, page, value, productId, retry])
  useEffect(() => {
    let current = true
    const timer = setTimeout(() => startTransition(async () => {
      try {
        const data = await getProductParentChoices({ search, page, selectedId: value || undefined, productId })
        if (!data) throw new Error("Catalogue indisponible")
        if (current) { setResult({ key, data }); setError(false) }
      } catch { if (current) setError(true) }
    }), 200)
    return () => { current = false; clearTimeout(timer) }
  }, [search, page, value, productId, key])
  const fresh = result?.key === key
  const data = result?.data
  const selected = data?.selected?.id === value ? data.selected : data?.items.find(item => item.id === value)
  const options = fresh && !error ? data?.items ?? [] : []
  const rows = selected && !options.some(item => item.id === selected.id) ? [selected, ...options] : options
  const busy = pending || (!fresh && !error)
  return <div className="space-y-2" role="group" aria-label="Choix du produit parent">
    <Select value={value || "none"} onValueChange={id => onChange(id === "none" ? "" : id ?? "")}>
      <SelectTrigger aria-label="Produit parent" disabled={busy || error}><SelectValue /></SelectTrigger>
      <SelectContent><SelectItem value="none">Produit racine</SelectItem>{rows.map(item => <SelectItem key={item.id} value={item.id}>{item.sku} · {item.label}</SelectItem>)}</SelectContent>
    </Select>
    <Input aria-label="Rechercher un produit parent" placeholder="Rechercher un produit parent" maxLength={200} value={search} onChange={event => { setSearch(event.target.value); setPage(1); setError(false) }} />
    <DirectoryPagination total={data?.total ?? 0} page={fresh ? data!.page : page} pending={busy} error={error} onPage={next => { setPage(next); setError(false) }} onRetry={() => { setError(false); setRetry(previous => previous + 1) }} />
  </div>
}
