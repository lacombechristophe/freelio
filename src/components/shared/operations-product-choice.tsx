"use client"

import { useCallback, useEffect, useState, useTransition } from "react"
import { getOperationsProductChoices } from "@/actions/operations-product-choices"
import { Input } from "@/components/ui/input"
import { DirectoryPagination } from "@/components/shared/directory-pagination"

type Choices = Awaited<ReturnType<typeof getOperationsProductChoices>>
type ProductOption = NonNullable<Choices["selected"]>

export function useOperationsProductChoices(value: string, stockTrackedOnly = false, enabled = true, equipmentId?: string) {
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [revision, setRevision] = useState(0)
  const retry = useCallback(() => setRevision(current => current + 1), [])
  const [loading, startTransition] = useTransition()
  const [lookup, setLookup] = useState<{ key: string; data: Choices | null; error: boolean } | null>(null)
  const [selected, setSelected] = useState<ProductOption>()
  const key = JSON.stringify([value, search, page, stockTrackedOnly, revision, equipmentId])
  const fresh = lookup?.key === key
  useEffect(() => {
    if (!enabled || fresh) return
    let current = true
    const timer = setTimeout(() => startTransition(async () => {
      try {
        const data = await getOperationsProductChoices({ selectedId: value || undefined, search, page, stockTrackedOnly, equipmentId })
        if (current) {
          setPage(data.page)
          setLookup({ key: JSON.stringify([value, search, data.page, stockTrackedOnly, revision, equipmentId]), data, error: false })
          if (data.selected) setSelected(data.selected)
        }
      } catch {
        if (current) setLookup(previous => ({ key, data: previous?.data ?? null, error: true }))
      }
    }), 200)
    return () => { current = false; clearTimeout(timer) }
  }, [enabled, fresh, key, value, search, page, stockTrackedOnly, revision, equipmentId])
  const busy = enabled && (loading || !fresh)
  const ready = enabled && fresh && !lookup?.error && Boolean(value && lookup?.data?.selected?.id === value)
  const error = fresh && (Boolean(lookup?.error) || Boolean(value && !ready))
  const currentSelection = selected?.id === value ? selected : undefined
  const items = fresh && !lookup?.error ? lookup?.data?.items ?? [] : []
  const options = currentSelection && !items.some(item => item.id === currentSelection.id) ? [currentSelection, ...items] : items
  return {
    value, search, page, ready, busy, error, options, total: lookup?.data?.total ?? 0,
    searchFor: (query: string) => { setSearch(query); setPage(1) }, goToPage: setPage, retry,
    remember: (id: string) => setSelected(options.find(item => item.id === id)),
  }
}

export function OperationsProductChoice({ choices, name, onChange, required = false, disabled = false }: {
  choices: ReturnType<typeof useOperationsProductChoices>; name: string; onChange: (id: string) => void; required?: boolean; disabled?: boolean
}) {
  return <>
    <Input aria-label="Rechercher un produit" placeholder="Rechercher un produit…" maxLength={200} value={choices.search} disabled={disabled} onChange={event => choices.searchFor(event.target.value)} />
    <select id={name} name={name} required={required} value={choices.value} disabled={disabled} onChange={event => {
      choices.remember(event.target.value); onChange(event.target.value)
    }} className="h-10 w-full rounded-[10px] border border-input bg-background px-3 text-sm outline-none focus:border-primary focus:ring-3 focus:ring-ring/20">
      <option value="">Sélectionner…</option>{choices.options.map(item => <option key={item.id} value={item.id}>{item.sku} · {item.label}</option>)}
    </select>
    <DirectoryPagination total={choices.total} page={choices.page} pending={choices.busy || disabled} error={choices.error} onPage={choices.goToPage} onRetry={choices.retry} />
  </>
}
